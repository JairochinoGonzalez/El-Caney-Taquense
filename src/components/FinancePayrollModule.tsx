import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ChevronDown,
  DollarSign,
  Download,
  Lock,
  Package,
  Plus,
  RotateCcw,
  Trash2,
  TrendingUp,
  Unlock,
  Users,
} from 'lucide-react';
import {
  BcvRateState,
  CalendarEvent,
  ClosedShift,
  EmployeeRole,
  PayrollRecord,
  Product,
  SaleRecord,
  ShrinkageOrigin,
  ShrinkageRecord,
  StaffUserAccount,
  StockRestockRecord,
  UserRole,
} from '../types';
import {
  addDaysISO,
  formatBs,
  formatDateSpanish,
  formatTime,
  formatUsd,
  getTodayISO,
} from '../utils/formatters';
import { downloadClosingShiftPdf } from '../utils/pdfGenerator';
import { SHRINKAGE_REASONS } from './ShrinkageModal';

type DateRangePreset = 'today' | 'weekend' | 'month' | 'custom';

interface FinancePayrollModuleProps {
  bcvState: BcvRateState;
  exchangeBufferBs: number;
  onChangeExchangeBuffer: (newBuffer: number) => void;
  activeParty: CalendarEvent | null;
  products: Product[];
  sales: SaleRecord[];
  closedShifts: ClosedShift[];
  payroll: PayrollRecord[];
  restocks: StockRestockRecord[];
  shrinkages: ShrinkageRecord[];
  staffUsers: StaffUserAccount[];
  onAddPayroll: (record: Omit<PayrollRecord, 'id'>) => void;
  onDeletePayroll: (id: string) => void;
  onDeleteShrinkage: (shrinkageId: string, restoreStock?: boolean) => void;
}

function mapUserRoleToEmployeeRole(role: UserRole): EmployeeRole {
  if (role === 'mesero') return 'Mesero';
  if (role === 'caja') return 'Cajero';
  if (role === 'taquilla') return 'Taquilla';
  return 'Administrador';
}

