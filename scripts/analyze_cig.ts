import fs from "fs";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

import { upsertTendersBatch, CPV_TARGETS } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = "c:\\Users\\info\\Documents\\Digits\\20260701-cig_json\\20260701-cig_json.json";

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

async function analyze() {
  console.log("=== Analisi File CIG ===");
  console.log(`Percorso file: ${FILE_PATH}`);
  
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`Errore: il file non esiste a quel percorso!`);
    return;
  }

  const fileStream = fs.createReadStream(FILE_PATH, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let totalLines = 0;
  let linesInJuly2026 = 0;
  let matchingCpvJuly2026 = 0;
  const matches: any[] = [];
  
  let minDate = "9999-99-99";
  let maxDate = "0000-00-00";

  for await (const line of rl) {
    totalLines++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Rimuove virgola finale se presente
    const cleanLine = trimmed.endsWith(",") ? trimmed.slice(0, -1) : trimmed;
    try {
      const record = JSON.parse(cleanLine);
      const pubDate = record.data_pubblicazione || "";
      
      if (pubDate) {
        if (pubDate < minDate) minDate = pubDate;
        if (pubDate > maxDate) maxDate = pubDate;
      }

      const isJuly2026 = pubDate.startsWith("2026-07");
      if (isJuly2026) {
        linesInJuly2026++;
        
        // Controlla il CPV
        const cpvRaw = record.cod_cpv || "";
        const cpvClean = String(cpvRaw).replace(/\D/g, "").substring(0, 8);
        const matchesCpv = CPV_TARGETS.some(target => cpvClean.startsWith(target));
        
        if (matchesCpv) {
          matchingCpvJuly2026++;
          matches.push(record);
        }
      }
    } catch (e) {
      // Ignora righe non valide
    }
  }

  console.log("\n--- RISULTATI ---");
  console.log(`Righe totali analizzate: ${totalLines}`);
  console.log(`Range date pubblicazione trovate: da ${minDate} a ${maxDate}`);
  console.log(`Gare pubblicate a Luglio 2026: ${linesInJuly2026}`);
  console.log(`Gare di Luglio 2026 con CPV target: ${matchingCpvJuly2026}`);
  
  if (matches.length > 0) {
    console.log("\nLista delle gare di Luglio 2026 idonee (matching CPV):");
    const dbTenders: any[] = [];
    
    for (const m of matches) {
      const region = PROVINCE_TO_REGIONE[String(m.provincia).toUpperCase()] || 
                     cleanRegionName(m.sezione_regionale) || 
                     "Non specificata";
      const cpv = m.cod_cpv || "";
      const importo = parseFloat(m.importo_lotto || m.importo_complessivo_gara || "0");
      const title = m.oggetto_lotto || m.oggetto_gara || `Gara CPV ${cpv}`;
      const authority = m.denominazione_amministrazione_appaltante || "Ente non specificato";
      
      console.log(`- CIG: ${m.cig} | Ente: ${authority} | Importo: €${importo.toLocaleString("it-IT")} | CPV: ${cpv} | Reg: ${region} | Data Pub: ${m.data_pubblicazione}`);
      
      dbTenders.push({
        id: m.cig,
        cig: m.cig,
        title: title,
        authority: authority,
        region: region,
        cpv: cpv,
        amount: importo,
        deadline: m.data_scadenza_offerta || null,
        publication_date: m.data_pubblicazione,
        description: m.oggetto_gara || m.oggetto_lotto || null,
        status: "active",
        source: "ANAC Local CIG File (2026-07)"
      });
    }

    // Chiedi se inserire nel DB
    console.log(`\nVuoi importare queste ${dbTenders.length} gare nel database?`);
    console.log(`[Esegui lo script con --import per confermare l'inserimento]`);
    
    if (process.argv.includes("--import")) {
      const inserted = upsertTendersBatch(dbTenders);
      console.log(`Importate con successo ${inserted} gare nel database!`);
    }
  } else {
    console.log("\nNessuna gara idonea trovata per Luglio 2026 nel file.");
  }
}

analyze().catch(err => {
  console.error("Errore durante l'esecuzione:", err);
});
