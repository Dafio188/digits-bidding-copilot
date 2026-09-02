import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Search, 
  RefreshCw, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Copy, 
  Check, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Award,
  Package,
  TrendingUp,
  Cpu,
  Download,
  ShieldCheck,
  MonitorCheck,
  FolderOpen,
  History,
  Printer,
  FileType2,
  Sparkles,
  CheckCheck,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  AlignmentType
} from 'docx';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { CompanyProfilePanel } from './components/CompanyProfilePanel';
import { TenderDocumentManager } from './components/TenderDocumentManager';
import { TenderHistoryPanel } from './components/TenderHistoryPanel';
import { QuickMatchModal } from './components/QuickMatchModal';
import { LoginModal } from './components/LoginModal';
import { getStoredToken, removeStoredToken, getStoredUser } from './api';
import { LogOut, Lock } from 'lucide-react';
import { 
  Tender, 
  CompanyProfile, 
  Product, 
  TenderAnalysis, 
  ComplianceVerification, 
  GeneratedOffer 
} from './types';

// Intercettore di sicurezza globale per iniettare l'header Authorization: Bearer <token>
if (typeof window !== 'undefined' && !(window as any).__digits_fetch_intercepted) {
  (window as any).__digits_fetch_intercepted = true;
  const rawFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as Request).url);
    if (urlStr.includes('/api/') && !urlStr.includes('/api/auth/login')) {
      const token = localStorage.getItem('digits_auth_token');
      if (token) {
        const headers = new Headers(init?.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        init = { ...init, headers };
      }
    }
    const res = await rawFetch(input, init);
    if (res.status === 401 && urlStr.includes('/api/') && !urlStr.includes('/api/auth/login')) {
      localStorage.removeItem('digits_auth_token');
      localStorage.removeItem('digits_auth_user');
      window.dispatchEvent(new Event('digits:unauthorized'));
    }
    return res;
  };
}


const REGIONI_ITALIA = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia",
  "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"
];

// Valori predefiniti di fallback
const INITIAL_PROFILE: CompanyProfile = {
  name: "DIGITS DISTRIBUZIONE SRL UNIPERSONALE",
  vatNumber: "09007650725",
  fiscalCode: "09007650725",
  location: "Casamassima (BA)",
  address: "Via Nazionale, 90 - 70010 Casamassima (BA)",
  pec: "digits@pec.it",
  phone: "+39 080 000000",
  maxTenderValue: 185000.00,
  turnover: [],
  mepaCategories: ["ICT", "Beni d'Ufficio", "Hardware/Software"],
  mepaEnabled: true,
  consipEnabled: false,
  certifications: ["ISO 9001", "ISO 14001", "ISO 27001", "R2v3 (Hardware Ricondizionato)", "Certificazione di processo per il ricondizionamento"],
  certificationDetails: [],
  societalDocuments: [],
  paReferences: [],
};

