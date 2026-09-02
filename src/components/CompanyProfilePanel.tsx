// CompanyProfilePanel.tsx — Profilo aziendale completo con certificazioni e documenti societari
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Award, FileText, TrendingUp, Plus, Trash2, Save,
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Edit3, X
} from 'lucide-react';
import type { CompanyProfile, Certification, SocietalDocument, TurnoverEntry } from '../types';

const EMPTY_PROFILE: CompanyProfile = {
  name: 'DIGITS DISTRIBUZIONE SRL UNIPERSONALE',
  vatNumber: '09007650725',
  fiscalCode: '',
  location: 'Casamassima (BA)',
  address: '',
  pec: '',
  phone: '',
  maxTenderValue: 185000,
  turnover: [],
  mepaCategories: ['ICT', "Beni d'Ufficio", 'Hardware/Software'],
  mepaEnabled: true,
  consipEnabled: false,
  certifications: ['ISO 9001', 'ISO 14001'],
  certificationDetails: [],
  societalDocuments: [],
  paReferences: [],
};

interface Props {
  onProfileChange?: (p: CompanyProfile) => void;
}

export function CompanyProfilePanel({ onProfileChange }: Props) {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>('anagrafica');
  const [editingCert, setEditingCert] = useState<Partial<Certification> | null>(null);
  const [editingDoc, setEditingDoc] = useState<Partial<SocietalDocument> | null>(null);

  useEffect(() => {
    fetch('/api/company-profile')
      .then(r => r.json())
      .then(data => {
        setProfile({ ...EMPTY_PROFILE, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/company-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaved(true);
        onProfileChange?.(profile);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof CompanyProfile, value: any) =>
    setProfile(p => ({ ...p, [field]: value }));

  const addCert = () => {
    if (!editingCert?.name) return;
    const cert: Certification = {
      id: `cert-${Date.now()}`,
      name: editingCert.name || '',
      issuer: editingCert.issuer || '',
      certNumber: editingCert.certNumber || '',
      issueDate: editingCert.issueDate || '',
      expiryDate: editingCert.expiryDate || '',
    };
    const updated = [...(profile.certificationDetails || []), cert];
    updateField('certificationDetails', updated);
    // Aggiorna anche la lista semplificata
    updateField('certifications', updated.map(c => c.name));
    setEditingCert(null);
  };

  const removeCert = (id: string) => {
    const updated = (profile.certificationDetails || []).filter(c => c.id !== id);
    updateField('certificationDetails', updated);
    updateField('certifications', updated.map(c => c.name));
  };

  const addDoc = () => {
    if (!editingDoc?.type) return;
    const doc: SocietalDocument = {
      type: editingDoc.type as any,
      label: editingDoc.label || editingDoc.type || '',
      value: editingDoc.value || '',
      expiryDate: editingDoc.expiryDate,
      notes: editingDoc.notes,
    };
    updateField('societalDocuments', [...(profile.societalDocuments || []), doc]);
    setEditingDoc(null);
  };

  const addTurnover = () => {
    const entry: TurnoverEntry = { year: new Date().getFullYear() - 1, totalRevenue: 0, paRevenue: 0 };
    updateField('turnover', [...(profile.turnover || []), entry]);
  };

  const certStatus = (cert: Certification) => {
    if (!cert.expiryDate) return 'unknown';
    const exp = new Date(cert.expiryDate);
    const now = new Date();
    const diffMs = exp.getTime() - now.getTime();
    if (diffMs < 0) return 'expired';
    if (diffMs < 30 * 24 * 60 * 60 * 1000) return 'expiring';
    return 'valid';
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const sections = [
    { id: 'anagrafica', label: 'Anagrafica Societaria', icon: Building2 },
    { id: 'certificazioni', label: 'Certificazioni & Qualificazioni', icon: Award },
    { id: 'documenti', label: 'Documenti Societari', icon: FileText },
    { id: 'fatturato', label: 'Fatturato & Referenze PA', icon: TrendingUp },
  ];

  return (
    <div className="space-y-3">
      {/* Header con pulsante salva */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">Profilo Societario</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Dati persistenti per la verifica conformità</p>
        </div>
        <motion.button
          onClick={save}
          disabled={saving}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            saved
              ? 'bg-emerald-500 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {saved ? <CheckCircle2 size={12} /> : <Save size={12} />}
          {saved ? 'Salvato!' : saving ? 'Salvataggio...' : 'Salva Profilo'}
        </motion.button>
      </div>

      {sections.map(section => {
        const Icon = section.icon;
        const isOpen = openSection === section.id;
        return (
          <div key={section.id} className="border border-neutral-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenSection(isOpen ? null : section.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-neutral-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-blue-600" />
                <span className="text-xs font-semibold text-neutral-700">{section.label}</span>
              </div>
              {isOpen ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
            </button>

            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-4 space-y-3 border-t border-neutral-100">

                    {/* ANAGRAFICA */}
                    {section.id === 'anagrafica' && (
                      <>
                        {[
                          { label: 'Ragione Sociale', field: 'name' as const },
                          { label: 'P.IVA', field: 'vatNumber' as const },
                          { label: 'Codice Fiscale', field: 'fiscalCode' as const },
                          { label: 'Sede', field: 'location' as const },
                          { label: 'Indirizzo completo', field: 'address' as const },
                          { label: 'PEC', field: 'pec' as const },
                          { label: 'Telefono', field: 'phone' as const },
                        ].map(f => (
                          <div key={f.field}>
                            <label className="block text-xs text-neutral-500 mb-1">{f.label}</label>
                            <input
                              type="text"
                              value={(profile[f.field] as string) || ''}
                              onChange={e => updateField(f.field, e.target.value)}
                              className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                        ))}
                        <div>
                          <label className="block text-xs text-neutral-500 mb-1">Capacità max per singola gara (€)</label>
                          <input
                            type="number"
                            value={profile.maxTenderValue || 0}
                            onChange={e => updateField('maxTenderValue', parseFloat(e.target.value))}
                            className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                          />
                        </div>
                        <div className="flex gap-4 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={profile.mepaEnabled} onChange={e => updateField('mepaEnabled', e.target.checked)} className="rounded" />
                            <span className="text-xs text-neutral-700">Iscritto MEPA</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={profile.consipEnabled} onChange={e => updateField('consipEnabled', e.target.checked)} className="rounded" />
                            <span className="text-xs text-neutral-700">Iscritto Consip</span>
                          </label>
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-500 mb-1">Categorie MEPA (una per riga)</label>
                          <textarea
                            value={(profile.mepaCategories || []).join('\n')}
                            onChange={e => updateField('mepaCategories', e.target.value.split('\n').filter(Boolean))}
                            rows={3}
                            className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white resize-none"
                          />
                        </div>
                      </>
                    )}

                    {/* CERTIFICAZIONI */}
                    {section.id === 'certificazioni' && (
                      <>
                        {(profile.certificationDetails || []).map(cert => {
                          const st = certStatus(cert);
                          return (
                            <div key={cert.id} className={`flex items-start justify-between p-3 rounded-lg border ${
                              st === 'expired' ? 'border-red-200 bg-red-50' :
                              st === 'expiring' ? 'border-amber-200 bg-amber-50' :
                              'border-emerald-200 bg-emerald-50'
                            }`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {st === 'expired' ? <XCircle size={12} className="text-red-500" /> :
                                   st === 'expiring' ? <AlertTriangle size={12} className="text-amber-500" /> :
                                   <CheckCircle2 size={12} className="text-emerald-500" />}
                                  <span className="text-xs font-semibold text-neutral-800">{cert.name}</span>
                                </div>
                                <div className="text-xs text-neutral-500 mt-0.5">
                                  {cert.issuer && <span>Ente: {cert.issuer} · </span>}
                                  {cert.certNumber && <span>N° {cert.certNumber} · </span>}
                                  {cert.expiryDate && <span>Scade: {new Date(cert.expiryDate).toLocaleDateString('it-IT')}</span>}
                                </div>
                                {st === 'expired' && <p className="text-xs text-red-600 font-medium mt-0.5">⚠ SCADUTA</p>}
                                {st === 'expiring' && <p className="text-xs text-amber-600 font-medium mt-0.5">⚠ In scadenza entro 30 giorni</p>}
                              </div>
                              <button onClick={() => removeCert(cert.id)} className="ml-2 text-neutral-400 hover:text-red-500 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          );
                        })}

                        {/* Form aggiunta certificazione */}
                        {editingCert !== null ? (
                          <div className="p-3 border border-blue-200 rounded-lg bg-blue-50 space-y-2">
                            <p className="text-xs font-semibold text-blue-800">Nuova Certificazione</p>
                            {[
                              { label: 'Nome (es. ISO 9001:2015)', field: 'name' },
                              { label: 'Ente Certificatore', field: 'issuer' },
                              { label: 'Numero Certificato', field: 'certNumber' },
                            ].map(f => (
                              <input key={f.field} type="text" placeholder={f.label}
                                value={(editingCert as any)[f.field] || ''}
                                onChange={e => setEditingCert(c => ({ ...c!, [f.field]: e.target.value }))}
                                className="w-full text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            ))}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-neutral-500">Data Rilascio</label>
                                <input type="date" value={editingCert.issueDate || ''}
                                  onChange={e => setEditingCert(c => ({ ...c!, issueDate: e.target.value }))}
                                  className="w-full text-xs border border-blue-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-neutral-500">Data Scadenza</label>
                                <input type="date" value={editingCert.expiryDate || ''}
                                  onChange={e => setEditingCert(c => ({ ...c!, expiryDate: e.target.value }))}
                                  className="w-full text-xs border border-blue-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={addCert} className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-blue-700">Aggiungi</button>
                              <button onClick={() => setEditingCert(null)} className="px-3 bg-white text-neutral-600 text-xs py-1.5 rounded-lg border hover:bg-neutral-50">
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setEditingCert({})} className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-neutral-300 rounded-lg text-xs text-neutral-500 hover:text-blue-600 hover:border-blue-300 transition-colors">
                            <Plus size={12} /> Aggiungi Certificazione
                          </button>
                        )}
                      </>
                    )}

                    {/* DOCUMENTI SOCIETARI */}
                    {section.id === 'documenti' && (
                      <>
                        {(profile.societalDocuments || []).map((doc, i) => {
                          const isDocExpired = doc.expiryDate && new Date(doc.expiryDate) < new Date();
                          return (
                            <div key={i} className={`flex items-start justify-between p-3 rounded-lg border ${isDocExpired ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-neutral-50'}`}>
                              <div className="flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-neutral-700">{doc.label || doc.type}</span>
                                  <span className="text-xs text-neutral-400 bg-neutral-200 px-1.5 py-0.5 rounded-full">{doc.type}</span>
                                </div>
                                {doc.value && <p className="text-xs text-neutral-600 mt-0.5">{doc.value}</p>}
                                {doc.expiryDate && (
                                  <p className={`text-xs mt-0.5 font-medium ${isDocExpired ? 'text-red-600' : 'text-neutral-500'}`}>
                                    Scade: {new Date(doc.expiryDate).toLocaleDateString('it-IT')}
                                    {isDocExpired && ' ⚠ SCADUTO'}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => updateField('societalDocuments', (profile.societalDocuments || []).filter((_, idx) => idx !== i))}
                                className="ml-2 text-neutral-400 hover:text-red-500"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          );
                        })}

                        {editingDoc !== null ? (
                          <div className="p-3 border border-blue-200 rounded-lg bg-blue-50 space-y-2">
                            <p className="text-xs font-semibold text-blue-800">Nuovo Documento</p>
                            <select
                              value={editingDoc.type || ''}
                              onChange={e => setEditingDoc(d => ({ ...d!, type: e.target.value as any, label: e.target.value }))}
                              className="w-full text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none"
                            >
                              <option value="">Seleziona tipo...</option>
                              <option value="DURC">DURC (Regolarità Contributiva)</option>
                              <option value="CCIAA">Iscrizione Camera di Commercio</option>
                              <option value="SOA">Attestazione SOA</option>
                              <option value="VISURA">Visura Camerale</option>
                              <option value="BILANCIO">Bilancio / Stato Patrimoniale</option>
                              <option value="REFERENZA">Referenza PA</option>
                            </select>
                            <input type="text" placeholder="Valore / Numero"
                              value={editingDoc.value || ''}
                              onChange={e => setEditingDoc(d => ({ ...d!, value: e.target.value }))}
                              className="w-full text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none"
                            />
                            <div>
                              <label className="text-xs text-neutral-500">Data Scadenza (se applicabile)</label>
                              <input type="date" value={editingDoc.expiryDate || ''}
                                onChange={e => setEditingDoc(d => ({ ...d!, expiryDate: e.target.value }))}
                                className="w-full text-xs border border-blue-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={addDoc} className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-blue-700">Aggiungi</button>
                              <button onClick={() => setEditingDoc(null)} className="px-3 bg-white text-neutral-600 text-xs py-1.5 rounded-lg border">
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setEditingDoc({})} className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-neutral-300 rounded-lg text-xs text-neutral-500 hover:text-blue-600 hover:border-blue-300 transition-colors">
                            <Plus size={12} /> Aggiungi Documento
                          </button>
                        )}
                      </>
                    )}

                    {/* FATTURATO */}
                    {section.id === 'fatturato' && (
                      <>
                        <p className="text-xs text-neutral-500">Fatturato ultimi esercizi (usato per verifica requisiti di gara)</p>
                        {(profile.turnover || []).map((t, i) => (
                          <div key={i} className="p-3 border border-neutral-200 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-neutral-700">Esercizio {t.year}</span>
                              <button
                                onClick={() => updateField('turnover', (profile.turnover || []).filter((_, idx) => idx !== i))}
                                className="text-neutral-400 hover:text-red-500"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-neutral-400">Fatturato Totale (€)</label>
                                <input type="number" value={t.totalRevenue}
                                  onChange={e => {
                                    const upd = [...(profile.turnover || [])];
                                    upd[i] = { ...upd[i], totalRevenue: parseFloat(e.target.value) };
                                    updateField('turnover', upd);
                                  }}
                                  className="w-full text-xs border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-neutral-400">di cui con PA (€)</label>
                                <input type="number" value={t.paRevenue}
                                  onChange={e => {
                                    const upd = [...(profile.turnover || [])];
                                    upd[i] = { ...upd[i], paRevenue: parseFloat(e.target.value) };
                                    updateField('turnover', upd);
                                  }}
                                  className="w-full text-xs border border-neutral-200 rounded-lg px-2 py-1.5 focus:outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        <button onClick={addTurnover} className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-neutral-300 rounded-lg text-xs text-neutral-500 hover:text-blue-600 hover:border-blue-300 transition-colors">
                          <Plus size={12} /> Aggiungi Esercizio
                        </button>

                        <div className="mt-3 pt-3 border-t border-neutral-100">
                          <p className="text-xs font-medium text-neutral-700 mb-2">Referenze PA</p>
                          {(profile.paReferences || []).map((ref, i) => (
                            <div key={i} className="p-2 border border-neutral-200 rounded-lg mb-2 text-xs text-neutral-600">
                              <div className="flex justify-between items-start">
                                <span className="font-medium">{ref.authority}</span>
                                <button onClick={() => updateField('paReferences', (profile.paReferences || []).filter((_, idx) => idx !== i))} className="text-neutral-400 hover:text-red-500 ml-2">
                                  <Trash2 size={10} />
                                </button>
                              </div>
                              <div>{ref.description} — €{ref.value?.toLocaleString('it-IT')} ({ref.year})</div>
                            </div>
                          ))}
                          <button
                            onClick={() => updateField('paReferences', [...(profile.paReferences || []), { authority: '', description: '', value: 0, year: new Date().getFullYear() - 1 }])}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-dashed border-neutral-300 rounded-lg text-xs text-neutral-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                          >
                            <Plus size={12} /> Aggiungi Referenza
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
