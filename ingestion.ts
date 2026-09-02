/**
 * ingestion.ts - Pipeline di download e processing dei dati ANAC
 * Gestisce:
 *   1. Download bulk mensile (JSONL da ANAC Open Data)
 *   2. Filtraggio per CPV, regione, importo
 *   3. Inserimento in SQLite
 *   4. Cancellazione dei file raw dopo il processing
 *   5. Back-off esponenziale in caso di rate-limiting
 */

import fs from "fs";
import { fileURLToPath } from "url";
import { upsertTendersBatchPg as upsertTendersBatch } from "./postgres.ts";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "ingestion_state.json");

export const CPV_TARGETS = ["30125110", "30200000", "30232150", "80510000"];
export const MIN_AMOUNT = parseFloat(process.env.MIN_AMOUNT || "500");
export const MAX_AMOUNT = parseFloat(process.env.MAX_AMOUNT || "75000");

function readState() {
  if (!fs.existsSync(STATE_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); }
  catch { return {}; }
}
function writeState(state) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}
function setIngestionState(key, value) {
  const state = readState();
  state[key] = value;
  writeState(state);
}
function getIngestionState(key) {
  const state = readState();
  return state[key] || null;
}
function deletIngestionState(key) {
  const state = readState();
  delete state[key];
  writeState(state);
}


// Percorso ancorato alla working directory: coerente tra dev (tsx) e bundle prod (dist/).
void fileURLToPath; // mantenuto per compatibilità import
const RAW_DIR = path.join(process.cwd(), "data", "raw");

if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

// ─── Utility: sleep con back-off esponenziale ─────────────────────────────────

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, maxRetries = 5) {
  let delay = 2000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": "DigitsBiddingCopilot/2.0 (DIGITS DISTRIBUZIONE SRL)",
          Accept: "application/json, application/jsonlines, */*",
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(60000),
      });

      if (response.status === 429) {
        console.warn(`[FETCH] Rate limit (429) per ${url}. Attendo ${delay/1000}s (tentativo ${attempt}/${maxRetries})...`);
        await sleep(delay);
        delay = Math.min(delay * 2, 60000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`[FETCH] Errore per ${url}: ${err.message}. Attendo ${delay/1000}s (tentativo ${attempt}/${maxRetries})...`);
      await sleep(delay);
      delay = Math.min(delay * 2, 60000);
    }
  }
  throw new Error(`[FETCH] Superato numero massimo di tentativi per ${url}`);
}

// ─── Mappatura record OCDS → TenderRecord ────────────────────────────────────

const REGIONE_PATTERNS = [
  "Abruzzo","Basilicata","Calabria","Campania","Emilia","Friuli",
  "Lazio","Liguria","Lombardia","Marche","Molise","Piemonte",
  "Puglia","Sardegna","Sicilia","Toscana","Trentino","Umbria","Valle","Veneto",
];

function extractRegion(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const r of REGIONE_PATTERNS) {
    if (t.includes(r.toLowerCase())) return r;
  }
  return null;
}

