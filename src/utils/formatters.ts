import { Product, RemainingStockSnapshot } from '../types';

export function formatUsd(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatBs(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return (
    'Bs. ' +
    new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe)
  );
}

export function formatStockReadable(
  stockUnits: number,
  unitType: Product['unitType'],
  caseSize = 36
): string {
  const safeUnits = Math.max(0, Math.floor(stockUnits));
  if ((unitType === 'case_36' || unitType === 'pack') && caseSize > 1) {
    const cases = Math.floor(safeUnits / caseSize);
    const loose = safeUnits % caseSize;
    return `${cases} Cajas (${caseSize}u) + ${loose} sueltas (Total: ${safeUnits} unid.)`;
  }
  return `${safeUnits} unidades`;
}

export function formatStockShort(
  stockUnits: number,
  unitType: Product['unitType'],
  caseSize = 36
): string {
  const safeUnits = Math.max(0, Math.floor(stockUnits));
  if ((unitType === 'case_36' || unitType === 'pack') && caseSize > 1) {
    const cases = Math.floor(safeUnits / caseSize);
    const loose = safeUnits % caseSize;
    return `${cases} Cajas (${caseSize}u) · ${loose} sueltas (${safeUnits} u.)`;
  }
  return `${safeUnits} unid.`;
}

export function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '--:--';
  }
}

export function formatDateSpanish(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString('es-VE', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(baseIso: string, deltaDays: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function snapshotStock(products: Product[]): RemainingStockSnapshot[] {
  return products.map((p) => ({
    productId: p.id,
    name: p.name,
    presentation: p.presentation,
    category: p.category,
    unitType: p.unitType,
    caseSize: p.caseSize,
    stockUnits: p.stockUnits,
  }));
}

export function getCategoryLabel(cat: Product['category']): string {
  switch (cat) {
    case 'cervezas':
      return 'Cervezas';
    case 'licores':
      return 'Licores';
    case 'refrescos':
      return 'Refrescos y Agua';
    case 'hielo_otros':
      return 'Hielo y Otros';
  }
}

export function getPaymentLabel(method: string): string {
  switch (method) {
    case 'efectivo_usd':
      return 'Efectivo USD ($)';
    case 'zelle':
      return 'Zelle ($)';
    case 'pago_movil':
      return 'Pago Móvil (Bs.)';
    case 'tarjeta':
      return 'Tarjeta / Punto (Bs.)';
    case 'mixto':
      return 'Pago Compartido';
    default:
      return method;
  }
}
