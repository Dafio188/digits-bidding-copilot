// QuickMatchModal.tsx — Modal per associare/inserire prodotti ai lotti non trovati nel listino
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Plus, Sparkles, Package, Euro, TrendingUp, CheckCircle2 } from 'lucide-react';
import type { Product, OfferItem } from '../types';

interface Props {
  isOpen: boolean;
  lottoId: number;
  lottoDescription: string;
  requiredSpecs?: string;
  requiredQty: number;
  currentProducts: Product[];
  onClose: () => void;
  onMatch: (product: Product, isOneShot: boolean) => void;
  onAddPermanent: (product: Product) => void;
}

const EMPTY_PRODUCT: Omit<Product, 'id'> = {
  codeOEM: '',
  description: '',
  brand: '',
  costPrice: 0,
  retailPrice: 0,
  stock: 0,
};

export function QuickMatchModal({
  isOpen, lottoId, lottoDescription, requiredSpecs, requiredQty,
  currentProducts, onClose, onMatch, onAddPermanent
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<'search' | 'manual'>('search');
  const [aiSuggestions, setAiSuggestions] = useState<Product[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [newProduct, setNewProduct] = useState<Omit<Product, 'id'>>(EMPTY_PRODUCT);
  const [saveMode, setSaveMode] = useState<'permanent' | 'oneshot'>('permanent');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [overridePrice, setOverridePrice] = useState<number | null>(null);

  // Filtra listino locale
  const filteredProducts = currentProducts.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.description.toLowerCase().includes(q) ||
      p.codeOEM.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q)
    );
  });

  // Suggerimenti AI al mount
  useEffect(() => {
    if (!isOpen) return;
    setLoadingAI(true);
    fetch('/api/suggest-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lottoDescription,
        requiredSpecs,
        currentProducts,
      }),
    })
      .then(r => r.json())
      .then(data => setAiSuggestions(data.suggestions || []))
      .catch(() => {})
      .finally(() => setLoadingAI(false));
  }, [isOpen, lottoDescription]);

  const handleConfirmProduct = (product: Product) => {
    const p = overridePrice !== null
      ? { ...product, retailPrice: overridePrice }
      : product;
    onMatch(p, saveMode === 'oneshot');
    if (saveMode === 'permanent') onAddPermanent(p);
    onClose();
  };

  const handleAddManual = () => {
    if (!newProduct.description || !newProduct.retailPrice) return;
    const product: Product = {
      id: `manual-${Date.now()}`,
      ...newProduct,
      isTenderSpecific: saveMode === 'oneshot',
    };
    handleConfirmProduct(product);
  };

  const calcMargin = (cost: number, price: number) => {
    if (!price) return 0;
    return Math.round(((price - cost) / price) * 100);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed inset-x-4 top-10 bottom-10 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[680px] bg-white rounded-2xl shadow-2xl border border-neutral-200 z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-neutral-100 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Associa Prodotto al Lotto</h3>
                  <p className="text-xs text-neutral-600 mt-1 max-w-lg">
                    <span className="font-medium text-blue-700">Lotto {lottoId}:</span> {lottoDescription}
                  </p>
                  {requiredSpecs && (
                    <p className="text-xs text-neutral-500 mt-0.5">📋 {requiredSpecs}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      Qtà richiesta: {requiredQty}
                    </span>
                  </div>
                </div>
                <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition-colors mt-1">
                  <X size={18} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-4 bg-white/70 rounded-xl p-1 border border-neutral-200">
                <button
                  onClick={() => setTab('search')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === 'search' ? 'bg-white shadow text-blue-700' : 'text-neutral-500 hover:text-neutral-700'}`}
                >
                  <Search size={12} /> Cerca nel Listino
                </button>
                <button
                  onClick={() => setTab('manual')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === 'manual' ? 'bg-white shadow text-blue-700' : 'text-neutral-500 hover:text-neutral-700'}`}
                >
                  <Plus size={12} /> Inserimento Manuale
                </button>
              </div>
            </div>

            {/* Corpo scrollabile */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {tab === 'search' && (
                <>
                  {/* Suggerimenti AI */}
                  {(loadingAI || aiSuggestions.length > 0) && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles size={13} className="text-purple-500" />
                        <span className="text-xs font-semibold text-purple-700">Suggerimenti AI</span>
                      </div>
                      {loadingAI ? (
                        <div className="h-16 bg-purple-50 rounded-xl animate-pulse" />
                      ) : (
                        <div className="space-y-2">
                          {aiSuggestions.map(p => (
                            <ProductCard
                              key={p.id} product={p}
                              requiredQty={requiredQty}
                              isSelected={selectedProduct?.id === p.id}
                              overridePrice={selectedProduct?.id === p.id ? overridePrice : null}
                              onOverridePrice={v => { setSelectedProduct(p); setOverridePrice(v); }}
                              onSelect={() => setSelectedProduct(p)}
                              highlighted
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ricerca libera */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Search size={13} className="text-neutral-500" />
                      <span className="text-xs font-semibold text-neutral-700">Tutti i Prodotti</span>
                    </div>
                    <div className="relative mb-3">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Cerca per descrizione, codice OEM, marca..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-xs border border-neutral-200 rounded-xl bg-neutral-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      {filteredProducts.length === 0 ? (
                        <p className="text-xs text-neutral-400 text-center py-4">Nessun prodotto trovato. Usa inserimento manuale.</p>
                      ) : (
                        filteredProducts.map(p => (
                          <ProductCard
                            key={p.id} product={p}
                            requiredQty={requiredQty}
                            isSelected={selectedProduct?.id === p.id}
                            overridePrice={selectedProduct?.id === p.id ? overridePrice : null}
                            onOverridePrice={v => { setSelectedProduct(p); setOverridePrice(v); }}
                            onSelect={() => setSelectedProduct(p)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              {tab === 'manual' && (
                <div className="space-y-3">
                  <p className="text-xs text-neutral-500">
                    Inserisci i dati del prodotto non presente nel listino. Il sistema calcolerà automaticamente il margine.
                  </p>
                  {[
                    { label: 'Codice OEM / Codice Fornitore *', field: 'codeOEM', type: 'text' },
                    { label: 'Descrizione completa del prodotto *', field: 'description', type: 'text' },
                    { label: 'Marca / Brand', field: 'brand', type: 'text' },
                  ].map(f => (
                    <div key={f.field}>
                      <label className="block text-xs text-neutral-600 mb-1">{f.label}</label>
                      <input
                        type={f.type}
                        value={(newProduct as any)[f.field] || ''}
                        onChange={e => setNewProduct(p => ({ ...p, [f.field]: e.target.value }))}
                        className="w-full text-xs border border-neutral-200 rounded-xl px-3 py-2 bg-neutral-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Costo Acquisto (€)', field: 'costPrice' },
                      { label: 'Prezzo Vendita (€) *', field: 'retailPrice' },
                      { label: 'Scorte a Magazzino', field: 'stock' },
                    ].map(f => (
                      <div key={f.field}>
                        <label className="block text-xs text-neutral-600 mb-1">{f.label}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={(newProduct as any)[f.field] || ''}
                          onChange={e => setNewProduct(p => ({ ...p, [f.field]: parseFloat(e.target.value) || 0 }))}
                          className="w-full text-xs border border-neutral-200 rounded-xl px-3 py-2 bg-neutral-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Preview margine */}
                  {newProduct.retailPrice > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                      <div className="text-center">
                        <p className="text-xs text-neutral-500">Totale offerta</p>
                        <p className="text-sm font-bold text-neutral-800">€{(newProduct.retailPrice * requiredQty).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="h-8 w-px bg-neutral-200" />
                      <div className="text-center">
                        <p className="text-xs text-neutral-500">Margine stimato</p>
                        <p className={`text-sm font-bold ${calcMargin(newProduct.costPrice, newProduct.retailPrice) > 20 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {calcMargin(newProduct.costPrice, newProduct.retailPrice)}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer con opzioni di salvataggio e conferma */}
            <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 space-y-3">
              {/* Opzione salvataggio */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 mr-1">Salva come:</span>
                <button
                  onClick={() => setSaveMode('permanent')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${saveMode === 'permanent' ? 'bg-blue-600 text-white' : 'bg-white border border-neutral-200 text-neutral-600'}`}
                >
                  Listino permanente
                </button>
                <button
                  onClick={() => setSaveMode('oneshot')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${saveMode === 'oneshot' ? 'bg-blue-600 text-white' : 'bg-white border border-neutral-200 text-neutral-600'}`}
                >
                  Solo questa gara
                </button>
              </div>

              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2 border border-neutral-200 rounded-xl text-xs text-neutral-600 hover:bg-neutral-100 transition-colors">
                  Annulla
                </button>
                <button
                  onClick={() => {
                    if (tab === 'manual') handleAddManual();
                    else if (selectedProduct) handleConfirmProduct(selectedProduct);
                  }}
                  disabled={tab === 'search' ? !selectedProduct : !newProduct.description || !newProduct.retailPrice}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 size={13} />
                  Usa questo prodotto
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Componente card singolo prodotto
function ProductCard({
  product, requiredQty, isSelected, overridePrice, onSelect, onOverridePrice, highlighted
}: {
  product: Product;
  requiredQty: number;
  isSelected: boolean;
  overridePrice: number | null;
  onSelect: () => void;
  onOverridePrice: (v: number | null) => void;
  highlighted?: boolean;
}) {
  const price = overridePrice ?? product.retailPrice;
  const total = price * requiredQty;
  const margin = price > 0 ? Math.round(((price - product.costPrice) / price) * 100) : 0;

  return (
    <motion.div
      onClick={onSelect}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`p-3 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
          : highlighted
          ? 'border-purple-200 bg-purple-50 hover:border-purple-400'
          : 'border-neutral-200 bg-white hover:border-blue-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Package size={11} className="text-neutral-400 shrink-0" />
            <span className="text-xs font-mono text-neutral-500">{product.codeOEM}</span>
            <span className="text-xs text-neutral-400">·</span>
            <span className="text-xs font-medium text-neutral-600">{product.brand}</span>
          </div>
          <p className="text-xs text-neutral-800 font-medium leading-snug">{product.description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-neutral-800">€{price.toFixed(2)}</p>
          <p className={`text-xs font-medium ${margin >= 20 ? 'text-emerald-600' : 'text-amber-600'}`}>
            +{margin}%
          </p>
        </div>
      </div>

      {/* Dettagli totale per qty */}
      <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
        <span>Scorte: {product.stock} pz</span>
        <span>Totale {requiredQty}x: <strong className="text-neutral-700">€{total.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong></span>
      </div>

      {/* Override prezzo se selezionato */}
      {isSelected && (
        <div className="mt-2 pt-2 border-t border-blue-200 flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <Euro size={12} className="text-blue-500 shrink-0" />
          <input
            type="number"
            placeholder={`Prezzo override (default: ${product.retailPrice})`}
            value={overridePrice ?? ''}
            onChange={e => onOverridePrice(e.target.value ? parseFloat(e.target.value) : null)}
            className="flex-1 text-xs border border-blue-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {overridePrice !== null && (
            <button onClick={() => onOverridePrice(null)} className="text-neutral-400 hover:text-neutral-600">
              <X size={10} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
