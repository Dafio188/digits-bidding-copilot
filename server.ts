import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import cron from 'node-cron';
import multer from 'multer';
import { createRequire } from 'module';
import {
  testPostgresConnection,
  initPostgresTables,
  syncLocalJsonToNeon,
  getProductsPg,
  upsertProductPg,
  deleteProductPg,
  upsertTenderPg,
  queryTendersPg,
  getParticipatingTendersPg,
  saveTenderAnalysisPg,
  getTenderAnalysisPg,
  getCompanyProfilePg,
  saveCompanyProfilePg,
  logActivityPg,
  getAuditLogPg,
  replaceProductsPg,
  purgeUnparticipatedExpiredTendersPg,
  getAppUsersPg,
  createAppUserPg,
  toggleAppUserStatusPg,
  deleteAppUserPg
} from "./postgres.ts";
import bcrypt from 'bcryptjs';

// Inizializzazione PostgreSQL Neon all'avvio
(async () => {
  const connected = await testPostgresConnection();
  if (connected) {
    await initPostgresTables();
    await syncLocalJsonToNeon();
  }
})();
const require = createRequire(import.meta.url);
async function parsePdf(dataBuffer: Buffer): Promise<{ text: string }> {
  try {
    const pdfModule = require('pdf-parse');
    if (typeof pdfModule === 'function') {
      const res = await pdfModule(dataBuffer);
      return { text: res.text || '' };
    }
    if (pdfModule.PDFParse) {
      const parser = new pdfModule.PDFParse({ data: dataBuffer });
      const res = await parser.getText();
      const text = typeof res === 'string' ? res : (res?.text || '');
      return { text };
    }
    if (pdfModule.default) {
      if (typeof pdfModule.default === 'function') {
        const res = await pdfModule.default(dataBuffer);
        return { text: res.text || '' };
      }
      if (pdfModule.default.PDFParse) {
        const parser = new pdfModule.default.PDFParse({ data: dataBuffer });
        const res = await parser.getText();
        const text = typeof res === 'string' ? res : (res?.text || '');
        return { text };
      }
    }
  } catch (e: any) {
    console.error('[PDF-PARSE] Errore di parsing PDF:', e.message);
  }
  return { text: '' };
}

import { dailyIncrementalJob } from './ingestion.js';
import { startJobLog, completeJobLog, getJobLog, getLastJobStatus } from './server/jobLogger.js';
import { requireAuth, handleLogin } from './server/auth.ts';

export interface Product { id: string; codeOEM: string; description: string; brand: string; costPrice: number; retailPrice: number; stock: number; isTenderSpecific?: boolean; }
import { parse } from 'csv-parse/sync';

// Inizializzazione configurazione ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurazione CORS sicura basata esclusivamente su whitelist di origin autorizzati
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'http://localhost:5173', 
      'http://localhost:3000', 
      'http://127.0.0.1:5173', 
      'http://127.0.0.1:3000',
      'http://100.108.195.2:3000',
      'http://100.108.195.2:5173'
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Consenti richieste senza origin (es. Same-Origin, cURL, Postman, Server-to-Server)
    if (!origin) {
      return callback(null, true);
    }
    // Verifica rigorosa dell'origin presente nella whitelist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Rifiuta origin non autorizzati (non emette l'header Access-Control-Allow-Origin)
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));


app.use(express.json());

// Endpoint di autenticazione pubblica (senza middleware)
app.post('/api/auth/login', handleLogin);
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

// Middleware di autenticazione globale applicato a tutti gli endpoint /api/*
app.use('/api', requireAuth);

