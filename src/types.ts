export type UserRole = 'admin' | 'taquilla' | 'caja' | 'mesero';

export type AppSection =
  | 'operacion'
  | 'calendario'
  | 'inventario'
  | 'finanzas'
  | 'configuracion';

export interface StaffUserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

export type ProductCategory = 'cervezas' | 'licores' | 'refrescos' | 'hielo_otros';

export type ProductUnitType = 'case_36' | 'pack' | 'unit';

export interface Product {
  id: string;
  name: string;
  presentation?: string; // e.g., "Tercio 222ml", "Lata 355ml", "Botella 0.75L"
  photoUrl?: string; // Base64 DataURL from camera/upload
  category: ProductCategory;
  unitType: ProductUnitType;
  caseSize: number; // e.g., 36, 24, 12, 6, or 1 for single units
  priceUnitUsd: number;
  priceCaseUsd?: number;
  costUnitUsd: number; // Hidden after creation in employee view unless delegated
  costCaseUsd?: number; // Hidden after creation in employee view unless delegated
  stockUnits: number; // Total individual units (bottles/cans/bags)
  lowStockThreshold: number;
}

export type EventType = 'fiesta' | 'alquiler';

export type EventStatus = 'programado' | 'en_curso' | 'finalizado';

export interface CalendarEvent {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  eventSubType?: string; // e.g. "15 Años", "Matrimonio", "Fiesta del Local", or custom
  organizer?: string; // Quién lo organiza
  startTime?: string; // e.g. "14:00"
  endTime?: string; // e.g. "19:00"
  entryPriceUsd: number; // Used only for 'fiesta' (internal events)
  clientName?: string; // Used for 'alquiler' (private events)
  totalRentalUsd: number; // Used for 'alquiler'
  depositPaidUsd: number; // Abono de reserva
  status: EventStatus;
  openedAt?: string; // ISO string
  closedAt?: string; // ISO string
  notes?: string;
}

export type PaymentMethod =
  | 'efectivo_usd'
  | 'zelle'
  | 'pago_movil'
  | 'tarjeta'
  | 'mixto';

export interface PaymentBreakdown {
  efectivoUsd: number;
  zelleUsd: number;
  bsAmount: number; // Total paid in Bs (Pago Móvil + Tarjeta/Punto)
  pagoMovilBs?: number;
  tarjetaBs?: number;
}

export interface SaleLineItem {
  productId?: string;
  name: string;
  mode: 'unit' | 'case' | 'entry';
  quantity: number; // Number of units, packs/cases, or entry tickets
  unitsDeducted: number; // Total bottles/units deducted from stock
  unitPriceUsd: number;
  subtotalUsd: number;
  unitCostUsd: number;
}

export interface SaleRecord {
  id: string;
  eventId: string;
  timestamp: string; // ISO string
  kind: 'barra' | 'taquilla';
  items: SaleLineItem[];
  totalUsd: number;
  totalBs: number;
  bcvRateAtSale: number;
  effectiveRateAtSale: number;
  bufferBsAtSale: number;
  paymentMethod: PaymentMethod;
  paymentBreakdown: PaymentBreakdown;
  amountReceivedUsd?: number;
  amountReceivedBs?: number;
  changeGivenUsd?: number;
  changeGivenBs?: number;
  changeNote?: string;
  status: 'active' | 'suspended';
  suspendReason?: string;
  suspendedAt?: string;
  suspendedByRole?: UserRole;
  cashierNote?: string;
}

export type TableOrderStatus = 'open' | 'ready_to_close' | 'closed' | 'cancelled';

export interface TableOrder {
  id: string;
  eventId: string;
  tableName: string;
  waiterEmail: string;
  waiterName: string;
  items: SaleLineItem[];
  subtotalUsd: number;
  subtotalBs: number;
  status: TableOrderStatus;
  openedAt: string; // ISO string
  notes?: string;
  saleId?: string;
  paymentMethod?: PaymentMethod;
  closedByEmail?: string;
  closedAt?: string;
}

export interface CourtesyItem {
  productId: string;
  name: string;
  mode: 'unit' | 'case';
  quantity: number;
  unitsDeducted: number;
  costUsd: number;
}

export interface CourtesyRecord {
  id: string;
  eventId: string;
  timestamp: string;
  recipient: string;
  reason: string;
  items: CourtesyItem[];
  totalCostUsd: number;
}

export interface StockRestockRecord {
  id: string;
  timestamp: string;
  date: string;
  productId: string;
  productName: string;
  casesAdded: number;
  unitsAdded: number;
  totalUnitsAdded: number;
  totalCostUsd: number;
  note?: string;
}

export type EmployeeRole =
  | 'Mesero'
  | 'Cajero'
  | 'Portero'
  | 'Limpieza'
  | 'Taquilla'
  | 'Administrador';

export interface PayrollRecord {
  id: string;
  employeeName: string;
  role: EmployeeRole;
  amountUsd: number;
  date: string; // YYYY-MM-DD
  note?: string;
}

export interface ProductSoldSummary {
  name: string;
  caseSize: number;
  casesSold: number;
  looseUnitsSold: number;
  totalUnitsSold: number;
  revenueUsd: number;
}

export interface RemainingStockSnapshot {
  productId: string;
  name: string;
  presentation?: string;
  category: ProductCategory;
  unitType: ProductUnitType;
  caseSize: number;
  stockUnits: number;
}

export interface ClosedShift {
  id: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  eventType: EventType;
  eventSubType?: string;
  openedAt: string;
  closedAt: string;
  bcvRate: number;
  bufferBs: number;
  effectiveRate: number;
  totalAttendees: number;
  taquillaUsd: number;
  barraUsd: number;
  totalRevenueUsd: number;
  totalRevenueBs: number;
  baseBcvRevenueUsd: number;
  exchangeSurplusUsd: number;
  exchangeSurplusBs: number;
  cashUsdTotal: number;
  zelleUsdTotal: number;
  pagoMovilBsTotal: number;
  tarjetaBsTotal?: number;
  cogsUsd: number;
  productsSold: ProductSoldSummary[];
  courtesies: CourtesyRecord[];
  suspendedSales: SaleRecord[];
  remainingStock: RemainingStockSnapshot[];
}

export interface BcvRateState {
  officialRate: number;
  source: string;
  lastUpdated: string;
  isLoading: boolean;
  isFallback: boolean;
}
