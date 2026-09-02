# 🏛️ Piattaforma Presentazione Preventivi PA (MEPA & Consip Bidding Co-Pilot)
### *Un'opera d'arte ingegneristica per DIGITS DISTRIBUZIONE SRL UNIPERSONALE*

---

## 🌟 1. Presentazione del Team di Sviluppo & Filosofia di Design

Questo sistema è stato concepito, sviluppato e rifinito da un team multidisciplinare di specialisti, sotto la direzione strategica del **Capo Team & Software Architect**, con l'obiettivo di realizzare un prodotto software che coniughi un'**esperienza utente in puro stile macOS** (minimalista, fluida, visivamente appagante) con i più rigidi standard di **sicurezza dei dati**, **scalabilità** e **resilienza algoritmica**.

### 👥 Il Team e le Decisioni Condivise:
1. **Software Architect (Capo Team):** Ha strutturato l'architettura full-stack (Express + Vite + TypeScript) garantendo un accoppiamento debole tra i servizi di recupero dati (ANAC Open Data, Google Search Grounding) e il motore di analisi semantica basato su modelli LLM di ultima generazione. Ha inoltre implementato il protocollo resiliente `callGeminiWithRetry` per aggirare le temporanee indisponibilità (errori 503) e saturazioni di quota (errori 429) delle API esterne.
2. **UI/UX & Graphic Designer (Esperto Stile MAC):** Ha curato l'interfaccia eliminando gradienti saturi e disordine visivo, preferendo un'estetica ispirata a *macOS Sequoia*: contrasti definiti, ampi spazi negativi, bordi arrotondati calibrati (`rounded-xl`), icone vettoriali precise (`lucide-react`) e transizioni cinematiche fluide (`motion/react`).
3. **Database & Data Strategy Expert:** Ha disegnato lo schema dei dati in `/src/types.ts` per modellare fedelmente la complessità dei bandi pubblici italiani (lotti indipendenti, criteri OEPV vs Prezzo più Basso, soccorso istruttorio e requisiti ISO) abbinandoli al listino interno dei prodotti.
4. **Security & Privacy Expert:** Ha garantito la totale sicurezza dei dati aziendali. Tutte le richieste esterne alla rete di Google e ad ANAC vengono intermediate ed elaborate esclusivamente **lato server (`server.ts`)**. Nessuna chiave API (es. `GEMINI_API_KEY`) viene esposta al browser client, azzerando il rischio di furto di credenziali e rispettando le linee guida del GDPR.

---

## 🗺️ 2. Architettura Generale del Sistema (High-Level)

Il sistema adotta un'architettura **Full-Stack monolitica modulare** che massimizza la velocità di sviluppo ed esecuzione e semplifica il deployment su infrastrutture containerizzate (come Google Cloud Run). In sviluppo i due processi (API Express e dev server Vite) girano in parallelo tramite `concurrently`; l'utente lavora su **`http://localhost:5173`** e le chiamate `/api` sono inoltrate al backend sulla **3000** dal proxy Vite. In produzione, Express serve sia gli asset statici compilati sia le API sulla porta 3000.

```
        ┌──────────────────────────────────────────────────────────┐
        │                     CLIENT (FRONTEND)                    │
        │   React 18 + Vite + Tailwind (Stile macOS) — :5173       │
        │   Dashboard Supervisore · Gestione Bandi · Listino ·     │
        │   Generatore Offerte · Export DOCX / PDF / RTF           │
        └───────────────────────────┬──────────────────────────────┘
                     Proxy /api  →   │   (dev :5173 → :3000)
                                     ▼
        ┌──────────────────────────────────────────────────────────┐
        │                     SERVER (BACKEND) — :3000             │
        │        Express · Node.js · TypeScript (tsx / esbuild)    │
        │   API REST · upload PDF (multer) · cron job giornaliero  │
        │   audit logger · job logger · graceful degradation       │
        └───┬───────────────┬───────────────────┬──────────────────┘
            │               │                   │
   AI /     ▼      Persistenza ▼       Ingestione ▼
  Grounding         locale               dati pubblici
 ┌──────────────┐ ┌──────────────────┐ ┌────────────────────────┐
 │ Google Gemini│ │  SQLite          │ │  ANAC BDNCP / OCDS     │
 │ API + Search │ │ (better-sqlite3) │ │  Open Data (CKAN/API)  │
 │  Grounding   │ │  + data/*.json   │ │  ingestion.ts + jobs   │
 └──────────────┘ └──────────────────┘ └────────────────────────┘
```

