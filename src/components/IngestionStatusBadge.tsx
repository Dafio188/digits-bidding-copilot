// IngestionStatusBadge.tsx — Badge stato job ANAC con indicatore in tempo reale
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Clock } from 'lucide-react';

interface JobStatus {
  lastSuccess: string | null;
  lastError: string | null;
  isStale: boolean;
  lastEntry: {
    status: string;
    tendersInserted: number;
    tendersTotal: number;
    triggeredBy: string;
    timestamp: string;
    errorMessage?: string;
  } | null;
}

interface IngestionStatusBadgeProps {
  onOpenSupervisor?: () => void;
}

export function IngestionStatusBadge({ onOpenSupervisor }: IngestionStatusBadgeProps) {
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/job-log');
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch {}
  };

  const triggerManual = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRunning(true);
    try {
      await fetch('/api/admin/run-ingestion', { method: 'POST' });
      // Ricontrolla dopo 5 secondi
      setTimeout(fetchStatus, 5000);
    } catch {}
    setTimeout(() => setIsRunning(false), 5000);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // Aggiorna ogni minuto
    return () => clearInterval(interval);
  }, []);

  const getStatusConfig = () => {
    if (isRunning) return {
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      icon: <RefreshCw size={12} className="animate-spin" />,
      label: 'Aggiornamento in corso...',
      dot: 'bg-blue-500 animate-pulse'
    };
    if (!status) return {
      color: 'text-neutral-500 bg-neutral-50 border-neutral-200',
      icon: <Clock size={12} />,
      label: 'Verifica stato...',
      dot: 'bg-neutral-400'
    };
    if (status.isStale) return {
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      icon: <AlertTriangle size={12} />,
      label: 'DB non aggiornato',
      dot: 'bg-amber-500 animate-pulse'
    };
    if (status.lastEntry?.status === 'ERROR') return {
      color: 'text-red-700 bg-red-50 border-red-200',
      icon: <XCircle size={12} />,
      label: 'Errore ultimo job',
      dot: 'bg-red-500'
    };
    return {
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      icon: <CheckCircle2 size={12} />,
      label: status.lastEntry
        ? `${status.lastEntry.tendersInserted} bandi`
        : 'Aggiornato',
      dot: 'bg-emerald-500'
    };
  };

  const cfg = getStatusConfig();

  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffH < 1) return 'meno di 1h fa';
    if (diffH < 24) return `${diffH}h fa`;
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Badge stato */}
      <motion.button
        onClick={onOpenSupervisor}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all cursor-pointer ${cfg.color}`}
        title={status?.isStale ? 'Database non aggiornato nelle ultime 26 ore. Clicca per aprire il pannello Supervisore.' : 'Stato aggiornamento ANAC'}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.icon}
        <span>ANAC: {cfg.label}</span>
        {status?.lastSuccess && (
          <span className="opacity-60">· {formatTime(status.lastSuccess)}</span>
        )}
      </motion.button>

      {/* Pulsante aggiornamento manuale */}
      <motion.button
        onClick={triggerManual}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        disabled={isRunning}
        className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all disabled:opacity-40"
        title="Avvia aggiornamento manuale bandi ANAC"
      >
        <RefreshCw size={13} className={isRunning ? 'animate-spin' : ''} />
      </motion.button>

      {/* Alert se stale */}
      <AnimatePresence>
        {status?.isStale && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-amber-700 font-medium"
          >
            ⚠ Aggiorna manualmente
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
