import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Trophy,
  XCircle,
  Clock,
  Search,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Percent,
  ChevronRight
} from 'lucide-react';
import type { Tender } from '../types';

interface Props {
  onSelectTender?: (tender: Tender) => void;
  onNavigateToTab?: (tab: any) => void;
}

export function TenderHistoryPanel({ onSelectTender, onNavigateToTab }: Props) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'submitted' | 'won' | 'lost'>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tenders/participating');
      if (res.ok) {
        const data = await res.json();
        setTenders(data.tenders || []);
      }
    } catch (e) {
      console.error("Errore caricamento storico gare:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusUpdate = async (id: string, newStatus: 'active' | 'submitted' | 'won' | 'lost') => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/tenders/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        // Ricarica i dati per aggiornare metriche e storico
        await loadData();
      }
    } catch (e) {
      console.error("Errore aggiornamento stato gara:", e);
    } finally {
      setUpdatingId(null);
    }
  };

  // Calcolo statistiche
  const stats = React.useMemo(() => {
    const total = tenders.length;
    const wonList = tenders.filter(t => t.status === 'won');
    const lostList = tenders.filter(t => t.status === 'lost');
    const pendingList = tenders.filter(t => t.status === 'submitted');

    const totalWonValue = wonList.reduce((acc, t) => acc + (t.value || 0), 0);
    const totalPendingValue = pendingList.reduce((acc, t) => acc + (t.value || 0), 0);
    
    // Win rate basato su esiti definiti (won / won+lost)
    const closedCount = wonList.length + lostList.length;
    const winRate = closedCount > 0 ? Math.round((wonList.length / closedCount) * 100) : 0;

    return {
      total,
      wonCount: wonList.length,
      lostCount: lostList.length,
      pendingCount: pendingList.length,
      totalWonValue,
      totalPendingValue,
      winRate
    };
  }, [tenders]);

  // Filtro ed ordinamento elenco
  const filteredTenders = tenders.filter(t => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.authority.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.cig && t.cig.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-5 h-full overflow-hidden">
      
      {/* Header Sezione */}
      <div className="flex flex-col gap-1 shrink-0 select-none">
        <h2 className="text-lg font-bold text-neutral-800 flex items-center gap-2">
          <History className="text-blue-600" size={20} />
          Storico Gare & Monitoraggio Partecipazioni
        </h2>
        <p className="text-xs text-neutral-500">
          Visualizza le gare in cui l'azienda ha presentato un'offerta e gestisci il loro ciclo di vita fino all'aggiudicazione.
        </p>
      </div>

      {/* Grid delle Statistiche Chiave (Apple Style Glass Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0 select-none">
        
        {/* Card 1: Totale Partecipazioni */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="glass-panel p-4 flex items-center gap-3.5 border-l-4 border-l-blue-500 shadow-sm"
        >
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
            <FileText size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Gare Partecipate</span>
            <span className="text-lg font-extrabold text-neutral-800 leading-none">{stats.total}</span>
          </div>
        </motion.div>

        {/* Card 2: Aggiudicate */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="glass-panel p-4 flex items-center gap-3.5 border-l-4 border-l-emerald-500 shadow-sm"
        >
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
            <Trophy size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Aggiudicate (Won)</span>
            <span className="text-lg font-extrabold text-neutral-800 leading-none flex items-baseline gap-1.5">
              {stats.wonCount}
              <span className="text-xs text-emerald-600 font-bold">
                (€{stats.totalWonValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })})
              </span>
            </span>
          </div>
        </motion.div>

        {/* Card 3: Win Rate */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="glass-panel p-4 flex items-center gap-3.5 border-l-4 border-l-purple-500 shadow-sm"
        >
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 shrink-0">
            <Percent size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Tasso di Successo</span>
            <span className="text-lg font-extrabold text-neutral-800 leading-none flex items-baseline gap-1">
              {stats.winRate}%
              <span className="text-[10px] text-neutral-400 font-medium">su esiti chiusi</span>
            </span>
          </div>
        </motion.div>

        {/* Card 4: In Attesa */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="glass-panel p-4 flex items-center gap-3.5 border-l-4 border-l-amber-500 shadow-sm"
        >
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 shrink-0">
            <Clock size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">In Valutazione PA</span>
            <span className="text-lg font-extrabold text-neutral-800 leading-none flex items-baseline gap-1.5">
              {stats.pendingCount}
              <span className="text-xs text-amber-600 font-bold">
                (€{stats.totalPendingValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })})
              </span>
            </span>
          </div>
        </motion.div>
      </div>

      {/* Sezione Filtri e Lista */}
      <div className="flex-1 min-h-0 flex flex-col gap-3.5 glass-panel p-4">
        
        {/* Barra dei filtri */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0 select-none">
          
          {/* Cerca */}
          <div className="relative w-full sm:max-w-xs">
            <span className="absolute inset-y-0 left-3 flex items-center text-neutral-400 pointer-events-none">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Cerca per CIG, Stazione o Titolo..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="mac-input w-full pl-9 py-1.5 text-xs focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Filtro Status Tabs */}
          <div className="flex bg-neutral-100 p-0.5 rounded-xl border border-neutral-200/50">
            {[
              { id: 'ALL', label: 'Tutte' },
              { id: 'submitted', label: 'In Attesa' },
              { id: 'won', label: 'Aggiudicate' },
              { id: 'lost', label: 'Perse' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === tab.id
                    ? 'bg-white text-neutral-800 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Elenco Gare */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-neutral-400">
                <div className="w-5 h-5 rounded-full border-2 border-neutral-300 border-t-blue-500 animate-spin" />
                <span className="text-xs">Caricamento dello storico...</span>
              </div>
            ) : filteredTenders.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-48 text-center text-neutral-400 select-none"
              >
                <History size={36} className="mb-2 text-neutral-300 animate-pulse" />
                <h4 className="text-xs font-bold text-neutral-700">Nessuna gara trovata</h4>
                <p className="text-[11px] text-neutral-400 max-w-xs mt-0.5 leading-relaxed">
                  {searchQuery || statusFilter !== 'ALL'
                    ? "Prova a modificare i filtri o la query di ricerca."
                    : "Non ci sono ancora partecipazioni registrate. Segna una gara come partecipata per iniziare il tracciamento."}
                </p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {filteredTenders.map((tender) => (
                  <motion.div
                    key={tender.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    className="p-3.5 bg-white border border-neutral-200/60 rounded-2xl hover:border-neutral-300 hover:shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    
                    {/* Dati Gara */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {tender.cig && (
                          <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
                            CIG: {tender.cig}
                          </span>
                        )}
                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                          {tender.region}
                        </span>
                        
                        {/* Status Badge */}
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full flex items-center gap-1 ${
                          tender.status === 'won'
                            ? 'bg-emerald-100 text-emerald-700'
                            : tender.status === 'lost'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700 animate-pulse'
                        }`}>
                          {tender.status === 'won' && <Trophy size={9} />}
                          {tender.status === 'lost' && <XCircle size={9} />}
                          {tender.status === 'submitted' && <Clock size={9} />}
                          {tender.status === 'won' ? 'Aggiudicata' : tender.status === 'lost' ? 'Non Aggiudicata' : 'In Valutazione'}
                        </span>
                      </div>

                      <h3 className="text-xs font-bold text-neutral-800 leading-snug line-clamp-1 hover:text-blue-600 cursor-pointer"
                          onClick={() => {
                            if (onSelectTender) {
                              onSelectTender(tender);
                              onNavigateToTab?.('ESTRAZIONE');
                            }
                          }}
                      >
                        {tender.title}
                      </h3>
                      
                      <div className="flex items-center gap-3 text-[10px] text-neutral-400">
                        <span className="font-semibold text-neutral-500 truncate max-w-[200px]">
                          🏛️ {tender.authority}
                        </span>
                        <span>•</span>
                        <span>Importo: <strong className="text-neutral-700">€{tender.value.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong></span>
                      </div>
                    </div>

                    {/* Azioni di Gestione Ciclo di Vita (Stato) */}
                    <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                      {updatingId === tender.id ? (
                        <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-semibold px-4">
                          <div className="w-3.5 h-3.5 rounded-full border border-neutral-300 border-t-neutral-600 animate-spin" />
                          Aggiornamento...
                        </div>
                      ) : (
                        <>
                          {/* Segna come Aggiudicata */}
                          {tender.status !== 'won' && (
                            <motion.button
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => handleStatusUpdate(tender.id, 'won')}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold flex items-center gap-1 transition-all"
                            >
                              <Trophy size={11} />
                              Aggiudicata
                            </motion.button>
                          )}

                          {/* Segna come Persa */}
                          {tender.status !== 'lost' && (
                            <motion.button
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => handleStatusUpdate(tender.id, 'lost')}
                              className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-bold flex items-center gap-1 transition-all"
                            >
                              <XCircle size={11} />
                              Persa
                            </motion.button>
                          )}

                          {/* Ripristina ad attiva (riapri gara) */}
                          <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleStatusUpdate(tender.id, 'active')}
                            className="p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-500 rounded-xl text-[10px] font-bold flex items-center gap-1 transition-all border border-neutral-200/40"
                            title="Ripristina come attiva / Riapri"
                          >
                            <RotateCcw size={11} />
                          </motion.button>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