---

## 💻 3. Specifiche del Backend (`server.ts`)

Il backend è interamente scritto in **TypeScript** ed eseguito tramite Node.js, fungendo sia da web server per gli asset statici ottimizzati del frontend sia da API Gateway sicuro per le integrazioni esterne.

### ⚙️ Le Caratteristiche Chiave del Codice Backend:

#### A. Gestione Resiliente delle API AI (`callGeminiWithRetry`)
La piattaforma integra un sofisticato meccanismo di riprova automatica con backoff esponenziale e fallback dinamico sul modello secondario per neutralizzare i limiti di quota (`429 RESOURCE_EXHAUSTED`) o le congestioni dei server di calcolo (`503 UNAVAILABLE`):
```typescript
async function callGeminiWithRetry(options: {
  model: string;
  contents: string | any;
  config?: any;
}, maxRetries = 3, delayMs = 1500): Promise<any> {
  const modelsToTry = [options.model, "gemini-3.1-flash-lite"];
  // ... Ciclo di retry con attesa esponenziale (delayMs * Math.pow(1.5, i))
  // ... Fallback automatico sul modello leggero ad alta disponibilità
}
```

#### B. Motore di Ricerca Live con Google Search Grounding (`/api/search-real-tenders`)
Questo endpoint permette di superare i limiti dei database statici effettuando ricerche sul web in tempo reale per trovare bandi attivi e reali di computer, notebook e consumabili per uffici pubblici italiani:
- Utilizza il **Google Search Tool** integrato in Gemini per setacciare portali istituzionali (MEPA, Consip, BDNCP).
- Ritorna un JSON rigidamente strutturato tramite uno schema di risposta predefinito (`responseSchema`).
- **Resilienza Integrata (Graceful Degradation):** Se l'API di Google o le quote di geolocalizzazione/ricerca risultano sature, il server intercetta l'errore e carica istantaneamente un set di bandi d'archivio reali ad alta fedeltà (es. Città Metropolitana di Torino, AO Napoli, Corte dei Conti Roma), garantendo la continuità operativa dell'applicazione.

#### C. Algoritmo di Valutazione Preventiva dell'Idoneità (Semaforo AI)
Prima ancora che l'utente apra un bando, la funzione `computeAiEvaluation(tender)` esegue un controllo semantico immediato incrociando i dati della gara con il profilo di **DIGITS DISTRIBUZIONE SRL**:
1. **SCARTATA (Rosso):** Se il bando riguarda la formazione specialistica (settore EA37 non coperto), o se il valore stimato supera la capacità di fatturato annuo (€185.000,00).
2. **DA VALUTARE (Giallo):** Se l'importo è elevato (> €60.000) o se compaiono clausole complesse che richiedono un controllo umano sui margini.
3. **APPROVATA (Verde):** Piena conformità finanziaria, amministrativa (ISO 9001, ISO 14001 presenti) e merceologica (MEPA coerente).

#### D. Pipeline di Elaborazione Bandi e Offerte
- `/api/analyze-tender`: Estrae l'Ente, la scadenza, i criteri d'aggiudicazione, i requisiti bloccanti e mappa l'elenco dei lotti/articoli richiesti. Accetta sia testo incollato sia **upload diretto del capitolato PDF** (gestito via `multer` + `pdf-parse`).
- `/api/verify-compliance`: Confronta dettagliatamente i requisiti amministrativi estratti con il profilo aziendale reale. Identifica i requisiti non soddisfatti e propone se risolverli tramite **Soccorso Istruttorio** o se sono conformi.
- `/api/generate-offer`: Incrocia i lotti tecnici del bando con il **listino interno** dell'azienda (es. codici OEM HP, Dell, Lenovo), calcola i prezzi ottimali di rivendita, i margini stimati, applica gli sconti medi e produce la nota MEPA per la sottomissione. Include un algoritmo di matching **deterministico locale** che funziona anche senza chiave Gemini (modalità degradata).

