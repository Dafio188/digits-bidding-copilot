/**
 * jobLogger.ts — Log persistente delle esecuzioni del job ANAC
 * Salva ogni esecuzione (riuscita o fallita) in data/job_log.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const JOB_LOG_PATH = path.join(DATA_DIR, "job_log.json");
const MAX_LOG_ENTRIES = 90; // Mantieni al massimo 90 giorni di log

export type JobStatus = "SUCCESS" | "ERROR" | "RUNNING" | "PARTIAL";

export interface JobLogEntry {
  id: string;
  timestamp: string;         // ISO8601
  triggeredBy: "CRON" | "MANUAL";
  status: JobStatus;
  tendersInserted: number;
  tendersTotal: number;
  durationMs: number;
  errorMessage?: string;
}

export interface JobLog {
  entries: JobLogEntry[];
  lastSuccess?: string;      // ISO8601 ultima esecuzione riuscita
  lastError?: string;        // ISO8601 ultimo errore
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readLog(): JobLog {
  if (!fs.existsSync(JOB_LOG_PATH)) return { entries: [] };
  try {
    return JSON.parse(fs.readFileSync(JOB_LOG_PATH, "utf8"));
  } catch {
    return { entries: [] };
  }
}

function writeLog(log: JobLog): void {
  // Mantieni solo gli ultimi MAX_LOG_ENTRIES
  if (log.entries.length > MAX_LOG_ENTRIES) {
    log.entries = log.entries.slice(-MAX_LOG_ENTRIES);
  }
  fs.writeFileSync(JOB_LOG_PATH, JSON.stringify(log, null, 2), "utf8");
}

export function startJobLog(triggeredBy: "CRON" | "MANUAL"): string {
  const id = `job-${Date.now()}`;
  const log = readLog();
  const entry: JobLogEntry = {
    id,
    timestamp: new Date().toISOString(),
    triggeredBy,
    status: "RUNNING",
    tendersInserted: 0,
    tendersTotal: 0,
    durationMs: 0,
  };
  log.entries.push(entry);
  writeLog(log);
  return id;
}

export function completeJobLog(
  id: string,
  result: { status: JobStatus; tendersInserted: number; tendersTotal?: number; errorMessage?: string },
  startTime: number
): void {
  const log = readLog();
  const idx = log.entries.findIndex((e) => e.id === id);
  if (idx === -1) return;

  log.entries[idx] = {
    ...log.entries[idx],
    status: result.status,
    tendersInserted: result.tendersInserted,
    tendersTotal: result.tendersTotal || 0,
    durationMs: Date.now() - startTime,
    errorMessage: result.errorMessage,
  };

  if (result.status === "SUCCESS" || result.status === "PARTIAL") {
    log.lastSuccess = new Date().toISOString();
  }
  if (result.status === "ERROR") {
    log.lastError = new Date().toISOString();
  }

  writeLog(log);
}

export function getJobLog(): JobLog {
  return readLog();
}

export function getLastJobStatus(): {
  lastSuccess: string | null;
  lastError: string | null;
  isStale: boolean;   // true se non aggiornato nelle ultime 26 ore
  lastEntry: JobLogEntry | null;
} {
  const log = readLog();
  const lastEntry = log.entries.length > 0 ? log.entries[log.entries.length - 1] : null;
  const lastSuccessTime = log.lastSuccess ? new Date(log.lastSuccess).getTime() : null;
  const isStale = !lastSuccessTime || (Date.now() - lastSuccessTime > 26 * 60 * 60 * 1000);
  return {
    lastSuccess: log.lastSuccess || null,
    lastError: log.lastError || null,
    isStale,
    lastEntry,
  };
}