export const FinancePayrollModule: React.FC<FinancePayrollModuleProps> = ({
  bcvState,
  exchangeBufferBs,
  onChangeExchangeBuffer,
  activeParty,
  products,
  sales,
  closedShifts,
  payroll,
  restocks,
  shrinkages,
  staffUsers,
  onAddPayroll,
  onDeletePayroll,
  onDeleteShrinkage,
}) => {
  const todayIso = getTodayISO();
  const [rangePreset, setRangePreset] = useState<DateRangePreset>('month');
  const [shrinkageOriginFilter, setShrinkageOriginFilter] = useState<
    'all' | ShrinkageOrigin
  >('all');
  const [confirmVoidShrinkage, setConfirmVoidShrinkage] =
    useState<ShrinkageRecord | null>(null);
  const [customStart, setCustomStart] = useState<string>(
    addDaysISO(todayIso, -7)
  );
  const [customEnd, setCustomEnd] = useState<string>(todayIso);

  const [bufferDraft, setBufferDraft] = useState<string>(
    exchangeBufferBs.toFixed(2)
  );

  // Payroll Form
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState<EmployeeRole>('Mesero');
  const [empAmount, setEmpAmount] = useState('35.00');
  const [empDate, setEmpDate] = useState(todayIso);
  const [empNote, setEmpNote] = useState('');

  const handleSelectStaffMember = (staffId: string) => {
    setSelectedStaffId(staffId);
    setShowStaffDropdown(false);
    if (!staffId || staffId === 'manual') {
      if (staffId === 'manual') setEmpName('');
      return;
    }
    const found = staffUsers.find((u) => u.id === staffId);
    if (found) {
      setEmpName(found.name);
      setEmpRole(mapUserRoleToEmployeeRole(found.role));
    }
  };

  const filteredStaffOptions = useMemo(() => {
    const q = empName.trim().toLowerCase();
    const selectedUser = staffUsers.find((u) => u.id === selectedStaffId);
    if (!q || (selectedUser && selectedUser.name.toLowerCase() === q)) {
      return staffUsers;
    }
    return staffUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        mapUserRoleToEmployeeRole(u.role).toLowerCase().includes(q)
    );
  }, [staffUsers, empName, selectedStaffId]);

  // Compute start & end ISO date bounds
  const { startDate, endDate } = useMemo(() => {
    if (rangePreset === 'today') {
      return { startDate: todayIso, endDate: todayIso };
    }
    if (rangePreset === 'weekend') {
      return { startDate: addDaysISO(todayIso, -3), endDate: todayIso };
    }
    if (rangePreset === 'month') {
      const [y, m] = todayIso.split('-');
      return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-31` };
    }
    return {
      startDate: customStart <= customEnd ? customStart : customEnd,
      endDate: customStart <= customEnd ? customEnd : customStart,
    };
  }, [rangePreset, todayIso, customStart, customEnd]);

  const inRange = (isoOrDate: string) => {
    const d = isoOrDate.slice(0, 10);
    return d >= startDate && d <= endDate;
  };

  // Combine closed shifts + currently active party live sales in range
  const filteredClosedShifts = useMemo(
    () => closedShifts.filter((s) => inRange(s.eventDate)),
    [closedShifts, startDate, endDate]
  );

  const activePartySalesInRange = useMemo(() => {
    if (!activeParty) return [];
    return sales.filter(
      (s) =>
        s.eventId === activeParty.id &&
        s.status === 'active' &&
        inRange(s.timestamp)
    );
  }, [activeParty, sales, startDate, endDate]);

  const financialSummary = useMemo(() => {
    // 1. From closed shifts
    let baseBcvUsd = filteredClosedShifts.reduce(
      (sum, s) => sum + s.baseBcvRevenueUsd,
      0
    );
    let surplusUsd = filteredClosedShifts.reduce(
      (sum, s) => sum + s.exchangeSurplusUsd,
      0
    );
    let surplusBs = filteredClosedShifts.reduce(
      (sum, s) => sum + s.exchangeSurplusBs,
      0
    );
    let cogsUsd = filteredClosedShifts.reduce((sum, s) => sum + s.cogsUsd, 0);

    // 2. Add live active party sales (so the owner in the USA sees real-time numbers!)
    for (const sale of activePartySalesInRange) {
      const usdDirect =
        sale.paymentBreakdown.efectivoUsd + sale.paymentBreakdown.zelleUsd;
      const bsPaid = sale.paymentBreakdown.bsAmount;
      const usdEquivalentChargedInBs =
        sale.effectiveRateAtSale > 0 ? bsPaid / sale.effectiveRateAtSale : 0;

      const extraBsFromBuffer =
        usdEquivalentChargedInBs * sale.bufferBsAtSale;
      const extraUsdFromBuffer =
        sale.bcvRateAtSale > 0 ? extraBsFromBuffer / sale.bcvRateAtSale : 0;

      baseBcvUsd += usdDirect + usdEquivalentChargedInBs;
      surplusBs += extraBsFromBuffer;
      surplusUsd += extraUsdFromBuffer;

      const saleCost = sale.items.reduce(
        (acc, item) => acc + item.unitCostUsd * item.quantity,
        0
      );
      cogsUsd += saleCost;
    }

    const grossUsd = baseBcvUsd + surplusUsd;

    const restockInvestmentUsd = restocks
      .filter((r) => inRange(r.date))
      .reduce((sum, r) => sum + r.totalCostUsd, 0);

    const payrollFiltered = payroll.filter((p) => inRange(p.date));
    const payrollTotalUsd = payrollFiltered.reduce(
      (sum, p) => sum + p.amountUsd,
      0
    );

    const shrinkagesFiltered = shrinkages.filter((s) => inRange(s.date));
    const shrinkageLossUsd = Number(
      shrinkagesFiltered
        .reduce((sum, s) => sum + s.totalLossCostUsd, 0)
        .toFixed(2)
    );
    const shrinkageUnitsTotal = shrinkagesFiltered.reduce(
      (sum, s) => sum + s.quantityUnits,
      0
    );
    const shrinkageEventUsd = Number(
      shrinkagesFiltered
        .filter((s) => s.origin === 'evento')
        .reduce((sum, s) => sum + s.totalLossCostUsd, 0)
        .toFixed(2)
    );
    const shrinkageGeneralUsd = Number(
      shrinkagesFiltered
        .filter((s) => s.origin === 'inventario_general')
        .reduce((sum, s) => sum + s.totalLossCostUsd, 0)
        .toFixed(2)
    );

    const shrinkageByReason = SHRINKAGE_REASONS.map((reasonLabel) => {
      const items = shrinkagesFiltered.filter((s) => s.reason === reasonLabel);
      return {
        reason: reasonLabel,
        count: items.length,
        units: items.reduce((sum, s) => sum + s.quantityUnits, 0),
        lossUsd: Number(
          items.reduce((sum, s) => sum + s.totalLossCostUsd, 0).toFixed(2)
        ),
      };
    });

    const netProfitUsd =
      grossUsd - cogsUsd - shrinkageLossUsd - payrollTotalUsd;

    return {
      grossUsd,
      baseBcvUsd,
      surplusUsd,
      surplusBs,
      cogsUsd,
      restockInvestmentUsd,
      payrollTotalUsd,
      payrollFiltered,
      shrinkagesFiltered,
      shrinkageLossUsd,
      shrinkageUnitsTotal,
      shrinkageEventUsd,
      shrinkageGeneralUsd,
      shrinkageByReason,
      netProfitUsd,
    };
  }, [
    filteredClosedShifts,
    activePartySalesInRange,
    restocks,
    payroll,
    shrinkages,
    startDate,
    endDate,
  ]);

  const inventoryValuation = useMemo(() => {
    const costValueUsd = products.reduce(
      (sum, p) => sum + p.stockUnits * p.costUnitUsd,
      0
    );
    const retailValueUsd = products.reduce(
      (sum, p) => sum + p.stockUnits * p.priceUnitUsd,
      0
    );
    const potentialProfitUsd = retailValueUsd - costValueUsd;
    const totalUnits = products.reduce((sum, p) => sum + p.stockUnits, 0);
    return {
      costValueUsd,
      retailValueUsd,
      potentialProfitUsd,
      totalUnits,
    };
  }, [products]);

  const isBufferLocked = Boolean(activeParty);

  const handleApplyBuffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBufferLocked) return;
    const val = Math.max(0, parseFloat(bufferDraft) || 0);
    onChangeExchangeBuffer(Number(val.toFixed(2)));
  };

  const handleAddPayrollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) return;
    const amt = Math.max(0, parseFloat(empAmount) || 0);
    if (amt <= 0) return;

    onAddPayroll({
      employeeName: empName.trim(),
      role: empRole,
      amountUsd: amt,
      date: empDate,
      note: empNote.trim() || undefined,
    });
    setSelectedStaffId('');
    setEmpName('');
    setEmpNote('');
  };

  return (
    <div className="space-y-6">
      {/* Owner Header & Date Filter */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 w-full max-w-full min-w-0">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-[#1D4ED8]">
            Módulo Exclusivo del Dueño
          </div>
          <h2 className="font-display font-bold text-xl text-[#0F172A] mt-0.5">
            Finanzas, Margen BCV y Nómina
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Supervisión en tiempo real desde EE. UU. · Período:{' '}
            <span className="tabular-nums font-semibold text-[#0F172A]">
              {formatDateSpanish(startDate)} — {formatDateSpanish(endDate)}
            </span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full lg:w-auto min-w-0">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 p-1 bg-[#F8FAFC] border border-[#CBD5E1] shadow-xs rounded-xl w-full sm:w-auto">
            {(
              [
                ['today', 'Hoy'],
                ['weekend', 'Este Fin de Semana'],
                ['month', 'Este Mes'],
                ['custom', 'Personalizado'],
              ] as const
            ).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRangePreset(preset)}
                className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors text-center leading-tight flex items-center justify-center ${
                  rangePreset === preset
                    ? 'bg-[#1D4ED8] text-white'
                    : 'text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {rangePreset === 'custom' && (
            <div className="grid grid-cols-[1fr_auto_1fr] sm:flex items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full sm:w-auto min-w-0 min-h-[38px] px-2.5 border border-[#CBD5E1] shadow-xs rounded-lg text-xs tabular-nums bg-white"
              />
              <span className="text-xs text-slate-400 text-center">a</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full sm:w-auto min-w-0 min-h-[38px] px-2.5 border border-[#CBD5E1] shadow-xs rounded-lg text-xs tabular-nums bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* BCV Silent Exchange Margin Configurator (Locked when Fiesta is Active) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              {isBufferLocked ? (
                <Lock className="w-4 h-4 text-[#EF4444]" />
              ) : (
                <Unlock className="w-4 h-4 text-[#10B981]" />
              )}
              <h3 className="font-display font-bold text-base text-[#0F172A]">
                Ajuste Cambiario Silencioso Pre-Fiesta (Sobre Tasa BCV)
              </h3>
            </div>
            <p className="text-sm text-slate-600">
              Suma un margen opcional en Bolívares por cada dólar sobre la tasa
              oficial BCV (
              <span className="tabular-nums font-bold text-[#1D4ED8]">
                {formatBs(bcvState.officialRate)}/$
              </span>
              ). La caja calcula el total en Bs. de forma transparente sin
              mostrar recargos al cliente ni al cajero.
            </p>
            {isBufferLocked && (
              <p className="text-xs font-semibold text-[#EF4444] pt-1">
                Candado activo: hay una fiesta en curso ({activeParty?.name}).
                Este ajuste solo puede modificarse ANTES de encender la fiesta,
                hasta que se haga el cierre de caja.
              </p>
            )}
          </div>

          <form
            onSubmit={handleApplyBuffer}
            className="flex flex-wrap items-end gap-3 lg:shrink-0 w-full lg:w-auto"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Extra sobre BCV (Bs./$)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                disabled={isBufferLocked}
                value={bufferDraft}
                onChange={(e) => setBufferDraft(e.target.value)}
                className={`w-36 min-h-[44px] px-3.5 py-2 border rounded-xl font-bold text-base tabular-nums ${
                  isBufferLocked
                    ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-white border-[#CBD5E1] shadow-xs text-[#0F172A]'
                }`}
              />
            </div>

            <div className="px-4 py-2 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-[11px] font-semibold text-[#1D4ED8]">
                Tasa Interna en Caja
              </div>
              <div className="font-extrabold text-base text-[#0F172A] tabular-nums">
                {formatBs(bcvState.officialRate + exchangeBufferBs)}/$
              </div>
            </div>

            <button
              type="submit"
              disabled={isBufferLocked}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                isBufferLocked
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-[#1D4ED8] hover:bg-blue-800 text-white'
              }`}
            >
              Aplicar Ajuste
            </button>
          </form>
        </div>
      </div>

      {/* Financial KPIs (USD primary + Bolívares miniature) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5">
          <div className="text-xs font-semibold text-slate-500">
            Ingresos Brutos (En Curso + Cerrados)
          </div>
          <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1.5">
            {formatUsd(financialSummary.grossUsd)}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            {formatBs(financialSummary.grossUsd * bcvState.officialRate)}
          </div>
          <div className="mt-3 pt-3 border-t border-[#CBD5E1] space-y-1 text-xs tabular-nums">
            <div className="flex justify-between text-slate-600">
              <span>Ingreso Base (BCV):</span>
              <span className="tabular-nums font-semibold text-[#0F172A]">
                {formatUsd(financialSummary.baseBcvUsd)}
              </span>
            </div>
            <div className="flex justify-between text-[#1D4ED8] font-semibold">
              <span>Excedente Ajuste Cambiario:</span>
              <span className="tabular-nums">
                +{formatUsd(financialSummary.surplusUsd)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5">
          <div className="text-xs font-semibold text-slate-500">
            Inversión en Mercancía
          </div>
          <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1.5">
            {formatUsd(financialSummary.cogsUsd)}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            {formatBs(financialSummary.cogsUsd * bcvState.officialRate)}
          </div>
          <div className="mt-3 pt-3 border-t border-[#CBD5E1] text-xs text-slate-600 space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span>Costo de bebidas vendidas:</span>
              <span className="tabular-nums font-semibold">
                {formatUsd(financialSummary.cogsUsd)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Compras / Reposiciones cava:</span>
              <span className="tabular-nums font-semibold">
                {formatUsd(financialSummary.restockInvestmentUsd)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-orange-50/80 border border-orange-200 shadow-xs rounded-2xl p-5">
          <div className="text-xs font-bold text-[#C2410C] flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4 shrink-0" />
            Mermas y Roturas ($ pérdida al costo)
          </div>
          <div className="font-extrabold text-2xl text-[#DC2626] tabular-nums mt-1.5">
            {financialSummary.shrinkageLossUsd > 0 ? '-' : ''}
            {formatUsd(financialSummary.shrinkageLossUsd)}
          </div>
          <div className="text-[11px] text-orange-800 tabular-nums">
            {formatBs(
              financialSummary.shrinkageLossUsd * bcvState.officialRate
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-orange-200 text-xs text-orange-950 space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span>Unidades perdidas:</span>
              <span className="font-bold">
                {financialSummary.shrinkageUnitsTotal} bot./unid.
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-orange-900">
              <span>Eventos / Cava Gral.:</span>
              <span className="font-semibold">
                {formatUsd(financialSummary.shrinkageEventUsd)} /{' '}
                {formatUsd(financialSummary.shrinkageGeneralUsd)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5">
          <div className="text-xs font-semibold text-slate-500">
            Pago de Nómina a Empleados
          </div>
          <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1.5">
            {formatUsd(financialSummary.payrollTotalUsd)}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            {formatBs(financialSummary.payrollTotalUsd * bcvState.officialRate)}
          </div>
          <div className="mt-3 pt-3 border-t border-[#CBD5E1] text-xs text-slate-600">
            {financialSummary.payrollFiltered.length} pago(s) registrados en el
            período seleccionado.
          </div>
        </div>

        <div className="bg-[#ECFDF5] border border-[#10B981]/40 rounded-2xl p-5 sm:col-span-2 xl:col-span-1">
          <div className="text-xs font-bold uppercase tracking-wider text-[#065F46] flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Ganancia Neta Real
          </div>
          <div className="font-extrabold text-3xl text-[#0F172A] tabular-nums mt-1.5">
            {formatUsd(financialSummary.netProfitUsd)}
          </div>
          <div className="text-[11px] text-[#065F46] tabular-nums">
            {formatBs(financialSummary.netProfitUsd * bcvState.officialRate)}
          </div>
          <div className="mt-3 pt-3 border-t border-[#10B981]/25 text-xs text-[#065F46] font-medium">
            Ingresos Brutos − Costo Mercancía − Mermas y Roturas − Nómina
          </div>
        </div>
      </div>

      {/* Inventory Valuation in Money (Admin Only) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#1D4ED8]" />
            <div>
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                Valor en Dinero del Inventario Actual en Cava
              </h3>
              <p className="text-xs text-slate-500">
                Existencia total:{' '}
                <strong className="tabular-nums text-[#0F172A]">
                  {inventoryValuation.totalUnits} unidades
                </strong>{' '}
                en {products.length} productos activos
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1]">
            <div className="text-xs font-semibold text-slate-600">
              Capital Invertido en Cava (Al Costo)
            </div>
            <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1">
              {formatUsd(inventoryValuation.costValueUsd)}
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums">
              {formatBs(inventoryValuation.costValueUsd * bcvState.officialRate)}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200">
            <div className="text-xs font-semibold text-[#1D4ED8]">
              Valor de Venta Estimado (Al Detal)
            </div>
            <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1">
              {formatUsd(inventoryValuation.retailValueUsd)}
            </div>
            <div className="text-[11px] text-[#1D4ED8] tabular-nums">
              {formatBs(
                inventoryValuation.retailValueUsd * bcvState.officialRate
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#ECFDF5] border border-[#10B981]/40">
            <div className="text-xs font-bold text-[#065F46]">
              Utilidad Proyectada en Inventario
            </div>
            <div className="font-extrabold text-2xl text-[#059669] tabular-nums mt-1">
              +{formatUsd(inventoryValuation.potentialProfitUsd)}
            </div>
            <div className="text-[11px] text-[#065F46] tabular-nums">
              {formatBs(
                inventoryValuation.potentialProfitUsd * bcvState.officialRate
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Audit: Mermas y Roturas (Pérdidas de Inventario) */}
      <div className="bg-white border border-orange-200 shadow-xs rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-orange-200 bg-orange-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-5 h-5 text-[#EA580C] shrink-0" />
            <div>
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                Auditoría de Mermas y Roturas ($ pérdida al costo)
              </h3>
              <p className="text-xs text-slate-600">
                Botellas partidas, reventadas en congelador o productos malos en
                el período · {financialSummary.shrinkageUnitsTotal} unidades
                perdidas ({formatUsd(financialSummary.shrinkageLossUsd)} al
                costo)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:inline-flex gap-1 p-1 bg-white border border-orange-200 rounded-xl w-full sm:w-auto">
            {(
              [
                ['all', 'Todos'],
                ['evento', 'En Eventos'],
                ['inventario_general', 'Inv. General'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setShrinkageOriginFilter(val)}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  shrinkageOriginFilter === val
                    ? 'bg-[#EA580C] text-white'
                    : 'text-slate-600 hover:text-[#0F172A]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Reason Breakdown Summary Grid */}
        <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {financialSummary.shrinkageByReason.map((item) => (
            <div
              key={item.reason}
              className="p-3 rounded-xl bg-white border border-slate-200 space-y-1"
            >
              <div className="text-[11px] font-bold text-slate-600 leading-snug">
                {item.reason}
              </div>
              <div className="flex items-baseline justify-between gap-2 tabular-nums">
                <span className="font-extrabold text-base text-[#0F172A]">
                  {item.units}{' '}
                  <span className="text-xs font-semibold text-slate-500">
                    unid.
                  </span>
                </span>
                <span className="text-xs font-extrabold text-[#DC2626]">
                  -{formatUsd(item.lossUsd)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Detailed Shrinkage Log */}
        <div className="divide-y divide-[#E2E8F0] max-h-96 overflow-y-auto">
          {(() => {
            const visibleShrinkages =
              financialSummary.shrinkagesFiltered.filter(
                (s) =>
                  shrinkageOriginFilter === 'all' ||
                  s.origin === shrinkageOriginFilter
              );

            if (visibleShrinkages.length === 0) {
              return (
                <div className="p-7 text-center text-sm text-slate-500">
                  Sin mermas ni roturas registradas en este período y filtro.
                </div>
              );
            }

            return visibleShrinkages.map((sh) => (
              <div
                key={sh.id}
                className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0 space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#0F172A]">
                      {sh.quantityUnits}× {sh.productName}
                      {sh.productPresentation
                        ? ` (${sh.productPresentation})`
                        : ''}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-orange-100 text-[#9A3412] text-[11px] font-bold">
                      {sh.reason}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                        sh.origin === 'evento'
                          ? 'bg-blue-50 text-[#1D4ED8] border border-blue-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {sh.origin === 'evento'
                        ? `Evento: ${sh.eventName || 'Fiesta'}`
                        : 'Inventario General'}
                    </span>
                  </div>
                  {sh.observation && (
                    <div className="text-xs text-slate-700">
                      Observación: {sh.observation}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {formatDateSpanish(sh.date)} · {formatTime(sh.timestamp)} ·
                    Registrado por: <strong>{sh.recordedByName}</strong> (
                    {sh.recordedByRole}) · Costo unit.:{' '}
                    {formatUsd(sh.unitCostUsd)} · $0.00 en caja
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right tabular-nums">
                    <div className="font-extrabold text-base text-[#DC2626]">
                      -{formatUsd(sh.totalLossCostUsd)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formatBs(sh.totalLossCostBs)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmVoidShrinkage(sh)}
                    title="Anular merma y devolver stock"
                    className="min-w-[34px] min-h-[34px] rounded-lg text-slate-400 hover:text-[#EF4444] hover:bg-red-50 flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Payroll Module + Shift Audit History */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Payroll Entry & Table */}
        <div className="xl:col-span-6 bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#CBD5E1] shadow-xs flex items-center gap-2">
            <Users className="w-5 h-5 text-[#1D4ED8]" />
            <h3 className="font-display font-bold text-lg text-[#0F172A]">
              Módulo de Nómina y Personal
            </h3>
          </div>

          <form
            onSubmit={handleAddPayrollSubmit}
            className="p-5 bg-[#F8FAFC] border-b border-[#CBD5E1] shadow-xs space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nombre del Empleado
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={empName}
                    onFocus={() => setShowStaffDropdown(true)}
                    onClick={() => setShowStaffDropdown(true)}
                    onBlur={() => setShowStaffDropdown(false)}
                    onChange={(e) => {
                      setEmpName(e.target.value);
                      setShowStaffDropdown(true);
                      if (selectedStaffId && selectedStaffId !== 'manual') {
                        setSelectedStaffId('manual');
                      }
                    }}
                    placeholder={
                      staffUsers.length > 0
                        ? 'Haz clic para elegir o escribe...'
                        : 'Nombre del empleado...'
                    }
                    className="w-full min-h-[42px] pl-3 pr-9 bg-white border border-[#CBD5E1] shadow-xs rounded-xl text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                  {staffUsers.length > 0 && (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label="Desplegar usuarios registrados"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setShowStaffDropdown((prev) => !prev);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-slate-500 hover:text-[#0F172A] hover:bg-slate-100 flex items-center justify-center transition-colors"
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          showStaffDropdown ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  )}
                </div>

                {showStaffDropdown && staffUsers.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-[#CBD5E1] rounded-xl shadow-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                      <span>Personal Registrado ({staffUsers.length})</span>
                      <span>Toca para elegir</span>
                    </div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                      {filteredStaffOptions.length === 0 ? (
                        <div className="px-3 py-2.5 text-xs text-slate-500">
                          Sin coincidencia exacta. Se registrará manualmente con el nombre escrito.
                        </div>
                      ) : (
                        filteredStaffOptions.map((u) => {
                          const isSelected = selectedStaffId === u.id;
                          const mappedRole = mapUserRoleToEmployeeRole(u.role);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectStaffMember(u.id);
                              }}
                              className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors ${
                                isSelected
                                  ? 'bg-blue-50 text-[#1D4ED8]'
                                  : 'hover:bg-slate-50 text-[#0F172A]'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-xs truncate">
                                  {u.name}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {u.email}
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700 shrink-0">
                                {mappedRole}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectStaffMember('manual');
                      }}
                      className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 border-t border-slate-200 text-left text-xs font-semibold text-slate-700"
                    >
                      + Otro empleado manual (Portero / Limpieza / Extra)
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Rol Operativo
                </label>
                <select
                  value={empRole}
                  onChange={(e) => setEmpRole(e.target.value as EmployeeRole)}
                  className="w-full min-h-[42px] px-3 bg-white border border-[#CBD5E1] shadow-xs rounded-xl text-sm"
                >
                  <option value="Mesero">Mesero</option>
                  <option value="Cajero">Cajero</option>
                  <option value="Taquilla">Taquilla</option>
                  <option value="Portero">Portero</option>
                  <option value="Limpieza">Limpieza</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Monto ($)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  required
                  value={empAmount}
                  onChange={(e) => setEmpAmount(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  required
                  value={empDate}
                  onChange={(e) => setEmpDate(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-sm tabular-nums"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full min-h-[42px] px-4 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Registrar Pago
                </button>
              </div>
            </div>

            <input
              type="text"
              value={empNote}
              onChange={(e) => setEmpNote(e.target.value)}
              placeholder="Nota opcional (Ej: Turno Rumba Vallenata)"
              className="w-full min-h-[38px] px-3 bg-white border border-[#E2E8F0] rounded-xl text-xs"
            />
          </form>

          <div className="divide-y divide-[#E2E8F0] max-h-80 overflow-y-auto">
            {financialSummary.payrollFiltered.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No hay pagos de nómina en este rango de fechas.
              </div>
            ) : (
              financialSummary.payrollFiltered.map((p) => (
                <div
                  key={p.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[#0F172A]">
                      {p.employeeName} ·{' '}
                      <span className="text-[#1D4ED8]">{p.role}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {formatDateSpanish(p.date)}
                      {p.note ? ` · ${p.note}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right tabular-nums">
                      <div className="font-bold text-base text-[#0F172A]">
                        {formatUsd(p.amountUsd)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatBs(p.amountUsd * bcvState.officialRate)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeletePayroll(p.id)}
                      title="Eliminar registro de nómina"
                      className="min-w-[34px] min-h-[34px] rounded-lg text-slate-400 hover:text-[#EF4444] hover:bg-red-50 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Closed Shifts & Remote Audit Inspector */}
        <div className="xl:col-span-6 bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#10B981]" />
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                Cierres Consolidados y Auditoría
              </h3>
            </div>
            <span className="text-xs tabular-nums font-semibold text-slate-500">
              {filteredClosedShifts.length} cierre(s)
            </span>
          </div>

          <div className="divide-y divide-[#E2E8F0]">
            {filteredClosedShifts.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No hay cierres de caja en este período. Cuando cierres la fiesta
                activa aparecerá aquí al instante.
              </div>
            ) : (
              filteredClosedShifts.map((shift) => (
                <div key={shift.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-display font-bold text-base text-[#0F172A]">
                        {shift.eventName}
                      </h4>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatDateSpanish(shift.eventDate)} ·{' '}
                        {formatTime(shift.openedAt)} a{' '}
                        {formatTime(shift.closedAt)} · {shift.totalAttendees}{' '}
                        asist.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadClosingShiftPdf(shift)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF Cierre
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-100 border border-[#CBD5E1] text-xs tabular-nums">
                    <div>
                      <div className="text-slate-500">Total Recaudado</div>
                      <div className="tabular-nums font-bold text-sm text-[#0F172A]">
                        {formatUsd(shift.totalRevenueUsd)}
                      </div>
                      <div className="tabular-nums text-[10px] text-slate-500">
                        {formatBs(shift.totalRevenueBs)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Base BCV / Extra</div>
                      <div className="tabular-nums font-semibold text-[#1D4ED8]">
                        +{formatUsd(shift.exchangeSurplusUsd)}
                      </div>
                      <div className="tabular-nums text-[10px] text-slate-500">
                        +{formatBs(shift.exchangeSurplusBs)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Utilidad Bruta</div>
                      <div className="tabular-nums font-bold text-sm text-[#10B981]">
                        {formatUsd(shift.totalRevenueUsd - shift.cogsUsd)}
                      </div>
                      <div className="tabular-nums text-[10px] text-slate-500">
                        {formatBs(
                          (shift.totalRevenueUsd - shift.cogsUsd) * shift.bcvRate
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mermas y Roturas del Evento Cerrado */}
                  {(() => {
                    const shiftShrinkages = shift.shrinkages || [];
                    const shiftLossUsd =
                      shift.shrinkageLossUsd !== undefined
                        ? shift.shrinkageLossUsd
                        : shiftShrinkages.reduce(
                            (sum, s) => sum + s.totalLossCostUsd,
                            0
                          );
                    const shiftLossUnits =
                      shift.shrinkageUnitsTotal !== undefined
                        ? shift.shrinkageUnitsTotal
                        : shiftShrinkages.reduce(
                            (sum, s) => sum + s.quantityUnits,
                            0
                          );

                    return (
                      <div className="p-3 rounded-xl bg-orange-50/80 border border-orange-200 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#C2410C]">
                          <span className="flex items-center gap-1.5">
                            <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                            Mermas y Roturas ({shiftLossUnits} unid.)
                          </span>
                          <span className="tabular-nums font-extrabold">
                            Pérdida al costo: {formatUsd(shiftLossUsd)}
                          </span>
                        </div>
                        {shiftShrinkages.length > 0 && (
                          <div className="space-y-1 pt-0.5">
                            {shiftShrinkages.map((sh) => (
                              <div
                                key={sh.id}
                                className="text-xs text-orange-950 flex items-start justify-between gap-2"
                              >
                                <span>
                                  <strong>
                                    {sh.quantityUnits}× {sh.productName}
                                  </strong>{' '}
                                  — {sh.reason}
                                  {sh.observation ? ` (${sh.observation})` : ''}
                                </span>
                                <span className="tabular-nums font-bold text-[#DC2626] shrink-0">
                                  -{formatUsd(sh.totalLossCostUsd)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {shift.suspendedSales.length > 0 && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-1.5">
                      <div className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {shift.suspendedSales.length} Venta(s) Suspendida(s)
                        para Auditoría:
                      </div>
                      {shift.suspendedSales.map((s) => (
                        <div key={s.id} className="text-xs text-red-900">
                          <span className="tabular-nums font-bold">
                            {formatTime(s.suspendedAt || s.timestamp)} (
                            {formatUsd(s.totalUsd)})
                          </span>{' '}
                          — {s.suspendReason}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Confirm Void / Delete Shrinkage Modal (Admin Only) */}
      {confirmVoidShrinkage && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#CBD5E1] shadow-2xl p-5 space-y-4">
            <h3 className="font-display font-bold text-lg text-[#0F172A]">
              ¿Anular registro de merma?
            </h3>
            <p className="text-sm text-slate-600">
              Se eliminará el registro de{' '}
              <strong className="text-[#0F172A]">
                {confirmVoidShrinkage.quantityUnits}×{' '}
                {confirmVoidShrinkage.productName}
              </strong>{' '}
              ({confirmVoidShrinkage.reason}, pérdida{' '}
              {formatUsd(confirmVoidShrinkage.totalLossCostUsd)}) y se devolverá
              automáticamente esa cantidad al stock disponible.
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmVoidShrinkage(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteShrinkage(confirmVoidShrinkage.id, true);
                  setConfirmVoidShrinkage(null);
                }}
                className="min-h-[42px] px-4 rounded-xl bg-[#DC2626] hover:bg-red-700 text-white text-sm font-bold flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                Anular y Devolver Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
