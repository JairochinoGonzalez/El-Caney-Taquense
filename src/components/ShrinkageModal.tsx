import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
  User,
  X,
} from 'lucide-react';
import {
  CalendarEvent,
  Product,
  ShrinkageOrigin,
  ShrinkageReason,
  UserRole,
} from '../types';
import {
  formatBs,
  formatStockReadable,
  formatUsd,
} from '../utils/formatters';

export const SHRINKAGE_REASONS: ShrinkageReason[] = [
  'Botella partida en servicio',
  'Reventada en congelador',
  'Producto defectuoso / malo',
  'Otro',
];

interface ShrinkageModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  bcvRate: number;
  origin: ShrinkageOrigin;
  activeEvent?: CalendarEvent | null;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  showCostPreview: boolean;
  initialProductId?: string;
  onSubmit: (params: {
    productId: string;
    quantityUnits: number;
    reason: ShrinkageReason;
    observation?: string;
    origin: ShrinkageOrigin;
    eventId?: string;
    eventName?: string;
  }) => Promise<void>;
}

export const ShrinkageModal: React.FC<ShrinkageModalProps> = ({
  isOpen,
  onClose,
  products,
  bcvRate,
  origin,
  activeEvent,
  userName,
  userEmail,
  userRole,
  showCostPreview,
  initialProductId,
  onSubmit,
}) => {
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [reason, setReason] = useState<ShrinkageReason | ''>('');
  const [observation, setObservation] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const availableProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.presentation || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if ((b.stockUnits > 0 ? 1 : 0) !== (a.stockUnits > 0 ? 1 : 0)) {
          return b.stockUnits > 0 ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });
  }, [products, search]);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setQuantityInput('1');
    setReason(
      origin === 'evento'
        ? 'Botella partida en servicio'
        : 'Reventada en congelador'
    );
    setObservation('');
    setErrorMsg(null);
    setIsSaving(false);

    if (initialProductId && products.some((p) => p.id === initialProductId)) {
      setSelectedProductId(initialProductId);
    } else {
      const firstWithStock =
        products.find((p) => p.stockUnits > 0) || products[0];
      setSelectedProductId(firstWithStock?.id || '');
    }
  }, [isOpen, initialProductId, origin, products]);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const maxStock = selectedProduct ? Math.max(0, selectedProduct.stockUnits) : 0;
  const parsedQty = Math.max(0, Math.floor(Number(quantityInput) || 0));
  const estimatedLossUsd =
    selectedProduct && parsedQty > 0
      ? Number((parsedQty * selectedProduct.costUnitUsd).toFixed(2))
      : 0;
  const estimatedLossBs = Number((estimatedLossUsd * bcvRate).toFixed(2));

  const nowLabel = new Date().toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleAdjustQty = (delta: number) => {
    const next = Math.max(1, Math.min(maxStock || 1, (parsedQty || 0) + delta));
    setQuantityInput(String(next));
    setErrorMsg(null);
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedProduct) {
      setErrorMsg('Selecciona un producto del inventario.');
      return;
    }
    if (selectedProduct.stockUnits <= 0) {
      setErrorMsg('Este producto no tiene stock disponible para descontar.');
      return;
    }
    if (!parsedQty || parsedQty < 1) {
      setErrorMsg('Indica una cantidad válida (mínimo 1 unidad).');
      return;
    }
    if (parsedQty > selectedProduct.stockUnits) {
      setErrorMsg(
        `No puedes descontar ${parsedQty} unidades porque solo hay ${selectedProduct.stockUnits} en stock.`
      );
      return;
    }
    if (!reason) {
      setErrorMsg('Selecciona obligatoriamente un motivo de la merma o rotura.');
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        productId: selectedProduct.id,
        quantityUnits: parsedQty,
        reason,
        observation: observation.trim() || undefined,
        origin,
        eventId: origin === 'evento' ? activeEvent?.id : undefined,
        eventName: origin === 'evento' ? activeEvent?.name : undefined,
      });
      onClose();
    } catch {
      setErrorMsg(
        'No se pudo registrar la merma. Verifica tu conexión e intenta nuevamente.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#EA580C] to-[#DC2626] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <AlertOctagon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-base sm:text-lg leading-tight truncate">
                {origin === 'evento'
                  ? 'Registrar Merma / Rotura'
                  : 'Registrar Merma / Baja de Stock'}
              </h3>
              <p className="text-xs text-orange-100 truncate">
                {origin === 'evento' && activeEvent
                  ? `Vinculado al evento: ${activeEvent.name}`
                  : 'Inventario General · Pérdida fuera de evento'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de merma"
            className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-white/80 hover:bg-white/15 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleConfirm}
          className="p-5 space-y-4 overflow-y-auto text-[#0F172A]"
        >
          {/* Accounting Guarantee Notice */}
          <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-950 flex items-start gap-2.5">
            <AlertOctagon className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />
            <div>
              <strong>Baja directa de inventario ($0.00 en caja):</strong>{' '}
              Descuenta el stock disponible de inmediato sin sumar dinero a
              ventas ni descuadrar el cierre de caja.
            </div>
          </div>

          {/* Product Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#0F172A]">
              1. Producto afectado *
            </label>
            {products.length > 6 && (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar producto por nombre..."
                  className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-slate-50 border border-[#CBD5E1] rounded-xl text-xs text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                />
              </div>
            )}
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setQuantityInput('1');
                setErrorMsg(null);
              }}
              className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#CBD5E1] rounded-xl text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
              required
            >
              {availableProducts.length === 0 ? (
                <option value="">Sin productos que coincidan</option>
              ) : (
                availableProducts.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={p.stockUnits <= 0}
                  >
                    {p.name}
                    {p.presentation ? ` (${p.presentation})` : ''} — Stock:{' '}
                    {p.stockUnits} unid.
                    {p.stockUnits <= 0 ? ' (Agotado)' : ''}
                  </option>
                ))
              )}
            </select>

            {selectedProduct && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-slate-500" />
                  Stock actual:{' '}
                  <strong className="text-[#0F172A] tabular-nums">
                    {formatStockReadable(
                      selectedProduct.stockUnits,
                      selectedProduct.unitType,
                      selectedProduct.caseSize
                    )}
                  </strong>
                </span>
                <span className="tabular-nums text-slate-500">
                  Quedarán:{' '}
                  <strong className="text-[#DC2626]">
                    {Math.max(0, selectedProduct.stockUnits - parsedQty)} unid.
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* Quantity Lost */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#0F172A]">
              2. Cantidad perdida (botellas / unidades) *
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAdjustQty(-1)}
                disabled={parsedQty <= 1}
                className="min-w-[44px] min-h-[44px] rounded-xl border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center text-[#0F172A]"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(1, maxStock)}
                value={quantityInput}
                onChange={(e) => {
                  setQuantityInput(e.target.value);
                  setErrorMsg(null);
                }}
                className="flex-1 min-h-[44px] px-3.5 py-2 text-center bg-white border border-[#CBD5E1] rounded-xl text-lg font-extrabold text-[#0F172A] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                required
              />
              <button
                type="button"
                onClick={() => handleAdjustQty(1)}
                disabled={parsedQty >= maxStock}
                className="min-w-[44px] min-h-[44px] rounded-xl border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center text-[#0F172A]"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mandatory Reason Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#0F172A]">
              3. Motivo de la pérdida (obligatorio) *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SHRINKAGE_REASONS.map((itemReason) => {
                const isSelected = reason === itemReason;
                return (
                  <button
                    key={itemReason}
                    type="button"
                    onClick={() => {
                      setReason(itemReason);
                      setErrorMsg(null);
                    }}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-red-50 border-[#DC2626] text-[#991B1B] shadow-xs'
                        : 'bg-white border-[#CBD5E1] text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{itemReason}</span>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-[#DC2626] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Observation */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#0F172A]">
              4. Observación breve (opcional)
            </label>
            <input
              type="text"
              maxLength={300}
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Ej: Se partió al destapar en barra, o congelador #2..."
              className="w-full min-h-[42px] px-3.5 py-2 bg-white border border-[#CBD5E1] rounded-xl text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
            />
          </div>

          {/* Cost Loss Preview (Admin Only) */}
          {showCostPreview && selectedProduct && parsedQty > 0 && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#991B1B]">
                  Pérdida estimada al costo
                </div>
                <div className="text-xs text-red-800 tabular-nums mt-0.5">
                  {parsedQty} unid. × {formatUsd(selectedProduct.costUnitUsd)} costo unit.
                </div>
              </div>
              <div className="text-right tabular-nums shrink-0">
                <div className="font-extrabold text-xl text-[#DC2626]">
                  -{formatUsd(estimatedLossUsd)}
                </div>
                <div className="text-[11px] font-semibold text-red-700">
                  {formatBs(estimatedLossBs)}
                </div>
              </div>
            </div>
          )}

          {/* Auto Metadata Footer */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1.5 truncate">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">Registro: {nowLabel}</span>
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                Por: <strong>{userName}</strong> ({userRole})
              </span>
            </div>
            <div className="sm:col-span-2 text-slate-500 truncate">
              Origen:{' '}
              <strong className="text-[#0F172A]">
                {origin === 'evento' && activeEvent
                  ? `Evento · ${activeEvent.name}`
                  : 'Inventario General'}
              </strong>{' '}
              · {userEmail}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-[#DC2626]">
              {errorMsg}
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || !selectedProduct || maxStock <= 0}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#EA580C] to-[#DC2626] hover:from-[#C2410C] hover:to-[#B91C1C] disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2 transition-colors shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <AlertOctagon className="w-4 h-4" />
                  Confirmar Baja de Stock ($0.00)
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
