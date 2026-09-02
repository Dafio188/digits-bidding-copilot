// SupervisorDashboard.tsx — Dashboard AI Supervisor con chat contestuale e log attività
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Send, Activity, CheckCircle2, AlertTriangle, XCircle, Clock,
  RefreshCw, FileText, Award, TrendingUp, Shield, Loader2,
  BarChart3, Calendar, Database, Zap, MessageSquare, History
} from 'lucide-react';
import type { ChatMessage, JobLogEntry, AuditEntry } from '../types';

interface Props {
  selectedTender?: any;
  companyProfile?: any;
  offerContext?: any;
}

export function SupervisorDashboard({ selectedTender, companyProfile, offerContext }: Props) {
  const [tab, setTab] = useState<'dashboard' | 'chat' | 'log'>('dashboard');

  // Dashboard data
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [dbStats, setDbStats] = useState<any>(null);
  const [jobLog, setJobLog] = useState<JobLogEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [runningJob, setRunningJob] = useState(false);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const [jobRes, statsRes, auditRes] = await Promise.all([
        fetch('/api/admin/job-log'),
        fetch('/api/db-stats'),
        fetch('/api/admin/audit-log'),
      ]);
      if (jobRes.ok) {
        const jd = await jobRes.json();
        setJobStatus(jd.status);
        setJobLog((jd.log?.entries || []).slice(-15).reverse());
      }
      if (statsRes.ok) setDbStats(await statsRes.json());
      if (auditRes.ok) {
        const ad = await auditRes.json();
        setAuditLog(Array.isArray(ad.log) ? ad.log : (Array.isArray(ad) ? ad : []));
      }
    } catch {}
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const triggerJob = async () => {
    setRunningJob(true);
    await fetch('/api/admin/run-ingestion', { method: 'POST' });
    setTimeout(() => { loadData(); setRunningJob(false); }, 6000);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: chatInput,
          tenderContext: selectedTender,
          profileContext: companyProfile,
          offerContext,
        }),
      });
      const data = await res.json();
      const aiMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: data.reply || 'Nessuna risposta ricevuta.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Errore di connessione all\'AI. Riprova tra qualche secondo.',
        timestamp: new Date().toISOString(),
      }]);
    }
    setChatLoading(false);
  };

  // Suggerimenti di domande contestuali
  const chatSuggestions = selectedTender
    ? [
        `Posso partecipare alla gara di ${selectedTender.authority}?`,
        `Quali documenti devo preparare per il CIG ${selectedTender.cig}?`,
        `Analizza i rischi di questa gara`,
        `Genera una dichiarazione di non ostative`
      ]
    : [
        'Qual è lo stato del mio profilo per le gare attive?',
        'Quali certificazioni stanno per scadere?',
        'Come posso migliorare il mio profilo per le gare PA?',
        'Spiegami la procedura MEPA passo per passo'
      ];

  const getStatusColor = (s: string) =>
    s === 'SUCCESS' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
    s === 'ERROR' ? 'text-red-600 bg-red-50 border-red-200' :
    s === 'RUNNING' ? 'text-blue-600 bg-blue-50 border-blue-200' :
    'text-amber-600 bg-amber-50 border-amber-200';

  const getActionIcon = (action: string) => {
    const map: Record<string, React.ReactNode> = {
      TENDER_ANALYZED: <FileText size={12} />,
      COMPLIANCE_CHECKED: <Shield size={12} />,
      OFFER_GENERATED: <TrendingUp size={12} />,
      DOCUMENT_UPLOADED: <Database size={12} />,
      DOCUMENT_GENERATED: <FileText size={12} />,
      PROFILE_UPDATED: <Award size={12} />,
      INGESTION_TRIGGERED: <RefreshCw size={12} />,
      AI_CHAT: <MessageSquare size={12} />,
      FLIGHT_CHECK: <Zap size={12} />,
    };
    return map[action] || <Activity size={12} />;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab navigation */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl mb-4">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          { id: 'chat', label: 'AI Advisor', icon: Bot },
          { id: 'log', label: 'Log Attività', icon: History },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                tab === t.id ? 'bg-white shadow text-blue-700' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* DASHBOARD */}
      {tab === 'dashboard' && (
        <div className="space-y-4 overflow-y-auto pb-4">
          {/* KPI Row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Stato ANAC */}
            <div className={`p-3 rounded-xl border ${jobStatus?.isStale ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Database size={13} className={jobStatus?.isStale ? 'text-amber-500' : 'text-emerald-500'} />
                  <span className="text-xs font-semibold text-neutral-700">DB Bandi</span>
                </div>
                {jobStatus?.isStale ? <AlertTriangle size={13} className="text-amber-500" /> : <CheckCircle2 size={13} className="text-emerald-500" />}
              </div>
              <p className="text-lg font-bold text-neutral-800">{dbStats?.total?.toLocaleString('it-IT') || '—'}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {jobStatus?.lastSuccess
                  ? `Aggiornato ${new Date(jobStatus.lastSuccess).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                  : 'Mai aggiornato'
                }
              </p>
            </div>

            {/* Certificazioni */}
            <div className="p-3 rounded-xl border border-neutral-200 bg-white">
              <div className="flex items-center gap-1.5 mb-1">
                <Award size={13} className="text-blue-500" />
                <span className="text-xs font-semibold text-neutral-700">Certificazioni</span>
              </div>
              <p className="text-lg font-bold text-neutral-800">{companyProfile?.certificationDetails?.length || companyProfile?.certifications?.length || '—'}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {companyProfile?.certificationDetails?.filter((c: any) => c.isExpiringSoon)?.length > 0
                  ? `⚠ ${companyProfile.certificationDetails.filter((c: any) => c.isExpiringSoon).length} in scadenza`
                  : 'Tutte valide'
                }
              </p>
            </div>
          </div>

          {/* Stato ultimo job con storico */}
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <RefreshCw size={13} className="text-neutral-500" />
                <span className="text-xs font-semibold text-neutral-700">Ultime Esecuzioni Job ANAC</span>
              </div>
              <motion.button
                onClick={triggerJob}
                disabled={runningJob}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {runningJob ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {runningJob ? 'In esecuzione...' : 'Avvia ora'}
              </motion.button>
            </div>
            <div className="divide-y divide-neutral-100">
              {jobLog.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-6">Nessuna esecuzione registrata</p>
              ) : (
                jobLog.slice(0, 8).map(entry => (
                  <div key={entry.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border font-medium ${getStatusColor(entry.status)}`}>
                        {entry.status === 'SUCCESS' ? <CheckCircle2 size={10} /> :
                         entry.status === 'ERROR' ? <XCircle size={10} /> :
                         entry.status === 'RUNNING' ? <Loader2 size={10} className="animate-spin" /> :
                         <AlertTriangle size={10} />}
                        {entry.status}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {new Date(entry.timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-xs text-neutral-400">·</span>
                      <span className="text-xs text-neutral-400">{entry.triggeredBy}</span>
                    </div>
                    <div className="text-xs text-neutral-600 text-right">
                      {entry.status === 'ERROR'
                        ? <span className="text-red-500 truncate max-w-32">{entry.errorMessage?.slice(0, 40)}...</span>
                        : <span className="font-medium">{entry.tendersInserted} bandi</span>
                      }
                      {entry.durationMs > 0 && (
                        <span className="text-neutral-400 ml-1">({(entry.durationMs / 1000).toFixed(1)}s)</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bandi per regione */}
          {dbStats?.byRegion?.length > 0 && (
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <BarChart3 size={13} className="text-neutral-500" />
                  <span className="text-xs font-semibold text-neutral-700">Bandi per Regione (Top 5)</span>
                </div>
              </div>
              <div className="px-4 py-3 space-y-2">
                {dbStats.byRegion.slice(0, 5).map((r: any) => (
                  <div key={r.region} className="flex items-center gap-3">
                    <span className="text-xs text-neutral-600 w-32 truncate">{r.region}</span>
                    <div className="flex-1 bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (r.count / dbStats.byRegion[0].count) * 100)}%` }}
                        transition={{ delay: 0.2 }}
                        className="h-full bg-blue-500 rounded-full"
                      />
                    </div>
                    <span className="text-xs font-medium text-neutral-700 w-10 text-right">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CHAT AI */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Contesto attivo */}
          {selectedTender && (
            <div className="mb-3 p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
              <Bot size={13} className="text-blue-500 shrink-0" />
              <p className="text-xs text-blue-700">
                <span className="font-medium">Contesto attivo:</span> {selectedTender.title?.slice(0, 60)}...
              </p>
            </div>
          )}

          {/* Messaggi */}
          <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8"
              >
                <Bot size={32} className="mx-auto text-blue-200 mb-3" />
                <p className="text-sm font-medium text-neutral-600">Bidding Advisor AI</p>
                <p className="text-xs text-neutral-400 mt-1">
                  Sono il tuo assistente specializzato in appalti PA.<br />
                  Chiedi qualsiasi cosa sulle gare, la conformità o la documentazione.
                </p>
                <div className="mt-4 flex flex-col gap-1.5 items-start">
                  {chatSuggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setChatInput(s); }}
                      className="text-left text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {messages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                    <Bot size={12} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] px-3 py-2.5 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-neutral-100 text-neutral-800 rounded-tl-sm border border-neutral-200'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <p className={`text-xs mt-1 opacity-60 ${msg.role === 'user' ? 'text-right' : ''}`}>
                    {new Date(msg.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            ))}

            {chatLoading && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                  <Bot size={12} className="text-white" />
                </div>
                <div className="bg-neutral-100 px-3 py-2.5 rounded-2xl rounded-tl-sm border border-neutral-200">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, delay: i * 0.15, duration: 0.6 }}
                        className="w-1.5 h-1.5 rounded-full bg-neutral-400"
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
              placeholder="Scrivi una domanda al Bidding Advisor..."
              className="flex-1 text-xs border border-neutral-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-neutral-50"
              disabled={chatLoading}
            />
            <motion.button
              onClick={sendChat}
              disabled={!chatInput.trim() || chatLoading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-all shrink-0"
            >
              {chatLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </motion.button>
          </div>
        </div>
      )}

      {/* LOG ATTIVITÀ */}
      {tab === 'log' && (() => {
        const safeAuditLog = Array.isArray(auditLog) ? auditLog : [];
        return (
          <div className="overflow-y-auto flex-1 space-y-1 pb-4">
            {safeAuditLog.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-10">Nessuna attività registrata.</p>
            ) : (
              safeAuditLog.map(entry => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-neutral-50 transition-colors border border-transparent hover:border-neutral-100"
                >
                  <div className="mt-0.5 text-neutral-400 shrink-0">
                    {getActionIcon(entry.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-neutral-700 leading-snug">{entry.details}</p>
                    {entry.tenderTitle && (
                      <p className="text-xs text-neutral-400 truncate">{entry.tenderTitle}</p>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400 shrink-0 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </motion.div>
              ))
            )}
          </div>
        );
      })()}
    </div>
  );
}
