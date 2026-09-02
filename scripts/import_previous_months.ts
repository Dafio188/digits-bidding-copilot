import fs from "fs";
import readline from "readline";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

import { upsertTendersBatch, CPV_TARGETS } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");

const PROVINCE_TO_REGIONE: Record<string, string> = {
  "AGRIGENTO": "Sicilia", "ALESSANDRIA": "Piemonte", "ANCONA": "Marche", "AOSTA": "Valle d'Aosta",
  "AREZZO": "Toscana", "ASCOLI PICENO": "Marche", "ASTI": "Piemonte", "AVELLINO": "Campania",
  "BARI": "Puglia", "BARLETTA-ANDRIA-TRANI": "Puglia", "BELLUNO": "Veneto", "BENEVENTO": "Campania",
  "BERGAMO": "Lombardia", "BIELLA": "Piemonte", "BOLOGNA": "Emilia-Romagna", "BOLZANO": "Trentino-Alto Adige",
  "BRESCIA": "Lombardia", "BRINDISI": "Puglia", "CAGLIARI": "Sardegna", "CALTANISSETTA": "Sicilia",
  "CAMPOBASSO": "Molise", "CARBONIA-IGLESIAS": "Sardegna", "CASERTA": "Campania", "CATANIA": "Sicilia",
  "CATANZARO": "Calabria", "CHIETI": "Abruzzo", "COMO": "Lombardia", "COSENZA": "Calabria",
  "CREMONA": "Lombardia", "CROTONE": "Calabria", "CUNEO": "Piemonte", "ENNA": "Sicilia",
  "FERMO": "Marche", "FERRARA": "Emilia-Romagna", "FIRENZE": "Toscana", "FOGGIA": "Puglia",
  "FORLI'-CESENA": "Emilia-Romagna", "FROSINONE": "Lazio", "GENOVA": "Liguria", "GORIZIA": "Friuli-Venezia Giulia",
  "GROSSETO": "Toscana", "IMPERIA": "Liguria", "ISERNIA": "Molise", "L'AQUILA": "Abruzzo",
  "LA SPEZIA": "Liguria", "LATINA": "Lazio", "LECCE": "Puglia", "LECCO": "Lombardia",
  "LIVORNO": "Toscana", "LODI": "Lombardia", "LUCCA": "Toscana", "MACERATA": "Marche",
  "MANTOVA": "Lombardia", "MASSA-CARRARA": "Toscana", "MATERA": "Basilicata", "MEDIO CAMPIDANO": "Sardegna",
  "MESSINA": "Sicilia", "MILANO": "Lombardia", "MODENA": "Emilia-Romagna", "MONZA E DELLA BRIANZA": "Lombardia",
  "NAPOLI": "Campania", "NOVARA": "Piemonte", "NUORO": "Sardegna", "OGLIASTRA": "Sardegna",
  "OLBIA-TEMPIO": "Sardegna", "ORISTANO": "Sardegna", "PADOVA": "Veneto", "PALERMO": "Sicilia",
  "PARMA": "Emilia-Romagna", "PAVIA": "Lombardia", "PERUGIA": "Umbria", "PESARO E URBINO": "Marche",
  "PESCARA": "Abruzzo", "PIACENZA": "Emilia-Romagna", "PISA": "Toscana", "PISTOIA": "Toscana",
  "PORDENONE": "Friuli-Venezia Giulia", "POTENZA": "Basilicata", "PRATO": "Toscana", "RAGUSA": "Sicilia",
  "RAVENNA": "Emilia-Romagna", "REGGIO CALABRIA": "Calabria", "REGGIO EMILIA": "Emilia-Romagna", "RIETI": "Lazio",
  "RIMINI": "Emilia-Romagna", "ROMA": "Lazio", "ROVIGO": "Veneto", "SALERNO": "Campania",
  "SASSARI": "Sardegna", "SAVONA": "Liguria", "SIENA": "Toscana", "SIRACUSA": "Sicilia",
  "SONDRIO": "Lombardia", "TARANTO": "Puglia", "TERAMO": "Abruzzo", "TERNI": "Umbria",
  "TORINO": "Piemonte", "TRAPANI": "Sicilia", "TRENTO": "Trentino-Alto Adige", "TREVISO": "Veneto",
  "TRIESTE": "Friuli-Venezia Giulia", "UDINE": "Friuli-Venezia Giulia", "VARESE": "Lombardia",
  "VENEZIA": "Veneto", "VERBANO-CUSIO-OSSOLA": "Piemonte", "VERCELLI": "Piemonte", "VERONA": "Veneto",
  "VIBO VALENTIA": "Calabria", "VICENZA": "Veneto", "VITERBO": "Lazio"
};

