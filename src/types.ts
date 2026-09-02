// Definizione dei tipi di dati condivisi per la piattaforma Digits v2.0

/**
 * Rappresenta un articolo nel listino prodotti aziendale.
 */
export interface Product {
  id: string;
  codeOEM: string;      // E.g., HP CF259X, DELL-LAT5440
  description: string;  // Descrizione estesa del prodotto
  brand: string;        // Marchio (HP, Dell, Lenovo, ecc.)
  costPrice: number;    // Prezzo di acquisto a noi riservato (€)
  retailPrice: number;  // Prezzo di vendita consigliato (€)
  stock: number;        // Quantità disponibile a magazzino
  isTenderSpecific?: boolean;  // Prodotto aggiunto per una gara specifica
  tenderSpecificId?: string;   // ID della gara per cui è stato aggiunto
}

// ─── Certificazione societaria con scadenza ───────────────────────────────────

export interface Certification {
  id: string;
  name: string;              // Es. "ISO 9001:2015"
  issuer: string;            // Ente certificatore (es. "Bureau Veritas")
  certNumber: string;        // Numero certificato
  issueDate: string;         // Data rilascio (ISO8601)
  expiryDate: string;        // Data scadenza (ISO8601)
  isExpired?: boolean;       // Calcolato runtime
  isExpiringSoon?: boolean;  // Calcolato runtime (entro 30 giorni)
  filePath?: string;         // Path locale al file PDF del certificato
}

// ─── Documento societario standard ───────────────────────────────────────────

export interface SocietalDocument {
  type: 'DURC' | 'CCIAA' | 'SOA' | 'VISURA' | 'BILANCIO' | 'REFERENZA';
  label: string;
  value: string;        // Es. numero REA, valore fatturato, ecc.
  expiryDate?: string;  // Data scadenza (per DURC, SOA)
  notes?: string;
}

// ─── Fatturato triennale ──────────────────────────────────────────────────────

export interface TurnoverEntry {
  year: number;
  totalRevenue: number;        // Fatturato totale (€)
  paRevenue: number;           // Fatturato con PA (€)
  specificRevenue?: number;    // Fatturato specifico (es. solo ICT)
}

/**
 * Profilo aziendale completo v2.0 — persistito in data/company_profile.json
 */
export interface CompanyProfile {
  // Anagrafica base
  name: string;
  vatNumber: string;
  fiscalCode?: string;
  location: string;
  address?: string;
  pec?: string;                // Posta Elettronica Certificata
  phone?: string;

  // Capacità finanziaria
  maxTenderValue: number;      // Capacità massima per singola gara (€)
  turnover: TurnoverEntry[];   // Fatturato ultimi 3 esercizi

  // Qualificazioni
  mepaCategories: string[];    // Categorie MEPA attive
  mepaEnabled: boolean;        // Iscritto attivamente al MEPA
  consipEnabled: boolean;      // Iscritto al portale Consip

  // Certificazioni con scadenza
  certifications: string[];    // Lista semplificata (compatibilità)
  certificationDetails: Certification[];  // Dettaglio completo con scadenze

  // Documenti societari
  societalDocuments: SocietalDocument[];

  // Referenze PA (forniture analoghe eseguite)
  paReferences: Array<{
    authority: string;
    description: string;
    value: number;
    year: number;
  }>;

  // Metadata
  lastUpdated?: string;
}

// ─── Documento allegato a un bando ───────────────────────────────────────────

export interface TenderDocument {
  id: string;
  tenderId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  documentType: 'CAPITOLATO' | 'BANDO_INTEGRALE' | 'MODULO_OFFERTA' | 'ALLEGATO' | 'ALTRO';
  analyzed: boolean;
  analysisResult?: Partial<TenderAnalysis>;
}

// ─── Chat AI contestuale ──────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  contextTenderId?: string;
}

// ─── Job Log ──────────────────────────────────────────────────────────────────

export interface JobLogEntry {
  id: string;
  timestamp: string;
  triggeredBy: 'CRON' | 'MANUAL';
  status: 'SUCCESS' | 'ERROR' | 'RUNNING' | 'PARTIAL';
  tendersInserted: number;
  tendersTotal: number;
  durationMs: number;
  errorMessage?: string;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  tenderId?: string;
  tenderTitle?: string;
  details: string;
  metadata?: Record<string, any>;
}