export default function App() {
  // Stato autenticazione e sicurezza JWT
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getStoredToken());
  const [authUser, setAuthUser] = useState<any>(() => getStoredUser());

  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setAuthUser(null);
    };
    window.addEventListener('digits:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('digits:unauthorized', handleUnauthorized);
  }, []);

  const handleLogout = () => {
    removeStoredToken();
    setIsAuthenticated(false);
    setAuthUser(null);
    if (typeof showToast === 'function') {
      showToast("Disconnessione effettuata.");
    }
  };

  // Stato centralizzato
  const [profile, setProfile] = useState<CompanyProfile>(INITIAL_PROFILE);

  const [products, setProducts] = useState<Product[]>([]);
  // Persistenza locale bandi per avvio istantaneo
  const [tenders, setTenders] = useState<Tender[]>(() => {
    try {
      const cached = localStorage.getItem('digits_cached_tenders');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error("Errore lettura cache bandi:", e);
    }
    return [];
  });
  const [selectedTender, setSelectedTender] = useState<Tender | null>(() => {
    try {
      const cached = localStorage.getItem('digits_cached_tenders');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
      }
    } catch {}
    return null;
  });

  // Tracciamento gare già viste / esaminate per calcolo "Nuove"
  const [seenTenderIds, setSeenTenderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('digits_seen_tenders');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Errore lettura seen tenders:", e);
    }
    return [];
  });

  // Salva i bandi visti in localStorage
  useEffect(() => {
    try {
      localStorage.setItem('digits_seen_tenders', JSON.stringify(seenTenderIds));
    } catch (e) {
      console.error("Errore salvataggio seen tenders:", e);
    }
  }, [seenTenderIds]);

  // Filtro rapido per isolare solo i nuovi bandi
  const [showOnlyNew, setShowOnlyNew] = useState<boolean>(false);
  
  // Filtri di ricerca
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedImporto, setSelectedImporto] = useState('ALL'); // ALL, <60k, 60k-150k, >150k
  const [excludeDirectNegotiations, setExcludeDirectNegotiations] = useState(true);

  // Filtri avanzati Elenco Gare (Semaforo AI, Scadenza ed Ordinamento)
  const [selectedAiFilter, setSelectedAiFilter] = useState<'ALL' | 'APPROVATA' | 'DA_VALUTARE' | 'SCARTATA'>('ALL');
  const [selectedExpiryFilter, setSelectedExpiryFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED'>('ALL');
  const [sortOrder, setSortOrder] = useState<'DEFAULT' | 'DEADLINE_ASC' | 'DEADLINE_DESC' | 'VALUE_DESC'>('DEADLINE_ASC');

  // Gestione dinamica CPV Target & Filtro per CPV specifico
  const [cpvList, setCpvList] = useState<string[]>(() => {
    const saved = localStorage.getItem('digits_cpvList');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error("Errore parse CPV", e); }
    }
    return ["30125110-5 - Hardware", "30200000-1 - Computer", "30232150-0 - Server", "88510000-2 - Servizi"];
  });
  
  useEffect(() => {
    localStorage.setItem('digits_cpvList', JSON.stringify(cpvList));
  }, [cpvList]);

  const [selectedCpvFilter, setSelectedCpvFilter] = useState<string>('ALL');
  const [newCpvInput, setNewCpvInput] = useState('');
  // Stati di caricamento (Skeleton Screens)
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [_isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [_isGeneratingOffer, setIsGeneratingOffer] = useState(false);

  // Risultati del Wizard di sottomissione
  const [_activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [analysis, setAnalysis] = useState<TenderAnalysis | null>(null);
  const [compliance, setCompliance] = useState<ComplianceVerification | null>(null);
  const [generatedOffer, setGeneratedOffer] = useState<GeneratedOffer | null>(null);
  
  // Checklist documenti verificati (salvavita)
  const [verifiedDocs, setVerifiedDocs] = useState<Record<string, boolean>>({});

  // Tab di navigazione attivo v1.1
  const [activeTab, setActiveTab] = useState<'ESTRAZIONE' | 'ANALISI' | 'CONFORMITA' | 'OFFERTA' | 'LISTINO' | 'PROFILO' | 'SUPERVISOR' | 'CONFORMITA_SOC' | 'DOCUMENTI' | 'STORICO'>('ESTRAZIONE');

  // Feedback visivo
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Testo del capitolato tecnico inserito/incollato dall'utente per l'analisi
  const [capitolatoText, setCapitolatoText] = useState('');

  // Stato per la modale QuickMatch di selezione prodotti dal listino
  const [quickMatchModal, setQuickMatchModal] = useState<{
    isOpen: boolean;
    itemIndex: number | null;
    lottoId: number;
    lottoDescription: string;
    requiredQty: number;
  }>({
    isOpen: false,
    itemIndex: null,
    lottoId: 0,
    lottoDescription: '',
    requiredQty: 1
  });

  // Nuovi articoli del listino aggiunti interattivamente
  const [newOem, setNewOem] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newCost, setNewCost] = useState<number | ''>('');
  const [newRetail, setNewRetail] = useState<number | ''>('');
  const [newStock, setNewStock] = useState<number | ''>('');

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products');
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (err) {
      console.error("Errore fetch products:", err);
    }
  };

  // Caricamento iniziale dei bandi (eseguito solo se l'utente è autenticato)
  useEffect(() => {
    if (isAuthenticated) {
      handleSearchTenders(true);
      fetchProducts();
    }
  }, [isAuthenticated]);

  // Salva il contesto di analisi e l'offerta per la gara corrente su server e localStorage
  const saveTenderAnalysisContext = (tenderId: string, stateToSave?: any) => {
    if (!tenderId) return;
    const payload = {
      tenderId,
      capitolatoText: stateToSave?.capitolatoText ?? capitolatoText,
      analysis: stateToSave?.analysis ?? analysis,
      compliance: stateToSave?.compliance ?? compliance,
      generatedOffer: stateToSave?.generatedOffer ?? generatedOffer,
      verifiedDocs: stateToSave?.verifiedDocs ?? verifiedDocs,
      activeTab: stateToSave?.activeTab ?? activeTab,
      updatedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(`digits_analysis_${tenderId}`, JSON.stringify(payload));
      fetch(`/api/tenders/${tenderId}/save-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (err) {
      console.error("Errore salvataggio contesto:", err);
    }
  };

  // Carica il contesto di analisi salvato per la gara corrente da server/localStorage
  const loadSavedTenderAnalysis = async (tenderId: string) => {
    try {
      const res = await fetch(`/api/tenders/${tenderId}/saved-analysis`);
      let saved = null;
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          saved = data.data;
        }
      }
      if (!saved) {
        const local = localStorage.getItem(`digits_analysis_${tenderId}`);
        if (local) {
          saved = JSON.parse(local);
        }
      }

      if (saved) {
        if (saved.capitolatoText) setCapitolatoText(saved.capitolatoText);
        if (saved.analysis) setAnalysis(saved.analysis);
        if (saved.compliance) setCompliance(saved.compliance);
        if (saved.generatedOffer) setGeneratedOffer(saved.generatedOffer);
        if (saved.verifiedDocs) setVerifiedDocs(saved.verifiedDocs);
        if (saved.activeTab) setActiveTab(saved.activeTab);
        showToast('🔄 Sessione di lavoro ripristinata per questa gara!');
        return true;
      }
    } catch (err) {
      console.error("Errore ripristino contesto salvato:", err);
    }
    return false;
  };

  // Sincronizza il testo del capitolato ed esegue il ripristino automatico dello stato dell'analisi
  useEffect(() => {
    if (selectedTender) {
      const id = selectedTender.cig || selectedTender.id;
      loadSavedTenderAnalysis(id).then(restored => {
        if (!restored) {
          setCapitolatoText(selectedTender.description || '');
          setAnalysis(null);
          setCompliance(null);
          setGeneratedOffer(null);
          setVerifiedDocs({});
        }
      });
    } else {
      setCapitolatoText('');
      setAnalysis(null);
      setCompliance(null);
      setGeneratedOffer(null);
      setVerifiedDocs({});
    }
  }, [selectedTender?.id, selectedTender?.cig]);

  // Ogni volta che il profilo o il listino prodotti cambia, se c'è un bando selezionato, ricalcoliamo la conformità e l'offerta
  useEffect(() => {
    if (selectedTender) {
      // Aggiorna localmente lo stato del semaforo per il bando selezionato
      let evaluation: 'SCARTATA' | 'DA_VALUTARE' | 'APPROVATA' = 'APPROVATA';
      let reasoning = "Piena conformità.";

      if (selectedTender.value > profile.maxTenderValue) {
        evaluation = 'SCARTATA';
        reasoning = `Importo stimato di €${selectedTender.value.toLocaleString('it-IT')} superiore alla capacità massima di bilancio annuo aziendale (€${profile.maxTenderValue.toLocaleString('it-IT')}).`;
      } else if (selectedTender.value > 60000) {
        evaluation = 'DA_VALUTARE';
        reasoning = "Importo elevato che richiede un controllo manuale dei margini e dei requisiti.";
      }

      setTenders(prev => prev.map(t => t.id === selectedTender.id ? { ...t, aiEvaluation: evaluation, aiReasoning: reasoning } : t));
      setSelectedTender((prev: Tender | null) => prev ? { ...prev, aiEvaluation: evaluation, aiReasoning: reasoning } : null);

      // Se eravamo agli step di conformità o offerta, forziamo il ricalcolo reattivo richiamando gli endpoint
      if (analysis) {
        recalculateComplianceAndOffer(analysis);
      }
    }
  }, [profile, products]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Sorgente dati dell'ultima ricerca (per il badge visivo nel frontend)
  const [dataSource, setDataSource] = React.useState<string | null>(null);

  // Mappa source → label e colore badge
  const getSourceBadge = (source: string | null) => {
    if (!source) return null;
    const map: Record<string, { label: string; color: string; icon: string }> = {
      anac_ocds_live:  { label: 'ANAC Live (API Ufficiale)', color: '#10b981', icon: '🟢' },
      anac_bulk_live:  { label: 'ANAC Live (Bulk Mensile)',  color: '#3b82f6', icon: '🔵' },
      gemini_grounding:{ label: 'Gemini Web Search',         color: '#8b5cf6', icon: '🔮' },
      archive_fallback:{ label: 'Archivio Storico (Offline)',color: '#f59e0b', icon: '📦' },
    };
    return map[source] || { label: source, color: '#6b7280', icon: 'ℹ️' };
  };

  // Funzione per la ricerca dei bandi pubblici
  const handleSearchTenders = async (isInitial = false) => {
    setIsSearching(true);
    if (!isInitial) {
      showToast('Ricerca bandi reali ANAC per i CPV registrati...');
    }
    try {
      const response = await fetch(`/api/anac-live?q=${encodeURIComponent(searchQuery)}&cpvs=${encodeURIComponent(cpvList.join(','))}&profile=${encodeURIComponent(JSON.stringify(profile))}`);
      if (response.ok) {
        const data = await response.json();
        // Il nuovo endpoint restituisce { source, tenders }
        const tenderList: Tender[] = Array.isArray(data) ? data : (data.tenders || []);
        const source = data.source || null;
        setDataSource(source);
        setTenders(tenderList);

        // Persistenza locale per avvio immediato
        try {
          localStorage.setItem('digits_cached_tenders', JSON.stringify(tenderList));
        } catch (e) {
          console.error("Errore salvataggio cache bandi:", e);
        }

        // Calcola quante nuove gare ci sono rispetto allo storico visto
        const currentSeen = new Set(seenTenderIds);
        const newCount = tenderList.filter(t => !currentSeen.has(t.id) && (!t.cig || !currentSeen.has(t.cig))).length;

        if (tenderList.length > 0 && isInitial) {
          if (!selectedTender) {
            setSelectedTender(tenderList[0]);
          }
        }
        if (!isInitial) {
          const badge = getSourceBadge(source);
          const newMsg = newCount > 0 ? ` (${newCount} nuovi ✨)` : '';
          showToast(`${badge?.icon || ''} ${tenderList.length} bandi trovati${newMsg} — ${badge?.label || 'Fonte sconosciuta'}`);
        }
      } else {
        throw new Error('Errore durante il recupero dei bandi ANAC');
      }
    } catch (error) {
      console.error(error);
      showToast('Errore di connessione. Caricamento dati di archivio.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleUpdateStatus = async (newStatus: 'active' | 'submitted' | 'won' | 'lost') => {
    if (!selectedTender) return;
    try {
      const response = await fetch(`/api/tenders/${selectedTender.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        const updatedTender = { ...selectedTender, status: newStatus };
        setSelectedTender(updatedTender);
        setTenders(prev => prev.map(t => t.id === selectedTender.id ? updatedTender : t));
        showToast(
          newStatus === 'submitted' ? "Gara segnata come partecipata!" :
          newStatus === 'won' ? "Complimenti! Gara aggiudicata! 🎉" :
          newStatus === 'lost' ? "Gara segnata come persa." :
          "Stato della gara ripristinato."
        );
      } else {
        showToast("Errore durante l'aggiornamento dello stato.");
      }
    } catch (err) {
      console.error(err);
      showToast("Errore di connessione.");
    }
  };

  // Funzione per avviare l'analisi semantica (Step 1)
  const handleAnalyzeTender = async (tender: Tender, overrideText?: string) => {
    setIsAnalyzing(true);
    setActiveStep(1);
    setAnalysis(null);
    setCompliance(null);
    setGeneratedOffer(null);
    setVerifiedDocs({});
    
    try {
      const textToUse = overrideText || capitolatoText || tender.description;
      const response = await fetch('/api/analyze-tender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId: tender.id,
          title: tender.title,
          description: textToUse
        })
      });
      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
        showToast("Capitolato analizzato con successo. Lotti estratti.");
        // Reindirizza al tab Analisi & Parsing v1.1
        setActiveTab('ANALISI');
        setActiveStep(1);
        // Procediamo automaticamente al calcolo dello step 2 per una UX ottimale
        await handleVerifyCompliance(data);
      }
    } catch (error) {
      console.error(error);
      showToast("Errore durante l'analisi semantica del capitolato.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Funzione per verificare la conformità amministrativa (Step 2)
  const handleVerifyCompliance = async (currentAnalysis: TenderAnalysis) => {
    setIsCheckingCompliance(true);
    try {
      const response = await fetch('/api/verify-compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderAnalysis: currentAnalysis,
          companyProfile: profile
        })
      });
      if (response.ok) {
        const data = await response.json();
        setCompliance(data);
        // Procediamo automaticamente al calcolo dello step 3
        await handleGenerateOffer(currentAnalysis);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsCheckingCompliance(false);
    }
  };

  // Funzione per generare l'offerta economica (Step 3)
  const handleGenerateOffer = async (currentAnalysis: TenderAnalysis) => {
    setIsGeneratingOffer(true);
    try {
      const response = await fetch('/api/generate-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderAnalysis: currentAnalysis,
          productsList: products
        })
      });
      if (response.ok) {
        const data = await response.json();
        setGeneratedOffer(data);
        if (selectedTender) {
          saveTenderAnalysisContext(selectedTender.cig || selectedTender.id, {
            analysis: currentAnalysis,
            generatedOffer: data
          });
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingOffer(false);
    }
  };

  // Funzione per ricalcolare i dati in tempo reale dopo modifiche alla sidebar
  const recalculateComplianceAndOffer = async (currentAnalysis: TenderAnalysis) => {
    // Eseguiamo in background senza bloccare la UI con skeleton pesanti
    try {
      const responseCompliance = await fetch('/api/verify-compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderAnalysis: currentAnalysis,
          companyProfile: profile
        })
      });
      if (responseCompliance.ok) {
        const dataComp = await responseCompliance.json();
        setCompliance(dataComp);
      }

      const responseOffer = await fetch('/api/generate-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderAnalysis: currentAnalysis,
          productsList: products
        })
      });
      if (responseOffer.ok) {
        const dataOff = await responseOffer.json();
        setGeneratedOffer(dataOff);
      }
    } catch (error) {
      console.error("Errore nel ricalcolo reattivo:", error);
    }
  };

  // Gestore per l'aggiornamento dinamico di costo, prezzo unitario, quantità e prodotto per l'offerta
  const handleOfferItemUpdate = (index: number, updates: Record<string, any>) => {
    if (!generatedOffer) return;

    const newItems = generatedOffer.items.map((item: any, idx: number) => {
      if (idx !== index) return item;
      const updated = { ...item, ...updates };

      const qty = Math.max(1, Number(updated.requiredQty) || 1);
      const unitCost = Math.max(0, Number(updated.unitCost) || 0);
      const unitPrice = Math.max(0, Number(updated.unitPrice) || 0);
      const totalPrice = Number((qty * unitPrice).toFixed(2));
      const totalCost = Number((qty * unitCost).toFixed(2));

      return {
        ...updated,
        requiredQty: qty,
        unitCost,
        unitPrice,
        totalPrice,
        totalCost,
      };
    });

    const totalPrice = Number(newItems.reduce((acc: number, it: any) => acc + (it.totalPrice || 0), 0).toFixed(2));
    const totalCost = Number(newItems.reduce((acc: number, it: any) => acc + (it.totalCost || 0), 0).toFixed(2));
    const totalMargin = Number((totalPrice - totalCost).toFixed(2));
    const marginPercentage = totalPrice > 0 ? Number(((totalMargin / totalPrice) * 100).toFixed(1)) : 0;

    const newOffer = {
      ...generatedOffer,
      items: newItems,
      totalPrice,
      totalCost,
      totalMargin,
      marginPercentage
    };

    setGeneratedOffer(newOffer);
    if (selectedTender) {
      saveTenderAnalysisContext(selectedTender.cig || selectedTender.id, {
        generatedOffer: newOffer
      });
    }
  };

  // Copia la nota MEPA negli appunti
  const handleCopyNote = () => {
    if (generatedOffer) {
      navigator.clipboard.writeText(generatedOffer.mepaSubmissionNote);
      setCopied(true);
      showToast("Nota MEPA copiata negli appunti!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Genera e scarica il documento d'offerta in formato RTF/ODF
  const handleDownloadRTF = () => {
    if (!selectedTender || !generatedOffer || !analysis) return;

    const today = new Date().toLocaleDateString('it-IT');
    const totalProposed = generatedOffer.totalPrice.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    let rtfContent = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Inter;}{\\f2\\fmodern\\fcharset0 JetBrains Mono;}}
{\\colortbl ;\\red0\\green102\\blue204;\\red51\\green51\\blue51;\\red240\\green240\\blue240;\\red220\\green53\\blue69;}
\\viewkind4\\uc1\\pard\\cf2\\f1\\fs24
{\\b\\cf1\\fs32 OFFERTA ECONOMICA E DICHIARAZIONE DI CONFORMIT\\'c0}\\par
\\cf2\\fs20 Generato automaticamente da Digits Co-Pilot in data: ${today}\\par
\\par
\\b STAZIONE APPALTANTE:\\b0  ${selectedTender.authority}\\par
\\b OGGETTO DELLA GARA:\\b0  ${selectedTender.title}\\par
\\b CIG (Codice Identificativo Gara):\\b0  ${selectedTender.cig || 'Non applicabile'}\\par
\\b IMPORTO A BASE D'ASTA:\\b0  EUR ${selectedTender.value.toLocaleString('it-IT', { minimumFractionDigits: 2 })}\\par
\\par
\\pard\\cf2\\fs22\\b DATI DELL'OPERATORE ECONOMICO\\b0\\par
\\pard\\fs20 Denominazione: ${profile.name}\\par
P.IVA/C.F.: ${profile.vatNumber}\\par
Sede Legale: ${profile.location}\\par
\\par
\\pard\\b DICHIARAZIONE DI CONFORMIT\\'c0 TECNICA E AMBIENTALE (CAM)\\b0\\par
Il sottoscritto, in qualita di legale rappresentante dell'Operatore Economico, dichiara sotto la propria responsabilita che tutti i prodotti offerti nel presente quadro economico sono pienamente conformi alle specifiche tecniche minime richieste dal capitolato d'oneri e rispettano integralmente i Criteri Ambientali Minimi (CAM) vigenti in materia di apparecchiature informatiche.\\par
\\par
\\pard\\b DETTAGLIO DELL'OFFERTA ECONOMICA\\b0\\par
\\par
`;

    generatedOffer.items.forEach((item) => {
      const lotPrice = item.totalPrice.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      rtfContent += `{\\b LOTTO #${item.lottoId}: ${item.lottoDescription}}\\par\n`;
      rtfContent += `Prodotto offerto (OEM): ${item.matchedProductOEM || 'N/A'}\\par\n`;
      rtfContent += `Quantita: ${item.requiredQty} pezzi | Prezzo unitario: EUR ${item.unitPrice.toLocaleString('it-IT', { minimumFractionDigits: 2 })} | \\b Prezzo Totale Lotto: EUR ${lotPrice}\\b0\\par\\par\n`;
    });

    rtfContent += `\\pard\\qr\\fs24\\b IMPORTO TOTALE DELL'OFFERTA: EUR ${totalProposed}\\b0\\par
\\par
\\pard\\cf2\\fs20 Note MEPA di Sottomissione:\\par
\\cf3\\fs18 ${generatedOffer.mepaSubmissionNote.replace(/\n/g, '\\par\n')}\\par
\\par
\\pard\\cf2\\fs20\\b DOCUMENTO SOTTOPOSTO A FIRMA DIGITALE\\b0\\par
Il presente documento deve essere firmato digitalmente ai sensi del D.Lgs. 82/2005 (CAD) mediante dispositivo di firma qualificata (formato CAdES .p7m o PAdES .pdf) dal legale rappresentante.\\par
}`;

    const blob = new Blob([rtfContent], { type: 'application/rtf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offerta_economica_${selectedTender.cig || 'gara'}.rtf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Offerta scaricata in formato RTF/ODF!");
  };

  // Utility: forza il download di un Blob con un nome file
  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Genera e scarica il documento d'offerta in formato Word (.docx) nativo
  const handleDownloadDOCX = async () => {
    if (!selectedTender || !generatedOffer || !analysis) return;

    try {
      const today = new Date().toLocaleDateString('it-IT');
      const euro = (n: number) =>
        'EUR ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const infoLine = (label: string, value: string) =>
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `${label} `, bold: true, size: 20 }),
            new TextRun({ text: value, size: 20 })
          ]
        });

      const headerCells = ['Lotto', 'Prodotto (OEM)', 'Q.tà', 'Prezzo unit.', 'Totale Lotto'].map(
        (t) =>
          new TableCell({
            shading: { fill: 'F0F0F0' },
            children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 18 })] })]
          })
      );

      const itemRows = generatedOffer.items.map(
        (item: any) =>
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: `#${item.lottoId} — ${item.lottoDescription}`, size: 18 })] })]
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: item.matchedProductOEM || 'N/A', size: 18 })] })]
              }),
              new TableCell({
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(item.requiredQty), size: 18 })] })]
              }),
              new TableCell({
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: euro(item.unitPrice), size: 18 })] })]
              }),
              new TableCell({
                children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: euro(item.totalPrice), bold: true, size: 18 })] })]
              })
            ]
          })
      );

      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ tableHeader: true, children: headerCells }), ...itemRows]
      });

      const doc = new DocxDocument({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun({ text: 'OFFERTA ECONOMICA E DICHIARAZIONE DI CONFORMITÀ' })]
              }),
              new Paragraph({
                spacing: { after: 200 },
                children: [new TextRun({ text: `Generato automaticamente da Digits Co-Pilot in data ${today}`, italics: true, size: 18, color: '666666' })]
              }),
              new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Dati della procedura' })] }),
              infoLine('Stazione appaltante:', selectedTender.authority),
              infoLine('Oggetto della gara:', selectedTender.title),
              infoLine('CIG:', selectedTender.cig || 'Non applicabile'),
              infoLine("Importo a base d'asta:", euro(selectedTender.value)),
              new Paragraph({ text: '', spacing: { after: 120 } }),
              new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Dati dell\'operatore economico' })] }),
              infoLine('Denominazione:', profile.name),
              infoLine('P.IVA / C.F.:', profile.vatNumber),
              infoLine('Sede legale:', profile.location),
              new Paragraph({ text: '', spacing: { after: 120 } }),
              new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Dichiarazione di conformità tecnica e ambientale (CAM)' })] }),
              new Paragraph({
                spacing: { after: 200 },
                children: [new TextRun({ text: "Il sottoscritto, in qualità di legale rappresentante dell'Operatore Economico, dichiara sotto la propria responsabilità che tutti i prodotti offerti nel presente quadro economico sono pienamente conformi alle specifiche tecniche minime richieste dal capitolato d'oneri e rispettano integralmente i Criteri Ambientali Minimi (CAM) vigenti in materia di apparecchiature informatiche.", size: 20 })]
              }),
              new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Dettaglio dell\'offerta economica' })] }),
              table,
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 200, after: 200 },
                children: [new TextRun({ text: `IMPORTO TOTALE DELL'OFFERTA: ${euro(generatedOffer.totalPrice)}`, bold: true, size: 24 })]
              }),
              new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Nota MEPA di sottomissione' })] }),
              ...generatedOffer.mepaSubmissionNote.split('\n').map(
                (line: string) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: line, size: 20 })] })
              ),
              new Paragraph({ text: '', spacing: { after: 160 } }),
              new Paragraph({
                children: [new TextRun({ text: 'DOCUMENTO SOTTOPOSTO A FIRMA DIGITALE', bold: true, size: 20 })]
              }),
              new Paragraph({
                children: [new TextRun({ text: 'Il presente documento deve essere firmato digitalmente ai sensi del D.Lgs. 82/2005 (CAD) mediante dispositivo di firma qualificata (formato CAdES .p7m o PAdES .pdf) dal legale rappresentante.', size: 18, color: '666666' })]
              })
            ]
          }
        ]
      });

      const blob = await Packer.toBlob(doc);
      triggerBlobDownload(blob, `offerta_economica_${selectedTender.cig || 'gara'}.docx`);
      showToast('Offerta esportata in formato Word (.docx)!');
    } catch (err) {
      console.error('Errore esportazione DOCX:', err);
      showToast("Errore durante l'esportazione DOCX.");
    }
  };

  // Genera un'anteprima di stampa professionale per il salvataggio in PDF
  const handleExportPDF = () => {
    if (!selectedTender || !generatedOffer || !analysis) return;

    const esc = (s: any) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const today = new Date().toLocaleDateString('it-IT');
    const euro = (n: number) =>
      '&euro; ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rows = generatedOffer.items
      .map(
        (item: any) => `<tr>
          <td>#${esc(item.lottoId)} &mdash; ${esc(item.lottoDescription)}</td>
          <td>${esc(item.matchedProductOEM || 'N/A')}</td>
          <td style="text-align:center">${esc(item.requiredQty)}</td>
          <td style="text-align:right">${euro(item.unitPrice)}</td>
          <td style="text-align:right;font-weight:600">${euro(item.totalPrice)}</td>
        </tr>`
      )
      .join('');

    const noteHtml = esc(generatedOffer.mepaSubmissionNote).replace(/\n/g, '<br>');

    const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Offerta ${esc(selectedTender.cig || 'gara')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Inter', Arial, sans-serif; color: #1f2937; margin: 40px; font-size: 12px; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #111827; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 24px 0 10px; }
  .meta { color: #6b7280; font-style: italic; margin-bottom: 16px; }
  .info b { display: inline-block; min-width: 200px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #d1d5db; padding: 7px 9px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: .02em; }
  .total { text-align: right; font-size: 16px; font-weight: 700; margin: 18px 0; }
  .note { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }
  .firma { color: #6b7280; font-size: 11px; margin-top: 20px; }
  .firma b { color: #111827; }
  @media print { body { margin: 18mm; } }
</style></head><body>
  <h1>Offerta economica e dichiarazione di conformità</h1>
  <div class="meta">Generato automaticamente da Digits Co-Pilot in data ${today}</div>

  <h2>Dati della procedura</h2>
  <div class="info">
    <div><b>Stazione appaltante:</b> ${esc(selectedTender.authority)}</div>
    <div><b>Oggetto della gara:</b> ${esc(selectedTender.title)}</div>
    <div><b>CIG:</b> ${esc(selectedTender.cig || 'Non applicabile')}</div>
    <div><b>Importo a base d'asta:</b> ${euro(selectedTender.value)}</div>
  </div>

  <h2>Dati dell'operatore economico</h2>
  <div class="info">
    <div><b>Denominazione:</b> ${esc(profile.name)}</div>
    <div><b>P.IVA / C.F.:</b> ${esc(profile.vatNumber)}</div>
    <div><b>Sede legale:</b> ${esc(profile.location)}</div>
  </div>

  <h2>Dichiarazione di conformità tecnica e ambientale (CAM)</h2>
  <p>Il sottoscritto, in qualità di legale rappresentante dell'Operatore Economico, dichiara sotto la propria responsabilità che tutti i prodotti offerti nel presente quadro economico sono pienamente conformi alle specifiche tecniche minime richieste dal capitolato d'oneri e rispettano integralmente i Criteri Ambientali Minimi (CAM) vigenti in materia di apparecchiature informatiche.</p>

  <h2>Dettaglio dell'offerta economica</h2>
  <table>
    <thead><tr><th>Lotto</th><th>Prodotto (OEM)</th><th>Q.tà</th><th>Prezzo unit.</th><th>Totale lotto</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">Importo totale dell'offerta: ${euro(generatedOffer.totalPrice)}</div>

  <h2>Nota MEPA di sottomissione</h2>
  <div class="note">${noteHtml}</div>

  <div class="firma"><b>DOCUMENTO SOTTOPOSTO A FIRMA DIGITALE.</b> Il presente documento deve essere firmato digitalmente ai sensi del D.Lgs. 82/2005 (CAD) mediante dispositivo di firma qualificata (formato CAdES .p7m o PAdES .pdf) dal legale rappresentante.</div>

  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      showToast('Consenti i popup del browser per esportare in PDF.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    showToast('Anteprima pronta: scegli "Salva come PDF" nella finestra di stampa.');
  };

  // Aggiunge un prodotto al listino prezzi
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOem || !newDesc || !newBrand || newCost === '' || newRetail === '' || newStock === '') {
      showToast("Tutti i campi del prodotto sono obbligatori.");
      return;
    }
    const product = {
      codeOEM: newOem.toUpperCase(),
      description: newDesc,
      brand: newBrand,
      costPrice: Number(newCost),
      retailPrice: Number(newRetail),
      stock: Number(newStock)
    };
    
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
      });
      if (response.ok) {
        showToast("Nuovo prodotto inserito nel listino!");
        fetchProducts();
        // Reset form
        setNewOem('');
        setNewDesc('');
        setNewBrand('');
        setNewCost('');
        setNewRetail('');
        setNewStock('');
      } else {
        showToast("Errore inserimento prodotto.");
      }
    } catch (err) {
      console.error(err);
      showToast("Errore di connessione.");
    }
  };

  // Rimuove un prodotto dal listino
  const handleRemoveProduct = async (id: string) => {
    try {
      const response = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (response.ok) {
        showToast("Prodotto rimosso dal listino.");
        fetchProducts();
      } else {
        showToast("Errore eliminazione prodotto.");
      }
    } catch (err) {
      console.error(err);
      showToast("Errore di connessione.");
    }
  };

  const handleDownloadTemplate = () => {
    window.location.href = '/api/products/template';
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('csvFile', file);

    showToast("Importazione CSV in corso...");
    try {
      const response = await fetch('/api/products/import', {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        showToast("Importazione completata con successo!");
        fetchProducts();
      } else {
        showToast("Errore durante l'importazione.");
      }
    } catch (err) {
      console.error(err);
      showToast("Errore di connessione.");
    }
    // reset file input
    e.target.value = '';
  };

  // Utility per verificare se la scadenza di un bando è già trascorsa
  const isTenderExpired = (deadlineStr?: string): boolean => {
    if (!deadlineStr || deadlineStr === 'Non definita') return false;
    try {
      let deadlineDate: Date | null = null;
      if (deadlineStr.includes('/')) {
        const parts = deadlineStr.split('/');
        if (parts.length === 3) {
          deadlineDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 23, 59, 59);
        }
      } else if (deadlineStr.includes('-')) {
        const parts = deadlineStr.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            deadlineDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59);
          } else {
            deadlineDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 23, 59, 59);
          }
        }
      }
      if (!deadlineDate || isNaN(deadlineDate.getTime())) {
        deadlineDate = new Date(deadlineStr);
      }
      if (isNaN(deadlineDate.getTime())) return false;
      return deadlineDate < new Date();
    } catch {
      return false;
    }
  };

  // Helper per estrarre il timestamp della data di scadenza (per ordinamento)
  const getDeadlineTimestamp = (deadlineStr?: string): number => {
    if (!deadlineStr || deadlineStr === 'Non definita') return Infinity;
    try {
      if (deadlineStr.includes('/')) {
        const parts = deadlineStr.split('/');
        if (parts.length === 3) {
          return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
        }
      } else if (deadlineStr.includes('-')) {
        const parts = deadlineStr.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
          } else {
            return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
          }
        }
      }
      const parsed = new Date(deadlineStr).getTime();
      return isNaN(parsed) ? Infinity : parsed;
    } catch {
      return Infinity;
    }
  };

  // Gestione aggiunta e rimozione dinamica CPV
  const handleAddCpv = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCpvInput.trim();
    if (!trimmed) return;
    if (cpvList.includes(trimmed)) {
      showToast('⚠️ Codice CPV già presente nell\'elenco.');
      return;
    }
    setCpvList(prev => [...prev, trimmed]);
    setNewCpvInput('');
    showToast(`✅ CPV ${trimmed} aggiunto ai target d'impresa!`);
  };

  const handleRemoveCpv = (cpvToRemove: string) => {
    setCpvList(prev => prev.filter(c => c !== cpvToRemove));
    if (selectedCpvFilter === cpvToRemove) {
      setSelectedCpvFilter('ALL');
    }
    showToast(`🗑️ CPV ${cpvToRemove} rimosso.`);
  };

  // Helper per verificare se un bando è nuovo (mai esaminato o aperto)
  const isTenderNew = (t: Tender) => {
    if (!t) return false;
    const seenSet = new Set(seenTenderIds);
    if (seenSet.has(t.id)) return false;
    if (t.cig && seenSet.has(t.cig)) return false;
    return true;
  };

  // Segna un bando specifico come visto
  const markTenderAsSeen = (t: Tender) => {
    if (!t) return;
    setSeenTenderIds(prev => {
      const next = new Set(prev);
      next.add(t.id);
      if (t.cig) next.add(t.cig);
      return Array.from(next);
    });
  };

  // Segna tutti i bandi attuali come esaminati / letti
  const handleMarkAllAsSeen = () => {
    setSeenTenderIds(prev => {
      const next = new Set(prev);
      tenders.forEach(t => {
        next.add(t.id);
        if (t.cig) next.add(t.cig);
      });
      return Array.from(next);
    });
    showToast('✅ Tutti i bandi presenti sono stati segnati come esaminati!');
  };

  // Azione per rimuovere in blocco tutte le gare scadute dall'elenco e dal DB PostgreSQL
  const handleRemoveExpiredTenders = async () => {
    try {
      showToast('🧹 Avvio pulizia gare scadute dal database...');
      const res = await fetch('/api/tenders/purge-expired', { method: 'POST' });
      let purgedCount = 0;
      if (res.ok) {
        const data = await res.json();
        purgedCount = data.deletedCount || 0;
      }
      
      const remaining = tenders.filter(t => !isTenderExpired(t.deadline));
      setTenders(remaining);
      if (selectedTender && isTenderExpired(selectedTender.deadline)) {
        setSelectedTender(remaining.length > 0 ? remaining[0] : null);
      }
      showToast(`🗑️ Pulizia completata! Eliminate dal DB ${purgedCount} gara/e scaduta/e a cui non si è partecipato.`);
    } catch (err) {
      console.error(err);
      showToast('⚠️ Errore durante la pulizia del DB.');
    }
  };

  // Filtra ed ordina i bandi basandosi sui filtri impostati
  const filteredTenders = tenders
    .filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            t.authority.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (t.cig && t.cig.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesRegion = selectedRegion === '' || t.region.toLowerCase() === selectedRegion.toLowerCase();
      
      let matchesImporto = true;
      if (selectedImporto === '<60k') {
        matchesImporto = t.value <= 60000;
      } else if (selectedImporto === '60k-150k') {
        matchesImporto = t.value > 60000 && t.value <= 150000;
      } else if (selectedImporto === '>150k') {
        matchesImporto = t.value > 150000;
      }

      const isDirectNegotiation = 
        (t.procedureType && (
          t.procedureType.toLowerCase().includes('dirett') || 
          t.procedureType.toLowerCase().includes('negoziata senza previa')
        )) || 
        t.title.toLowerCase().includes('affidamento diretto') ||
        t.title.toLowerCase().includes('trattativa diretta') ||
        (t.description && (
          t.description.toLowerCase().includes('affidamento diretto') ||
          t.description.toLowerCase().includes('trattativa diretta')
        ));

      if (excludeDirectNegotiations && isDirectNegotiation) {
        return false;
      }

      // Filtro CPV Target selezionato
      if (selectedCpvFilter !== 'ALL') {
        if (!t.cpv) return false;
        const targetMatch = selectedCpvFilter.match(/\d{8}/);
        const tenderMatch = t.cpv.match(/\d{8}/);
        const targetClean = targetMatch ? targetMatch[0] : selectedCpvFilter.trim();
        const tenderClean = tenderMatch ? tenderMatch[0] : t.cpv.trim();
        const matchCpv = t.cpv.includes(selectedCpvFilter) || 
                         tenderClean.startsWith(targetClean.substring(0, 3)) ||
                         targetClean.startsWith(tenderClean.substring(0, 3));
        if (!matchCpv) return false;
      }

      // Filtro Valutazione AI (Semaforo)
      if (selectedAiFilter !== 'ALL') {
        if (t.aiEvaluation !== selectedAiFilter) {
          return false;
        }
      }

      // Filtro Scadenza
      const expired = isTenderExpired(t.deadline);
      if (selectedExpiryFilter === 'ACTIVE' && expired) {
        return false;
      }
      if (selectedExpiryFilter === 'EXPIRED' && !expired) {
        return false;
      }

      // Filtro per Nuovi Rilevati
      if (showOnlyNew && !isTenderNew(t)) {
        return false;
      }

      return matchesSearch && matchesRegion && matchesImporto;
    })
    .sort((a, b) => {
      if (sortOrder === 'DEADLINE_ASC') {
        return getDeadlineTimestamp(a.deadline) - getDeadlineTimestamp(b.deadline);
      }
      if (sortOrder === 'DEADLINE_DESC') {
        return getDeadlineTimestamp(b.deadline) - getDeadlineTimestamp(a.deadline);
      }
      if (sortOrder === 'VALUE_DESC') {
        return b.value - a.value;
      }
      return 0;
    });

  if (!isAuthenticated) {
    return (
      <LoginModal 
        onLoginSuccess={(user) => {
          setAuthUser(user);
          setIsAuthenticated(true);
          handleSearchTenders(true);
          fetchProducts();
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4 relative overflow-hidden bg-neutral-50 selection:bg-blue-100">
      
      {/* Toast Alert Apple Style */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/90 text-white backdrop-blur-md px-4 py-2.5 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 border border-white/10"
          >
            <Cpu size={16} className="text-blue-400 animate-pulse" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layout principale a navigazione tabulata (v1.1) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 h-[calc(100vh-2rem)] overflow-hidden">
        
        {/* ========================================================================= */}
        {/* SIDEBAR DI NAVIGAZIONE A SINISTRA - larghezza 3 colonne */}
        {/* ========================================================================= */}
        <section className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto custom-scrollbar glass-panel p-4 select-none">
          {/* Tre pallini stile macOS */}
          <div className="flex items-center gap-1.5 px-1 mb-1">
            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
            <div className="w-3 h-3 rounded-full bg-green-400"></div>
          </div>

          <div className="flex items-center justify-between border-b border-neutral-200/60 pb-3 mb-2 px-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-neutral-400 font-mono tracking-wider">v1.1 (MEPA OS)</span>
              <h1 className="text-sm font-bold text-neutral-800 flex items-center gap-1.5 font-sans leading-none">
                🏛️ MEPA Tender AI
              </h1>
              <span className="text-[11px] text-neutral-500 font-medium leading-none">Analizzatore Gare PA</span>
            </div>
            <button
              onClick={handleLogout}
              title="Disconnetti dalla sessione sicura"
              className="p-1.5 rounded-lg bg-neutral-100 hover:bg-red-50 text-neutral-500 hover:text-red-600 transition-all border border-neutral-200/60 flex items-center gap-1 text-[11px] font-medium"
            >
              <LogOut size={13} />
              <span>Esci</span>
            </button>
          </div>


          {/* Voci di navigazione principali */}
          <div className="flex flex-col gap-1.5">
            <button 
              onClick={() => setActiveTab('ESTRAZIONE')}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'ESTRAZIONE' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <Search size={15} />
              1. Estrazione Open Data
            </button>

            <button 
              onClick={() => analysis && setActiveTab('ANALISI')}
              disabled={!analysis}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'ANALISI' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : !analysis 
                    ? 'text-neutral-300 cursor-not-allowed' 
                    : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <Cpu size={15} />
              2. Analisi & Parsing
            </button>

            <button 
              onClick={() => compliance && setActiveTab('CONFORMITA')}
              disabled={!compliance}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'CONFORMITA' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : !compliance 
                    ? 'text-neutral-300 cursor-not-allowed' 
                    : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <FileText size={15} />
              3. Conformità Societaria
            </button>

            <button 
              onClick={() => generatedOffer && setActiveTab('OFFERTA')}
              disabled={!generatedOffer}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'OFFERTA' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : !generatedOffer 
                    ? 'text-neutral-300 cursor-not-allowed' 
                    : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <FileText size={15} />
              4. Lettera & Offerta
            </button>

            {/* Database Interno */}
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mt-4 mb-1.5 px-3">
              Database Interno
            </div>

            <button 
              onClick={() => setActiveTab('LISTINO')}
              className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'LISTINO' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Package size={15} />
                Listino Articoli IT
              </span>
              <span className={`text-[10px] px-1.5 rounded-md font-bold font-mono ${activeTab === 'LISTINO' ? 'bg-blue-700 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                {products.length}
              </span>
            </button>

            <button 
              onClick={() => setActiveTab('PROFILO')}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'PROFILO' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <Building2 size={15} />
              Profilo Azienda
            </button>

            {/* Gestione Utenti & Accessi: visibile ESCLUSIVAMENTE all'Amministratore */}
            {authUser?.role === 'admin' && (
              <button 
                onClick={() => setActiveTab('UTENTI')}
                className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'UTENTI' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-neutral-600 hover:bg-neutral-100/80'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Users size={15} />
                  Gestione Utenti & Accessi
                </span>
                <span className="text-[9px] bg-blue-100 text-blue-700 font-mono font-bold px-1.5 py-0.5 rounded uppercase">
                  Admin
                </span>
              </button>
            )}

            {/* Sezione Avanzata */}
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mt-4 mb-1.5 px-3">
              Strumenti PA
            </div>

            <button 
              onClick={() => setActiveTab('CONFORMITA_SOC')}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'CONFORMITA_SOC' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <ShieldCheck size={15} />
              Conformità Societaria
            </button>

            <button 
              onClick={() => selectedTender && setActiveTab('DOCUMENTI')}
              disabled={!selectedTender}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'DOCUMENTI' 
                  ? 'bg-amber-600 text-white shadow-sm' 
                  : !selectedTender
                    ? 'text-neutral-300 cursor-not-allowed'
                    : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <FolderOpen size={15} />
              Documenti di Gara
            </button>

            <button 
              onClick={() => setActiveTab('STORICO')}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'STORICO' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <History size={15} />
              Storico & Gare
            </button>

            {/* AI Supervisor */}
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mt-4 mb-1.5 px-3">
              AI Supervisor
            </div>

            <button 
              onClick={() => setActiveTab('SUPERVISOR')}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'SUPERVISOR' 
                  ? 'bg-violet-600 text-white shadow-sm' 
                  : 'text-neutral-600 hover:bg-neutral-100/80'
              }`}
            >
              <MonitorCheck size={15} />
              Control Room AI
            </button>
          </div>

          {/* Dati Aziendali e Profilo Utente Loggato in basso */}
          <div className="mt-auto p-3 bg-neutral-100/70 border border-neutral-200/40 rounded-xl text-xs flex flex-col gap-1.5 select-none font-sans">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-200/50">
              <span className="text-[10px] text-neutral-400 font-semibold truncate max-w-[130px]" title={authUser?.username}>
                👤 {authUser?.username || 'Utente'}
              </span>
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                authUser?.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {authUser?.role || 'operatore'}
              </span>
            </div>
            <div className="font-semibold text-neutral-700 truncate text-[11px]">{profile.name}</div>
            <div className="text-[10px] text-neutral-400 font-mono">P.IVA: {profile.vatNumber}</div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* AREA DI CONTENUTO PRINCIPALE - larghezza 9 colonne */}
        {/* ========================================================================= */}
        <section className="lg:col-span-9 h-full overflow-hidden flex flex-col gap-4">
          
          <AnimatePresence mode="wait">
            
            {/* VISTA 1: ESTRAZIONE OPEN DATA */}
            {activeTab === 'ESTRAZIONE' && (
              <motion.div 
                key="tab-estrazione"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-12 gap-5 h-full overflow-hidden"
              >
                {/* Pannello Ricerca (col-span-7) */}
                <div className="col-span-7 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar glass-panel p-4">
                  
                  {/* Allineamento ANAC */}
                  <div className="bg-neutral-900 text-white p-3.5 rounded-2xl flex flex-col gap-2.5 shadow-sm border border-neutral-800">
                    <div className="flex items-center gap-2 text-xs font-semibold select-none">
                      <RefreshCw size={13} className="text-blue-400" />
                      <span>ALLINEAMENTO BDNCP ANAC (STORICO & GIORNALIERO)</span>
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-relaxed font-sans">
                      Configura e gestisci l'interoperabilità con ANAC. Puoi scaricare lo storico iniziale per popolare il database e programmare l'aggiornamento giornaliero automatico.
                    </p>
                    <div className="flex items-center gap-2 mt-1 select-none">
                      <button 
                        onClick={() => handleSearchTenders(false)}
                        disabled={isSearching}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 font-semibold cursor-pointer"
                      >
                        <Download size={12} />
                        Popola Storico (Pre-oggi)
                      </button>
                      <button 
                        onClick={() => handleSearchTenders(false)}
                        disabled={isSearching}
                        className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 border border-neutral-700 cursor-pointer"
                      >
                        <RefreshCw size={12} className={isSearching ? "animate-spin" : ""} />
                        Sincronizza Delta Odierno
                      </button>
                    </div>
                    <div className="text-[9px] text-neutral-500 font-mono mt-0.5">Ultimo aggiornamento: Oggi ore 08:30</div>
                  </div>

                  {/* CPV Target & Filtro Interattivo */}
                  <div className="bg-white border border-neutral-200/60 p-3.5 rounded-2xl flex flex-col gap-2.5 shadow-sm">
                    <div className="flex items-center justify-between select-none">
                      <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                        <Package size={13} />
                        <span>Codici Merceologici Target (CPV) d'Impresa</span>
                      </div>
                      {selectedCpvFilter !== 'ALL' && (
                        <button
                          onClick={() => setSelectedCpvFilter('ALL')}
                          className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                        >
                          Mostra Tutti i CPV (Reset)
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 select-none">
                      <button
                        onClick={() => setSelectedCpvFilter('ALL')}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          selectedCpvFilter === 'ALL'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
                        }`}
                      >
                        TUTTI I CPV ({tenders.length})
                      </button>

                      {cpvList.map((cpv) => {
                        const isSelected = selectedCpvFilter === cpv;
                        const count = tenders.filter(t => {
                          if (!t.cpv) return false;
                          const targetClean = cpv.split('-')[0].trim();
                          const tenderClean = t.cpv.split('-')[0].trim();
                          return t.cpv.includes(cpv) || tenderClean.startsWith(targetClean.substring(0, 3));
                        }).length;

                        return (
                          <span
                            key={cpv}
                            onClick={() => setSelectedCpvFilter(isSelected ? 'ALL' : cpv)}
                            className={`font-mono text-[10px] px-2 py-1 rounded-lg flex items-center gap-1.5 border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-700 shadow-sm font-bold'
                                : 'bg-neutral-50 text-neutral-700 border-neutral-200/60 hover:border-neutral-300 hover:bg-neutral-100'
                            }`}
                          >
                            <span>{cpv}</span>
                            <span className={`text-[9px] px-1 rounded font-bold ${isSelected ? 'bg-blue-700 text-white' : 'bg-neutral-200/80 text-neutral-600'}`}>
                              {count}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveCpv(cpv);
                              }}
                              title="Rimuovi CPV"
                              className="hover:text-red-400 font-bold ml-0.5"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>

                    <form onSubmit={handleAddCpv} className="flex items-center gap-2 mt-1">
                      <input 
                        type="text" 
                        placeholder="Inserisci nuovo CPV (es: 30200000-1)" 
                        value={newCpvInput}
                        onChange={(e) => setNewCpvInput(e.target.value)}
                        className="mac-input text-xs py-1.5 flex-1 font-mono"
                      />
                      <button type="submit" className="btn-primary text-xs py-1.5 px-3 font-semibold">
                        + Registra CPV
                      </button>
                    </form>
                  </div>

                  {/* Filtri */}
                  <div className="flex flex-col gap-2 border-t border-neutral-200/60 pt-3">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider select-none font-sans">Filtri Database</span>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="Cerca bando o CIG..." 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="mac-input w-full pl-7 py-1 text-xs"
                        />
                        <Search className="absolute left-2.5 top-2 text-neutral-400" size={12} />
                      </div>
                      <select 
                        value={selectedCpvFilter} 
                        onChange={e => setSelectedCpvFilter(e.target.value)}
                        className="mac-input py-1 text-xs font-mono"
                      >
                        <option value="ALL">Tutti i CPV Target</option>
                        {cpvList.map(c => <option key={c} value={c}>CPV: {c}</option>)}
                      </select>
                      <select 
                        value={selectedRegion} 
                        onChange={e => setSelectedRegion(e.target.value)}
                        className="mac-input py-1 text-xs"
                      >
                        <option value="">Tutte le Regioni</option>
                        {REGIONI_ITALIA.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <select 
                        value={selectedImporto} 
                        onChange={e => setSelectedImporto(e.target.value)}
                        className="mac-input py-1 text-xs"
                      >
                        <option value="ALL">Qualsiasi Importo</option>
                        <option value="<60k">Fino a €60.000</option>
                        <option value="60k-150k">€60.000 - €150.000</option>
                        <option value=">150k">Oltre €150.000</option>
                      </select>
                    </div>
                    
                    {/* Filtro Scadenza, Ordinamento & Esclusione Trattative Dirette */}
                    <div className="grid grid-cols-2 gap-2 mt-1 select-none">
                      <select 
                        value={selectedExpiryFilter} 
                        onChange={e => setSelectedExpiryFilter(e.target.value as any)}
                        className="mac-input py-1 text-xs"
                      >
                        <option value="ALL">Tutte le Scadenze</option>
                        <option value="ACTIVE">Solo Attive (Non Scadute)</option>
                        <option value="EXPIRED">Solo Scadute</option>
                      </select>

                      <select 
                        value={sortOrder} 
                        onChange={e => setSortOrder(e.target.value as any)}
                        className="mac-input py-1 text-xs font-semibold text-neutral-700"
                      >
                        <option value="DEADLINE_ASC">⏱️ Scadenza Imminente (Prima)</option>
                        <option value="DEADLINE_DESC">📅 Scadenza più Lontana</option>
                        <option value="VALUE_DESC">💶 Importo Più Alto</option>
                        <option value="DEFAULT">🔢 Ordine Predefinito (ANAC)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 px-2 py-1 mt-1 bg-neutral-50 rounded-lg border border-neutral-200/50 select-none">
                      <input 
                        type="checkbox" 
                        id="excludeDirectNegotiations"
                        checked={excludeDirectNegotiations}
                        onChange={(e) => setExcludeDirectNegotiations(e.target.checked)}
                        className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer"
                      />
                      <label htmlFor="excludeDirectNegotiations" className="text-[10px] text-neutral-500 font-semibold cursor-pointer truncate">
                        Escludi Affidamenti/Trattative Dirette
                      </label>
                    </div>

                    <button 
                      onClick={() => handleSearchTenders(false)}
                      disabled={isSearching}
                      className="btn-primary py-2 text-xs select-none font-semibold mt-1"
                    >
                      {isSearching ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          Interrogazione ANAC Open Data in corso...
                        </>
                      ) : (
                        <>
                          <Cpu size={12} />
                          Scarica Gare Reali da ANAC Open Data
                        </>
                      )}
                    </button>
                  </div>

                  {/* Badge fonte dati */}
                  {dataSource && (() => {
                    const badge = getSourceBadge(dataSource);
                    return badge ? (
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold select-none w-fit"
                        style={{ backgroundColor: badge.color + '18', color: badge.color, border: `1px solid ${badge.color}40` }}
                      >
                        <span>{badge.icon}</span>
                        <span>Fonte: {badge.label}</span>
                      </div>
                    ) : null;
                  })()}

                  {/* Elenco Gare Rilevate con Filtri Semaforo AI & Pulizia Scadute */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 mt-1">
                    
                    {/* Header Elenco & Azioni (Segna tutti come letti, Elimina Scadute) */}
                    <div className="flex items-center justify-between gap-2 select-none">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider font-sans">
                          Elenco Gare Rilevate
                        </span>
                        <span className="text-[10px] font-bold text-neutral-600 font-mono bg-neutral-100 px-1.5 py-0.2 rounded border border-neutral-200/50">
                          {filteredTenders.length}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {tenders.some(isTenderNew) && (
                          <button 
                            onClick={handleMarkAllAsSeen}
                            title="Segna tutte le novità come già esaminate"
                            className="flex items-center gap-1 text-[10px] font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200/80 px-2 py-0.5 rounded-lg border border-neutral-200/70 transition-all active:scale-95 cursor-pointer"
                          >
                            <CheckCheck size={11} className="text-blue-600" />
                            <span>Segna Letti</span>
                          </button>
                        )}
                        <button 
                          onClick={handleRemoveExpiredTenders}
                          title="Elimina tutte le gare scadute dall'elenco"
                          className="flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 hover:bg-red-100/80 px-2 py-0.5 rounded-lg border border-red-200/60 transition-all active:scale-95 cursor-pointer"
                        >
                          <Trash2 size={11} />
                          <span>Elimina Scadute</span>
                        </button>
                      </div>
                    </div>

                    {/* Filtro Rapido Novità vs Tutti & Semaforo AI */}
                    <div className="flex flex-col gap-1.5">
                      {/* Toggle Novità */}
                      {(() => {
                        const newTendersCount = tenders.filter(isTenderNew).length;
                        return (
                          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-neutral-200/70 shadow-xs select-none">
                            <button
                              onClick={() => setShowOnlyNew(false)}
                              className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-semibold transition-all flex items-center justify-center gap-1 ${
                                !showOnlyNew 
                                  ? 'bg-neutral-800 text-white shadow-xs font-bold' 
                                  : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                              }`}
                            >
                              <span>Tutti i Bandi ({tenders.length})</span>
                            </button>
                            <button
                              onClick={() => setShowOnlyNew(true)}
                              className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                                showOnlyNew 
                                  ? 'bg-blue-600 text-white shadow-xs font-bold' 
                                  : newTendersCount > 0 
                                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100/70 border border-blue-200/60 font-bold' 
                                    : 'text-neutral-400 hover:text-neutral-600'
                              }`}
                            >
                              <Sparkles size={11} className={showOnlyNew ? 'text-white animate-pulse' : 'text-blue-600'} />
                              <span>Solo Nuovi</span>
                              {newTendersCount > 0 && (
                                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${showOnlyNew ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'}`}>
                                  {newTendersCount}
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      })()}

                      {/* Pill Selector Semaforo AI */}
                      <div className="grid grid-cols-4 gap-1 p-1 bg-neutral-100/70 rounded-xl border border-neutral-200/50 select-none text-[10px] font-semibold">
                        <button
                          onClick={() => setSelectedAiFilter('ALL')}
                          className={`py-1 px-1.5 rounded-lg transition-all text-center ${selectedAiFilter === 'ALL' ? 'bg-white text-neutral-800 shadow-sm border border-neutral-200/60 font-bold' : 'text-neutral-500 hover:text-neutral-700'}`}
                        >
                          Tutte
                        </button>
                        <button
                          onClick={() => setSelectedAiFilter('APPROVATA')}
                          className={`py-1 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${selectedAiFilter === 'APPROVATA' ? 'bg-emerald-600 text-white shadow-sm font-bold' : 'text-emerald-700 hover:bg-emerald-50/60'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                          <span className="truncate">Approvate</span>
                        </button>
                        <button
                          onClick={() => setSelectedAiFilter('DA_VALUTARE')}
                          className={`py-1 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${selectedAiFilter === 'DA_VALUTARE' ? 'bg-amber-500 text-white shadow-sm font-bold' : 'text-amber-700 hover:bg-amber-50/60'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"></span>
                          <span className="truncate">Da Valutare</span>
                        </button>
                        <button
                          onClick={() => setSelectedAiFilter('SCARTATA')}
                          className={`py-1 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${selectedAiFilter === 'SCARTATA' ? 'bg-red-600 text-white shadow-sm font-bold' : 'text-red-700 hover:bg-red-50/60'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-red-300 shrink-0"></span>
                          <span className="truncate">Scartate</span>
                        </button>
                      </div>
                    </div>

                    {filteredTenders.length === 0 ? (
                      <div className="text-center text-neutral-400 py-6 text-xs font-sans">
                        {showOnlyNew 
                          ? 'Nessun nuovo bando da esaminare! Hai già verificato tutte le opportunità.' 
                          : 'Nessuna gara trovata con i filtri selezionati.'}
                      </div>
                    ) : (
                      filteredTenders.map(t => {
                        const isSelected = selectedTender?.id === t.id;
                        const expired = isTenderExpired(t.deadline);
                        const isNew = isTenderNew(t);
                        return (
                          <div 
                            key={t.id}
                            onClick={() => {
                              setSelectedTender(t);
                              markTenderAsSeen(t);
                              setAnalysis(null);
                              setCompliance(null);
                              setGeneratedOffer(null);
                            }}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 relative ${
                              isSelected 
                                ? 'bg-blue-50/40 border-blue-200 shadow-sm' 
                                : isNew
                                  ? 'bg-gradient-to-r from-blue-50/30 to-white border-blue-300/80 shadow-xs hover:border-blue-400 hover:shadow-sm'
                                  : 'bg-white border-neutral-200/50 hover:border-neutral-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-semibold text-neutral-800 text-xs leading-snug line-clamp-1 flex-1">{t.title}</h3>
                              {isNew && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-600 text-white shadow-xs shrink-0 tracking-wide animate-pulse">
                                  <Sparkles size={9} />
                                  NUOVO
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-neutral-500 font-medium font-sans">
                              <span>{t.authority}</span>
                              <span className="font-mono text-neutral-700 bg-neutral-100 px-1.5 py-0.5 rounded">
                                {t.value && t.value > 0 ? `€${t.value.toLocaleString('it-IT')}` : 'N.D. (Da Capitolato)'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <div className="flex gap-2 text-[10px] text-neutral-400 font-mono items-center flex-wrap">
                                {t.cig && <span>CIG: {t.cig}</span>}
                                {t.cpv && <span className="bg-neutral-100 px-1.5 py-0.2 rounded text-neutral-600 font-bold border border-neutral-200/50">CPV: {t.cpv}</span>}
                                <span className={expired ? "text-red-500 font-bold" : ""}>Scadenza: {t.deadline}</span>
                              </div>
                              <div className="flex gap-1 select-none">
                                {expired && <span className="mac-badge-red bg-red-100/90 text-red-700 border-red-300 font-bold">SCADUTA</span>}
                                {t.status === 'submitted' && <span className="mac-badge-blue bg-blue-50 text-blue-700 border-blue-200">PARTECIPATA</span>}
                                {t.status === 'won' && <span className="mac-badge-green bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">AGGIUDICATA 🎉</span>}
                                {t.status === 'lost' && <span className="mac-badge-red bg-red-50 text-red-700 border-red-200">PERSA</span>}
                                {(!t.status || t.status === 'active') && (
                                  <>
                                    {t.aiEvaluation === 'APPROVATA' && <span className="mac-badge-green">APPROVATA</span>}
                                    {t.aiEvaluation === 'DA_VALUTARE' && <span className="mac-badge-yellow">DA VALUTARE</span>}
                                    {t.aiEvaluation === 'SCARTATA' && <span className="mac-badge-red">SCARTATA</span>}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Pannello Dettaglio (col-span-5) */}
                <div className="col-span-5 flex flex-col gap-4 glass-panel p-4 overflow-y-auto custom-scrollbar">
                  {selectedTender ? (
                    <div className="flex flex-col gap-4 h-full">
                      <div className="border-b border-neutral-200/60 pb-2.5 flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded w-fit">CIG: {selectedTender.cig || "N/D"}</span>
                          {selectedTender.cig && (
                            <div className="flex gap-2.5 select-none">
                              <a 
                                href={`https://dettaglio-cig.anticorruzione.it/cig/${selectedTender.cig}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[9px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                              >
                                Cerca su BDNCP (ANAC) ↗
                              </a>
                              <a 
                                href={`https://www.google.com/search?q=site:acquistinretepa.it+${selectedTender.cig}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[9px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                              >
                                Cerca su MEPA (Google) ↗
                              </a>
                            </div>
                          )}
                        </div>
                        <h2 className="text-xs font-bold text-neutral-800 leading-snug mt-1">{selectedTender.title}</h2>
                        <div className="text-[10px] text-neutral-500 font-semibold font-sans mt-0.5">
                          Ente: {selectedTender.authority} | Regione: {selectedTender.region}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center text-xs select-none">
                        <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/40">
                          <div className="text-neutral-400 text-[10px]">Valore Gara</div>
                          <div className="font-mono font-bold text-neutral-800 mt-0.5">
                            {selectedTender.value && selectedTender.value > 0 ? `€${selectedTender.value.toLocaleString('it-IT')}` : 'N.D. (Da Capitolato)'}
                          </div>
                        </div>
                        <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/40">
                          <div className="text-neutral-400 text-[10px]">Scadenza</div>
                          <div className="font-semibold text-neutral-800 mt-0.5">{selectedTender.deadline}</div>
                        </div>
                      </div>

                      {/* Semaforo AI */}
                      <div className={`p-3.5 rounded-xl border flex flex-col gap-1.5 ${
                        selectedTender.aiEvaluation === 'APPROVATA' ? 'bg-emerald-50/40 border-emerald-200 text-emerald-950' :
                        selectedTender.aiEvaluation === 'DA_VALUTARE' ? 'bg-amber-50/40 border-amber-200 text-amber-950' :
                        'bg-red-50/40 border-red-200 text-red-950'
                      }`}>
                        <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide">
                          {selectedTender.aiEvaluation === 'APPROVATA' && <CheckCircle2 size={15} className="text-emerald-600" />}
                          {selectedTender.aiEvaluation === 'DA_VALUTARE' && <AlertTriangle size={15} className="text-amber-600" />}
                          {selectedTender.aiEvaluation === 'SCARTATA' && <XCircle size={15} className="text-red-600" />}
                          SEMAFORO PREVENTIVO AI D'IMPRESA
                        </div>
                        <p className="text-xs leading-relaxed font-sans">{selectedTender.aiReasoning}</p>
                        
                        {/* Bottoni semaforici */}
                        <div className="grid grid-cols-3 gap-1.5 mt-1 text-center font-bold text-[9px] select-none">
                          <span className={`py-1 rounded border ${selectedTender.aiEvaluation !== 'SCARTATA' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : 'bg-red-500/10 border-red-500/20 text-red-700'}`}>
                            ✓ Fatturato IT
                          </span>
                          <span className="py-1 rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-700">
                            ✓ MEPA Coerente
                          </span>
                          <span className={`py-1 rounded border ${selectedTender.aiEvaluation === 'APPROVATA' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : 'bg-amber-500/10 border-amber-500/20 text-amber-700'}`}>
                            ✓ ISO 9001/14001
                          </span>
                        </div>
                      </div>

                      {/* Gestione Partecipazione Gara */}
                      <div className="p-3.5 rounded-xl border border-neutral-200/60 bg-neutral-50/50 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider font-sans select-none">Tracciamento Gara (DIGITS)</span>
                          {/* Badge dello stato corrente */}
                          {(!selectedTender.status || selectedTender.status === 'active') && <span className="mac-badge-blue bg-neutral-100 text-neutral-500 border-neutral-200">DA VALUTARE</span>}
                          {selectedTender.status === 'submitted' && <span className="mac-badge-blue bg-blue-50 text-blue-700 border-blue-200">PARTECIPATA</span>}
                          {selectedTender.status === 'won' && <span className="mac-badge-green bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">AGGIUDICATA 🎉</span>}
                          {selectedTender.status === 'lost' && <span className="mac-badge-red bg-red-50 text-red-700 border-red-200">PERSA</span>}
                        </div>
                        
                        <div className="flex gap-2 mt-1">
                          {(!selectedTender.status || selectedTender.status === 'active') && (
                            <button
                              onClick={() => handleUpdateStatus('submitted')}
                              className="btn-primary flex-1 py-1.5 text-[10px] font-semibold"
                            >
                              Segna come Partecipata
                            </button>
                          )}
                          {selectedTender.status === 'submitted' && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus('won')}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex-1 py-1.5 text-[10px] font-semibold transition"
                              >
                                Segna come Aggiudicata 🎉
                              </button>
                              <button
                                onClick={() => handleUpdateStatus('lost')}
                                className="bg-red-600 hover:bg-red-700 text-white rounded-lg flex-1 py-1.5 text-[10px] font-semibold transition"
                              >
                                Segna come Persa
                              </button>
                            </>
                          )}
                          {selectedTender.status && selectedTender.status !== 'active' && (
                            <button
                              onClick={() => handleUpdateStatus('active')}
                              className="border border-neutral-300 hover:bg-neutral-100 text-neutral-600 rounded-lg py-1 px-2.5 text-[10px] font-semibold transition"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Capitolato */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider font-sans select-none">Estratto Capitolato / Documentazione</span>
                          <label className="text-[10px] text-blue-600 hover:text-blue-700 cursor-pointer font-semibold flex items-center gap-1 select-none">
                            <span>Carica .txt</span>
                            <input
                              type="file"
                              accept=".txt,.md"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (evt) => {
                                    setCapitolatoText(evt.target?.result as string);
                                    showToast("Capitolato caricato dal file!");
                                  };
                                  reader.readAsText(file);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                        <textarea
                          value={capitolatoText}
                          onChange={(e) => setCapitolatoText(e.target.value)}
                          placeholder="Incolla qui il testo del capitolato tecnico scaricato dal MEPA per un'analisi dettagliata..."
                          className="w-full p-2.5 bg-neutral-100/50 border border-neutral-200/60 rounded-xl text-xs text-neutral-600 leading-relaxed focus:outline-none focus:border-neutral-300 resize-none font-sans h-[140px] custom-scrollbar"
                        />
                      </div>

                      {/* Bottone Avvia Analisi */}
                      <div className="mt-auto pt-2">
                        <button 
                          onClick={() => handleAnalyzeTender(selectedTender)}
                          disabled={isAnalyzing}
                          className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          {isAnalyzing ? (
                            <>
                              <RefreshCw size={14} className="animate-spin" />
                              Analisi capitolato in corso...
                            </>
                          ) : (
                            <>
                              <Cpu size={14} />
                              Avvia Analisi Capitolato (AI)
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-neutral-400 gap-3">
                      <FileText size={32} strokeWidth={1.5} className="text-neutral-300 animate-pulse" />
                      <h3 className="font-semibold text-neutral-700 text-xs">Nessuna gara selezionata</h3>
                      <p className="text-[11px] max-w-xs leading-relaxed font-sans">Seleziona una gara dal database per visualizzarne l'analisi di conformità preventiva.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* VISTA 2: ANALISI & PARSING */}
            {activeTab === 'ANALISI' && (
              <motion.div 
                key="tab-analisi"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-12 gap-5 h-full overflow-hidden"
              >
                <div className="col-span-8 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar glass-panel p-4">
                  <h2 className="text-sm font-bold text-neutral-800 border-b border-neutral-200/60 pb-2 flex items-center gap-2 select-none">
                    <Cpu size={16} className="text-blue-600" />
                    Lotti di Fornitura Estratti dal Capitolato
                  </h2>
                  <div className="flex flex-col gap-3">
                    {analysis ? (
                      analysis.lotti.map((lotto: any) => {
                        const isTarget = lotto.category === 'hardware' || lotto.category === 'consumabili';
                        return (
                          <div 
                            key={lotto.id} 
                            className={`p-3 bg-white border rounded-xl shadow-sm text-xs flex flex-col gap-1.5 transition-all hover:shadow-md ${
                              isTarget 
                                ? 'border-blue-200 bg-blue-50/5 hover:border-blue-300' 
                                : 'border-neutral-200/60 hover:border-neutral-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-neutral-800 text-sm flex items-center gap-1.5">
                                {isTarget && <span className="text-blue-500 text-xs">⭐</span>}
                                Lotto #{lotto.id}: {lotto.description}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {lotto.category && (
                                  <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider font-sans select-none ${
                                    lotto.category === 'hardware' ? 'bg-blue-100 text-blue-800' :
                                    lotto.category === 'consumabili' ? 'bg-emerald-100 text-emerald-800' :
                                    lotto.category === 'software' ? 'bg-purple-100 text-purple-800' :
                                    lotto.category === 'servizi' ? 'bg-amber-100 text-amber-800' :
                                    'bg-neutral-100 text-neutral-600'
                                  }`}>
                                    {lotto.category === 'hardware' ? '💻 hardware' :
                                     lotto.category === 'consumabili' ? '🖨️ consumabili' :
                                     lotto.category === 'software' ? '💿 software' :
                                     lotto.category === 'servizi' ? '🛠️ servizi' :
                                     lotto.category}
                                  </span>
                                )}
                                <span className="bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full font-semibold font-mono">
                                  Quantità: {lotto.quantity}
                                </span>
                              </div>
                            </div>
                            <p className="text-neutral-500 leading-relaxed text-[11px] font-sans">{lotto.requiredSpecs}</p>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-neutral-400 py-10 text-xs font-sans">Nessuna analisi disponibile.</div>
                    )}
                  </div>
                </div>

                <div className="col-span-4 flex flex-col gap-4 glass-panel p-4 overflow-y-auto custom-scrollbar">
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none font-sans">Riepilogo Gara</h3>
                  {analysis && (
                    <div className="flex flex-col gap-3.5 text-xs leading-relaxed text-neutral-600 font-sans">
                      <div><strong>Stazione Appaltante:</strong><br />{analysis.authority}</div>
                      <div><strong>Criterio di Aggiudicazione:</strong><br /><span className="bg-neutral-100 px-1.5 py-0.5 rounded font-mono text-[10px]">{analysis.criterioAggiudicazione}</span></div>
                      <div><strong>Scadenza Offerta:</strong><br />{analysis.deadline}</div>
                      
                      <button 
                        onClick={() => { setActiveTab('CONFORMITA'); setActiveStep(2); }}
                        className="btn-primary w-full py-2.5 mt-auto text-xs font-semibold flex items-center justify-center gap-1 shadow-sm"
                      >
                        Continua alla Conformità <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* VISTA 3: CONFORMITÀ SOCIETARIA */}
            {activeTab === 'CONFORMITA' && (
              <motion.div 
                key="tab-conformita"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-12 gap-5 h-full overflow-hidden"
              >
                <div className="col-span-8 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar glass-panel p-4">
                  <h2 className="text-sm font-bold text-neutral-800 border-b border-neutral-200/60 pb-2 flex items-center gap-2 select-none">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    Verifica Requisiti e Checklist Documenti
                  </h2>
                  
                  {compliance ? (
                    <div className="flex flex-col gap-4">
                      {/* Tabella Requisiti */}
                      <div className="flex flex-col gap-2.5">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider select-none font-sans">Requisiti di Partecipazione</span>
                        {compliance.items.map((item: any, idx: number) => (
                          <div key={idx} className="p-3 bg-white border border-neutral-200/60 rounded-xl shadow-sm text-xs flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-neutral-700 truncate max-w-[300px]">{item.requirement}</span>
                              {item.status === 'CONFORME' && <span className="mac-badge-green">Conforme</span>}
                              {item.status === 'SOCCORSO_ISTRUTTORIO' && <span className="mac-badge-yellow">Soccorso Istr.</span>}
                              {item.status === 'NON_CONFORME' && <span className="mac-badge-red">Non Conforme</span>}
                            </div>
                            <p className="text-neutral-500 leading-relaxed text-[11px] font-sans">{item.details}</p>
                          </div>
                        ))}
                      </div>

                      {/* Checklist documenti */}
                      {compliance.documentiStato && compliance.documentiStato.length > 0 && (
                        <div className="flex flex-col gap-2.5 mt-1 border-t border-neutral-200/60 pt-4">
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1 select-none font-sans">
                            <FileText size={12} />
                            Checklist Documenti Obbligatori (Zero Errori)
                          </span>
                          <div className="flex flex-col gap-2">
                            {compliance.documentiStato.map((doc: any, idx: number) => {
                              const isChecked = !!verifiedDocs[doc.nome];
                              return (
                                <div 
                                  key={idx} 
                                  className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                                    isChecked 
                                      ? 'bg-neutral-50/50 border-neutral-200/60 opacity-80' 
                                      : 'bg-white border-neutral-200 hover:border-neutral-300 shadow-sm'
                                  }`}
                                >
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => setVerifiedDocs(prev => ({ ...prev, [doc.nome]: e.target.checked }))}
                                    className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    id={`doc-check-${idx}`}
                                  />
                                  <div className="flex-1 flex flex-col gap-0.5 select-none font-sans">
                                    <div className="flex items-center justify-between gap-2">
                                      <label htmlFor={`doc-check-${idx}`} className="font-bold text-neutral-700 text-xs cursor-pointer">
                                        {doc.nome}
                                      </label>
                                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                                        doc.stato === 'PRONTO' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                        doc.stato === 'DA_GENERARE' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                        'bg-orange-50 text-orange-700 border border-orange-200'
                                      }`}>
                                        {doc.stato.replace('_', ' ')}
                                      </span>
                                    </div>
                                    <p className="text-neutral-500 text-[10px] leading-relaxed">{doc.descrizione}</p>
                                    <p className="text-blue-600 font-medium text-[10px] mt-0.5 flex items-center gap-1">
                                      <ChevronRight size={10} />
                                      Azione: {doc.azione}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-neutral-400 py-10 text-xs font-sans">Nessuna informazione di conformità disponibile.</div>
                  )}
                </div>

                <div className="col-span-4 flex flex-col gap-4 glass-panel p-4 overflow-y-auto custom-scrollbar">
                  {/* Vincoli in rosso */}
                  {(selectedTender?.vincoliEsclusione || (analysis && analysis.vincoliEsclusione)) && (
                    <div className="p-3.5 bg-red-50/50 border border-red-200/60 rounded-2xl flex flex-col gap-2 shadow-sm select-none">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-red-700 uppercase tracking-wide font-sans">
                        <AlertTriangle size={14} className="text-red-600 animate-pulse" />
                        Vincoli & Cause di Esclusione
                      </div>
                      <ul className="list-disc list-inside text-[10px] text-red-600 space-y-1.5 pl-0.5 font-sans">
                        {(analysis?.vincoliEsclusione || selectedTender?.vincoliEsclusione || []).map((vincolo, idx) => (
                          <li key={idx} className="leading-relaxed font-sans">{vincolo}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {compliance && (() => {
                    const allDocsVerified = compliance.documentiStato 
                      ? compliance.documentiStato.every((doc: any) => verifiedDocs[doc.nome])
                      : true;
                    const hasNonConforme = compliance.items.some((item: any) => item.status === 'NON_CONFORME');
                    const isStep3Blocked = !allDocsVerified || hasNonConforme;

                    return (
                      <div className="flex flex-col gap-2.5 mt-auto">
                        <button 
                          onClick={() => { setActiveTab('OFFERTA'); setActiveStep(3); }}
                          disabled={isStep3Blocked}
                          className={`btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                            isStep3Blocked ? 'opacity-40 cursor-not-allowed bg-neutral-100 border-neutral-200 text-neutral-400 hover:shadow-none' : ''
                          }`}
                        >
                          Continua al Preventivo <ChevronRight size={14} />
                        </button>
                        {isStep3Blocked && (
                          <p className="text-[10px] text-red-500 text-center font-medium leading-relaxed font-sans select-none font-semibold">
                            {hasNonConforme 
                              ? "Non conforme: Gara scartata per mancanza requisiti essenziali." 
                              : "Spunta tutti i documenti obbligatori per sbloccare la fase di offerta."}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            )}

            {/* VISTA 4: LETTERA & OFFERTA */}
            {activeTab === 'OFFERTA' && (
              <motion.div 
                key="tab-offerta"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-12 gap-5 h-full overflow-hidden"
              >
                <div className="col-span-8 flex flex-col gap-3.5 overflow-y-auto custom-scrollbar glass-panel p-4">
                  <h2 className="text-sm font-bold text-neutral-800 border-b border-neutral-200/60 pb-2 flex items-center gap-2 select-none">
                    <FileText size={16} className="text-blue-600" />
                    Offerta Economica & Nota MEPA
                  </h2>
                  
                  {generatedOffer ? (
                    <div className="flex flex-col gap-4">
                      {/* Mappatura prodotti ed editing dinamico prezzi/costi */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between select-none">
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider font-sans">
                            Mappatura Listino & Prezzi Personalizzabili
                          </span>
                          <span className="text-[10px] text-blue-600 font-medium font-sans">
                            ✏️ Modifica liberamente costi, prezzi unitari e prodotti per il ricalcolo istantaneo
                          </span>
                        </div>
                        {generatedOffer.items.map((item: any, idx: number) => {
                          const lotCost = (Number(item.requiredQty) || 0) * (Number(item.unitCost) || 0);
                          const lotPrice = item.totalPrice || 0;
                          const lotMargin = lotPrice - lotCost;
                          const lotMarginPct = lotPrice > 0 ? ((lotMargin / lotPrice) * 100).toFixed(1) : '0';

                          return (
                            <div key={idx} className="p-3.5 bg-white border border-neutral-200/80 rounded-xl shadow-sm text-xs flex flex-col gap-3 hover:border-neutral-300 transition-all">
                              {/* Intestazione Lotto */}
                              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                                <span className="font-bold text-neutral-800 text-xs truncate max-w-[320px]">
                                  Lotto #{item.lottoId}: {item.lottoDescription}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    item.status === 'MAPPED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}>
                                    {item.status === 'MAPPED' ? 'Mappato' : 'Stock Basso / Custom'}
                                  </span>
                                  <button
                                    onClick={() => setQuickMatchModal({
                                      isOpen: true,
                                      itemIndex: idx,
                                      lottoId: item.lottoId,
                                      lottoDescription: item.lottoDescription,
                                      requiredQty: item.requiredQty
                                    })}
                                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 flex items-center gap-1 transition"
                                  >
                                    <Package size={11} />
                                    Listino
                                  </button>
                                </div>
                              </div>

                              {/* Prodotto / Codice OEM e Quantità */}
                              <div className="grid grid-cols-12 gap-3 items-center">
                                <div className="col-span-8 flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold text-neutral-500">
                                    Prodotto Offerto / Codice OEM / Materiale Associato
                                  </label>
                                  <input
                                    type="text"
                                    value={item.matchedProductOEM || ''}
                                    onChange={(e) => handleOfferItemUpdate(idx, { matchedProductOEM: e.target.value })}
                                    placeholder="es. OEM-123 + kit accessori"
                                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg py-1 px-2.5 text-xs text-neutral-800 font-mono focus:outline-none focus:border-blue-400 focus:bg-white transition"
                                  />
                                </div>
                                <div className="col-span-4 flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold text-neutral-500">
                                    Quantità (Pezzi)
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.requiredQty || 1}
                                    onChange={(e) => handleOfferItemUpdate(idx, { requiredQty: parseInt(e.target.value) || 1 })}
                                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg py-1 px-2.5 text-xs font-mono font-bold text-center text-neutral-800 focus:outline-none focus:border-blue-400 focus:bg-white transition"
                                  />
                                </div>
                              </div>

                              {/* Prezzi: Costo Unitario, Prezzo Unitario Offerto, Totale Lotto e Margine */}
                              <div className="grid grid-cols-12 gap-3 items-center pt-2 border-t border-neutral-100 bg-neutral-50/50 p-2.5 rounded-lg">
                                <div className="col-span-3 flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold text-neutral-500">
                                    Costo Unit. (€)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.unitCost ?? 0}
                                    onChange={(e) => handleOfferItemUpdate(idx, { unitCost: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-white border border-neutral-200 rounded-lg py-1 px-2 text-xs font-mono text-neutral-700 focus:outline-none focus:border-blue-400 transition"
                                  />
                                </div>
                                <div className="col-span-3 flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold text-neutral-500">
                                    Prezzo Unit. Offerto (€)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.unitPrice ?? 0}
                                    onChange={(e) => handleOfferItemUpdate(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-white border border-neutral-200 rounded-lg py-1 px-2 text-xs font-mono font-bold text-blue-700 focus:outline-none focus:border-blue-400 transition"
                                  />
                                </div>
                                <div className="col-span-3 flex flex-col gap-0.5 text-right font-mono">
                                  <span className="text-[10px] text-neutral-400 font-sans">Totale Lotto</span>
                                  <span className="text-xs font-bold text-neutral-800">
                                    €{lotPrice.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div className="col-span-3 flex flex-col gap-0.5 text-right font-mono">
                                  <span className="text-[10px] text-neutral-400 font-sans">Margine Lotto</span>
                                  <span className={`text-[11px] font-bold ${lotMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    €{lotMargin.toLocaleString('it-IT', { minimumFractionDigits: 2 })} ({lotMarginPct}%)
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Nota di sottomissione MEPA */}
                      <div className="flex flex-col gap-2 bg-blue-50/30 p-3.5 border border-blue-200/30 rounded-2xl shadow-sm">
                        <div className="flex items-center justify-between select-none">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1 font-sans">
                            <FileText size={12} />
                            Nota MEPA Sottomissione Gara
                          </span>
                          <button 
                            onClick={handleCopyNote}
                            className="text-[10px] text-blue-600 hover:text-blue-500 flex items-center gap-1 border border-blue-200 bg-white px-2.5 py-0.5 rounded-lg active:scale-95 transition-all shadow-sm font-semibold"
                          >
                            {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                            Copia Nota
                          </button>
                        </div>
                        <p className="text-[11px] text-neutral-600 leading-relaxed font-sans mt-1 bg-white p-3 rounded-xl border border-neutral-200/50 max-h-[100px] overflow-y-auto custom-scrollbar select-all">
                          {generatedOffer.mepaSubmissionNote}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-neutral-400 py-10 text-xs font-sans">Preventivo non generato.</div>
                  )}
                </div>

                <div className="col-span-4 flex flex-col gap-4 glass-panel p-4 overflow-y-auto custom-scrollbar">
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none font-sans">Riepilogo Finanziario</h3>
                  {generatedOffer && (
                    <div className="flex flex-col gap-4 text-xs font-sans h-full">
                      <div className="flex flex-col gap-1 border-b border-neutral-200/50 pb-2.5">
                        <span className="text-neutral-400">Prezzo Totale Proposto</span>
                        <span className="text-2xl font-bold text-neutral-800 font-mono">
                          €{generatedOffer.totalPrice.toLocaleString('it-IT')}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5 border-b border-neutral-200/50 pb-2.5 text-neutral-500">
                        <span>Costo Hardware: €{generatedOffer.totalCost.toLocaleString('it-IT')}</span>
                        <span className="text-emerald-600 font-bold flex items-center gap-1 text-sm mt-0.5">
                          <TrendingUp size={14} />
                          Margine Lordo: €{generatedOffer.totalMargin.toLocaleString('it-IT')} ({generatedOffer.marginPercentage}%)
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-2 mt-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={handleExportPDF}
                            className="btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <Printer size={14} />
                            Esporta PDF
                          </button>
                          <button
                            onClick={handleDownloadDOCX}
                            className="btn-primary py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <FileType2 size={14} />
                            Esporta Word (.docx)
                          </button>
                        </div>
                        <button
                          onClick={handleDownloadRTF}
                          className="w-full py-2 text-xs font-semibold flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200/70 bg-white/60 text-neutral-500 hover:bg-neutral-50 transition-colors"
                        >
                          <Download size={13} />
                          Formato .rtf / ODF (compatibilità)
                        </button>
                      </div>
                      <div className="text-[10px] text-neutral-400 leading-relaxed text-center font-medium font-sans mt-2 select-none">
                        Il documento generato è formattato professionalmente e pronto per la firma digitale CAdES (.p7m) / PAdES (.pdf). Per il PDF usa "Salva come PDF" nella finestra di stampa.
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* VISTA 5: LISTINO ARTICOLI IT */}
            {activeTab === 'LISTINO' && (
              <motion.div 
                key="tab-listino"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-4 glass-panel p-4 h-full overflow-hidden"
              >
                <div className="border-b border-neutral-200/60 pb-2 flex items-center justify-between select-none">
                  <h2 className="text-sm font-bold text-neutral-800 flex items-center gap-2">
                    <Package size={16} className="text-blue-600" />
                    Gestione Listino Articoli IT ({products.length} elementi)
                  </h2>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleDownloadTemplate}
                      className="text-xs bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <Download size={13} /> Scarica Modello CSV
                    </button>
                    <label className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer">
                      <Plus size={13} /> Importa CSV
                      <input 
                        type="file" 
                        accept=".csv" 
                        onChange={handleImportCSV} 
                        className="hidden" 
                      />
                    </label>
                  </div>
                </div>
                
                <div className="grid grid-cols-12 gap-5 flex-1 overflow-hidden">
                  {/* Form Aggiunta */}
                  <div className="col-span-4 bg-neutral-50 p-4 rounded-2xl border border-neutral-200/60 text-xs flex flex-col gap-3 h-fit">
                    <div className="font-bold text-neutral-700 text-sm select-none">Nuovo Articolo Hardware</div>
                    <form onSubmit={handleAddProduct} className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-neutral-500 select-none">Codice OEM</label>
                          <input 
                            type="text" 
                            placeholder="es: HP-CF259X" 
                            value={newOem} 
                            onChange={e => setNewOem(e.target.value)} 
                            className="mac-input-mono text-xs py-1.5"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-neutral-500 select-none">Marchio</label>
                          <input 
                            type="text" 
                            placeholder="es: HP" 
                            value={newBrand} 
                            onChange={e => setNewBrand(e.target.value)} 
                            className="mac-input py-1.5"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-semibold text-neutral-500 select-none">Descrizione Prodotto</label>
                        <input 
                          type="text" 
                          placeholder="Descrizione estesa del prodotto..." 
                          value={newDesc} 
                          onChange={e => setNewDesc(e.target.value)} 
                          className="mac-input py-1.5"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-neutral-500 select-none">Costo (€)</label>
                          <input 
                            type="number" 
                            placeholder="Costo" 
                            value={newCost} 
                            onChange={e => setNewCost(e.target.value !== '' ? Number(e.target.value) : '')} 
                            className="mac-input-mono py-1.5"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-neutral-500 select-none">Rivendita (€)</label>
                          <input 
                            type="number" 
                            placeholder="Listino" 
                            value={newRetail} 
                            onChange={e => setNewRetail(e.target.value !== '' ? Number(e.target.value) : '')} 
                            className="mac-input-mono py-1.5"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-semibold text-neutral-500 select-none">Scorte</label>
                          <input 
                            type="number" 
                            placeholder="Quantità" 
                            value={newStock} 
                            onChange={e => setNewStock(e.target.value !== '' ? Number(e.target.value) : '')} 
                            className="mac-input-mono py-1.5"
                          />
                        </div>
                      </div>
                      <button type="submit" className="btn-primary py-2 text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-all shadow-sm">
                        <Plus size={14} /> Aggiungi Prodotto
                      </button>
                    </form>
                  </div>

                  {/* Tabella Prodotti */}
                  <div className="col-span-8 overflow-y-auto custom-scrollbar flex flex-col gap-2.5 pr-1">
                    {products.map((prod) => (
                      <div key={prod.id} className="p-3 bg-white border border-neutral-200/60 rounded-xl flex items-center justify-between text-xs hover:border-neutral-300 transition-all shadow-sm">
                        <div className="flex flex-col gap-1 font-sans">
                          <div className="font-mono font-bold text-neutral-800 text-sm flex items-center gap-2 select-none">
                            {prod.codeOEM}
                            <span className="text-[10px] bg-neutral-100 text-neutral-500 font-sans font-normal px-2 py-0.5 rounded-md border border-neutral-200/20">
                              {prod.brand}
                            </span>
                          </div>
                          <div className="text-neutral-500 text-xs font-sans">{prod.description}</div>
                          <div className="font-mono text-neutral-400 text-[11px] mt-0.5">
                            Prezzo Acquisto: €{prod.costPrice} | Rivendita Consigliato: €{prod.retailPrice} | Stock Magazzino: {prod.stock}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleRemoveProduct(prod.id)}
                          className="text-neutral-300 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition-all active:scale-90"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* VISTA 6: PROFILO AZIENDA */}
            {activeTab === 'PROFILO' && (
              <motion.div 
                key="tab-profilo"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-4 glass-panel p-4 h-full overflow-y-auto custom-scrollbar"
              >
                <h2 className="text-sm font-bold text-neutral-800 border-b border-neutral-200/60 pb-2 flex items-center gap-2 select-none">
                  <Building2 size={16} className="text-blue-600" />
                  Profilo Aziendale Ufficiale
                </h2>
                
                <div className="max-w-xl flex flex-col gap-4 text-xs font-sans">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-neutral-500 select-none">Ragione Sociale d'Impresa</label>
                    <input 
                      type="text" 
                      value={profile.name} 
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="mac-input py-2 text-sm font-medium font-sans"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-semibold text-neutral-500 select-none">Partita IVA / Codice Fiscale</label>
                      <input 
                        type="text" 
                        value={profile.vatNumber} 
                        onChange={(e) => setProfile({ ...profile, vatNumber: e.target.value })}
                        className="mac-input-mono py-2 text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-semibold text-neutral-500 select-none">Sede Legale</label>
                      <input 
                        type="text" 
                        value={profile.location} 
                        onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                        className="mac-input py-2 text-xs font-sans"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-neutral-500 select-none">Soglia Massima Importo Gara (Fatturato IT Coordinato) (€)</label>
                    <input 
                      type="number" 
                      value={profile.maxTenderValue} 
                      onChange={(e) => setProfile({ ...profile, maxTenderValue: Number(e.target.value) })}
                      className="mac-input-mono py-2 text-sm"
                    />
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-neutral-500 select-none">Certificazioni Possedute (per Controlli Bloccanti)</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {profile.certifications.map((cert: string, idx: number) => (
                        <span key={idx} className="bg-blue-50 text-blue-700 border border-blue-200/50 text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
                          <Award size={13} />
                          {cert}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* VISTA: CONFORMITÀ SOCIETARIA */}
            {activeTab === 'CONFORMITA_SOC' && (
              <motion.div
                key="tab-conformita-soc"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full overflow-y-auto custom-scrollbar"
              >
                <CompanyProfilePanel
                  userRole={authUser?.role}
                  onProfileChange={(updatedProfile) => {
                    setProfile(updatedProfile as any);
                    showToast('✅ Profilo societario aggiornato!');
                  }}
                />
              </motion.div>
            )}

            {/* VISTA DEDICATA: GESTIONE UTENTI & ACCESSI (SOLO ADMIN) */}
            {activeTab === 'UTENTI' && authUser?.role === 'admin' && (
              <motion.div
                key="tab-utenti"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full overflow-y-auto custom-scrollbar"
              >
                <CompanyProfilePanel
                  userRole={authUser?.role}
                  initialSection="utenti"
                  onProfileChange={(updatedProfile) => {
                    setProfile(updatedProfile as any);
                  }}
                />
              </motion.div>
            )}

            {/* VISTA: DOCUMENTI DI GARA */}
            {activeTab === 'DOCUMENTI' && selectedTender && (
              <motion.div
                key="tab-documenti"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full overflow-y-auto custom-scrollbar"
              >
                <TenderDocumentManager
                  tenderId={selectedTender.cig || selectedTender.id}
                  tenderTitle={selectedTender.title}
                  onAnalysisComplete={(analysisData) => {
                    if (analysisData?.extractedText && selectedTender) {
                      setCapitolatoText(analysisData.extractedText);
                      showToast('📄 PDF analizzato! Avvio analisi lotti e requisiti...');
                      handleAnalyzeTender(selectedTender, analysisData.extractedText);
                    } else {
                      setActiveTab('ANALISI');
                      showToast('👁️ Apertura analisi salvata nel Database Cloud!');
                    }
                  }}
                />
              </motion.div>
            )}

            {/* VISTA: AI CONTROL ROOM (SUPERVISOR) */}
            {activeTab === 'SUPERVISOR' && (
              <motion.div
                key="tab-supervisor"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full overflow-y-auto custom-scrollbar"
              >
                <SupervisorDashboard
                  selectedTender={selectedTender}
                  companyProfile={profile}
                  offerContext={generatedOffer}
                />
              </motion.div>
            )}

            {/* VISTA: STORICO PARTECIPAZIONI */}
            {activeTab === 'STORICO' && (
              <motion.div
                key="tab-storico"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full overflow-y-auto custom-scrollbar"
              >
                <TenderHistoryPanel
                  onSelectTender={(tender) => {
                    setSelectedTender(tender);
                    if (tender.description) {
                      setCapitolatoText(tender.description);
                    }
                  }}
                  onNavigateToTab={(tab) => setActiveTab(tab)}
                />
              </motion.div>
            )}

          </AnimatePresence>

        </section>

      </div>
      {/* Modal QuickMatch per selezionare o aggiungere prodotti */}
      <QuickMatchModal
        isOpen={quickMatchModal.isOpen}
        lottoId={quickMatchModal.lottoId}
        lottoDescription={quickMatchModal.lottoDescription}
        requiredQty={quickMatchModal.requiredQty}
        currentProducts={products}
        onClose={() => setQuickMatchModal(prev => ({ ...prev, isOpen: false }))}
        onMatch={(product, _isOneShot) => {
          if (quickMatchModal.itemIndex !== null) {
            handleOfferItemUpdate(quickMatchModal.itemIndex, {
              matchedProductOEM: `${product.codeOEM} - ${product.description}`,
              unitCost: product.costPrice,
              unitPrice: product.retailPrice,
              status: 'MAPPED'
            });
            showToast(`Abbinato ${product.codeOEM} dal listino!`);
          }
        }}
        onAddPermanent={(product) => {
          setProducts(prev => [...prev, product]);
        }}
      />
    </div>
  );
}
