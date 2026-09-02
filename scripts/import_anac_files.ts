/**
 * import_anac_files.ts
 * Importa i file ANAC scaricati localmente nel database JSON.
 * 
 * File attesi:
 *   - pubblicazioni_json/pubblicazioni_json.json  (CIG + date pub)
 *   - stazioni-appaltanti_json/stazioni-appaltanti_json.json  (anagrafica SA)
 *   - centri-di-costo_json/centri-di-costo_json.json  (dettaglio centri)
 *   - cup_json/cup_json.json  (CIG -> CUP)
 * 
 * Da scaricare ancora dal portale ANAC:
 *   - appalti_json.json  (CIG + CPV + importo + oggetto)
 * 
 * Eseguire con: npm run import:anac
 */

import fs from "fs";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

import { upsertTendersBatch, setIngestionState, CPV_TARGETS, MIN_AMOUNT, MAX_AMOUNT } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ─── Configurazione ───────────────────────────────────────────────────────────

const FILES = {
  appalti: path.join(ROOT, "appalti_json", "appalti_json.json"),
  pubblicazioni: path.join(ROOT, "pubblicazioni_json", "pubblicazioni_json.json"),
  stazioni: path.join(ROOT, "stazioni-appaltanti_json", "stazioni-appaltanti_json.json"),
  centri: path.join(ROOT, "centri-di-costo_json", "centri-di-costo_json.json"),
  cup: path.join(ROOT, "cup_json", "cup_json.json"),
};

// Regioni italiane per normalizzazione provincia -> regione
const PROVINCE_TO_REGIONE: Record<string, string> = {
  "IT-AG":"Sicilia","IT-AL":"Piemonte","IT-AN":"Marche","IT-AO":"Valle d Aosta",
  "IT-AP":"Marche","IT-AQ":"Abruzzo","IT-AR":"Toscana","IT-AT":"Piemonte",
  "IT-AV":"Campania","IT-BA":"Puglia","IT-BG":"Lombardia","IT-BI":"Piemonte",
  "IT-BL":"Veneto","IT-BN":"Campania","IT-BO":"Emilia-Romagna","IT-BR":"Puglia",
  "IT-BS":"Lombardia","IT-BT":"Puglia","IT-BZ":"Trentino-Alto Adige",
  "IT-CA":"Sardegna","IT-CB":"Molise","IT-CE":"Campania","IT-CH":"Abruzzo",
  "IT-CL":"Sicilia","IT-CN":"Piemonte","IT-CO":"Lombardia","IT-CR":"Lombardia",
  "IT-CS":"Calabria","IT-CT":"Sicilia","IT-CZ":"Calabria","IT-EN":"Sicilia",
  "IT-FC":"Emilia-Romagna","IT-FE":"Emilia-Romagna","IT-FG":"Puglia",
  "IT-FI":"Toscana","IT-FM":"Marche","IT-FR":"Lazio","IT-GE":"Liguria",
  "IT-GO":"Friuli-Venezia Giulia","IT-GR":"Toscana","IT-IM":"Liguria",
  "IT-IS":"Molise","IT-KR":"Calabria","IT-LC":"Lombardia","IT-LE":"Puglia",
  "IT-LI":"Toscana","IT-LO":"Lombardia","IT-LT":"Lazio","IT-LU":"Toscana",
  "IT-MB":"Lombardia","IT-MC":"Marche","IT-ME":"Sicilia","IT-MI":"Lombardia",
  "IT-MN":"Lombardia","IT-MO":"Emilia-Romagna","IT-MS":"Toscana","IT-MT":"Basilicata",
  "IT-NA":"Campania","IT-NO":"Piemonte","IT-NU":"Sardegna","IT-OR":"Sardegna",
  "IT-OT":"Sardegna","IT-PA":"Sicilia","IT-PC":"Emilia-Romagna","IT-PD":"Veneto",
  "IT-PE":"Abruzzo","IT-PG":"Umbria","IT-PI":"Toscana","IT-PN":"Friuli-Venezia Giulia",
  "IT-PO":"Toscana","IT-PR":"Emilia-Romagna","IT-PT":"Toscana","IT-PU":"Marche",
  "IT-PV":"Lombardia","IT-PZ":"Basilicata","IT-RA":"Emilia-Romagna","IT-RC":"Calabria",
  "IT-RE":"Emilia-Romagna","IT-RG":"Sicilia","IT-RI":"Lazio","IT-RM":"Lazio",
  "IT-RN":"Emilia-Romagna","IT-RO":"Veneto","IT-SA":"Campania","IT-SI":"Toscana",
  "IT-SO":"Lombardia","IT-SP":"Liguria","IT-SR":"Sicilia","IT-SS":"Sardegna",
  "IT-SU":"Sardegna","IT-SV":"Liguria","IT-TA":"Puglia","IT-TE":"Abruzzo",
  "IT-TN":"Trentino-Alto Adige","IT-TO":"Piemonte","IT-TP":"Sicilia","IT-TR":"Umbria",
  "IT-TS":"Friuli-Venezia Giulia","IT-TV":"Veneto","IT-UD":"Friuli-Venezia Giulia",
  "IT-VA":"Lombardia","IT-VB":"Piemonte","IT-VC":"Piemonte","IT-VE":"Veneto",
  "IT-VI":"Veneto","IT-VR":"Veneto","IT-VS":"Sardegna","IT-VT":"Lazio","IT-VV":"Calabria",
};