#### E. Persistenza SQLite (`db.js`)
Lo strato dati è gestito da **SQLite** tramite `better-sqlite3` (accesso sincrono ad alte prestazioni). Il modulo espone `queryTenders` (ricerca con filtri per regione/CPV/importo), `getDbStats` (statistiche archivio), `upsertTender` (inserimento/aggiornamento idempotente) e `getParticipatingTenders` (gare a cui l'azienda ha partecipato). Il profilo aziendale e le certificazioni sono persistiti in file JSON dedicati (`data/company_profile.json`), consentendo backup e versionamento semplici.

#### F. Ingestione Dati ANAC & Job Schedulati
- **`ingestion.ts`** implementa `dailyIncrementalJob()`, il job incrementale che scarica e normalizza le pubblicazioni recenti dal formato **OCDS** di ANAC (mapping `mapOcdsToTender`) e le persiste su SQLite.
- **`node-cron`** pianifica l'esecuzione automatica giornaliera del job all'interno del server.
- Gli script in **`scripts/`** (`download_historical.ts`, `import_anac_files.ts`, `import_previous_months.ts`, `analyze_cig.ts`) permettono il caricamento massivo dello storico e l'analisi puntuale per CIG.

#### G. Osservabilità: Job Logger & Audit Logger
- **`server/jobLogger.ts`** traccia l'esito di ogni esecuzione del job di ingestione (`startJobLog`, `completeJobLog`, `getLastJobStatus`), esposto in UI dall'`IngestionStatusBadge`.
- **`server/auditLogger.ts`** registra le attività rilevanti dell'operatore (`logActivity`, `getAuditLog`), alimentando la **Dashboard Supervisore**.

---

## 🎨 4. Specifiche del Frontend e Interfaccia Utente (UI/UX)

L'interfaccia utente è progettata seguendo le linee guida estetiche dei sistemi operativi **Apple (macOS Style)**, ponendo l'accento sulla pulizia visiva, sulla tipografia e sulla leggibilità dei flussi informativi.

### 🖼️ Aspetti Grafici e Layout:
* **Palette Colori "Snow-Slate":** Sfondo pulito off-white (`bg-neutral-50`), accostato a superfici dei pannelli bianche e lucide con ombreggiature impercettibili e bordi ad alta definizione (`border border-neutral-200/60`).
* **Tipografia Elegante:** Integrazione del font **Inter** per la parte gestionale e dei comandi, accoppiato a dettagli tecnici e codici identificativi (es. CIG, codici OEM, valori di bilancio) formattati in **JetBrains Mono** ad alta precisione.
* **Layout a Tre Pannelli Dinamici:**
  1. **Sidebar di Configurazione:** Contiene il profilo aziendale ufficiale e il listino prezzi (completamente modificabili interattivamente in tempo reale dall'utente).
  2. **Centro di Ricerca ed Elenco Bandi:** Presenta i filtri avanzati per Regione, CPV e fascia d'importo, il tasto per ricaricare l'archivio e l'esclusivo pulsante **"Trova Gare Reali sul Web (AI)"** con indicatore di caricamento a rotazione cinetica. Ciascun bando mostra istantaneamente il badge colorato del *Semaforo Preventivo AI*.
  3. **Pannello Dettaglio e Generatore Offerte (macOS Card Style):** Mostra la scheda del bando selezionato comprensiva del responso dettagliato del semaforo AI, il testo del capitolato e le schede per la generazione guidata dell'offerta economica.

### 🧩 Moduli Componenti Principali (`src/components/`)
* **`SupervisorDashboard`:** cruscotto di supervisione con statistiche archivio, stato dell'ultimo job di ingestione e audit log delle attività.
* **`TenderHistoryPanel`:** storico delle gare analizzate e di quelle a cui l'azienda ha partecipato.
* **`TenderDocumentManager`:** gestione dei documenti richiesti per ciascun bando (DGUE, PassOE, certificazioni, offerta economica).
* **`CompanyProfilePanel`:** editor del profilo aziendale, delle certificazioni (con avviso di scadenza imminente) e dei documenti societari.
* **`QuickMatchModal`:** matching rapido di un prodotto del listino su un lotto.
* **`IngestionStatusBadge`:** badge live sullo stato del job di ingestione ANAC.

### 🔄 Flusso Interattivo di Generazione Offerta in 3 Step:
Grazie ad una gestione dello stato centralizzata in React, l'utente può cliccare su un bando e avviare la procedura guidata:
1. **Analisi Semantica:** Estrazione dei lotti e delle quantità (da testo incollato o capitolato PDF caricato).
2. **Verifica Conformità:** Generazione di una tabella interattiva con lo stato di adeguatezza per ogni singolo requisito del bando.
3. **Generazione Offerta:** Mappatura automatica con gli articoli a magazzino, calcolo del valore totale e del margine lordo stimato, generazione della nota MEPA copiabile e **export del documento d'offerta formattato**.

### 📄 Export del Documento d'Offerta
Il documento d'offerta (dati procedura, dati operatore economico, dichiarazione di conformità CAM, quadro economico a lotti, importo totale, nota MEPA e clausola di firma digitale) è esportabile in tre formati:
* **PDF** — anteprima di stampa professionale del browser con opzione "Salva come PDF" (nessuna dipendenza esterna).
* **Word `.docx`** — documento Office nativo generato lato client con la libreria `docx` (tabella dei lotti, intestazioni e formattazione tipografica).
* **RTF / ODF** — formato di compatibilità pronto per LibreOffice/Word.

Tutti i formati sono predisposti per la successiva firma digitale **CAdES (.p7m)** o **PAdES (.pdf)** ai sensi del D.Lgs. 82/2005 (CAD).

---

## 🗄️ 5. Gestione dei Dati & Persistenza

La piattaforma gestisce i dati su **due livelli complementari**: un database **SQLite** per l'archivio delle gare (mole dati elevata, query filtrate) e file **JSON** per la configurazione aziendale (facilmente ispezionabili e versionabili).

* **Archivio Bandi (SQLite / `better-sqlite3`):** le gare ingerite da ANAC e quelle analizzate sono persistite su database SQLite, interrogabile per regione, CPV e fascia d'importo. Sopravvive ai riavvii e alimenta statistiche e storico.
* **Profilo Aziendale (`data/company_profile.json`):** DIGITS DISTRIBUZIONE SRL UNIPERSONALE (P.IVA 09007650725), sede a Casamassima (BA), fatturato triennale, categorie MEPA attive e certificazioni ISO 9001 / ISO 14001 con **data di scadenza** e flag `isExpiringSoon` calcolato a runtime.
* **Listino Prodotti (Hardware & Consumabili):** codici OEM originali più diffusi (es. HP CF259X, Dell Latitude, Lenovo ThinkPad), con tracciamento di costi d'acquisto, prezzi di vendita consigliati e scorte; supporta articoli aggiunti ad-hoc per una gara specifica (`isTenderSpecific`).
* **Log & Audit:** lo stato dei job di ingestione e l'audit trail delle attività dell'operatore sono persistiti e consultabili dalla Dashboard Supervisore.
* **Stato Dinamico Reattivo:** l'utente può alterare prezzi, aggiungere prodotti o aggiornare il profilo dalla UI; l'algoritmo di corrispondenza si adatta istantaneamente ai nuovi valori.

---

## 🔒 6. Sicurezza dei Dati, Privacy & Compliance GDPR

La sicurezza è stata posta al centro dell'architettura dal nostro esperto di Privacy:
* **Isolamento delle Chiavi API:** La chiave `GEMINI_API_KEY` risiede esclusivamente nelle variabili d'ambiente del server. Il client non effettua alcuna richiesta diretta verso l'esterno, prevenendo attacchi di tipo *man-in-the-middle* o la compromissione delle credenziali.
* **Trattamento Dati Sensibili:** I testi dei bandi incollati o analizzati vengono processati in memoria volatile e trasmessi tramite canali protetti HTTPS (TLS 1.3) alle API di Google AI per l'elaborazione, senza alcuna persistenza non autorizzata o indicizzazione pubblica.
* **Conformità MEPA/Consip:** Le risposte generate dall'AI (note di offerta e corrispondenza CAM) rispettano fedelmente la terminologia formale richiesta dalle stazioni appaltanti pubbliche, tutelando legalmente l'azienda da dichiarazioni incongrue.

---

## 🚀 7. Guida all'Esecuzione e Gestione della Piattaforma

### 📋 Prerequisiti
Assicurarsi di avere installato sul sistema:
* **Node.js** (versione 18 o superiore)
* **npm** (versione 9 o superiore)

### 📂 Configurazione delle Variabili d'Ambiente
Creare o verificare la presenza del file `.env` nella directory radice e valorizzare le seguenti variabili (utilizzando `.env.example` come riferimento):
```env
# Chiave API ufficiale di Google AI Studio (Necessaria per le funzioni di analisi semantica e grounding)
GEMINI_API_KEY=tua_api_key_qui
```

### 🔨 Installazione dei Pacchetti
Dalla directory radice del progetto, eseguire il comando per installare tutte le dipendenze dichiarate nel file `package.json`:
```bash
npm install
```

### 💻 Avvio in Modalità Sviluppo (Dev Mode)
Per avviare la piattaforma in modalità sviluppo con ricaricamento rapido del codice, eseguire:
```bash
npm run dev
```
Il comando avvia in parallelo (via `concurrently`) due processi:
* **Server Express** (API backend) sulla porta **3000**
* **Vite Dev Server** (interfaccia utente React con hot-reload) sulla porta **5173**

👉 **L'applicazione si utilizza aprendo il browser su `http://localhost:5173/`** — le chiamate `/api` vengono inoltrate automaticamente al backend sulla 3000 tramite il proxy configurato in `vite.config.ts`.

### 🏗️ Compilazione e Avvio in Produzione (Production Build)
Per generare la versione ottimizzata e avviarla simulando il deployment reale:
1. **Compilazione del Progetto:**
   ```bash
   npm run build
   ```
   Questo comando compila gli asset del frontend all'interno della cartella `dist/` e impacchetta il server TypeScript in un unico modulo ES ottimizzato (`dist/server.mjs`) tramite `esbuild`. L'output è **ESM** (non CommonJS) perché il progetto usa `import.meta.url` e la sintassi a moduli: il formato CJS lasciava `import.meta.url` vuoto e faceva fallire l'avvio in produzione.
2. **Avvio dell'Applicazione Compilata:**
   ```bash
   npm start
   ```
   L'applicazione è ora in esecuzione alla massima efficienza, pronta a servire le richieste di produzione dei consulenti d'impresa di DIGITS DISTRIBUZIONE SRL.

---
*Progettato con orgoglio, rigore ingegneristico e amore per il design dal Bidding Platform Development Team.*

---

## 📋 8. Registro di Supervisione (aggiornamento sequenziale)

### [2026-07-16] — Azione #1: Analisi del readme e verifica integrità progetto (Supervisor/Analista)

**Attività svolta:** lettura completa del readme e verifica di corrispondenza con i file effettivamente presenti nella cartella di progetto.

**Esito — criticità bloccante rilevata:** il codice sorgente descritto nel readme risulta ASSENTE dalla cartella. File mancanti: `package.json`, `package-lock.json`, `server.ts`, `src/` (incluso `src/types.ts`), `index.html`, `tsconfig.json`, `dist/`, `.env`. File presenti: `readme.md`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `.env.example`, `node_modules/`. Senza `package.json` i comandi `npm install`, `npm run dev`, `npm run build` non sono eseguibili. Azione richiesta: recuperare il sorgente da backup/altra cartella/repository prima di qualsiasi ulteriore sviluppo.

**Osservazioni minori:** (a) in modalità dev Vite gira sulla porta 5173 con proxy `/api` → 3000, mentre il readme cita solo la 3000; (b) verificare la disponibilità effettiva del modello di fallback "gemini-3.1-flash-lite"; (c) la persistenza è solo in-memory: listino e profilo si perdono al riavvio.

**Raccomandazioni strategiche proposte (in ordine di priorità):**
1. Versionamento Git del progetto per prevenire perdite di codice come quella attuale.
2. Persistenza dati reale (SQLite o Supabase) per listino, profilo aziendale e storico gare con audit trail.
3. Scheduler di monitoraggio bandi con notifiche (email/Telegram) alla pubblicazione di gare classificate "verdi" dal semaforo AI.
4. Parsing diretto dei capitolati PDF (oggi supportato solo testo incollato).
5. Dashboard KPI: win rate, margini medi, scadenze imminenti.
6. Export DOCX/PDF dell'offerta formattata pronta per il portale Acquisti in Rete PA.

**Prossima azione suggerita:** localizzare/ripristinare il codice sorgente, quindi eseguire audit di sicurezza del `server.ts` (validazione input, rate limiting, gestione errori API).

### [2026-07-16] — Azione #2: Rettifica Azione #1 e censimento del codice reale (Supervisor/Analista)

**Rettifica:** la criticità bloccante segnalata nell'Azione #1 era un **falso allarme** dovuto a un indice file non aggiornato dello strumento di analisi. Il codice sorgente è integralmente presente e l'applicazione è **funzionante**. Avvio confermato: `npm run dev` → interfaccia su **http://localhost:5173/** (backend API su porta 3000, proxy Vite). Sezione 7 del readme aggiornata di conseguenza.

**Censimento del codice reale — il readme era sottodimensionato rispetto al progetto.** Struttura effettiva rilevata:
* `server.ts` — backend Express con Gemini, cron (`node-cron`), upload PDF (`multer` + `pdf-parse`), graceful degradation su bandi d'archivio
* `db.js` — persistenza **SQLite** (better-sqlite3): query bandi, statistiche, gare partecipate
* `ingestion.ts` + `scripts/` (`download_historical.ts`, `import_anac_files.ts`, `import_previous_months.ts`, `analyze_cig.ts`) — pipeline di ingestione dati ANAC/BDNCP con job incrementale giornaliero
* `server/jobLogger.ts` e `server/auditLogger.ts` — logging dei job e audit trail delle attività
* `src/components/` — `SupervisorDashboard`, `TenderHistoryPanel`, `TenderDocumentManager`, `QuickMatchModal`, `CompanyProfilePanel`, `IngestionStatusBadge`
* `src/types.ts` v2.0 — profilo aziendale persistito in `data/company_profile.json`, certificazioni con scadenza (`isExpiringSoon`), documenti societari (DURC, CCIAA, SOA), fatturato triennale

**Conseguenza sulle raccomandazioni dell'Azione #1:** le proposte 2 (persistenza SQLite), 3 (scheduler, parzialmente — manca la notifica esterna) e 4 (parsing PDF) risultano **già implementate**. Restano valide e prioritarie:
1. **Versionamento Git** del progetto (tuttora assente, rischio perdita codice).
2. **Notifiche esterne** (email/Telegram) quando il job giornaliero rileva nuove gare "verdi" o certificazioni in scadenza.
3. **Export DOCX/PDF dell'offerta** formattata pronta per il portale Acquisti in Rete PA.
4. **Aggiornamento delle sezioni 2–5 del readme**, che non riflettono più l'architettura reale (SQLite, ingestione ANAC, audit log, dashboard supervisore).

**Prossima azione suggerita:** audit funzionale della dashboard supervisore e revisione di sicurezza di `server.ts` (validazione input upload PDF, rate limiting endpoint AI).

### [2026-07-16] — Azione #3: Export offerta DOCX/PDF + allineamento readme sezioni 2–5 (Supervisor/Analista)

**Attività svolta:** implementazione dell'export del documento d'offerta in formati Office nativi e riscrittura delle sezioni descrittive del readme per riflettere l'architettura reale.

**Export DOCX/PDF (nuova funzionalità):**
* Aggiunta dipendenza `docx` (^8.5.0) in `package.json` → **richiede `npm install`** prima del prossimo avvio.
* `src/App.tsx`: nuove funzioni `handleDownloadDOCX()` (Word `.docx` nativo via libreria `docx`, con tabella lotti, dichiarazione CAM, nota MEPA e clausola firma digitale) e `handleExportPDF()` (anteprima di stampa HTML professionale → "Salva come PDF", zero dipendenze). Aggiunta utility `triggerBlobDownload()`.
* UI del tab OFFERTA: due pulsanti primari **"Esporta PDF"** e **"Esporta Word (.docx)"**; il precedente RTF/ODF è stato mantenuto come opzione secondaria di compatibilità. Nuove icone `Printer` e `FileType2`.
* Approccio scelto: generazione **lato client** (coerente con l'export RTF preesistente), nessun dato d'offerta inviato a servizi esterni → conforme all'impostazione privacy del progetto.

**Allineamento readme:**
* **Sez. 2** — diagramma architettura riscritto: aggiunti SQLite, ingestione ANAC/OCDS, cron, audit/job logger, porte 5173 (client) / 3000 (API) con proxy.
* **Sez. 3** — nuove sottosezioni E (persistenza SQLite `db.js`), F (ingestione ANAC + job schedulati), G (job/audit logger); sottosezione D aggiornata con upload PDF e matching deterministico locale.
* **Sez. 4** — aggiunto censimento dei moduli `src/components/` e nuova sottosezione "Export del Documento d'Offerta" (PDF/DOCX/RTF).
* **Sez. 5** — riscritta: persistenza reale su SQLite + JSON (`data/company_profile.json`), certificazioni con scadenza, log/audit.

**Note di verifica:** la libreria `docx` è compatibile con l'esecuzione browser (bundle Vite) e usa `Packer.toBlob`. L'export PDF dipende dai popup del browser (gestito con messaggio di avviso se bloccati). Da testare in ambiente reale dopo `npm install`: (a) rendering tabella lotti nel `.docx`, (b) stampa PDF su Chrome/Edge.

**Raccomandazioni aggiornate ancora aperte:**
1. **Versionamento Git** (tuttora assente — priorità massima).
2. **Notifiche esterne** (email/Telegram) per gare "verdi" e certificazioni in scadenza.
3. Audit di sicurezza `server.ts` (validazione upload PDF, rate limiting endpoint AI).

**Prossima azione suggerita:** eseguire `npm install` e verificare l'export su una gara reale; poi valutare le notifiche esterne del job giornaliero.

### [2026-07-16] — Azione #4: Fix crash `npm start` in produzione (build ESM) (Supervisor/Analista)

**Problema segnalato:** `npm run dev` funziona (`http://localhost:5173`), ma `npm run build` + `npm start` andava in crash:
`TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string... Received undefined` in `dist/server.cjs:41` → `fileURLToPath`.

**Causa (root cause):** `build:server` compilava con `esbuild --format=cjs`, mentre il codice usa `import.meta.url` (in `server.ts`, `db.ts`, `ingestion.ts`, `server/auditLogger.ts`, `server/jobLogger.ts`). In output **CommonJS** `import.meta.url` è **vuoto** → `fileURLToPath(undefined)` lancia l'eccezione al caricamento del modulo. In dev il problema non si manifesta perché `tsx` esegue il codice come ESM nativo (gli stessi 5 warning `empty-import-meta` di esbuild lo segnalavano già).

**Correzione applicata:**
1. `package.json` → `build:server` ora produce **ESM**: `esbuild server.ts --bundle --platform=node --outfile=dist/server.mjs --format=esm --packages=external`. Aggiornati anche `main` e `start` → `dist/server.mjs`. In ESM `import.meta.url` è valorizzato correttamente e `createRequire` (per `pdf-parse`) funziona.
2. `db.ts` e `ingestion.ts` → i percorsi dati sono stati ancorati a **`process.cwd()`** (`data/` e `data/raw/`) invece che a `__dirname`. Motivo: nel bundle unico `dist/server.mjs`, `import.meta.url` punta a `dist/`, quindi un path basato su `__dirname` avrebbe cercato i dati in `dist/data` (vuoto) anziché in `data/` alla radice (dove risiedono i 95 bandi). `server.ts` già usava `process.cwd()`: ora la convenzione è uniforme. `auditLogger.ts`/`jobLogger.ts` usano `__dirname/../data` e restano corretti in entrambe le modalità.
3. Aggiornata la sez. 7 del readme (output ESM anziché CommonJS).

**Verifica richiesta dall'utente:** rieseguire `npm run build` (ora genera `dist/server.mjs` senza i 5 warning `empty-import-meta`) e poi `npm start` → il server deve avviarsi sulla 3000 servendo il frontend compilato. Nota: il vecchio `dist/server.cjs` può essere rimosso.

**Prossima azione suggerita:** aggiungere il **versionamento Git** (priorità massima, tuttora assente) e valutare le notifiche esterne del job giornaliero.