// ─── Documento generato AI ───────────────────────────────────────────────────

export interface GeneratedDocument {
  type: 'DICHIARAZIONE_ANTIMAFIA' | 'SCHEDA_TECNICA' | 'DICHIARAZIONE_CAM' | 'NOTA_MEPA' | 'FLIGHT_CHECK_REPORT';
  title: string;
  content: string;
  generatedAt: string;
  tenderId: string;
}

export interface RequiredDocument {
  nome: string;
  descrizione: string;
  tipo: 'Amministrativo' | 'Tecnico' | 'Economico';
  bloccante: boolean;
}

export interface RequiredDocumentStatus {
  nome: string;
  descrizione: string;
  tipo: 'Amministrativo' | 'Tecnico' | 'Economico';
  stato: 'PRONTO' | 'DA_GENERARE' | 'DA_ACQUISIRE';
  azione: string;
  verificato: boolean;
}

/**
 * Rappresenta un bando di gara.
 */
export interface Tender {
  id: string;
  title: string;
  cig?: string;
  authority: string;
  value: number;
  deadline: string;
  region: string;
  cpv: string;
  description: string;
  aiEvaluation?: 'SCARTATA' | 'DA_VALUTARE' | 'APPROVATA';
  aiReasoning?: string;
  documentiRichiesti?: RequiredDocument[];
  vincoliEsclusione?: string[];
  status?: 'active' | 'submitted' | 'won' | 'lost';
  procedureType?: string;
  // Nuovi campi v2.0
  attachedDocs?: TenderDocument[];
  hasAnalyzedDocs?: boolean;
  // Tracciamento novità e persistenza
  isNew?: boolean;
  createdAt?: string;
}

/**
 * Risultato dell'analisi semantica del bando (Step 1).
 */
export interface TenderAnalysis {
  tenderId: string;
  authority: string;
  deadline: string;
  criterioAggiudicazione: string;
  requisitiBloccanti: string[];
  lotti: Array<{
    id: number;
    description: string;
    quantity: number;
    estimatedValue?: number;
    requiredSpecs?: string;
    category?: string;
  }>;
  documentiRichiesti: RequiredDocument[];
  vincoliEsclusione: string[];
}

/**
 * Risultato della verifica di conformità amministrativa (Step 2).
 */
export interface ComplianceItem {
  requirement: string;
  status: 'CONFORME' | 'SOCCORSO_ISTRUTTORIO' | 'NON_CONFORME';
  details: string;
}

export interface ComplianceVerification {
  tenderId: string;
  overallStatus: 'SCARTATA' | 'DA_VALUTARE' | 'APPROVATA';
  items: ComplianceItem[];
  reason: string;
  documentiStato: RequiredDocumentStatus[];
}

/**
 * Articolo mappato dell'offerta economica (Step 3).
 */
export interface OfferItem {
  lottoId: number;
  lottoDescription: string;
  requiredQty: number;
  matchedProductId?: string;
  matchedProductOEM?: string;
  unitCost: number;
  unitPrice: number;        // Può essere sovrascritta manualmente
  unitPriceOverride?: number; // Prezzo manuale inserito dall'utente
  totalPrice: number;
  marginPercentage: number;
  status: 'MAPPED' | 'STOCK_LOW' | 'NOT_FOUND';
  aiSuggestions?: Product[]; // Suggerimenti AI per NOT_FOUND
}

/**
 * Risultato finale dell'offerta economica generata.
 */
export interface GeneratedOffer {
  tenderId: string;
  items: OfferItem[];
  totalCost: number;
  totalPrice: number;
  totalMargin: number;
  marginPercentage: number;
  mepaSubmissionNote: string;
}

/**
 * Risultato Flight Check AI pre-invio
 */
export interface FlightCheckResult {
  tenderId: string;
  overallStatus: 'GO' | 'NO_GO' | 'ATTENTION';
  score: number; // 0-100
  checks: Array<{
    category: string;
    description: string;
    status: 'OK' | 'WARNING' | 'CRITICAL';
    details: string;
  }>;
  recommendations: string[];
  generatedAt: string;
}