// ─── Utility: lettura streaming JSONL ─────────────────────────────────────────

async function streamJsonl(
  filePath: string,
  onRecord: (record: any) => void,
  maxRecords?: number
): Promise<number> {
  if (!fs.existsSync(filePath)) {
    console.warn(`[IMPORT] File non trovato: ${filePath}`);
    return 0;
  }

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let count = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "[" || trimmed === "]") continue;
    // Rimuove virgola finale se presente (formato JSON array)
    const clean = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
    try {
      const record = JSON.parse(clean);
      onRecord(record);
      count++;
      if (maxRecords && count >= maxRecords) break;
    } catch { /* Ignora righe malformate */ }
  }
  rl.close();
  return count;
}

// ─── Step 1: Carica lookup stazioni appaltanti (cf -> { denominazione, provincia }) ─

async function buildStazioniLookup(): Promise<Map<string, { denominazione: string; provincia: string; regione: string }>> {
  console.log("[IMPORT] Caricamento stazioni appaltanti...");
  const map = new Map();
  await streamJsonl(FILES.stazioni, (r) => {
    if (r.codice_fiscale) {
      map.set(r.codice_fiscale, {
        denominazione: r.denominazione || "",
        provincia: r.provincia_codice || "",
        regione: PROVINCE_TO_REGIONE[r.provincia_codice] || r.provincia_nome || "Non specificata",
      });
    }
  });
  console.log(`[IMPORT] Stazioni caricate: ${map.size}`);
  return map;
}

// ─── Step 2: Carica lookup centri di costo (codice_ausa -> regione) ───────────

async function buildCentriLookup(): Promise<Map<string, string>> {
  console.log("[IMPORT] Caricamento centri di costo...");
  const map = new Map();
  await streamJsonl(FILES.centri, (r) => {
    if (r.codice_ausa && r.provincia_codice) {
      const reg = PROVINCE_TO_REGIONE[r.provincia_codice] || r.provincia_nome || "Non specificata";
      map.set(r.codice_ausa, reg);
    }
  });
  console.log(`[IMPORT] Centri caricati: ${map.size}`);
  return map;
}

// ─── Step 3: Carica lookup pubblicazioni (cig -> { data_creazione, scadenza }) ─

async function buildPubblicazioniLookup(): Promise<Map<string, { data_creazione: string; scadenza: string }>> {
  console.log("[IMPORT] Caricamento pubblicazioni (1.85 GB — potrebbe richiedere qualche minuto)...");
  const map = new Map();
  let count = 0;
  await streamJsonl(FILES.pubblicazioni, (r) => {
    const cig = r.cig || r.CIG;
    if (!cig) return;
    // Filtra solo pubblicazioni dal 2026
    const data = r.data_creazione || r.data_albo || r.data_guri || "";
    if (data && data < "2026-01-01") return;
    map.set(cig.toUpperCase(), {
      data_creazione: data,
      scadenza: r.SCADENZA_INVITO || "",
    });
    count++;
    if (count % 500000 === 0) process.stdout.write(`  ... ${count} pub 2026 caricate\n`);
  });
  console.log(`[IMPORT] Pubblicazioni 2026 in memoria: ${map.size}`);
  return map;
}

// ─── Step 4: Processa file appalti (il principale con CPV e importo) ──────────

