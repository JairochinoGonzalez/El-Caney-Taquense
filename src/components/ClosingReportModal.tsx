import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Download,
  Gift,
  Package,
  Printer,
  X,
} from 'lucide-react';
import { ClosedShift } from '../types';
import {
  formatBs,
  formatDateSpanish,
  formatStockReadable,
  formatTime,
  formatUsd,
  getPaymentLabel,
} from '../utils/formatters';
import { downloadClosingShiftPdf } from '../utils/pdfGenerator';

interface ClosingReportModalProps {
  shift: ClosedShift;
  onClose: () => void;
}

export const ClosingReportModal: React.FC<ClosingReportModalProps> = ({
  shift,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl border border-[#E2E8F0] shadow-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0F172A] text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-6 h-6 text-[#10B981] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display font-bold text-lg truncate">
                Cierre de Caja Consolidado
              </h2>
              <p className="text-xs text-slate-300 truncate">
                {shift.eventName} · {formatDateSpanish(shift.eventDate)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar reporte"
            className="min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Mobile-Readable Body (Large high-contrast typography) */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-[#0F172A]">
          {/* Event Time & Attendance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0]">
            <div>
              <div className="text-xs text-slate-500 font-medium">Apertura</div>
              <div className="font-bold text-base tabular-nums mt-0.5">
                {formatTime(shift.openedAt)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Cierre</div>
              <div className="font-bold text-base tabular-nums mt-0.5">
                {formatTime(shift.closedAt)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">
                {shift.eventType === 'fiesta'
                  ? 'Asistentes Taquilla'
                  : 'Modalidad'}
              </div>
              <div className="font-bold text-base tabular-nums mt-0.5">
                {shift.eventType === 'fiesta'
                  ? `${shift.totalAttendees} personas`
                  : shift.eventSubType || 'Evento Privado'}
              </div>
            </div>
          </div>

          {/* Grand Total */}
          <div className="p-5 rounded-xl bg-[#ECFDF5] border border-[#10B981]/40">
            <div className="text-xs font-bold uppercase tracking-wider text-[#065F46]">
              Total Recaudado en la Noche
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-extrabold text-3xl sm:text-4xl text-[#0F172A] tabular-nums">
                {formatUsd(shift.totalRevenueUsd)}
              </span>
              <span className="font-bold text-xl text-[#1D4ED8] tabular-nums">
                {formatBs(shift.totalRevenueBs)}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-[#10B981]/25 flex flex-wrap gap-6 text-sm">
              {shift.eventType === 'fiesta' && (
                <div>
                  <span className="text-slate-600">Taquilla: </span>
                  <span className="font-bold tabular-nums">
                    {formatUsd(shift.taquillaUsd)}
                  </span>
                </div>
              )}
              <div>
                <span className="text-slate-600">Barra y Bebidas: </span>
                <span className="font-bold tabular-nums">
                  {formatUsd(shift.barraUsd)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Methods Breakdown */}
          <div>
            <h3 className="font-display font-bold text-base text-[#0F172A] mb-3">
              Desglose por Método de Pago
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white">
                <div className="text-xs font-medium text-slate-500">
                  Efectivo USD en Gaveta
                </div>
                <div className="font-bold text-xl text-[#0F172A] tabular-nums mt-1">
                  {formatUsd(shift.cashUsdTotal)}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white">
                <div className="text-xs font-medium text-slate-500">
                  Zelle Recibido
                </div>
                <div className="font-bold text-xl text-[#0F172A] tabular-nums mt-1">
                  {formatUsd(shift.zelleUsdTotal)}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white">
                <div className="text-xs font-medium text-slate-500">
                  Bolívares en Banco (P. Móvil / Punto)
                </div>
                <div className="font-bold text-lg text-[#1D4ED8] tabular-nums mt-1">
                  {formatBs(
                    shift.pagoMovilBsTotal + (shift.tarjetaBsTotal || 0)
                  )}
                </div>
                {(shift.tarjetaBsTotal || 0) > 0 && (
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    PM: {formatBs(shift.pagoMovilBsTotal)} · Punto:{' '}
                    {formatBs(shift.tarjetaBsTotal || 0)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Products Sold */}
          <div>
            <h3 className="font-display font-bold text-base text-[#0F172A] mb-2.5">
              Productos Vendidos (Barra)
            </h3>
            {shift.productsSold.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">
                No se registraron ventas de barra en este turno.
              </p>
            ) : (
              <div className="border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
                {shift.productsSold.map((prod) => (
                  <div
                    key={prod.name}
                    className="px-4 py-3 flex items-center justify-between gap-4 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-[#0F172A]">
                        {prod.name}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                        {prod.casesSold > 0
                          ? `${prod.casesSold} Cajas (${prod.caseSize || 36}u) + ${prod.looseUnitsSold} sueltas (${prod.totalUnitsSold} unid.)`
                          : `${prod.totalUnitsSold} unidades`}
                      </div>
                    </div>
                    <div className="font-bold text-base tabular-nums">
                      {formatUsd(prod.revenueUsd)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cortesías */}
          <div>
            <h3 className="font-display font-bold text-base text-[#6366F1] flex items-center gap-2 mb-2.5">
              <Gift className="w-4 h-4" />
              Cortesías y Consumo Interno ({shift.courtesies.length})
            </h3>
            {shift.courtesies.length === 0 ? (
              <p className="text-sm text-slate-500">
                Sin cortesías registradas.
              </p>
            ) : (
              <div className="space-y-2">
                {shift.courtesies.map((cort) => (
                  <div
                    key={cort.id}
                    className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-sm"
                  >
                    <div className="font-semibold text-[#0F172A]">
                      {formatTime(cort.timestamp)} · {cort.recipient}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Motivo: {cort.reason}
                    </div>
                    <div className="text-xs font-medium text-indigo-800 mt-1">
                      {cort.items
                        .map((i) => `${i.quantity}x ${i.name}`)
                        .join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mermas y Roturas ($ pérdida al costo) */}
          {(() => {
            const eventShrinkages = shift.shrinkages || [];
            const totalLossUsd =
              shift.shrinkageLossUsd !== undefined
                ? shift.shrinkageLossUsd
                : eventShrinkages.reduce((sum, s) => sum + s.totalLossCostUsd, 0);
            const totalUnits =
              shift.shrinkageUnitsTotal !== undefined
                ? shift.shrinkageUnitsTotal
                : eventShrinkages.reduce((sum, s) => sum + s.quantityUnits, 0);

            return (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <h3 className="font-display font-bold text-base text-[#EA580C] flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4" />
                    Mermas y Roturas ({totalUnits} unid.)
                  </h3>
                  <span className="px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-xs font-extrabold text-[#C2410C] tabular-nums">
                    Pérdida al costo: {formatUsd(totalLossUsd)}
                  </span>
                </div>

                {eventShrinkages.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Sin mermas ni roturas registradas en este evento ($0.00).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {eventShrinkages.map((sh) => (
                      <div
                        key={sh.id}
                        className="p-3.5 rounded-xl bg-orange-50/80 border border-orange-200 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-[#0F172A]">
                            {sh.quantityUnits}× {sh.productName}
                            {sh.productPresentation
                              ? ` (${sh.productPresentation})`
                              : ''}
                          </div>
                          <span className="font-extrabold text-[#C2410C] tabular-nums shrink-0">
                            -{formatUsd(sh.totalLossCostUsd)}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-orange-900 mt-0.5">
                          Motivo: {sh.reason}
                        </div>
                        {sh.observation && (
                          <div className="text-xs text-slate-700 mt-0.5">
                            Obs.: {sh.observation}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 mt-1">
                          {formatTime(sh.timestamp)} · Registró:{' '}
                          {sh.recordedByName} · $0.00 en caja
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Auditoría de Ventas Suspendidas */}
          <div>
            <h3 className="font-display font-bold text-base text-[#EF4444] flex items-center gap-2 mb-2.5">
              <AlertTriangle className="w-4 h-4" />
              Auditoría: Ventas Suspendidas ({shift.suspendedSales.length})
            </h3>
            {shift.suspendedSales.length === 0 ? (
              <p className="text-sm text-slate-500">
                Sin ventas suspendidas en este turno.
              </p>
            ) : (
              <div className="space-y-2">
                {shift.suspendedSales.map((susp) => (
                  <div
                    key={susp.id}
                    className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold text-red-800">
                      <span>
                        {formatTime(susp.suspendedAt || susp.timestamp)} ·{' '}
                        {getPaymentLabel(susp.paymentMethod)}
                      </span>
                      <span className="tabular-nums">
                        {formatUsd(susp.totalUsd)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 mt-1">
                      {susp.items
                        .map((i) => `${i.quantity}x ${i.name}`)
                        .join(', ')}
                    </div>
                    <div className="text-xs font-medium text-red-900 mt-1">
                      Nota: {susp.suspendReason}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Remaining Cave Stock */}
          <div>
            <h3 className="font-display font-bold text-base text-[#0F172A] flex items-center gap-2 mb-2.5">
              <Package className="w-4 h-4" />
              Inventario Restante en Cava
            </h3>
            <div className="border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
              {shift.remainingStock.map((item) => (
                <div
                  key={item.productId}
                  className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm"
                >
                  <span className="font-medium text-[#0F172A]">
                    {item.name}
                  </span>
                  <span className="text-xs sm:text-sm text-slate-700 tabular-nums text-right">
                    {formatStockReadable(
                      item.stockUnits,
                      item.unitType,
                      item.caseSize
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F172A] hover:bg-slate-100 flex items-center gap-2 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>

          <div className="flex flex-wrap items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={() => downloadClosingShiftPdf(shift)}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 text-white text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