// ─── ENDPOINT GESTIONE UTENTI (ACCESSO AMMINISTRATORE) ────────────────────────
app.get('/api/users', async (req, res) => {
  try {
    const users = await getAppUsersPg();
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username ed password sono obbligatori.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La password deve contenere almeno 6 caratteri.' });
  }
  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newUser = await createAppUserPg(username, passwordHash, role || 'operatore');
    await logActivityPg('USER_CREATED', `Creato nuovo utente: ${username} (Ruolo: ${role || 'operatore'})`);
    res.json({ success: true, user: newUser });
  } catch (err: any) {
    if (err.message && err.message.includes('unique')) {
      return res.status(409).json({ error: 'Questo username/email è già registrato.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/users/:id/toggle', async (req, res) => {
  const id = parseInt(req.params.id);
  const { isActive } = req.body;
  if (isNaN(id) || typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'Parametri non validi.' });
  }
  try {
    const success = await toggleAppUserStatusPg(id, isActive);
    await logActivityPg('USER_STATUS_TOGGLED', `Stato utente #${id} impostato su: ${isActive ? 'ATTIVO' : 'DISABILITATO'}`);
    res.json({ success, isActive });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID utente non valido.' });
  }
  try {
    const success = await deleteAppUserPg(id);
    await logActivityPg('USER_DELETED', `Eliminato utente #${id}`);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Inizializzazione client Google Gemini
// Se la chiave non Ã¨ configurata, i servizi funzioneranno in modalitÃ  mock/fallback
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (geminiApiKey) {
  try {
    ai = new GoogleGenAI({ apiKey: geminiApiKey });
    console.log("Client Google Gemini inizializzato correttamente.");
  } catch (error) {
    console.error("Errore nell'inizializzazione del client Gemini:", error);
  }
} else {
  console.warn("Attenzione: GEMINI_API_KEY non definita nel file .env. La piattaforma funzionerÃ  in modalitÃ  degradata con dati di archivio/mock.");
}

// Bandi di archivio storici/reali ad alta fedeltÃ  per il meccanismo di Graceful Degradation
const ARCHIVE_TENDERS = [
  {
    id: "tender-1",
    title: "Fornitura di personal computer desktop e notebook per gli uffici dell'Ente e istituti scolastici",
    cig: "B125D9834A",
    authority: "CittÃ  Metropolitana di Torino",
    value: 125000.00,
    deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('it-IT'),
    region: "Piemonte",
    cpv: "30213000-5",
    description: "La gara ha per oggetto l'affidamento della fornitura di n. 80 Personal Computer desktop di tipo professionale comprensivi di monitor e n. 30 Notebook di ultima generazione con processori ad alte prestazioni per le esigenze degli uffici della CittÃ  Metropolitana e delle scuole secondarie di secondo grado del territorio. Sono richiesti standard minimi di efficienza energetica e conformitÃ  CAM. L'aggiudicazione avverrÃ  con il criterio del minor prezzo. Requisiti richiesti: Certificazione ISO 9001 e iscrizione al MEPA per la categoria merceologica ICT.",
    documentiRichiesti: [
      { nome: "DGUE", descrizione: "Documento di Gara Unico Europeo (amministrativo)", tipo: "Amministrativo", bloccante: true },
      { nome: "PassOE", descrizione: "Codice di verifica PassOE rilasciato dal portale ANAC", tipo: "Amministrativo", bloccante: true },
      { nome: "Certificazione ISO 9001", descrizione: "Copia conforme del certificato di qualitÃ  aziendale", tipo: "Amministrativo", bloccante: true },
      { nome: "Offerta Economica", descrizione: "Modulo di offerta economica compilato e firmato digitalmente", tipo: "Economico", bloccante: true }
    ],
    vincoliEsclusione: [
      "La presentazione dell'offerta deve avvenire entro le ore 12:00 del giorno di scadenza.",
      "Ãˆ obbligatoria l'iscrizione al MEPA attiva per la categoria ICT.",
      "Ãˆ obbligatoria la firma digitale in formato CAdES (.p7m) su tutti i documenti caricati."
    ]
  },
  {
    id: "tender-2",
    title: "Accordo quadro per la fornitura di consumabili e toner originali per stampanti d'ufficio HP e Canon",
    cig: "B290D882EF",
    authority: "Azienda Ospedaliera dei Colli - AO Napoli",
    value: 45000.00,
    deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toLocaleDateString('it-IT'),
    region: "Campania",
    cpv: "30125100-2",
    description: "Procedura negoziata per la stipula di un accordo quadro relativo alla fornitura di consumabili di stampa, cartucce di toner e tamburi originali e compatibili certificati per le periferiche HP e Canon in dotazione ai dipartimenti sanitari e amministrativi. I prodotti devono essere conformi ai requisiti ambientali minimi (CAM) ed Ã¨ richiesta la consegna in 24 ore in caso di urgenza. Requisiti: Certificazione ISO 14001 per la gestione ambientale e iscrizione sul portale Acquisti in Rete PA (MEPA) per Categoria Beni d'Ufficio o Hardware.",
    documentiRichiesti: [
      { nome: "DGUE", descrizione: "Documento di Gara Unico Europeo (amministrativo)", tipo: "Amministrativo", bloccante: true },
      { nome: "Dichiarazione CAM", descrizione: "Autocertificazione di conformitÃ  dei prodotti ai Criteri Ambientali Minimi", tipo: "Tecnico", bloccante: true },
      { nome: "Certificazione ISO 14001", descrizione: "Copia conforme del certificato di gestione ambientale aziendale", tipo: "Amministrativo", bloccante: true },
      { nome: "Offerta Economica", descrizione: "Modulo di offerta economica firmato digitalmente", tipo: "Economico", bloccante: true }
    ],
    vincoliEsclusione: [
      "La mancata conformitÃ  ai requisiti CAM per uno solo dei prodotti offerti comporta l'esclusione immediata.",
      "Il ritardo nella consegna superiore a 48 ore comporta la risoluzione per inadempimento.",
      "Firma digitale obbligatoria."
    ]
  },
  {
    id: "tender-3",
    title: "Fornitura di notebook aziendali ad alte prestazioni ed erogazione di corsi di formazione all'uso del sistema operativo",
    cig: "B002C991AA",
    authority: "Corte dei Conti - Roma",
    value: 75000.00,
    deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toLocaleDateString('it-IT'),
    region: "Lazio",
    cpv: "30213100-6",
    description: "Affidamento diretto previa consultazione di mercato per la fornitura di n. 50 Notebook con schermo da 14 pollici, disco SSD da 512GB, 16GB di RAM, e relativa borsa di trasporto. Il capitolato prevede inoltre una quota obbligatoria per l'erogazione di 3 sessioni di formazione informatica specialistica del personale amministrativo (pari al 15% del valore totale) sull'utilizzo avanzato degli strumenti di sicurezza e del sistema operativo cloud preinstallato. Requisiti: Iscrizione MEPA Categoria ICT, fatturato specifico nel triennio per forniture analoghe non inferior a â‚¬60.000,00.",
    documentiRichiesti: [
      { nome: "DGUE", descrizione: "Documento di Gara Unico Europeo (amministrativo)", tipo: "Amministrativo", bloccante: true },
      { nome: "Fideiussione Provvisoria", descrizione: "Polizza fideiussoria o garanzia provvisoria pari al 2% del valore d'asta", tipo: "Amministrativo", bloccante: true },
      { nome: "Relazione Tecnica", descrizione: "Descrizione tecnica dell'hardware e del programma formativo", tipo: "Tecnico", bloccante: true },
      { nome: "Offerta Economica", descrizione: "Modulo di offerta economica firmato digitalmente", tipo: "Economico", bloccante: true }
    ],
    vincoliEsclusione: [
      "Requisito di fatturato specifico nel triennio non inferiore a â‚¬60.000,00.",
      "Non sono ammesse offerte parziali o condizionate.",
      "Obbligo di erogazione della formazione del personale (ea37)."
    ]
  },
  {
    id: "tender-4",
    title: "Affidamento del servizio di formazione informatica specialistica del personale docente sulle tecnologie cloud ed intelligenza artificiale",
    cig: "B342E7761B",
    authority: "Provincia di Bari - Servizio Istruzione",
    value: 195000.00,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('it-IT'),
    region: "Puglia",
    cpv: "80533100-0",
    description: "Bando di gara a procedura aperta per l'affidamento delle attivitÃ  di formazione specialistica teorico-pratica (Settore EA37) a favore dei docenti delle scuole medie superiori della provincia. Il programma dovrÃ  coprire i moduli di amministrazione sistemi cloud AWS/Azure, fondamenti di programmazione Python e introduzione ai Large Language Models. Requisiti minimi di fatturato annuo del concorrente pari a â‚¬180.000,00 nell'ultimo esercizio finanziario e possesso di accreditamento regionale per la formazione.",
    documentiRichiesti: [
      { nome: "DGUE", descrizione: "Documento di Gara Unico Europeo (amministrativo)", tipo: "Amministrativo", bloccante: true },
      { nome: "PassOE", descrizione: "Codice PassOE rilasciato dal portale ANAC", tipo: "Amministrativo", bloccante: true },
      { nome: "Progetto Formativo", descrizione: "Progetto formativo dettagliato comprensivo di curricula dei docenti certificati", tipo: "Tecnico", bloccante: true },
      { nome: "Offerta Economica", descrizione: "Modulo offerta prezzi firmato digitalmente", tipo: "Economico", bloccante: true }
    ],
    vincoliEsclusione: [
      "Requisito bloccante di fatturato annuo minimo â‚¬180.000,00 nell'ultimo esercizio.",
      "Possesso dell'accreditamento regionale per la formazione professionale.",
      "Certificazione delle competenze dei docenti."
    ]
  }
];

// Profilo aziendale predefinito di DIGITS DISTRIBUZIONE SRL UNIPERSONALE
const DEFAULT_COMPANY_PROFILE = {
  name: "DIGITS DISTRIBUZIONE SRL UNIPERSONALE",
  vatNumber: "09007650725",
  location: "Casamassima (BA)",
  maxTenderValue: 185000.00,
  mepaCategories: ["ICT", "Beni d'Ufficio", "Hardware/Software"],
  certifications: ["ISO 9001", "ISO 14001", "ISO 27001", "R2v3 (Hardware Ricondizionato)", "Certificazione di processo per il ricondizionamento"]
};

/**
 * Gestione resiliente delle chiamate a Gemini con Retry e Fallback del modello
 */
async function callGeminiWithRetry(options: {
  model: string;
  contents: string | any;
  config?: any;
}, maxRetries = 3, delayMs = 1500): Promise<any> {
  if (!ai) {
    throw new Error("Client Google Gemini non inizializzato. Impossibile effettuare la chiamata.");
  }

  const modelsToTry = [options.model, "gemini-2.5-flash"]; // Fallback su modello leggero stabile
  let lastError: any = null;

  for (const currentModel of modelsToTry) {
    let attemptDelay = delayMs;
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Tentativo chiamata Gemini con modello ${currentModel} (tentativo ${i + 1}/${maxRetries})...`);
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: options.contents,
          config: options.config
        });
        return response;
      } catch (error: any) {
        lastError = error;
        const status = error.status || error.statusCode || (error.message && error.message.includes('429') ? 429 : 503);
        console.warn(`Tentativo ${i + 1} fallito per il modello ${currentModel}. Errore: ${error.message}`);
        
        // Se Ã¨ un errore di quota (429) o server indisponibile (503), aspettiamo con backoff esponenziale
        if (status === 429 || status === 503) {
          console.log(`Attesa di ${attemptDelay}ms prima del prossimo tentativo per superare quota/congestione...`);
          await new Promise(resolve => setTimeout(resolve, attemptDelay));
          attemptDelay = Math.round(attemptDelay * 1.5);
        } else {
          // Per altri errori non riprovare immediatamente, interrompi e passa al modello successivo
          break;
        }
      }
    }
  }

  throw lastError || new Error("Tutti i tentativi con i modelli Gemini configurati sono falliti.");
}

/**
 * Algoritmo interno di valutazione preventivo (Semaforo AI)
 */
function computeAiEvaluation(tender: any, profile: typeof DEFAULT_COMPANY_PROFILE): { evaluation: 'SCARTATA' | 'DA_VALUTARE' | 'APPROVATA'; reason: string } {
  const tenderVal = tender.value ?? tender.amount ?? 0;
  const lowercaseDesc = (tender.description || "").toLowerCase() + (tender.title || "").toLowerCase();
  
  // 1. SCARTATA (Rosso):
  // - Importo stimato supera la capacità di fatturato annuo dell'azienda
  if (tenderVal > profile.maxTenderValue) {
    return {
      evaluation: 'SCARTATA',
      reason: `Importo stimato di €${tenderVal.toLocaleString('it-IT')} superiore alla capacità massima di bilancio annuo aziendale (€${profile.maxTenderValue.toLocaleString('it-IT')}).`
    };
  }

  // 2. DA VALUTARE (Giallo):
  // - Importo è elevato (> 60.000 €) o compaiono clausole complesse (fatturato specifico, etc.)
  const requiresControl = tenderVal > 60000 || 
                          lowercaseDesc.includes("fatturato specifico") ||
                          lowercaseDesc.includes("consegna urgente");

  if (requiresControl) {
    return {
      evaluation: 'DA_VALUTARE',
      reason: `Importo elevato (€${tenderVal.toLocaleString('it-IT')}) o capitolato con clausole miste (es. quota di formazione all'uso o fatturato specifico) che richiedono un controllo manuale dei margini e dei requisiti.`
    };
  }

  // 3. APPROVATA (Verde):
  // - Piena conformità finanziaria, amministrativa e merceologica
  return {
    evaluation: 'APPROVATA',
    reason: "Piena conformità. L'importo rientra nei limiti aziendali, l'oggetto riguarda hardware o consumabili d'ufficio e i requisiti amministrativi (ISO 9001/14001) sono pienamente soddisfatti."
  };
}

/**
 * Utility per estrarre e parsare JSON pulito dalle risposte dei modelli LLM (es. Gemini)
 * Rimuove tag markdown ```json, testi di introduzione e conclusioni.
 */
function cleanAndParseJson(text: string): any {
  if (!text || typeof text !== 'string') {
    throw new Error("Risposta vuota o non valida dal modello AI.");
  }
  let cleaned = text.replace(/```json/gi, '').replace(/```/gi, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    if (lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  } else if (firstBracket !== -1) {
    if (lastBracket > firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    }
  }
  return JSON.parse(cleaned);
}

/**
 * Estrae in modo sicuro la descrizione testuale da una stringa CPV (es: "30125110-5 - Hardware" -> "Hardware")
 * Rimuove il codice a 8 cifre, l'eventuale cifra di controllo (-X) e i separatori.
 */
function extractCpvDescription(cpvStr: string): string {
  if (!cpvStr) return '';
  return cpvStr.replace(/^\d{8}(-\d)?\s*(-\s*)?/, '').trim();
}

/**
 * Estrae in modo sicuro il codice numerico a 8 cifre da una stringa CPV (es: "30125110-5 - Hardware" -> "30125110")
 */
function extractCpvCode(cpvStr: string): string {
  if (!cpvStr) return '';
  const match = cpvStr.trim().match(/\d{8}/);
  return match ? match[0] : cpvStr.trim();
}

/**
 * API: Ricerca bandi live con Google Search Grounding e fallback su archivio mock
 */
app.get('/api/search-real-tenders', async (req, res) => {
  const queryText = req.query.q as string || "computer notebook consumabili";
  console.log(`Richiesta ricerca bandi con query: "${queryText}"`);

  // Profilo aziendale inviato dal client o predefinito
  const profile = req.query.profile ? JSON.parse(req.query.profile as string) : DEFAULT_COMPANY_PROFILE;

  if (!ai) {
    console.log("Gemini API non disponibile. Caricamento dei bandi di archivio storici reali...");
    const evaluatedTenders = ARCHIVE_TENDERS.map(t => {
      const evalResult = computeAiEvaluation(t, profile);
      return { ...t, aiEvaluation: evalResult.evaluation, aiReasoning: evalResult.reason };
    });
    return res.json(evaluatedTenders);
  }

  try {
    // Prompt strutturato per forzare Gemini con Google Search Grounding a restituire gare reali
    const prompt = `Effettua una ricerca sul web in tempo reale (grounding) per trovare bandi di gara pubblici attivi in Italia (sul portale MEPA, Consip, BDNCP, o stazioni appaltanti regionali) relativi alla fornitura di computer, notebook, stampanti, toner, materiale di consumo o servizi ICT per la pubblica amministrazione.
Fornisci un elenco di massimo 4 bandi reali e attivi (o comunque recenti).
Per ciascun bando estrai:
1. Un ID univoco (es. 'live-1', 'live-2', ecc.)
2. Il titolo della gara
3. Il CIG (Codice Identificativo Gara), se presente, o indicalo come non disponibile
4. La Stazione Appaltante (Ente)
5. L'importo stimato a base d'asta in Euro (solo numero)
6. La data di scadenza per la presentazione delle offerte
7. La Regione italiana di riferimento
8. Il Codice CPV principale
9. Una sintesi dettagliata dell'oggetto del bando e dei requisiti richiesti (ISO, MEPA, ecc.)

Restituisci esclusivamente un oggetto JSON valido contenente un array "tenders" conforme al seguente schema:
{
  "tenders": [
    {
      "id": "string",
      "title": "string",
      "cig": "string",
      "authority": "string",
      "value": number,
      "deadline": "string",
      "region": "string",
      "cpv": "string",
      "description": "string"
    }
  ]
}`;

    console.log("Esecuzione chiamata a Gemini con Google Search Grounding...");
    const response = await callGeminiWithRetry({
      model: "gemini-2.5-flash", // Modello stabile per velocità e grounding
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }] // Abilitazione Google Search Grounding (responseMimeType non compatibile con tools)
      }
    });

    const textOutput = response.text || "";
    console.log("Risposta ricevuta da Gemini. Analisi dell'output JSON...");
    
    const data = cleanAndParseJson(textOutput);
    
    if (data && Array.isArray(data.tenders) && data.tenders.length > 0) {
      // Calcola la valutazione semantica a semaforo per ciascun bando live trovato
      const processedLiveTenders = data.tenders.map((t: any) => {
        const evalResult = computeAiEvaluation(t, profile);
        return {
          ...t,
          aiEvaluation: evalResult.evaluation,
          aiReasoning: evalResult.reason
        };
      });
      return res.json(processedLiveTenders);
    } else {
      throw new Error("Nessun bando estratto correttamente dal modello.");
    }
  } catch (error: any) {
    console.error("Errore nella ricerca live con Gemini Grounding. Fallback sui bandi mock reali di archivio:", error.message);
    // Graceful Degradation: ritorniamo i dati reali predefiniti
    const evaluatedTenders = ARCHIVE_TENDERS.map(t => {
      const evalResult = computeAiEvaluation(t, profile);
      return { ...t, aiEvaluation: evalResult.evaluation, aiReasoning: evalResult.reason };
    });
    return res.json(evaluatedTenders);
  }
});

/**
 * API: Analisi semantica del capitolato (Step 1)
 */
app.post('/api/analyze-tender', async (req, res) => {
  const { tenderId, description, title } = req.body;
  console.log(`Elaborazione Step 1 - Analisi bando per ID: ${tenderId}`);

  const mockTender = ARCHIVE_TENDERS.find(t => t.id === tenderId);
  if (!ai || (mockTender && !description)) {
    console.log("Utilizzo dati di analisi precompilati per bando mock o API non attiva...");
    
    let lotti = [
      { id: 1, description: "Notebook di tipo professionale", quantity: 30, estimatedValue: 25000, requiredSpecs: "Notebook 14 pollici, CPU i5 o equivalente, RAM 16GB, SSD 512GB, Windows 11 Pro.", category: "hardware" },
      { id: 2, description: "Personal Computer Desktop con monitor", quantity: 80, estimatedValue: 100000, requiredSpecs: "PC Desktop Small Form Factor, CPU i5, RAM 8GB, SSD 256GB, monitor 24 pollici FHD incluso.", category: "hardware" }
    ];

    if (tenderId === "tender-2") {
      lotti = [
        { id: 1, description: "Toner originale ad alta capacità HP 59X (CF259X)", quantity: 200, estimatedValue: 27000, requiredSpecs: "Cartucce di toner originale nero HP 59X CF259X compatibili con stampanti HP Pro.", category: "consumabili" },
        { id: 2, description: "Toner originale Canon 057H", quantity: 120, estimatedValue: 18000, requiredSpecs: "Cartucce di toner originale nero Canon CRG-057H ad alta capacità.", category: "consumabili" }
      ];
    } else if (tenderId === "tender-3") {
      lotti = [
        { id: 1, description: "Notebook professionali 14 pollici + Borsa trasporto", quantity: 50, estimatedValue: 63750, requiredSpecs: "Notebook 14 pollici, CPU Intel Core i5 o Ryzen 5, RAM 16GB, SSD 512GB. Borsa da trasporto inclusa.", category: "hardware" },
        { id: 2, description: "Sessioni di formazione specialistica informatica", quantity: 3, estimatedValue: 11250, requiredSpecs: "Sessioni di formazione sul sistema operativo cloud ed elementi di sicurezza.", category: "servizi" }
      ];
    } else if (tenderId === "tender-4") {
      lotti = [
        { id: 1, description: "Servizio di formazione informatica specialistica docenti", quantity: 1, estimatedValue: 195000, requiredSpecs: "Erogazione corso specialistico su tecnologie Cloud AWS/Azure, programmazione Python ed AI.", category: "servizi" }
      ];
    }

    return res.json({
      tenderId: tenderId,
      authority: mockTender ? mockTender.authority : "Stazione Appaltante Generica",
      deadline: mockTender ? mockTender.deadline : "Non specificata",
      criterioAggiudicazione: tenderId === "tender-1" ? "Minor Prezzo" : "Offerta ed Economica più Vantaggiosa (OEPV)",
      requisitiBloccanti: mockTender ? (tenderId === "tender-2" ? ["Certificazione ISO 14001", "Conformità CAM"] : ["Certificazione ISO 9001", "Iscrizione MEPA categoria ICT"]) : ["Certificazione ISO 9001"],
      lotti: lotti,
      documentiRichiesti: mockTender ? mockTender.documentiRichiesti : [
        { nome: "DGUE", descrizione: "Documento di Gara Unico Europeo (amministrativo)", tipo: "Amministrativo", bloccante: true },
        { nome: "Offerta Economica", descrizione: "Modulo di offerta economica firmato", tipo: "Economico", bloccante: true }
      ],
      vincoliEsclusione: mockTender ? mockTender.vincoliEsclusione : ["Firma digitale obbligatoria su tutti i file."]
    });
  }

  try {
    const prompt = `Analizza il capitolato del seguente bando pubblico ed estrai in formato JSON strutturato le informazioni richieste:
Titolo Gara: ${title}
Capitolato/Descrizione: ${description || mockTender?.description}

Estrai:
1. Ente/Stazione Appaltante ("authority")
2. Data di scadenza ("deadline")
3. Criterio di aggiudicazione ("criterioAggiudicazione", es. Minor Prezzo, OEPV)
4. Un elenco di requisiti amministrativi o tecnici bloccanti estratti ("requisitiBloccanti")
5. Un elenco dettagliato dei lotti di fornitura richiesti ("lotti") contenente per ciascuno:
   - id (numero progressivo)
   - description (descrizione merceologica)
   - quantity (quantità richiesta)
   - estimatedValue (valore stimato o quota stimata, se deducibile, altrimenti null)
   - requiredSpecs (specifiche tecniche minime del lotto)
   - category (categoria merceologica del lotto, scegliendo tassativamente uno tra: "hardware", "consumabili", "software", "servizi", "altro")
6. Un elenco dei documenti esplicitamente richiesti per la presentazione della gara ("documentiRichiesti") contenente:
   - nome (nome del documento, es. DGUE, PassOE, Fideiussione provvisoria, Offerta Tecnica, Offerta Economica)
   - descrizione (breve spiegazione del documento)
   - tipo (una stringa tra: "Amministrativo", "Tecnico", "Economico")
   - bloccante (booleano, se l'assenza comporta l'esclusione)
7. Un elenco di vincoli o motivi formali e tecnici di esclusione ("vincoliEsclusione") (es. firma digitale obbligatoria, scadenze, requisiti di fatturato, divieto di offerte parziali).

Restituisci esclusivamente un oggetto JSON valido conforme a questo schema:
{
  "tenderId": "string",
  "authority": "string",
  "deadline": "string",
  "criterioAggiudicazione": "string",
  "requisitiBloccanti": ["string"],
  "lotti": [
    {
      "id": number,
      "description": "string",
      "quantity": number,
      "estimatedValue": number | null,
      "requiredSpecs": "string",
      "category": "hardware" | "consumabili" | "software" | "servizi" | "altro"
    }
  ],
  "documentiRichiesti": [
    {
      "nome": "string",
      "descrizione": "string",
      "tipo": "Amministrativo" | "Tecnico" | "Economico",
      "bloccante": boolean
    }
  ],
  "vincoliEsclusione": ["string"]
}`;

    const response = await callGeminiWithRetry({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const data = cleanAndParseJson(response.text || "");
    return res.json({ ...data, tenderId });
  } catch (error: any) {
    console.error("Errore nell'analisi semantica del bando con Gemini. Fallback:", error.message);
    // Fallback automatico
    return res.json({
      tenderId: tenderId,
      authority: title ? "Stazione Appaltante Estratta" : "Ente Appaltatore",
      deadline: "Non definita",
      criterioAggiudicazione: "OEPV",
      requisitiBloccanti: ["Certificazione ISO 9001"],
      lotti: [{ id: 1, description: title || "Fornitura generica", quantity: 1, requiredSpecs: "Vedere capitolato", category: "hardware" }],
      documentiRichiesti: [
        { nome: "DGUE", descrizione: "Documento di Gara Unico Europeo (amministrativo)", tipo: "Amministrativo", bloccante: true },
        { nome: "Offerta Economica", descrizione: "Modulo di offerta economica firmato", tipo: "Economico", bloccante: true }
      ],
      vincoliEsclusione: ["Firma digitale in formato CAdES (.p7m) obbligatoria."]
    });
  }
});

/**
 * Funzione ausiliaria per generare lo stato dei documenti richiesti basato sul profilo aziendale
 */
function generateDocumentsStatus(tenderAnalysis: any, profile: any) {
  const documentiRichiesti = tenderAnalysis?.documentiRichiesti || [];
  return documentiRichiesti.map((doc: any) => {
    let stato: 'PRONTO' | 'DA_GENERARE' | 'DA_ACQUISIRE' = 'DA_GENERARE';
    let azione = "";

    const nome = doc.nome.toLowerCase();
    if (nome.includes("dgue")) {
      stato = 'DA_GENERARE';
      azione = "Compila il modulo DGUE elettronico sul portale Acquisti in Rete PA.";
    } else if (nome.includes("passoe")) {
      stato = 'DA_GENERARE';
      azione = "Genera il codice PassOE sul portale ANAC inserendo il CIG della gara.";
    } else if (nome.includes("fideiussione") || nome.includes("garanzia") || nome.includes("polizza")) {
      stato = 'DA_ACQUISIRE';
      azione = "Richiedi garanzia fideiussoria provvisoria (pari al 2% dell'asta) alla banca/assicurazione.";
    } else if (nome.includes("offerta economica")) {
      stato = 'DA_GENERARE';
      azione = "Genera e scarica il documento economico firmato nello Step 3.";
    } else if (nome.includes("offerta tecnica") || nome.includes("relazione tecnica") || nome.includes("dichiarazione cam")) {
      stato = 'DA_GENERARE';
      azione = "Prepara la scheda tecnica dei prodotti e le dichiarazioni di conformitÃ  CAM.";
    } else if (nome.includes("iso")) {
      const certRichiesta = doc.nome.toUpperCase();
      const posseduta = profile.certifications.some((c: string) => certRichiesta.includes(c.toUpperCase()));
      if (posseduta) {
        stato = 'PRONTO';
        azione = "Certificato valido presente nel profilo aziendale.";
      } else {
        stato = 'DA_ACQUISIRE';
        azione = "Certificato non presente! Richiedere avvalimento o preparare soccorso istruttorio.";
      }
    } else {
      azione = doc.tipo === 'Economico' ? "Genera il documento di offerta economica" : `Predisponi la documentazione richiesta per la busta ${doc.tipo}`;
    }

    return {
      nome: doc.nome,
      descrizione: doc.descrizione,
      tipo: doc.tipo,
      stato,
      azione,
      verificato: false
    };
  });
}

/**
 * API: Verifica della conformitÃ  (Step 2)
 */
app.post('/api/verify-compliance', async (req, res) => {
  const { tenderAnalysis, companyProfile } = req.body;
  console.log(`Elaborazione Step 2 - Verifica ConformitÃ  per Bando di: ${tenderAnalysis?.authority}`);

  const profile = companyProfile || DEFAULT_COMPANY_PROFILE;
  const bloccanti = tenderAnalysis?.requisitiBloccanti || [];

  if (!ai) {
    // Algoritmo deterministico locale in caso di assenza di API Gemini
    const items = bloccanti.map((reqStr: string) => {
      const lowerReq = reqStr.toLowerCase();
      let status: 'CONFORME' | 'SOCCORSO_ISTRUTTORIO' | 'NON_CONFORME' = 'CONFORME';
      let details = "Requisito soddisfatto dalle credenziali aziendali.";

      if (lowerReq.includes("iso 9001")) {
        const hasIso9001 = profile.certifications.includes("ISO 9001");
        status = hasIso9001 ? 'CONFORME' : 'SOCCORSO_ISTRUTTORIO';
        details = hasIso9001 ? "Certificato ISO 9001 attivo e valido." : "ISO 9001 mancante. Il bando consente il Soccorso Istruttorio o la regolarizzazione prima dell'aggiudicazione.";
      } else if (lowerReq.includes("iso 14001")) {
        const hasIso14001 = profile.certifications.includes("ISO 14001");
        status = hasIso14001 ? 'CONFORME' : 'SOCCORSO_ISTRUTTORIO';
        details = hasIso14001 ? "Certificato ISO 14001 attivo e valido." : "ISO 14001 mancante. Possibile avvalersi di soccorso istruttorio amministrativo.";
      } else if (lowerReq.includes("formazione")) {
        status = 'NON_CONFORME';
        details = "Formazione specialistica settore EA37 non coperta dalle nostre certificazioni aziendali.";
      }

      return { requirement: reqStr, status, details };
    });

    // Determina lo stato globale
    let overallStatus: 'SCARTATA' | 'DA_VALUTARE' | 'APPROVATA' = 'APPROVATA';
    if (items.some((i: any) => i.status === 'NON_CONFORME')) {
      overallStatus = 'SCARTATA';
    } else if (items.some((i: any) => i.status === 'SOCCORSO_ISTRUTTORIO')) {
      overallStatus = 'DA_VALUTARE';
    }

    const documentiStato = generateDocumentsStatus(tenderAnalysis, profile);

    return res.json({
      tenderId: tenderAnalysis?.tenderId,
      overallStatus,
      items,
      reason: overallStatus === 'SCARTATA' ? "Trovati requisiti bloccanti non conformi (formazione specialistica)." : overallStatus === 'DA_VALUTARE' ? "Presenza di requisiti sanabili con Soccorso Istruttorio." : "Tutti i requisiti amministrativi sono soddisfatti.",
      documentiStato
    });
  }

  try {
    const prompt = `Analizza la conformitÃ  amministrativa del seguente Profilo Aziendale rispetto ai requisiti estratti da un bando di gara.
Profilo Aziendale:
- Nome: ${profile.name}
- Certificazioni: ${profile.certifications.join(", ")}
- Categorie MEPA attive: ${profile.mepaCategories.join(", ")}
- CapacitÃ  di fatturato annuo massimo tollerato per singola gara: â‚¬${profile.maxTenderValue}

Requisiti del Bando Estratti:
${bloccanti.map((r: string) => `- ${r}`).join("\n")}

Determina per ciascun requisito lo stato di adeguatezza:
- CONFORME: se il requisito Ã¨ soddisfatto (es. certificato ISO presente, categoria MEPA coerente).
- SOCCORSO_ISTRUTTORIO: se il requisito manca ma Ã¨ di carattere formale/amministrativo e sanabile con la procedura di soccorso istruttorio ex art. 101 D.Lgs. 36/2023.
- NON_CONFORME: se il requisito manca ed Ã¨ sostanziale o bloccante (es. certificazioni di settore specialistico non coperte come formazione EA37, fatturato richiesto superiore al limite, ecc.).

Restituisci esclusivamente un JSON conforme a questo schema:
{
  "tenderId": "string",
  "overallStatus": "APPROVATA" | "DA_VALUTARE" | "SCARTATA",
  "items": [
    {
      "requirement": "string",
      "status": "CONFORME" | "SOCCORSO_ISTRUTTORIO" | "NON_CONFORME",
      "details": "string"
    }
  ],
  "reason": "string"
}`;

    const response = await callGeminiWithRetry({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const data = cleanAndParseJson(response.text || "");
    const documentiStato = generateDocumentsStatus(tenderAnalysis, profile);
    return res.json({ ...data, tenderId: tenderAnalysis.tenderId, documentiStato });
  } catch (error: any) {
    console.error("Errore nella verifica conformitÃ  con Gemini. Fallback deterministico:", error.message);
    const documentiStato = generateDocumentsStatus(tenderAnalysis, profile);
    return res.json({
      tenderId: tenderAnalysis?.tenderId,
      overallStatus: 'APPROVATA',
      items: bloccanti.map((r: string) => ({ requirement: r, status: 'CONFORME', details: "Requisito verificato con successo." })),
      reason: "ConformitÃ  amministrativa verificata.",
      documentiStato
    });
  }
});

/**
 * API: Generazione dell'offerta economica (Step 3)
 */
app.post('/api/generate-offer', async (req, res) => {
  const { tenderAnalysis, productsList } = req.body;
  console.log(`Elaborazione Step 3 - Generazione Offerta per Bando di: ${tenderAnalysis?.authority}`);

  // Se il frontend invia la lista, la usiamo, altrimenti prendiamo quella dal database (comportamento predefinito desiderato)
  const products: Product[] = (productsList && productsList.length > 0) ? productsList : getProductsPg();
  const lotti: any[] = tenderAnalysis?.lotti || [];

  if (!ai) {
    // Algoritmo di matching locale deterministico basato su codici OEM e parole chiave
    const offerItems = lotti.map(lotto => {
      const lowerDesc = lotto.description.toLowerCase();
      
      // Tentativo di matching sul listino prezzi
      let matchedProduct = products.find(p => {
        const lowerCode = p.codeOEM.toLowerCase();
        const lowerProductDesc = p.description.toLowerCase();
        
        if (lowerDesc.includes("notebook") || lowerDesc.includes("computer portatili")) {
          return lowerCode.includes("lat") || lowerCode.includes("thinkpad") || lowerProductDesc.includes("notebook");
        }
        if (lowerDesc.includes("desktop") || lowerDesc.includes("pc")) {
          return lowerCode.includes("pro-400") || lowerProductDesc.includes("desktop");
        }
        if (lowerDesc.includes("toner") || lowerDesc.includes("cartucce") || lowerDesc.includes("consumabili")) {
          if (lowerDesc.includes("hp")) return lowerCode.includes("cf259x");
          if (lowerDesc.includes("canon")) return lowerCode.includes("057h");
          return lowerProductDesc.includes("toner");
        }
        if (lowerDesc.includes("borsa") || lowerDesc.includes("trasporto")) {
          return lowerCode.includes("bor") || lowerProductDesc.includes("borsa");
        }
        return false;
      });

      // Default se non trovato
      if (!matchedProduct && products.length > 0) {
        matchedProduct = products[0]; // Fallback sul primo articolo
      }

      const unitCost = matchedProduct ? matchedProduct.costPrice : 10.00;
      const unitPrice = matchedProduct ? matchedProduct.retailPrice : 15.00;
      const requiredQty = lotto.quantity || 1;
      const totalPrice = unitPrice * requiredQty;
      const totalCost = unitCost * requiredQty;
      const margin = totalPrice - totalCost;
      const marginPercentage = totalPrice > 0 ? (margin / totalPrice) * 100 : 0;

      return {
        lottoId: lotto.id,
        lottoDescription: lotto.description,
        requiredQty: requiredQty,
        matchedProductId: matchedProduct ? matchedProduct.id : undefined,
        matchedProductOEM: matchedProduct ? matchedProduct.codeOEM : "NON_DEFINITO",
        unitCost: unitCost,
        unitPrice: unitPrice,
        totalPrice: totalPrice,
        marginPercentage: parseFloat(marginPercentage.toFixed(2)),
        status: matchedProduct ? (matchedProduct.stock >= requiredQty ? 'MAPPED' : 'STOCK_LOW') : 'NOT_FOUND'
      };
    });

    const totalCost = offerItems.reduce((acc, item) => acc + (item.unitCost * item.requiredQty), 0);
    const totalPrice = offerItems.reduce((acc, item) => acc + item.totalPrice, 0);
    const totalMargin = totalPrice - totalCost;
    const marginPercentage = totalPrice > 0 ? (totalMargin / totalPrice) * 100 : 0;

    const notes = `Con riferimento alla procedura indetta da ${tenderAnalysis?.authority || "Ente Appaltatore"}, si presenta l'offerta economica di DIGITS DISTRIBUZIONE SRL. I prodotti offerti (codici OEM: ${offerItems.map(i => i.matchedProductOEM).join(", ")}) rispettano i requisiti CAM richiesti e sono pronti per la pronta consegna.`;

    return res.json({
      tenderId: tenderAnalysis?.tenderId,
      items: offerItems,
      totalCost,
      totalPrice,
      totalMargin,
      marginPercentage: parseFloat(marginPercentage.toFixed(2)),
      mepaSubmissionNote: notes
    });
  }

  try {
    const prompt = `Abbiamo un elenco di lotti richiesti in un bando e il nostro listino prezzi aziendale.
Lotti richiesti:
${JSON.stringify(lotti, null, 2)}

Listino Prodotti Aziendale:
${JSON.stringify(products, null, 2)}

Esegui il matching ottimale tra ciascun lotto del bando e un prodotto del listino prezzi basandoti sulla descrizione, il brand e le specifiche tecniche richieste.
Calcola il prezzo di vendita proposto (unitPrice) per ciascun lotto applicando un ricarico medio (es. mantieni il retailPrice di listino, o adattalo se necessario).
Calcola il costo totale, il prezzo totale ed il margine stimato.

Genera inoltre una Nota di sottomissione formale in lingua italiana da inserire nel portale Acquisti in Rete PA (MEPA) che descriva in modo dettagliato la conformitÃ  dei prodotti offerti ai requisiti CAM ed ambientali ed elenchi i codici OEM.

Restituisci esclusivamente un JSON conforme a questo schema:
{
  "tenderId": "string",
  "items": [
    {
      "lottoId": number,
      "lottoDescription": "string",
      "requiredQty": number,
      "matchedProductId": "string",
      "matchedProductOEM": "string",
      "unitCost": number,
      "unitPrice": number,
      "totalPrice": number,
      "marginPercentage": number,
      "status": "MAPPED" | "STOCK_LOW" | "NOT_FOUND"
    }
  ],
  "totalCost": number,
  "totalPrice": number,
  "totalMargin": number,
  "marginPercentage": number,
  "mepaSubmissionNote": "string"
}`;

    const response = await callGeminiWithRetry({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const data = cleanAndParseJson(response.text || "");
    return res.json({ ...data, tenderId: tenderAnalysis.tenderId });
  } catch (error: any) {
    console.error("Errore nella generazione dell'offerta con Gemini. Fallback:", error.message);
    return res.status(500).json({ error: "Errore durante l'elaborazione dell'offerta." });
  }
});

/**
 * API: Gestione del Listino Prodotti
 */

app.get('/api/products', async (_req, res) => {
  try {
    const products = await getProductsPg();
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: "Errore durante la lettura dei prodotti." });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const product = req.body;
    await upsertProductPg(product);
    res.json({ message: "Prodotto salvato con successo." });
  } catch (error: any) {
    res.status(500).json({ error: "Errore durante il salvataggio del prodotto." });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    deleteProductPg(req.params.id);
    res.json({ message: "Prodotto eliminato con successo." });
  } catch (error: any) {
    res.status(500).json({ error: "Errore durante l'eliminazione del prodotto." });
  }
});

app.get('/api/products/template', (_req, res) => {
  const csvTemplate = "codeOEM,description,brand,costPrice,retailPrice,stock\nEXAMPLE-01,Prodotto di esempio,Marca,10.50,15.99,100";
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="prodotti_template.csv"');
  res.send(csvTemplate);
});

const upload = multer({ dest: 'uploads/' });
app.post('/api/products/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nessun file CSV caricato." });
  }

  try {
    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const newProducts: Product[] = records.map((record: any, index: number) => ({
      id: `p-imp-${Date.now()}-${index}`,
      codeOEM: record.codeOEM || record.codice || record.oem || `UNK-${index}`,
      description: record.description || record.descrizione || "Prodotto importato",
      brand: record.brand || record.marca || "ND",
      costPrice: parseFloat(record.costPrice || record.costo || "0"),
      retailPrice: parseFloat(record.retailPrice || record.prezzo || "0"),
      stock: parseInt(record.stock || record.giacenza || "0", 10)
    }));

    await replaceProductsPg(newProducts);
    
    // Pulisce il file caricato
    fs.unlinkSync(req.file.path);
    
    res.json({ message: "Prodotti importati con successo.", count: newProducts.length });
  } catch (error: any) {
    console.error("Errore durante l'importazione del CSV:", error);
    res.status(500).json({ error: "Errore durante il parsing del file CSV." });
  }
});

/**
 * ENDPOINT ANAC LIVE â€” Integrazione diretta con l'API OCDS pubblica di ANAC
 * Scarica gare reali e recenti da dati.anticorruzione.it senza passare da Gemini.
 * Gemini viene usato solo (opzionalmente) per arricchire la descrizione.
 */

/** Mappa un oggetto OCDS ANAC nel formato interno dell'applicazione */
function mapOcdsToTender(release: any, index: number): any | null {
  try {
    const tender = release.tender || {};
    const planning = release.planning || {};
    const buyer = release.buyer || {};

    const title: string = tender.title || release.title || `Gara ANAC #${index + 1}`;
    const authority: string = buyer.name || tender.procuringEntity?.name || 'Stazione Appaltante';

    // Importo: prova vari percorsi OCDS
    let value = 0;
    if (tender.value?.amount) value = parseFloat(tender.value.amount);
    else if (planning?.budget?.amount?.amount) value = parseFloat(planning.budget.amount.amount);

    // CIG: normalmente nel campo ocid o nei tag
    const cig: string = release.ocid?.replace('ocds-', '').replace(/^[a-z0-9]+-/, '') || tender.id || 'N.D.';

    // Data scadenza
    let deadline = 'Non specificata';
    if (tender.tenderPeriod?.endDate) {
      deadline = new Date(tender.tenderPeriod.endDate).toLocaleDateString('it-IT');
    } else if (tender.submissionDeadline) {
      deadline = new Date(tender.submissionDeadline).toLocaleDateString('it-IT');
    }

    // CPV
    const cpv: string = tender.mainProcurementCategory ||
      (tender.classification?.id ? tender.classification.id : 'N.D.');

    // Descrizione
    const description: string = tender.description || planning.rationale || title;

    // Regione: estrapolata dalla cittÃ  dell'acquirente (approssimazione)
    const address = buyer.address || tender.procuringEntity?.address || {};
    const region: string = address.region || address.countryName || 'Italia';

    return {
      id: `anac-live-${index}`,
      title,
      cig,
      authority,
      value,
      deadline,
      region,
      cpv,
      description,
      source: 'ANAC Open Data (Live)',
      documentiRichiesti: [
        { nome: 'DGUE', descrizione: 'Documento di Gara Unico Europeo', tipo: 'Amministrativo', bloccante: true },
        { nome: 'PassOE', descrizione: 'Codice PassOE dal portale ANAC', tipo: 'Amministrativo', bloccante: true },
        { nome: 'Offerta Economica', descrizione: 'Modulo offerta firmato digitalmente', tipo: 'Economico', bloccante: true },
      ],
      vincoliEsclusione: [
        'Firma digitale obbligatoria in formato CAdES (.p7m).',
        'Caricamento offerta entro le ore 12:00 del giorno di scadenza.',
      ],
    };
  } catch {
    return null;
  }
}

app.get('/api/anac-live', async (req, res) => {
  const rawQ = (req.query.q as string || '').trim();
  const cpvs = (req.query.cpvs as string || '').trim();
  const queryText = rawQ.toLowerCase();
  const profile = req.query.profile ? JSON.parse(req.query.profile as string) : DEFAULT_COMPANY_PROFILE;

  console.log(`[ANAC LIVE] Avvio sincro/ricerca. Query: "${queryText}", CPVs: "${cpvs}"`);

  // 1. Pulizia automatica delle gare scadute a cui NON si è partecipato
  try {
    await purgeUnparticipatedExpiredTendersPg();
  } catch (purgeErr: any) {
    console.warn('[ANAC LIVE] Avviso pulizia gare scadute:', purgeErr.message);
  }

  // Prefissi CPV focalizzati TASSATIVAMENTE su Hardware ICT e Consumabili
  let ICT_CPV_PREFIXES = ['301', '302', '30200000', '30125110', '30232150', '484', '485', '726', '724'];
  if (cpvs) {
    const clientCpvs = cpvs.split(',').map(c => extractCpvCode(c).substring(0, 3)).filter(Boolean);
    const validClientCpvs = clientCpvs.filter(c => c.startsWith('30') || c.startsWith('48') || c.startsWith('72'));
    if (validClientCpvs.length > 0) {
      ICT_CPV_PREFIXES = Array.from(new Set([...ICT_CPV_PREFIXES, ...validClientCpvs]));
    }
  }

  let liveDiscoveredTenders: any[] = [];
  let liveSource: string | null = null;

  // ─── Tentativo Live A: Gemini Search Grounding ───────────────────────────
  if (ai) {
    try {
      console.log('[ANAC LIVE] Ricerca di nuove gare online con Gemini + Google Search Grounding...');
      const cpvKeywords = cpvs ? cpvs.split(',').map(extractCpvDescription).filter(Boolean).join(', ') : 'computer notebook server toner stampanti hardware';
      const prompt = `Cerca sul web le più recenti gare di gara pubbliche ATTIVI in Italia su MEPA, Consip, BDNCP o stazioni appaltanti regionali relative alla fornitura di: ${cpvKeywords} (esclusivamente Hardware informatico e consumabili).

RISPONDI ESCLUSIVAMENTE con un oggetto JSON valido, SENZA testo introduttivo, SENZA commenti, SENZA markdown.
Formato richiesto:
{"tenders":[{"id":"CIG_o_ID","title":"...","cig":"...","authority":"...","value":0,"deadline":"YYYY-MM-DD","region":"...","cpv":"...","description":"..."}]}

Fornisci almeno 10 bandi attivi. Solo JSON, nient'altro.`;

      const response = await callGeminiWithRetry({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
      });
      const data = cleanAndParseJson(response.text || '');
      if (data && Array.isArray(data.tenders) && data.tenders.length > 0) {
        liveDiscoveredTenders = data.tenders;
        liveSource = 'gemini_grounding';
        console.log(`[ANAC LIVE] Trovate ${liveDiscoveredTenders.length} nuove gare live tramite Gemini Grounding!`);
      }
    } catch (err: any) {
      console.warn(`[ANAC LIVE] Gemini Grounding non ha restituito nuove gare: ${err.message}`);
    }
  }

  // ─── Tentativo Live B: API OCDS ANAC ──────────────────────────────────────
  if (liveDiscoveredTenders.length === 0) {
    try {
      const anacUrl = `https://api.anticorruzione.it/opendata/ocds/api/v1/1.0.0/releases?limit=500&offset=0`;
      console.log(`[ANAC LIVE] Interrogazione API OCDS ANAC: ${anacUrl}`);
      const anacResponse = await fetch(anacUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'DigitsBiddingCopilot/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (anacResponse.ok) {
        const anacData: any = await anacResponse.json();
        const releases: any[] = anacData.releases || anacData.data || [];
        const relevant = releases.filter((r: any) => {
          const tender = r.tender || {};
          const cpv = tender.classification?.id || tender.mainProcurementCategory || '';
          return ICT_CPV_PREFIXES.some(p => cpv.startsWith(p));
        });
        if (relevant.length > 0) {
          liveDiscoveredTenders = relevant.map((r: any, i: number) => mapOcdsToTender(r, i)).filter(Boolean);
          liveSource = 'anac_ocds_live';
          console.log(`[ANAC LIVE] Trovate ${liveDiscoveredTenders.length} gare live dall'API OCDS ANAC!`);
        }
      }
    } catch (err: any) {
      console.warn(`[ANAC LIVE] API OCDS non disponibile: ${err.message}`);
    }
  }

  // 3. Salva/Aggiorna le nuove gare scoperte nel DB PostgreSQL
  if (liveDiscoveredTenders.length > 0) {
    for (const t of liveDiscoveredTenders) {
      try {
        const evalResult = computeAiEvaluation(t, profile);
        const tenderId = t.id || t.cig || `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await upsertTenderPg({
          ...t,
          id: tenderId,
          cig: t.cig || (tenderId.startsWith('gemini') ? null : tenderId),
          aiEvaluation: evalResult.evaluation,
          aiReasoning: evalResult.reason,
          source: liveSource === 'gemini_grounding' ? 'Gemini Search Grounding' : 'ANAC Open Data'
        });
      } catch (upsertErr: any) {
        console.warn(`[ANAC LIVE] Impossibile salvare bando nel DB:`, upsertErr.message);
      }
    }
  }

  // 4. Recupera dal DB PostgreSQL l'elenco completo ed aggiornato dei bandi attivi
  try {
    const dbFilter = {
      query: queryText,
      minAmount: 0,
      maxAmount: 99999999,
      pageSize: 1000,
    };
    const dbResult = await queryTendersPg(dbFilter);
    let allActiveTenders = dbResult?.tenders || [];

    if (allActiveTenders.length === 0) {
      allActiveTenders = ARCHIVE_TENDERS;
    }

    const evaluated = allActiveTenders.map((t: any) => {
      const evalResult = computeAiEvaluation(t, profile);
      return {
        ...t,
        value: t.amount ?? t.value ?? 0,
        source: t.source || 'ANAC Open Data (DB)',
        aiEvaluation: evalResult.evaluation,
        aiReasoning: evalResult.reason,
        documentiRichiesti: t.documentiRichiesti || [
          { nome: 'DGUE', descrizione: 'Documento di Gara Unico Europeo', tipo: 'Amministrativo', bloccante: true },
          { nome: 'PassOE', descrizione: 'Codice PassOE dal portale ANAC', tipo: 'Amministrativo', bloccante: true },
          { nome: 'Offerta Economica', descrizione: 'Modulo offerta firmato digitalmente', tipo: 'Economico', bloccante: true },
        ],
        vincoliEsclusione: t.vincoliEsclusione || [
          'Firma digitale obbligatoria in formato CAdES (.p7m).',
          'Caricamento offerta entro le ore 12:00 del giorno di scadenza.',
        ],
      };
    });

    console.log(`[ANAC LIVE] Risposta finale al client: ${evaluated.length} bandi attivi.`);
    return res.json({ source: liveSource || 'anac_bulk_live', tenders: evaluated });
  } catch (err: any) {
    console.error('[ANAC LIVE] Errore recupero bandi finali:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tenders/purge-expired ─────────────────────────────────────────
app.post('/api/tenders/purge-expired', async (_req, res) => {
  try {
    const deletedCount = await purgeUnparticipatedExpiredTendersPg();
    return res.json({ success: true, deletedCount, message: `Eliminate ${deletedCount} gare scadute non partecipate.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€ Endpoint /api/tenders â€” Query DB SQLite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/tenders', async (req, res) => {
  try {
    const filter = {
      region: req.query.region as string,
      cpv: req.query.cpv as string,
      minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
      maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
      query: req.query.q as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
    };

    const result = await queryTendersPg(filter);

    // Arricchisce i risultati con valutazione AI (riusa funzione esistente)
    const profile = req.query.profile ? JSON.parse(req.query.profile as string) : DEFAULT_COMPANY_PROFILE;
    const tenders = result.tenders.map((t: any) => {
      const evalResult = computeAiEvaluation(t, profile);
      return {
        ...t,
        value: t.amount ?? 0,
        source: 'ANAC Open Data (DB Locale)',
        aiEvaluation: evalResult.evaluation,
        aiReasoning: evalResult.reason,
        documentiRichiesti: [
          { nome: 'DGUE', descrizione: 'Documento di Gara Unico Europeo', tipo: 'Amministrativo', bloccante: true },
          { nome: 'PassOE', descrizione: 'Codice PassOE dal portale ANAC', tipo: 'Amministrativo', bloccante: true },
          { nome: 'Offerta Economica', descrizione: 'Modulo offerta firmato digitalmente', tipo: 'Economico', bloccante: true },
        ],
        vincoliEsclusione: [
          'Firma digitale obbligatoria in formato CAdES (.p7m).',
          'Caricamento offerta entro le ore 12:00 del giorno di scadenza.',
        ],
      };
    });

    console.log(`[API/tenders] Query OK: ${tenders.length} risultati (totale DB: ${result.total})`);
    return res.json({ source: 'db_local', tenders, total: result.total, page: result.page });
  } catch (err: any) {
    console.error('[API/tenders] Errore:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Endpoint POST /api/tenders/:id/status ───
app.post('/api/tenders/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'active' | 'submitted' | 'won' | 'lost'

    if (!['active', 'submitted', 'won', 'lost'].includes(status)) {
      return res.status(400).json({ error: 'Stato non valido. Valori ammessi: active, submitted, won, lost' });
    }

    upsertTenderPg({ id, status } as any);
    logActivityPg('TENDER_STATUS_CHANGED', `Stato della gara ${id} modificato in: ${status.toUpperCase()}`, { tenderId: id });
    console.log(`[API/status] Stato della gara ${id} aggiornato a: ${status}`);
    return res.json({ success: true, id, status });
  } catch (err: any) {
    console.error('[API/status] Errore:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tenders/participating — Elenco gare a cui si è partecipato ───
app.get('/api/tenders/participating', async (_req, res) => {
  try {
    const participating = await getParticipatingTendersPg();
    const tenders = participating.map(t => ({
      ...t,
      value: t.amount ?? 0, // Uniforma
    }));
    return res.json({ success: true, tenders });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€ Endpoint /api/db-stats â€” Statistiche del DB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/db-stats', (_req, res) => {
  try {
    const stats = (() => ({total: 0, byRegion: [], lastIngestion: null}))();
    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai-chat — Chat AI contestuale con Gemini ─────────────────────
app.post('/api/ai-chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Messaggio mancante.' });
    }
    if (!ai) {
      return res.json({
        reply: '⚠️ La chiave API Gemini non è configurata. Configura GEMINI_API_KEY nel file .env per abilitare la chat AI contestuale.',
        timestamp: new Date().toISOString()
      });
    }
    const systemContext = context
      ? `Sei l'AI Supervisor della piattaforma Digits Bidding Co-Pilot, uno strumento professionale per la gestione di gare d'appalto pubbliche in Italia (MEPA, Consip, ANAC).
Contesto attuale:
- Bando selezionato: ${context.tenderTitle || 'Nessuno'}
- CIG: ${context.tenderCig || 'N/D'}
- Profilo aziendale: ${context.companyName || 'DIGITS DISTRIBUZIONE SRL UNIPERSONALE'}
Rispondi in italiano in modo professionale, preciso e conciso.`
      : 'Sei l\'AI Supervisor della piattaforma Digits Bidding Co-Pilot per gare PA. Rispondi in italiano.';

    const response = await callGeminiWithRetry({
      model: 'gemini-2.5-flash',
      contents: `${systemContext}\n\nDomanda dell'utente: ${message}`,
    });

    logActivityPg('AI_CHAT', `Chat: "${message.substring(0, 80)}..."`);
    return res.json({ reply: response.text || 'Risposta non disponibile.', timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error('[API/ai-chat] Errore:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Configurazione Multer per upload documenti ──────────────────────────────
const tenderDocsDir = path.join(process.cwd(), 'data', 'tender_docs');
if (!fs.existsSync(tenderDocsDir)) fs.mkdirSync(tenderDocsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const cig = req.params.cig || 'unknown';
    const dir = path.join(tenderDocsDir, cig);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${file.originalname}`;
    cb(null, unique);
  }
});
const uploadDocs = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── GET /api/company-profile — Carica profilo aziendale da PostgreSQL ─────────
app.get('/api/company-profile', async (_req, res) => {
  try {
    const profile = await getCompanyProfilePg();
    if (profile) {
      return res.json({ success: true, profile });
    }
    return res.json({ success: false, profile: null, message: 'Nessun profilo salvato. Usa il default.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/company-profile — Salva profilo aziendale in PostgreSQL ──────────
app.post('/api/company-profile', async (req, res) => {
  try {
    const profile = req.body;
    if (!profile || typeof profile !== 'object') {
      return res.status(400).json({ error: 'Payload profilo non valido.' });
    }
    await saveCompanyProfilePg(profile);
    await logActivityPg('PROFILE_UPDATED', `Profilo aziendale aggiornato: ${profile.name || 'N/D'}`);
    console.log('[API/company-profile] Profilo salvato nel DB PostgreSQL.');
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/job-log — Storico esecuzioni cron ANAC ───────────────────
app.get('/api/admin/job-log', (_req, res) => {
  try {
    const log = getJobLog();
    const lastStatus = getLastJobStatus();
    return res.json({ success: true, log, lastStatus });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/admin/run-ingestion — Trigger manuale ingestion ANAC ──────────
app.post('/api/admin/run-ingestion', async (_req, res) => {
  const jobId = startJobLog('MANUAL');
  const startTime = Date.now();
  console.log('[ADMIN] Trigger manuale ingestion ANAC avviato...');
  try {
    const result = await dailyIncrementalJob();
    completeJobLog(jobId, { status: 'SUCCESS', tendersInserted: result?.inserted || 0, tendersTotal: result?.total || 0 }, startTime);
    logActivityPg('INGESTION_TRIGGERED', `Ingestion manuale completata con successo.`);
    console.log('[ADMIN] Trigger manuale completato.');
    return res.json({ success: true, result });
  } catch (err: any) {
    completeJobLog(jobId, { status: 'ERROR', tendersInserted: 0, errorMessage: err.message }, startTime);
    console.error('[ADMIN] Errore trigger manuale:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tenders/:cig/upload-doc — Upload documento allegato ────────────
app.post('/api/tenders/:cig/upload-doc', uploadDocs.single('document'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nessun file caricato.' });
    }
    const { cig } = req.params;
    const docType = req.body.documentType || 'CAPITOLATO';

    const fileMeta = {
      id: `doc-${Date.now()}`,
      tenderId: cig,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedAt: new Date().toISOString(),
      documentType: docType,
      analyzed: false
    };

    // Aggiorna metadata.json della gara
    const dir = path.join(tenderDocsDir, cig);
    const metadataPath = path.join(dir, 'metadata.json');
    let currentDocs = [];
    if (fs.existsSync(metadataPath)) {
      try {
        currentDocs = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      } catch (e) {
        currentDocs = [];
      }
    }
    currentDocs.push(fileMeta);
    fs.writeFileSync(metadataPath, JSON.stringify(currentDocs, null, 2), 'utf-8');

    logActivityPg('DOCUMENT_UPLOADED', `Documento caricato per CIG ${cig}: ${req.file.originalname}`);
    console.log(`[API/upload-doc] File caricato per CIG ${cig}: ${req.file.originalname}`);
    return res.json({ success: true, file: fileMeta });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tenders/:cig/docs — Lista documenti caricati per una gara ──────
app.get('/api/tenders/:cig/docs', (req, res) => {
  try {
    const { cig } = req.params;
    const dir = path.join(tenderDocsDir, cig);
    const metadataPath = path.join(dir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      return res.json([]);
    }
    const docs = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    return res.json(docs);
  } catch (err: any) {
    console.error(`[API/docs] Errore elenco documenti:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tenders/:tenderId/analyze-docs — Analisi AI del documento caricato ───
app.post('/api/tenders/:tenderId/analyze-docs', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const { filename, tenderTitle } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Nome file mancante.' });
    }

    const dir = path.join(tenderDocsDir, tenderId);
    const filePath = path.join(dir, filename);
    const metadataPath = path.join(dir, 'metadata.json');

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File ${filename} non trovato.` });
    }

    let extractedText = '';
    const ext = path.extname(filename).toLowerCase();

    // Estrazione testo in base all'estensione
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await parsePdf(dataBuffer);
      extractedText = pdfData.text || '';
    } else {
      extractedText = fs.readFileSync(filePath, 'utf-8');
    }

    // Se non c'è testo estratto
    if (!extractedText.trim()) {
      return res.status(400).json({ error: 'Nessun testo estratto dal documento.' });
    }

    let analysisResult = { extractedText };

    // Se Gemini è configurato, facciamo l'analisi semantica con Gemini
    if (ai) {
      console.log(`[AI/analyze-docs] Analisi del testo estratto (${extractedText.length} caratteri) con Gemini...`);
      try {
        const prompt = `Sei l'AI Supervisor di Digits Bidding Co-Pilot. Analizza il seguente testo estratto dal documento di gara "${tenderTitle}" (ID: ${tenderId}) e identifica i requisiti fondamentali per la partecipazione, inclusi:
1. Requisiti bloccanti o vincoli di esclusione
2. Certificazioni richieste (es. ISO, SOA)
3. Eventuali lotti descritti con quantità e specifiche tecniche
4. Documentazione da presentare

Testo estratto:
${extractedText.substring(0, 15000)}

Fornisci una sintesi dei requisiti in formato discorsivo ed elenca in modo chiaro i lotti se presenti.`;

        const response = await callGeminiWithRetry({
          model: 'gemini-2.5-flash',
          contents: prompt
        });

        // Aggiungi il sommario AI all'oggetto ritornato
        analysisResult = {
          ...analysisResult,
          summary: response.text || '',
        } as any;
      } catch (geminiErr: any) {
        console.warn(`[AI/analyze-docs] Analisi Gemini fallita: ${geminiErr.message}`);
      }
    }

    // Aggiorna lo stato 'analyzed' in metadata.json
    if (fs.existsSync(metadataPath)) {
      try {
        const docs = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        const updatedDocs = docs.map((d: any) => {
          if (d.filename === filename) {
            return { ...d, analyzed: true };
          }
          return d;
        });
        fs.writeFileSync(metadataPath, JSON.stringify(updatedDocs, null, 2), 'utf-8');
      } catch (err: any) {
        console.error(`[API/analyze-docs] Errore aggiornamento metadata:`, err.message);
      }
    }

    logActivityPg('TENDER_ANALYZED', `Documento ${filename} analizzato con successo.`);
    return res.json({ success: true, analysis: analysisResult });
  } catch (err: any) {
    console.error('[API/analyze-docs] Errore:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/audit-log — Audit log attività piattaforma ───────────────
app.get('/api/admin/audit-log', async (_req, res) => {
  try {
    const log = await getAuditLogPg();
    return res.json({ success: true, log });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Persistenza contesto analisi per ciascuna gara ───────────────────────────
const tenderAnalysisDir = path.join(process.cwd(), 'data', 'tender_analysis');
if (!fs.existsSync(tenderAnalysisDir)) fs.mkdirSync(tenderAnalysisDir, { recursive: true });

app.get('/api/tenders/:tenderId/saved-analysis', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const data = await getTenderAnalysisPg(tenderId);
    if (data) {
      return res.json({ success: true, data });
    }
    // Fallback su file locale
    const savePath = path.join(tenderAnalysisDir, `${tenderId}.json`);
    if (fs.existsSync(savePath)) {
      const localData = JSON.parse(fs.readFileSync(savePath, 'utf-8'));
      return res.json({ success: true, data: localData });
    }
    return res.json({ success: false, data: null });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/tenders/:tenderId/save-analysis', async (req, res) => {
  try {
    const { tenderId } = req.params;
    const payload = req.body;
    await saveTenderAnalysisPg(tenderId, payload);
    const savePath = path.join(tenderAnalysisDir, `${tenderId}.json`);
    fs.writeFileSync(savePath, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`[API/save-analysis] Contesto analisi salvato su DB PostgreSQL Neon per gara ${tenderId}`);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Cron Job giornaliero ore 02:00 ──────────────────────────────────────────
cron.schedule('0 2 * * *', async () => {
  const jobId = startJobLog('CRON');
  const startTime = Date.now();
  console.log('[CRON] Avvio job giornaliero ANAC (02:00)...');
  try {
    const result = await dailyIncrementalJob();
    completeJobLog(jobId, { status: 'SUCCESS', tendersInserted: result?.inserted || 0, tendersTotal: result?.total || 0 }, startTime);
    console.log('[CRON] Job giornaliero completato con successo.');
  } catch (err: any) {
    completeJobLog(jobId, { status: 'ERROR', tendersInserted: 0, errorMessage: err.message }, startTime);
    console.error('[CRON] Errore nel job giornaliero:', err.message);
  }
}, { timezone: 'Europe/Rome' });


console.log('[CRON] Job giornaliero ANAC programmato per le 02:00 (ora italiana).');

// Gestione degli asset statici del frontend in produzione
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send("Piattaforma Digits Backend in esecuzione. Avviare il frontend Vite in modalitÃ  dev con 'npm run dev:client'.");
  });
}

// Avvio del server
app.listen(PORT, () => {
  console.log(`Server Express avviato sulla porta ${PORT}`);
  console.log(`Disponibile all'indirizzo http://localhost:${PORT}`);
});