async function processAppalti(
  stazioniMap: Map<string, any>,
  pubMap: Map<string, any>,
): Promise<number> {
  if (!fs.existsSync(FILES.appalti)) {
    console.warn(`
[IMPORT] ⚠️  File MANCANTE: ${FILES.appalti}
  Questo è il file principale con CPV e importo delle gare.
  Devi scaricarlo dal portale ANAC:
    1. Vai su https://dati.anticorruzione.it/opendata/dataset
    2. Cerca "appalti" o "lotti"
    3. Scarica il file JSON/CSV
    4. Salvalo nella cartella "appalti_json/"
`);
    return 0;
  }

  console.log("[IMPORT] Elaborazione appalti...");

  const CPV_DATE_CUTOFF = "2026-01-01";
  const batch: any[] = [];
  let inserted = 0;
  let processed = 0;
  let filtered = 0;

  const flush = () => {
    if (batch.length > 0) {
      inserted += upsertTendersBatch([...batch]);
      batch.length = 0;
    }
  };

  await streamJsonl(FILES.appalti, (r) => {
    processed++;
    if (processed % 100000 === 0) {
      process.stdout.write(`  ... ${processed} record processati, ${filtered} filtrati, ${inserted} inseriti\n`);
      flush();
    }

    // CIG (chiave primaria)
    const cig = (r.cig || r.CIG || "").toUpperCase();
    if (!cig) return;

    // CPV
    const cpvRaw = r.cpv || r.cod_cpv || r.CPV || r.codice_cpv || "";
    const cpv = String(cpvRaw).replace(/\D/g, "").substring(0, 8);
    if (!CPV_TARGETS.some(t => cpv.startsWith(t))) return;

    // Importo
    const importo = parseFloat(
      r.importo_complessivo_gara || r.importo || r.valore_stimato || r.somma_liq || "0"
    );
    if (importo < MIN_AMOUNT || importo > MAX_AMOUNT) return;

    // Data: deve essere >= 2026
    const pub = pubMap.get(cig);
    const dataCreazione = pub?.data_creazione || r.data_creazione || r.data_pubblicazione || "";
    if (dataCreazione && dataCreazione < CPV_DATE_CUTOFF) return;

    // Stazione appaltante
    const cf = r.cf_amministrazione_appaltante || r.codice_fiscale || r.stazione_appaltante_cf || "";
    const sa = stazioniMap.get(cf);
    const authority = sa?.denominazione || r.denominazione_amministrazione_appaltante || "Non specificata";
    const regione = sa?.regione || "Non specificata";

    filtered++;

    batch.push({
      id: cig,
      cig,
      title: r.oggetto || r.oggetto_gara || r.titolo || `Gara ${cpv} - ${authority}`,
      authority,
      region: regione,
      cpv: cpvRaw || cpv,
      amount: importo,
      deadline: pub?.scadenza || r.data_scadenza || null,
      publication_date: dataCreazione || new Date().toISOString().split("T")[0],
      description: r.oggetto || r.descrizione || null,
      status: "active",
      source: "ANAC Open Data (File locale)",
    });

    if (batch.length >= 500) flush();
  });

  flush();
  console.log(`[IMPORT] Appalti: ${processed} totali, ${filtered} nei target CPV+importo, ${inserted} inseriti nel DB`);
  return inserted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("DIGITS — Importazione file locali ANAC");
  console.log(`CPV target: ${CPV_TARGETS.join(", ")}`);
  console.log(`Range importo: €${MIN_AMOUNT} - €${MAX_AMOUNT}`);
  console.log(`Periodo: dal 2026-01-01 ad oggi`);
  console.log("=".repeat(60));
  console.log();

  const t0 = Date.now();

  // 1. Build lookup tables (file piccoli - veloci)
  const [stazioniMap, centriMap, pubMap] = await Promise.all([
    buildStazioniLookup(),
    buildCentriLookup(),
    // Pub è troppo grande, facciamolo in serie per evitare OOM
  ]);

  const pubMapFull = await buildPubblicazioniLookup();

  // 2. Processa appalti (file principale)
  const inserted = await processAppalti(stazioniMap, pubMapFull);

  setIngestionState("last_local_import", new Date().toISOString());
  setIngestionState("local_import_count", String(inserted));

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log();
  console.log("=".repeat(60));
  console.log(`Completato in ${elapsed}s`);
  console.log(`Bandi inseriti nel DB: ${inserted}`);
  console.log("=".repeat(60));

  if (inserted === 0) {
    console.log(`
⚠️  NESSUN BANDO INSERITO — Possibili motivi:
  1. Il file "appalti_json.json" NON è presente (vedi avviso sopra)
  2. Nessun record corrisponde ai CPV target (${CPV_TARGETS.join(", ")})
  3. Nessun record è nel range €${MIN_AMOUNT}-€${MAX_AMOUNT}

➡️  Azione richiesta:
  Scarica dal portale ANAC il dataset "appalti" o "lotti" e salvalo in:
  c:\\Users\\info\\Documents\\Digits\\appalti_json\\appalti_json.json
`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Errore fatale:", err);
  process.exit(1);
});
