// TenderDocumentManager.tsx — Upload e gestione allegati PDF di un bando
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Upload, Trash2, Sparkles, CheckCircle2, AlertCircle,
  FileWarning, Download, ExternalLink, Loader2
} from 'lucide-react';

interface TenderDocument {
  id: string;
  tenderId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  documentType: string;
  analyzed: boolean;
}

interface Props {
  tenderId: string;
  tenderTitle?: string;
  onAnalysisComplete?: (analysis: any) => void;
}

const DOC_TYPES = [
  { value: 'CAPITOLATO', label: 'Capitolato Tecnico' },
  { value: 'BANDO_INTEGRALE', label: 'Bando Integrale' },
  { value: 'MODULO_OFFERTA', label: 'Modulo Offerta' },
  { value: 'ALLEGATO', label: 'Allegato Generico' },
  { value: 'ALTRO', label: 'Altro' },
];

const ACCEPT_TYPES = '.pdf,.doc,.docx,.txt,.rtf';

export function TenderDocumentManager({ tenderId, tenderTitle, onAnalysisComplete }: Props) {
  const [docs, setDocs] = useState<TenderDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedType, setSelectedType] = useState('CAPITOLATO');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = async () => {
    try {
      const res = await fetch(`/api/tenders/${tenderId}/docs`);
      if (res.ok) setDocs(await res.json());
    } catch {}
  };

  useEffect(() => { loadDocs(); }, [tenderId]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('documentType', selectedType);

      const res = await fetch(`/api/tenders/${tenderId}/upload-doc`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Errore durante l\'upload');
      }
      await loadDocs();
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const analyzeDoc = async (doc: TenderDocument) => {
    setAnalyzing(doc.id);
    try {
      // Per testi semplici, leggiamo il file e lo inviamo al server per analisi
      // In alternativa: il server legge direttamente il file via path
      const res = await fetch(`/api/tenders/${tenderId}/analyze-docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docContent: `[Analisi del file: ${doc.originalName}]\nIl server analizzerà il documento "${doc.originalName}" (tipo: ${doc.documentType}) caricato per il bando "${tenderTitle}". Estrai tutte le informazioni strutturate rilevanti per la gara.`,
          tenderTitle,
          filename: doc.filename,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onAnalysisComplete?.(data.analysis);
        // Aggiorna doc come analizzato
        setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, analyzed: true } : d));
      }
    } catch {}
    setAnalyzing(null);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const docTypeLabel = (type: string) => DOC_TYPES.find(d => d.value === type)?.label || type;

  return (
    <div className="space-y-3">
      {/* Tipo documento + drop zone */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-neutral-500">Tipo documento:</label>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="text-xs border border-neutral-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        <motion.div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          whileHover={{ scale: 1.01 }}
          className={`relative flex flex-col items-center justify-center gap-2 py-6 px-4 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-neutral-300 bg-neutral-50 hover:border-blue-300 hover:bg-blue-50/50'
          } ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_TYPES}
            className="hidden"
            onChange={handleFileInput}
            disabled={uploading}
          />

          {uploading ? (
            <>
              <Loader2 size={22} className="text-blue-500 animate-spin" />
              <p className="text-xs text-blue-600 font-medium">Upload in corso...</p>
            </>
          ) : (
            <>
              <Upload size={22} className={dragOver ? 'text-blue-500' : 'text-neutral-400'} />
              <div className="text-center">
                <p className="text-xs font-medium text-neutral-700">Trascina qui il documento</p>
                <p className="text-xs text-neutral-400 mt-0.5">o clicca per selezionare · PDF, DOC, TXT</p>
              </div>
            </>
          )}
        </motion.div>

        {uploadError && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle size={12} /> {uploadError}
          </div>
        )}
      </div>

      {/* Lista documenti */}
      <AnimatePresence mode="popLayout">
        {docs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-4 text-xs text-neutral-400"
          >
            <FileWarning size={20} className="mx-auto mb-1 opacity-40" />
            Nessun allegato caricato per questa gara.<br />
            Carica il capitolato per un'analisi AI precisa.
          </motion.div>
        ) : (
          <div className="space-y-2">
            {docs.map(doc => (
              <motion.div
                key={doc.id}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  doc.analyzed
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-neutral-200 bg-white'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {doc.analyzed
                    ? <CheckCircle2 size={16} className="text-emerald-500" />
                    : <FileText size={16} className="text-neutral-400" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-neutral-800 truncate">{doc.originalName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-neutral-400">{formatBytes(doc.sizeBytes)}</span>
                    <span className="text-xs text-neutral-300">·</span>
                    <span className="text-xs bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded-full">
                      {docTypeLabel(doc.documentType)}
                    </span>
                    {doc.analyzed && (
                      <span className="text-xs bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">
                        ✓ Analizzato
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-300 mt-0.5">
                    {new Date(doc.uploadedAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {doc.analyzed ? (
                    <div className="flex items-center gap-1.5">
                      <motion.button
                        onClick={() => analyzeDoc(doc)}
                        disabled={analyzing === doc.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        title="Vedi l'analisi e l'offerta per questa gara"
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
                      >
                        {analyzing === doc.id ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        {analyzing === doc.id ? 'Caricamento...' : '👁️ Vedi Analisi'}
                      </motion.button>
                      
                      <button
                        onClick={() => analyzeDoc(doc)}
                        title="Forza nuova analisi AI del documento"
                        className="text-xs text-neutral-400 hover:text-neutral-600 px-1 py-1"
                      >
                        🔄
                      </button>
                    </div>
                  ) : (
                    <motion.button
                      onClick={() => analyzeDoc(doc)}
                      disabled={analyzing === doc.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-xs"
                    >
                      {analyzing === doc.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Sparkles size={11} />
                      }
                      {analyzing === doc.id ? 'Analisi...' : '⚡ Analizza AI'}
                    </motion.button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
