/**
 * download_historical.ts
 * Script one-shot: scarica tutte le gare ANAC da gennaio 2026 ad oggi.
 * Eseguire con: npm run download:historical
 *
 * Questo script va eseguito UNA SOLA VOLTA per popolare il database storico.
 * I file raw vengono cancellati automaticamente dopo il processing.
 */

import dotenv from "dotenv";
dotenv.config();

import { downloadHistorical } from "../ingestion.js";
import { getDbStats } from "../db.js";

async function main() {
  console.log("=".repeat(60));
  console.log("DIGITS — Download Storico Gare ANAC (Gen 2026 → Oggi)");
  console.log("=".repeat(60));
  console.log();

  const startTime = Date.now();

  try {
    const totalInserted = await downloadHistorical(2026, 1);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log();
    console.log("=".repeat(60));
    console.log(`Completato in ${elapsed}s`);
    console.log(`Totale bandi inseriti nel DB: ${totalInserted}`);

    // Statistiche DB
    const stats = getDbStats();
    console.log(`Totale bandi nel DB: ${stats.total}`);
    console.log("Distribuzione per regione:");
    for (const r of stats.byRegion) {
      console.log(`  ${r.region}: ${r.count}`);
    }
    console.log("=".repeat(60));

    process.exit(0);
  } catch (err) {
    console.error("Errore durante il download storico:", err);
    process.exit(1);
  }
}

main();

