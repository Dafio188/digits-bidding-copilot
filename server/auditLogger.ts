/**
 * auditLogger.ts — Log persistente delle attività critiche della piattaforma
 * Registra: analisi bandi, generazione offerte, upload documenti, modifiche profilo.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const AUDIT_LOG_PATH = path.join(DATA_DIR, "audit_log.json");
const MAX_ENTRIES = 500;

export type AuditAction =
  | "TENDER_ANALYZED"
  | "COMPLIANCE_CHECKED"
  | "OFFER_GENERATED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_GENERATED"
  | "PROFILE_UPDATED"
  | "PRODUCT_ADDED"
  | "PRODUCT_UPDATED"
  | "TENDER_STATUS_CHANGED"
  | "INGESTION_TRIGGERED"
  | "AI_CHAT"
  | "FLIGHT_CHECK";

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  tenderId?: string;
  tenderTitle?: string;
  details: string;
  metadata?: Record<string, any>;
}

export interface AuditLog {
  entries: AuditEntry[];
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readAuditLog(): AuditLog {
  if (!fs.existsSync(AUDIT_LOG_PATH)) return { entries: [] };
  try {
    return JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, "utf8"));
  } catch {
    return { entries: [] };
  }
}

function writeAuditLog(log: AuditLog): void {
  if (log.entries.length > MAX_ENTRIES) {
    log.entries = log.entries.slice(-MAX_ENTRIES);
  }
  fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(log, null, 2), "utf8");
}

export function logActivity(
  action: AuditAction,
  details: string,
  extra?: { tenderId?: string; tenderTitle?: string; metadata?: Record<string, any> }
): void {
  const log = readAuditLog();
  const entry: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action,
    details,
    tenderId: extra?.tenderId,
    tenderTitle: extra?.tenderTitle,
    metadata: extra?.metadata,
  };
  log.entries.push(entry);
  writeAuditLog(log);
}

export function getAuditLog(limit = 100): AuditEntry[] {
  const log = readAuditLog();
  return log.entries.slice(-limit).reverse();
}