function mapOcdsRecord(record, idx) {
  try {
    const tender = record.tender || record;
    const buyer = (record.buyer || record.parties?.find((p) => p.roles?.includes("buyer"))) || {};
    const lot = tender.lots?.[0] || {};

    // Importo: cerca in tutti i campi possibili
    const amount =
      lot.value?.amount ??
      tender.value?.amount ??
      record.contracts?.[0]?.value?.amount ??
      record.awards?.[0]?.value?.amount ??
      null;

    if (!amount || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return null;

    // CPV
    const cpvCode =
      lot.classification?.id ??
      tender.classification?.id ??
      tender.mainProcurementCategory ??
      "";
    const cpvClean = String(cpvCode).replace(/\D/g, "").substring(0, 8);

    // Verifica che il CPV rientri nei target
    if (cpvClean && !CPV_TARGETS.some((t) => cpvClean.startsWith(t))) return null;

    // Regione
    const authorityName = buyer.name || tender.procuringEntity?.name || "";
    const authorityAddress = buyer.address?.region || buyer.address?.locality || "";
    const region = extractRegion(authorityAddress) || extractRegion(authorityName) || "Non specificata";

    // Scadenza
    const deadline =
      tender.tenderPeriod?.endDate ??
      lot.tenderPeriod?.endDate ??
      null;

    // Verifica scadenza: scarta se già scaduta
    if (deadline && new Date(deadline) < new Date()) return null;

    const id = record.id || record.ocid || `anac-${cpvClean}-${idx}-${Date.now()}`;

    return {
      id,
      cig: tender.id || record.ocid || null,
      title: tender.title || lot.title || `Gara ${cpvClean}`,
      authority: authorityName || null,
      region,
      cpv: cpvCode || null,
      amount,
      deadline: deadline ? new Date(deadline).toISOString().split("T")[0] : null,
      publication_date: record.date
        ? new Date(record.date).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      description: tender.description || lot.description || null,
      status: "active",
      source: "ANAC Open Data",
      procedureType: tender.procurementMethod || tender.procurementMethodDetails || null,
      raw_json: JSON.stringify(record).substring(0, 4000), // limita dimensione
    };
  } catch (err) {
    return null;
  }
}

// ─── Download e processing di un mese bulk ───────────────────────────────────

// URL catalogo dataset ANAC OCDS
// I file sono disponibili come bulk mensili in formato JSONL (una release per riga)
// o JSON array. Proviamo entrambi i formati.
function buildBulkUrls(year, month) {
  const mm = String(month).padStart(2, "0");
  return [
    // Formato CSV (più affidabile)
    `https://dati.anticorruzione.it/opendata/download/dataset/anac-dataset-appalti/filesystem/?fileName=anac-dataset-appalti-${year}-${mm}.csv`,
    // Formato JSONL
    `https://dati.anticorruzione.it/opendata/download/dataset/ocds/filesystem/bulk/${year}/${mm}.jsonl`,
    // Formato JSON array
    `https://dati.anticorruzione.it/opendata/download/dataset/ocds/filesystem/bulk/${year}/${mm}.json`,
    // Alternativa con formato diverso
    `https://dati.anticorruzione.it/opendata/download/dataset/ocds/filesystem/bulk/${year}-${mm}.json`,
  ];
}

async function tryDownloadBulk(year, month) {
  const urls = buildBulkUrls(year, month);
  for (const url of urls) {
    try {
      console.log(`[INGESTION] Provo URL: ${url}`);
      const res = await fetchWithRetry(url, {}, 3);
      const text = await res.text();
      if (text && text.length > 100) {
        return { text, url };
      }
    } catch (err) {
      console.warn(`[INGESTION] URL fallito: ${url} — ${err.message}`);
    }
  }
  return null;
}

export async function downloadAndProcessBulk(year, month) {
  const label = `${year}-${String(month).padStart(2, "0")}`;

  // Controlla se questo mese è già stato processato
  const alreadyDone = getIngestionState(`processed_${label}`);
  if (alreadyDone === "done") {
    console.log(`[INGESTION] Mese ${label} già processato. Skip.`);
    return { inserted: 0, skipped: true };
  }

  console.log(`[INGESTION] === Avvio download bulk per ${label} ===`);

  const result = await tryDownloadBulk(year, month);
  if (!result) {
    console.warn(`[INGESTION] Nessun dato disponibile per ${label}`);
    return { inserted: 0, available: false };
  }

  const { text, url } = result;
  console.log(`[INGESTION] Scaricati ${text.length} bytes da ${url}`);

  // Salva raw temporaneamente
  const rawPath = path.join(RAW_DIR, `${label}.raw`);
  fs.writeFileSync(rawPath, text, "utf8");

  let records = [];

  // Parsing: tenta JSON array, poi JSONL riga per riga
  try {
    const json = JSON.parse(text);
    records = json.releases || json.data || (Array.isArray(json) ? json : []);
    console.log(`[INGESTION] Parsato come JSON array: ${records.length} record`);
  } catch {
    // Prova JSONL
    const lines = text.split("\n").filter((l) => l.trim().startsWith("{"));
    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {}
    }
    console.log(`[INGESTION] Parsato come JSONL: ${records.length} record`);
  }

  if (records.length === 0) {
    console.warn(`[INGESTION] Nessun record parsato per ${label}`);
    fs.unlinkSync(rawPath);
    return { inserted: 0, parsed: 0 };
  }

  // Filtra e mappa
  const mapped = records
    .map((r, i) => mapOcdsRecord(r, i))
    .filter((r) => r !== null);

  console.log(`[INGESTION] Record filtrati e conformi: ${mapped.length} / ${records.length}`);

  // Inserimento in batch nel DB
  const inserted = await upsertTendersBatch(mapped);
  console.log(`[INGESTION] Inseriti ${inserted} bandi nel DB per ${label}`);

  // Cancella file raw
  fs.unlinkSync(rawPath);
  console.log(`[INGESTION] File raw ${label} cancellato.`);

  // Aggiorna stato ingestion
  setIngestionState(`processed_${label}`, "done");
  setIngestionState("last_bulk", label);

  return { inserted, total: records.length, filtered: mapped.length };
}

// ─── Download storico (da gennaio 2026 al mese corrente) ─────────────────────

export async function downloadHistorical(startYear = 2026, startMonth = 1) {
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1; // 0-indexed -> 1-indexed

  console.log(`[INGESTION] Avvio download storico da ${startYear}-${String(startMonth).padStart(2,"0")} a ${endYear}-${String(endMonth).padStart(2,"0")}`);

  let totalInserted = 0;
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const result = await downloadAndProcessBulk(year, month);
    totalInserted += result.inserted || 0;

    // Pausa tra un mese e l'altro per evitare rate-limiting
    await sleep(2000);

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  console.log(`[INGESTION] Download storico completato. Totale bandi inseriti: ${totalInserted}`);
  return totalInserted;
}

// ─── Job giornaliero incrementale ────────────────────────────────────────────

export async function dailyIncrementalJob() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  console.log(`[INGESTION] === Job giornaliero ${now.toISOString()} ===`);


  // Forza il re-processing del mese corrente (rimuove il flag "done" per il mese corrente)
  const label = `${year}-${String(month).padStart(2, "0")}`;
  deletIngestionState(`processed_${label}`);

  const result = await downloadAndProcessBulk(year, month);

  setIngestionState("last_daily_job", now.toISOString());

  console.log(`[INGESTION] Job giornaliero completato: ${result.inserted || 0} bandi aggiornati.`);
  return result;
}



