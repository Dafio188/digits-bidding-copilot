// CompanyProfilePanel.tsx — Profilo aziendale completo con certificazioni e documenti societari
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Award, FileText, TrendingUp, Plus, Trash2, Save,
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Edit3, X,
  Users, UserPlus, Shield, ToggleLeft, ToggleRight
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

interface AppUser {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

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

  // Stato gestione utenti e credenziali di accesso
  const [users, setUsers] = useState<AppUser[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'operatore' | 'admin'>('operatore');
  const [userActionMsg, setUserActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Errore fetch users:", err);
    }
  };

  useEffect(() => {
    fetch('/api/company-profile')
      .then(r => r.json())
      .then(data => {
        setProfile({ ...EMPTY_PROFILE, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newUserRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setUserActionMsg({ text: `✅ Profilo "${newUsername}" creato con successo!`, type: 'success' });
        setNewUsername('');
        setNewPassword('');
        fetchUsers();
      } else {
        setUserActionMsg({ text: `⚠️ ${data.error || 'Errore nella creazione dell\'utente'}`, type: 'error' });
      }
    } catch (err) {
      setUserActionMsg({ text: '⚠️ Errore di connessione', type: 'error' });
    }
    setTimeout(() => setUserActionMsg(null), 4000);
  };

  const handleToggleUser = async (user: AppUser) => {
    try {
      const res = await fetch(`/api/users/${user.id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (res.ok) {
        setUserActionMsg({
          text: `Stato di ${user.username} impostato su: ${!user.isActive ? 'ATTIVO 🟢' : 'DISABILITATO 🔴'}`,
          type: 'success'
        });
        fetchUsers();
      }
    } catch (err) {
      setUserActionMsg({ text: '⚠️ Impossibile aggiornare lo stato', type: 'error' });
    }
    setTimeout(() => setUserActionMsg(null), 3000);
  };

  const handleDeleteUser = async (id: number, uname: string) => {
    if (!confirm(`Sei sicuro di voler eliminare definitivamente il profilo di accesso "${uname}"?`)) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setUserActionMsg({ text: `Profilo ${uname} eliminato.`, type: 'success' });
        fetchUsers();
      }
    } catch (err) {
      setUserActionMsg({ text: '⚠️ Errore durante l\'eliminazione', type: 'error' });
    }
    setTimeout(() => setUserActionMsg(null), 3000);
  };

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
    { id: 'utenti', label: 'Accessi & Profili Utente (Abilita/Disabilita)', icon: Users },
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

                    {section.id === 'utenti' && (
                      <div className="space-y-4">
                        {userActionMsg && (
                          <div className={`p-2.5 rounded-xl text-xs font-semibold ${userActionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                            {userActionMsg.text}
                          </div>
                        )}

                        {/* Modulo Aggiunta Nuovo Utente */}
                        <form onSubmit={handleCreateUser} className="p-3 bg-neutral-100/60 rounded-xl border border-neutral-200/70 flex flex-col gap-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                              <UserPlus size={13} className="text-blue-600" />
                              Crea Nuovo Profilo di Accesso
                            </span>
                            <span className="text-[10px] text-neutral-400">Potrai disabilitarlo in qualsiasi momento</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] font-semibold text-neutral-500 mb-0.5 block">Email / Username</label>
                              <input 
                                type="text"
                                placeholder="es. operatore@digits.it"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                required
                                className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 bg-white"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-neutral-500 mb-0.5 block">Password (min. 6 car.)</label>
                              <input 
                                type="password"
                                placeholder="••••••••"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 bg-white"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-neutral-500 mb-0.5 block">Ruolo</label>
                              <select 
                                value={newUserRole}
                                onChange={(e: any) => setNewUserRole(e.target.value)}
                                className="w-full text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 bg-white"
                              >
                                <option value="operatore">Operatore (Gestione Gare)</option>
                                <option value="admin">Amministratore</option>
                              </select>
                            </div>
                          </div>

                          <button 
                            type="submit"
                            className="btn-primary text-xs py-1.5 px-3 self-end font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus size={12} />
                            <span>Crea Profilo</span>
                          </button>
                        </form>

                        {/* Elenco Utenti & Switch Toggle */}
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Profili Registrati ({users.length})</div>
                          {users.length === 0 ? (
                            <div className="text-center py-4 text-xs text-neutral-400 bg-neutral-50 rounded-xl border border-neutral-100">
                              Nessun profilo aggiuntivo creato oltre all'amministratore master.
                            </div>
                          ) : (
                            users.map(u => (
                              <div 
                                key={u.id}
                                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                  u.isActive 
                                    ? 'bg-white border-neutral-200 shadow-xs' 
                                    : 'bg-neutral-50/80 border-neutral-200 opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${u.isActive ? 'bg-blue-100 text-blue-700' : 'bg-neutral-200 text-neutral-500'}`}>
                                    <Shield size={14} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-neutral-800 truncate">{u.username}</span>
                                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600 border border-neutral-200/50 uppercase">
                                        {u.role}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-neutral-400">
                                      {u.isActive ? (
                                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                                          Accesso Abilitato
                                        </span>
                                      ) : (
                                        <span className="text-red-500 font-semibold flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"></span>
                                          Accesso Disabilitato (Bloccato)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 select-none">
                                  {/* Toggle Switch */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleUser(u)}
                                    title={u.isActive ? "Clicca per disabilitare questo profilo" : "Clicca per abilitare questo profilo"}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer focus:outline-none ${
                                      u.isActive ? 'bg-emerald-500' : 'bg-neutral-300'
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                                        u.isActive ? 'translate-x-6' : 'translate-x-1'
                                      }`}
                                    />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                    title="Elimina profilo"
                                    className="p-1.5 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
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