function cleanRegionName(sezioneRegionale: string): string {
  if (!sezioneRegionale) return "Non specificata";
  let reg = sezioneRegionale.replace("SEZIONE REGIONALE", "").trim();
  if (reg === "VALLE D'AOSTA") return "Valle d Aosta";
  return reg;
}

// Forza il download e il parsing di un determinato mese
async function processMonth(monthStr: string, shouldImport: boolean) {
  const label = `2026-${monthStr}`;
  const url = `https://dati.anticorruzione.it/opendata/download/dataset/cig/filesystem/2026${monthStr}01-cig_json.zip`;
  const zipPath = path.join(DATA_DIR, `temp_${monthStr}.zip`);
  const extractDir = path.join(DATA_DIR, `temp_${monthStr}_extracted`);

  console.log(`\n=== Inizio Processamento Mese: ${label} ===`);
  console.log(`URL: ${url}`);

  // 1. Download del file ZIP
  try {
    if (fs.existsSync(zipPath)) {
      console.log(`File ZIP già presente in locale: ${zipPath}`);
    } else {
      console.log(`Download in corso...`);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*"
        }
      });
      if (!response.ok) {
        throw new Error(`Errore HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));
      console.log(`Download completato: ${zipPath} (${arrayBuffer.byteLength} bytes)`);
    }
  } catch (err: any) {
    console.error(`Errore durante il download del mese ${label}:`, err.message);
    return;
  }

  // 2. Estrazione dello ZIP usando PowerShell
  try {
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }
    console.log(`Estrazione archivio ZIP in ${extractDir}...`);
    execSync(`powershell -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${extractDir}'"`, { stdio: "inherit" });
    console.log("Estrazione completata con successo!");
  } catch (err: any) {
    console.error(`Errore durante l'estrazione dello ZIP per il mese ${label}:`, err.message);
    cleanup(zipPath, extractDir);
    return;
  }

  // 3. Individuazione del file JSON estratto
  const files = fs.readdirSync(extractDir);
  const jsonFile = files.find(f => f.endsWith(".json"));
  if (!jsonFile) {
    console.error(`Errore: nessun file JSON trovato all'interno dello ZIP estratto!`);
    cleanup(zipPath, extractDir);
    return;
  }
  const jsonPath = path.join(extractDir, jsonFile);
  console.log(`File JSON individuato: ${jsonPath}`);

  // 4. Lettura in streaming e filtraggio
  const fileStream = fs.createReadStream(jsonPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let totalLines = 0;
  let matchingTenders = 0;
  const dbTenders: any[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Azzera ore per confronto date preciso

  for await (const line of rl) {
    totalLines++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Rimuove virgola finale se presente
    const cleanLine = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
    try {
      const record = JSON.parse(cleanLine);
      
      // Controllo data di pubblicazione: escludi se antecedente al 2026
      const pubDate = record.data_pubblicazione || "";
      if (pubDate && pubDate < "2026-01-01") {
        continue; // Scartata perché pubblicata in anni precedenti
      }

      // Controllo data di scadenza: escludi se scaduta rispetto ad oggi
      const deadlineStr = record.data_scadenza_offerta || null;
      if (deadlineStr) {
        const deadlineDate = new Date(deadlineStr);
        if (deadlineDate < today) {
          continue; // Scartata perché scaduta
        }
      }

      // Controllo CPV
      const cpvRaw = record.cod_cpv || "";
      const cpvClean = String(cpvRaw).replace(/\D/g, "").substring(0, 8);
      const matchesCpv = CPV_TARGETS.some(target => cpvClean.startsWith(target));
      
      if (!matchesCpv) {
        continue; // Scartata perché CPV non in target
      }

      // Controllo importo (limite massimo €250k)
      const importo = parseFloat(record.importo_lotto || record.importo_complessivo_gara || "0");
      const maxAmount = parseFloat(process.env.MAX_AMOUNT || "250000");
      if (importo > maxAmount) {
        continue; // Scartata perché supera l'importo massimo
      }

      // Se supera tutti i filtri, mappa il record
      matchingTenders++;
      
      const region = PROVINCE_TO_REGIONE[String(record.provincia).toUpperCase()] || 
                     cleanRegionName(record.sezione_regionale) || 
                     "Non specificata";
      const title = record.oggetto_lotto || record.oggetto_gara || `Gara CPV ${cpvRaw}`;
      const authority = record.denominazione_amministrazione_appaltante || "Ente non specificato";

      dbTenders.push({
        id: record.cig,
        cig: record.cig,
        title: title,
        authority: authority,
        region: region,
        cpv: cpvRaw,
        amount: importo,
        deadline: deadlineStr,
        publication_date: record.data_pubblicazione || new Date().toISOString().split("T")[0],
        description: record.oggetto_gara || record.oggetto_lotto || null,
        status: "active",
        source: `ANAC CIG Ingestion (2026-${monthStr})`,
        procedureType: record.tipo_scelta_contraente || null
      });

    } catch (e) {
      // Ignora righe non valide o parziali (es. parentesi di inizio/fine file JSON)
    }
  }

  console.log(`\nStatistiche Mese ${label}:`);
  console.log(`- Righe totali nel file: ${totalLines}`);
  console.log(`- Gare attive corrispondenti ai requisiti (CPV & Scadenza): ${matchingTenders}`);

  if (dbTenders.length > 0) {
    if (shouldImport) {
      console.log(`Importazione in corso di ${dbTenders.length} gare nel database...`);
      const inserted = upsertTendersBatch(dbTenders);
      console.log(`Fatto! Inserite/aggiornate ${inserted} gare.`);
    } else {
      console.log(`[Demo Mode] Gare trovate ma non inserite. Esegui con --import per scrivere sul database.`);
      console.log(`Esempio prima gara trovata:`, JSON.stringify(dbTenders[0], null, 2));
    }
  } else {
    console.log(`Nessuna gara attiva in target trovata per il mese ${label}.`);
  }

  // 5. Pulizia
  cleanup(zipPath, extractDir);
}

function cleanup(zipPath: string, extractDir: string) {
  try {
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      console.log(`Rimosso file ZIP temporaneo: ${zipPath}`);
    }
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
      console.log(`Rimossa cartella temporanea estratta: ${extractDir}`);
    }
  } catch (err: any) {
    console.warn(`Errore durante la pulizia dei file temporanei:`, err.message);
  }
}

async function main() {
  const shouldImport = process.argv.includes("--import");
  const monthArgIndex = process.argv.indexOf("--month");
  
  let months = ["06", "05", "04"]; // Mesi di default (Giugno, Maggio, Aprile)
  
  if (monthArgIndex !== -1 && monthArgIndex + 1 < process.argv.length) {
    months = [process.argv[monthArgIndex + 1].padStart(2, "0")];
  }

  console.log("==================================================");
  console.log("DIGITS — Ingestion Storica Incrementale CIG ANAC");
  console.log("==================================================");
  console.log(`Mesi da analizzare: ${months.join(", ")}`);
  console.log(`Modalità Scrittura Database: ${shouldImport ? "ABILITATA" : "DISABILITATA (Solo Test)"}`);
  console.log("==================================================");

  for (const m of months) {
    await processMonth(m, shouldImport);
  }
  
  console.log("\nProcesso di ingestion terminato correttamente.");
}

main().catch(err => {
  console.error("Errore fatale nello script:", err);
});
