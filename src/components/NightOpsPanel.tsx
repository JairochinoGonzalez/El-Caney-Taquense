import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Beer,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Flame,
  Gift,
  Lock,
  Minus,
  Plus,
  PowerOff,
  Receipt,
  Search,
  Send,
  Smartphone,
  Split,
  Ticket,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  CalendarEvent,
  CourtesyItem,
  CourtesyRecord,
  PaymentBreakdown,
  PaymentMethod,
  Product,
  ProductCategory,
  SaleLineItem,
  SaleRecord,
  TableOrder,
  UserRole,
} from '../types';
import {
  formatBs,
  formatStockShort,
  formatTime,
  formatUsd,
  getPaymentLabel,
} from '../utils/formatters';

type SinglePaymentChannel = 'efectivo_usd' | 'zelle' | 'pago_movil' | 'tarjeta';

const PAYMENT_CHANNEL_META: Array<{
  id: SinglePaymentChannel;
  label: string;
  shortLabel: string;
  isBs: boolean;
}> = [
  { id: 'efectivo_usd', label: 'Efectivo ($)', shortLabel: 'Efectivo $', isBs: false },
  { id: 'zelle', label: 'Zelle ($)', shortLabel: 'Zelle $', isBs: false },
  { id: 'pago_movil', label: 'Pago Móvil', shortLabel: 'P. Móvil', isBs: true },
  { id: 'tarjeta', label: 'Tarjeta / Punto', shortLabel: 'Tarjeta', isBs: true },
];

function buildSharedBreakdown(
  m1: SinglePaymentChannel,
  m2: SinglePaymentChannel,
  usd1: number,
  usd2: number,
  effectiveRate: number
): PaymentBreakdown {
  let efectivoUsd = 0;
  let zelleUsd = 0;
  let pagoMovilBs = 0;
  let tarjetaBs = 0;

  const apply = (ch: SinglePaymentChannel, usdVal: number) => {
    if (ch === 'efectivo_usd') efectivoUsd += usdVal;
    else if (ch === 'zelle') zelleUsd += usdVal;
    else if (ch === 'pago_movil') pagoMovilBs += usdVal * effectiveRate;
    else if (ch === 'tarjeta') tarjetaBs += usdVal * effectiveRate;
  };

  apply(m1, usd1);
  apply(m2, usd2);

  return {
    efectivoUsd: Number(efectivoUsd.toFixed(2)),
    zelleUsd: Number(zelleUsd.toFixed(2)),
    bsAmount: Number((pagoMovilBs + tarjetaBs).toFixed(2)),
    pagoMovilBs: Number(pagoMovilBs.toFixed(2)),
    tarjetaBs: Number(tarjetaBs.toFixed(2)),
  };
}

interface CartEntry {
  key: string;
  productId: string;
  name: string;
  mode: 'unit' | 'case';
  quantity: number;
  unitsPerQty: number;
  unitPriceUsd: number;
  unitCostUsd: number;
}

interface NightOpsPanelProps {
  role: UserRole;
  userEmail: string;
  userName: string;
  activeParty: CalendarEvent | null;
  products: Product[];
  sales: SaleRecord[];
  tableOrders: TableOrder[];
  courtesies: CourtesyRecord[];
  effectiveRate: number;
  onRecordSale: (params: {
    kind: 'barra' | 'taquilla';
    items: SaleLineItem[];
    paymentMethod: PaymentMethod;
    paymentBreakdown: PaymentBreakdown;
    amountReceivedUsd?: number;
    amountReceivedBs?: number;
    changeGivenUsd?: number;
    changeGivenBs?: number;
    changeNote?: string;
  }) => void;
  onSaveTableOrder: (params: {
    existingOrderId?: string;
    tableName: string;
    items: SaleLineItem[];
    notes?: string;
    status?: 'open' | 'ready_to_close';
  }) => Promise<void>;
  onRequestTableClose: (orderId: string) => Promise<void>;
  onCloseTableOrder: (params: {
    orderId: string;
    paymentMethod: PaymentMethod;
    paymentBreakdown: PaymentBreakdown;
    amountReceivedUsd?: number;
    amountReceivedBs?: number;
    changeGivenUsd?: number;
    changeGivenBs?: number;
    changeNote?: string;
  }) => Promise<void>;
  onCancelTableOrder: (orderId: string) => Promise<void>;
  onRecordCourtesy: (params: {
    recipient: string;
    reason: string;
    items: CourtesyItem[];
  }) => void;
  onSuspendSale: (saleId: string, reason: string) => void;
  onDeleteSale: (saleId: string) => void;
  onCloseParty: () => void;
  onGoToCalendar: () => void;
}

export const NightOpsPanel: React.FC<NightOpsPanelProps> = ({
  role,
  userEmail,
  userName,
  activeParty,
  products,
  sales,
  tableOrders,
  courtesies,
  effectiveRate,
  onRecordSale,
  onSaveTableOrder,
  onRequestTableClose,
  onCloseTableOrder,
  onCancelTableOrder,
  onRecordCourtesy,
  onSuspendSale,
  onDeleteSale,
  onCloseParty,
  onGoToCalendar,
}) => {
  const [categoryTab, setCategoryTab] = useState<ProductCategory | 'all'>(
    'all'
  );
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [cartQtyDrafts, setCartQtyDrafts] = useState<Record<string, string>>(
    {}
  );

  // Invoice Checkout Modal ("Pagar Factura" — Barra Cart OR Closing a Waiter's Table)
  const [showPayInvoiceModal, setShowPayInvoiceModal] = useState(false);
  const [chargingTableOrder, setChargingTableOrder] =
    useState<TableOrder | null>(null);

  // Mesero Table Builder State
  const [tableNameInput, setTableNameInput] = useState<string>('Mesa 1');
  const [tableNotesInput, setTableNotesInput] = useState<string>('');
  const [editingTableOrderId, setEditingTableOrderId] = useState<string | null>(
    null
  );
  const [savingTableOrder, setSavingTableOrder] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'single' | 'shared'>('single');
  const [singleMethod, setSingleMethod] =
    useState<SinglePaymentChannel>('efectivo_usd');
  const [sharedMethod1, setSharedMethod1] =
    useState<SinglePaymentChannel>('pago_movil');
  const [sharedMethod2, setSharedMethod2] =
    useState<SinglePaymentChannel>('zelle');
  const [sharedMethod1Amount, setSharedMethod1Amount] = useState<string>('3.00');
  const [sharedMethod1Currency, setSharedMethod1Currency] = useState<
    'usd' | 'bs'
  >('usd');
  const [sharedMethod2Amount, setSharedMethod2Amount] = useState<string>('0.00');
  const [sharedMethod2Currency, setSharedMethod2Currency] = useState<
    'usd' | 'bs'
  >('usd');
  const [sharedLastEdited, setSharedLastEdited] = useState<1 | 2>(1);
  const [receivedAmountInput, setReceivedAmountInput] = useState<string>('');
  const [changeNote, setChangeNote] = useState<string>('');

  // Fast 1-2 Click Taquilla State (only for internal 'fiesta' events)
  const [ticketCountInput, setTicketCountInput] = useState<string>('1');
  const [taquillaSharedMode, setTaquillaSharedMode] = useState<boolean>(false);
  const [taquillaSharedM1, setTaquillaSharedM1] =
    useState<SinglePaymentChannel>('pago_movil');
  const [taquillaSharedM2, setTaquillaSharedM2] =
    useState<SinglePaymentChannel>('efectivo_usd');
  const [taquillaSharedUsd1, setTaquillaSharedUsd1] = useState<string>('5.00');
  const [taquillaSharedUsd2, setTaquillaSharedUsd2] = useState<string>('0.00');
  const [taquillaLastEdited, setTaquillaLastEdited] = useState<1 | 2>(1);

  // Active Operational Station View (Admin switches between Taquilla & Barra; Taquilla & Caja are locked)
  const [activeStation, setActiveStation] = useState<'taquilla' | 'barra'>(
    'taquilla'
  );
  // Inside Caja/Barra: toggle between POS catalog/cart and dedicated Mesas section
  const [barraSubView, setBarraSubView] = useState<'pos' | 'mesas'>('pos');

  // Night Ledger View Mode: Consolidated Summary vs Detailed Ticket-by-Ticket
  const [ledgerView, setLedgerView] = useState<'resumen' | 'detalle'>('resumen');

  // Cortesía Modal
  const [showCourtesyModal, setShowCourtesyModal] = useState(false);
  const [courtesyRecipient, setCourtesyRecipient] = useState('');
  const [courtesyReason, setCourtesyReason] = useState('');

  // Suspend Sale Modal (Mandatory Note)
  const [suspendingSale, setSuspendingSale] = useState<SaleRecord | null>(null);
  const [suspendNote, setSuspendNote] = useState('');
  const [suspendError, setSuspendError] = useState('');

  // Owner-Only Delete Sale Confirm Modal
  const [deletingSale, setDeletingSale] = useState<SaleRecord | null>(null);

  // Confirm Close Party Modal
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Feedback banner
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const triggerFlash = (msg: string) => {
    setFlashMessage(msg);
    setTimeout(() => setFlashMessage(null), 3200);
  };

  // Derived Night Metrics for activeParty
  const partySales = useMemo(() => {
    if (!activeParty) return [];
    return sales
      .filter((s) => s.eventId === activeParty.id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [sales, activeParty]);

  const activePartySales = useMemo(
    () => partySales.filter((s) => s.status === 'active'),
    [partySales]
  );

  const partyCourtesies = useMemo(() => {
    if (!activeParty) return [];
    return courtesies
      .filter((c) => c.eventId === activeParty.id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [courtesies, activeParty]);

  const taquillaSales = useMemo(
    () => partySales.filter((s) => s.kind === 'taquilla'),
    [partySales]
  );

  const activeTaquillaSales = useMemo(
    () => activePartySales.filter((s) => s.kind === 'taquilla'),
    [activePartySales]
  );

  const barraSales = useMemo(
    () => partySales.filter((s) => s.kind === 'barra'),
    [partySales]
  );

  const activeBarraSales = useMemo(
    () => activePartySales.filter((s) => s.kind === 'barra'),
    [activePartySales]
  );

  const confirmedAttendees = useMemo(() => {
    return activeTaquillaSales.reduce(
      (acc, s) =>
        acc + s.items.reduce((sum, item) => sum + item.quantity, 0),
      0
    );
  }, [activeTaquillaSales]);

  const taquillaTotalUsd = useMemo(
    () => activeTaquillaSales.reduce((sum, s) => sum + s.totalUsd, 0),
    [activeTaquillaSales]
  );

  const taquillaTotalBs = useMemo(
    () => activeTaquillaSales.reduce((sum, s) => sum + s.totalBs, 0),
    [activeTaquillaSales]
  );

  const taquillaBreakdown = useMemo(() => {
    return activeTaquillaSales.reduce(
      (acc, s) => ({
        efectivoUsd: acc.efectivoUsd + s.paymentBreakdown.efectivoUsd,
        zelleUsd: acc.zelleUsd + s.paymentBreakdown.zelleUsd,
        bsAmount: acc.bsAmount + s.paymentBreakdown.bsAmount,
      }),
      { efectivoUsd: 0, zelleUsd: 0, bsAmount: 0 }
    );
  }, [activeTaquillaSales]);

  const barraTotalUsd = useMemo(
    () => activeBarraSales.reduce((sum, s) => sum + s.totalUsd, 0),
    [activeBarraSales]
  );

  const barraTotalBs = useMemo(
    () => activeBarraSales.reduce((sum, s) => sum + s.totalBs, 0),
    [activeBarraSales]
  );

  const totalNightUsd = useMemo(
    () => activePartySales.reduce((sum, s) => sum + s.totalUsd, 0),
    [activePartySales]
  );

  const totalNightBs = useMemo(
    () => activePartySales.reduce((sum, s) => sum + s.totalBs, 0),
    [activePartySales]
  );

  const consolidatedProductsSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        caseSize: number;
        casesSold: number;
        looseUnitsSold: number;
        totalUnitsSold: number;
        revenueUsd: number;
      }
    >();

    for (const sale of activePartySales.filter((s) => s.kind === 'barra')) {
      for (const item of sale.items) {
        const prod = products.find((p) => p.id === item.productId);
        const keyName = prod ? prod.name : item.name;
        const caseSize = prod?.caseSize || 36;
        const entry = map.get(keyName) || {
          name: keyName,
          caseSize,
          casesSold: 0,
          looseUnitsSold: 0,
          totalUnitsSold: 0,
          revenueUsd: 0,
        };
        if (item.mode === 'case') {
          entry.casesSold += item.quantity;
        } else {
          entry.looseUnitsSold += item.quantity;
        }
        entry.totalUnitsSold += item.unitsDeducted;
        entry.revenueUsd += item.subtotalUsd;
        map.set(keyName, entry);
      }
    }
    return Array.from(map.values());
  }, [activePartySales, products]);

  const partyTableOrders = useMemo(() => {
    if (!activeParty) return [];
    return tableOrders
      .filter((t) => t.eventId === activeParty.id)
      .sort((a, b) => {
        const rank = (s: TableOrder['status']) =>
          s === 'ready_to_close' ? 0 : s === 'open' ? 1 : s === 'closed' ? 2 : 3;
        const diff = rank(a.status) - rank(b.status);
        return diff !== 0 ? diff : b.openedAt.localeCompare(a.openedAt);
      });
  }, [tableOrders, activeParty]);

  const pendingTableOrders = useMemo(
    () =>
      partyTableOrders.filter(
        (t) => t.status === 'open' || t.status === 'ready_to_close'
      ),
    [partyTableOrders]
  );

  const readyToCloseTables = useMemo(
    () => pendingTableOrders.filter((t) => t.status === 'ready_to_close'),
    [pendingTableOrders]
  );

  const openOnlyTables = useMemo(
    () => pendingTableOrders.filter((t) => t.status === 'open'),
    [pendingTableOrders]
  );

  const closedTableOrders = useMemo(
    () => partyTableOrders.filter((t) => t.status === 'closed'),
    [partyTableOrders]
  );

  const myWaiterTableOrders = useMemo(() => {
    const emailLower = userEmail.trim().toLowerCase();
    return partyTableOrders.filter((t) => t.waiterEmail === emailLower);
  }, [partyTableOrders, userEmail]);

  const reservedUnitsByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of pendingTableOrders) {
      for (const item of order.items) {
        if (!item.productId) continue;
        map.set(
          item.productId,
          (map.get(item.productId) || 0) + item.unitsDeducted
        );
      }
    }
    return map;
  }, [pendingTableOrders]);

  if (!activeParty) {
    return (
      <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto mt-6 space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-[#ECFDF5] text-[#10B981] flex items-center justify-center mx-auto">
          <Flame className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display font-bold text-2xl text-[#0F172A]">
            No hay fiesta encendida en este momento
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {role === 'mesero'
              ? 'Espera a que Caja o el Administrador enciendan el evento para abrir mesas y registrar pedidos.'
              : 'Para facturar en barra (y taquilla si es evento interno), selecciona un evento en el calendario y presiona Encender Fiesta.'}
          </p>
        </div>
        {role !== 'mesero' && (
          <button
            type="button"
            onClick={onGoToCalendar}
            className="min-h-[48px] px-6 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white font-display font-bold text-sm inline-flex items-center gap-2 transition-colors"
          >
            <CalendarDays className="w-5 h-5" />
            Ir al Calendario de Eventos
          </button>
        )}
      </div>
    );
  }

  const isInternalParty = activeParty.type === 'fiesta';
  const effectiveStation: 'taquilla' | 'barra' | 'mesero' =
    role === 'mesero'
      ? 'mesero'
      : role === 'taquilla'
        ? 'taquilla'
        : role === 'caja'
          ? 'barra'
          : isInternalParty
            ? activeStation
            : 'barra';

  const getAvailableStockForCart = (productId: string, baseStock: number) => {
    const reserved = reservedUnitsByProduct.get(productId) || 0;
    return Math.max(0, baseStock - reserved);
  };

  // Cart helpers
  const addToCart = (product: Product, mode: 'unit' | 'case') => {
    const unitsPerQty = mode === 'case' ? product.caseSize : 1;
    const price =
      mode === 'case'
        ? product.priceCaseUsd || product.priceUnitUsd * product.caseSize
        : product.priceUnitUsd;
    const cost =
      mode === 'case'
        ? product.costCaseUsd || product.costUnitUsd * product.caseSize
        : product.costUnitUsd;

    const key = `${product.id}_${mode}`;
    const currentUnitsInCartForProduct = cart
      .filter((c) => c.productId === product.id)
      .reduce((sum, c) => sum + c.quantity * c.unitsPerQty, 0);
    const availableStock = getAvailableStockForCart(
      product.id,
      product.stockUnits
    );

    if (currentUnitsInCartForProduct + unitsPerQty > availableStock) {
      triggerFlash(
        `Stock insuficiente para ${product.name} (disponible libre: ${availableStock} unid.)`
      );
      return;
    }

    setCartQtyDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) {
        return prev.map((c) =>
          c.key === key ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          name:
            mode === 'case'
              ? `${product.name} (Caja ${product.caseSize})`
              : product.name,
          mode,
          quantity: 1,
          unitsPerQty,
          unitPriceUsd: price,
          unitCostUsd: cost,
        },
      ];
    });
  };

  const updateCartQty = (key: string, delta: number) => {
    setCartQtyDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.key !== key) return c;
          const nextQty = c.quantity + delta;
          if (nextQty <= 0) return null;
          const prod = products.find((p) => p.id === c.productId);
          if (prod && delta > 0) {
            const otherUnits = prev
              .filter((o) => o.productId === c.productId && o.key !== key)
              .reduce((sum, o) => sum + o.quantity * o.unitsPerQty, 0);
            const availableStock = getAvailableStockForCart(
              prod.id,
              prod.stockUnits
            );
            if (otherUnits + nextQty * c.unitsPerQty > availableStock) {
              triggerFlash(`Tope de stock alcanzado para ${prod.name}`);
              return c;
            }
          }
          return { ...c, quantity: nextQty };
        })
        .filter(Boolean) as CartEntry[]
    );
  };

  const setCartExactQty = (key: string, rawQty: string) => {
    setCartQtyDrafts((prev) => ({ ...prev, [key]: rawQty }));
    const parsed = parseInt(rawQty, 10);
    if (Number.isNaN(parsed) || parsed < 1) return;

    setCart((prev) =>
      prev.map((c) => {
        if (c.key !== key) return c;
        const prod = products.find((p) => p.id === c.productId);
        if (prod) {
          const otherUnits = prev
            .filter((o) => o.productId === c.productId && o.key !== key)
            .reduce((sum, o) => sum + o.quantity * o.unitsPerQty, 0);
          const availableStock = getAvailableStockForCart(
            prod.id,
            prod.stockUnits
          );
          const maxQty = Math.max(
            1,
            Math.floor((availableStock - otherUnits) / c.unitsPerQty)
          );
          if (parsed > maxQty) {
            triggerFlash(
              `Stock máximo disponible para ${prod.name}: ${maxQty}`
            );
            setCartQtyDrafts((d) => ({ ...d, [key]: String(maxQty) }));
            return { ...c, quantity: maxQty };
          }
        }
        return { ...c, quantity: parsed };
      })
    );
  };

  const cartTotalUsd = cart.reduce(
    (sum, item) => sum + item.unitPriceUsd * item.quantity,
    0
  );
  const cartTotalBs = cartTotalUsd * effectiveRate;

  const checkoutTotalUsd = chargingTableOrder
    ? chargingTableOrder.items.reduce((sum, i) => sum + i.subtotalUsd, 0)
    : cartTotalUsd;
  const checkoutTotalBs = checkoutTotalUsd * effectiveRate;

  const initCheckoutModalForTotal = (totalUsd: number) => {
    const initUsd1 = Number(Math.min(3, totalUsd).toFixed(2));
    const initUsd2 = Number(Math.max(0, totalUsd - initUsd1).toFixed(2));
    setPaymentMode('single');
    setSingleMethod('efectivo_usd');
    setSharedMethod1('pago_movil');
    setSharedMethod2('zelle');
    setSharedMethod1Currency('usd');
    setSharedMethod2Currency('usd');
    setSharedLastEdited(1);
    setSharedMethod1Amount(initUsd1.toFixed(2));
    setSharedMethod2Amount(initUsd2.toFixed(2));
    setReceivedAmountInput(totalUsd.toFixed(2));
    setChangeNote('');
    setShowPayInvoiceModal(true);
  };

  const openPayInvoiceModal = () => {
    if (cart.length === 0) return;
    setChargingTableOrder(null);
    initCheckoutModalForTotal(cartTotalUsd);
  };

  const openPayTableOrderModal = (order: TableOrder) => {
    setChargingTableOrder(order);
    const total = order.items.reduce((sum, i) => sum + i.subtotalUsd, 0);
    initCheckoutModalForTotal(total);
  };

  // Bi-directional Shared payment math (Method 1 <-> Method 2)
  const rawShared1 = Math.max(0, parseFloat(sharedMethod1Amount) || 0);
  const rawShared2 = Math.max(0, parseFloat(sharedMethod2Amount) || 0);

  let sharedUsd1 = 0;
  let sharedUsd2 = 0;
  if (sharedLastEdited === 1) {
    sharedUsd1 = Math.min(
      checkoutTotalUsd,
      sharedMethod1Currency === 'bs' && effectiveRate > 0
        ? rawShared1 / effectiveRate
        : rawShared1
    );
    sharedUsd2 = Math.max(0, checkoutTotalUsd - sharedUsd1);
  } else {
    sharedUsd2 = Math.min(
      checkoutTotalUsd,
      sharedMethod2Currency === 'bs' && effectiveRate > 0
        ? rawShared2 / effectiveRate
        : rawShared2
    );
    sharedUsd1 = Math.max(0, checkoutTotalUsd - sharedUsd2);
  }
  const sharedBs1 = sharedUsd1 * effectiveRate;
  const sharedBs2 = sharedUsd2 * effectiveRate;

  const parsedReceivedVal = Math.max(0, parseFloat(receivedAmountInput) || 0);
  const changeUsd =
    paymentMode === 'single' && singleMethod === 'efectivo_usd'
      ? Math.max(0, parsedReceivedVal - checkoutTotalUsd)
      : 0;
  const changeBs =
    paymentMode === 'single' &&
    (singleMethod === 'pago_movil' || singleMethod === 'tarjeta')
      ? Math.max(0, parsedReceivedVal - checkoutTotalBs)
      : changeUsd * effectiveRate;

  const handleSelectSingleMethod = (method: SinglePaymentChannel) => {
    setSingleMethod(method);
    if (method === 'efectivo_usd' || method === 'zelle') {
      setReceivedAmountInput(checkoutTotalUsd.toFixed(2));
    } else {
      setReceivedAmountInput(checkoutTotalBs.toFixed(2));
    }
  };

  const handleSelectSharedM1 = (ch: SinglePaymentChannel) => {
    if (ch === sharedMethod2) {
      setSharedMethod2(sharedMethod1);
      if (sharedMethod1 === 'efectivo_usd' || sharedMethod1 === 'zelle') {
        setSharedMethod2Currency('usd');
      }
    }
    setSharedMethod1(ch);
    if (ch === 'efectivo_usd' || ch === 'zelle') {
      setSharedMethod1Currency('usd');
      setSharedMethod1Amount(sharedUsd1.toFixed(2));
    }
  };

  const handleSelectSharedM2 = (ch: SinglePaymentChannel) => {
    if (ch === sharedMethod1) {
      setSharedMethod1(sharedMethod2);
      if (sharedMethod2 === 'efectivo_usd' || sharedMethod2 === 'zelle') {
        setSharedMethod1Currency('usd');
      }
    }
    setSharedMethod2(ch);
    if (ch === 'efectivo_usd' || ch === 'zelle') {
      setSharedMethod2Currency('usd');
      setSharedMethod2Amount(sharedUsd2.toFixed(2));
    }
  };

  const handleConfirmClosePaidInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chargingTableOrder && cart.length === 0) return;

    let finalMethod: PaymentMethod;
    let breakdown: PaymentBreakdown;
    let amountReceivedUsd: number | undefined;
    let amountReceivedBs: number | undefined;
    let changeGivenUsd: number | undefined;
    let changeGivenBs: number | undefined;

    if (paymentMode === 'single') {
      finalMethod = singleMethod;
      if (singleMethod === 'efectivo_usd') {
        breakdown = {
          efectivoUsd: checkoutTotalUsd,
          zelleUsd: 0,
          bsAmount: 0,
          pagoMovilBs: 0,
          tarjetaBs: 0,
        };
        amountReceivedUsd = parsedReceivedVal;
        changeGivenUsd = changeUsd;
        changeGivenBs = changeUsd * effectiveRate;
      } else if (singleMethod === 'zelle') {
        breakdown = {
          efectivoUsd: 0,
          zelleUsd: checkoutTotalUsd,
          bsAmount: 0,
          pagoMovilBs: 0,
          tarjetaBs: 0,
        };
        amountReceivedUsd = checkoutTotalUsd;
      } else if (singleMethod === 'pago_movil') {
        breakdown = {
          efectivoUsd: 0,
          zelleUsd: 0,
          bsAmount: checkoutTotalBs,
          pagoMovilBs: checkoutTotalBs,
          tarjetaBs: 0,
        };
        amountReceivedBs = parsedReceivedVal;
        changeGivenBs = changeBs;
      } else {
        breakdown = {
          efectivoUsd: 0,
          zelleUsd: 0,
          bsAmount: checkoutTotalBs,
          pagoMovilBs: 0,
          tarjetaBs: checkoutTotalBs,
        };
        amountReceivedBs = parsedReceivedVal;
        changeGivenBs = changeBs;
      }
    } else {
      finalMethod = 'mixto';
      breakdown = buildSharedBreakdown(
        sharedMethod1,
        sharedMethod2,
        sharedUsd1,
        sharedUsd2,
        effectiveRate
      );
      amountReceivedUsd = Number(
        (breakdown.efectivoUsd + breakdown.zelleUsd).toFixed(2)
      );
      amountReceivedBs = breakdown.bsAmount;
    }

    const sharedNote =
      paymentMode === 'shared'
        ? `${PAYMENT_CHANNEL_META.find((m) => m.id === sharedMethod1)?.shortLabel}: ${formatUsd(sharedUsd1)} + ${PAYMENT_CHANNEL_META.find((m) => m.id === sharedMethod2)?.shortLabel}: ${formatUsd(sharedUsd2)}`
        : '';
    const finalNote = [sharedNote, changeNote.trim()]
      .filter(Boolean)
      .join(' · ');

    if (chargingTableOrder) {
      await onCloseTableOrder({
        orderId: chargingTableOrder.id,
        paymentMethod: finalMethod,
        paymentBreakdown: breakdown,
        amountReceivedUsd,
        amountReceivedBs,
        changeGivenUsd,
        changeGivenBs,
        changeNote: finalNote || undefined,
      });
      const closedName = chargingTableOrder.tableName;
      setChargingTableOrder(null);
      setShowPayInvoiceModal(false);
      triggerFlash(
        `Mesa ${closedName} cerrada y cobrada: ${formatUsd(checkoutTotalUsd)}`
      );
      return;
    }

    const items: SaleLineItem[] = cart.map((c) => ({
      productId: c.productId,
      name: c.name,
      mode: c.mode,
      quantity: c.quantity,
      unitsDeducted: c.quantity * c.unitsPerQty,
      unitPriceUsd: c.unitPriceUsd,
      subtotalUsd: c.unitPriceUsd * c.quantity,
      unitCostUsd: c.unitCostUsd,
    }));

    onRecordSale({
      kind: 'barra',
      items,
      paymentMethod: finalMethod,
      paymentBreakdown: breakdown,
      amountReceivedUsd,
      amountReceivedBs,
      changeGivenUsd,
      changeGivenBs,
      changeNote: finalNote || undefined,
    });

    setCart([]);
    setShowPayInvoiceModal(false);
    triggerFlash(
      `Factura cerrada como pagada: ${formatUsd(checkoutTotalUsd)}${
        changeGivenUsd && changeGivenUsd > 0
          ? ` · Vuelto: ${formatUsd(changeGivenUsd)}`
          : ''
      }`
    );
  };

  // Mesero: Submit or Append Order to Table
  const editingTableOrder = editingTableOrderId
    ? pendingTableOrders.find((t) => t.id === editingTableOrderId) || null
    : null;

  const matchingOpenTableByName =
    editingTableOrder ||
    pendingTableOrders.find(
      (t) =>
        t.tableName.trim().toLowerCase() === tableNameInput.trim().toLowerCase()
    ) ||
    null;

  const handleSubmitMeseroOrder = async () => {
    const cleanTable = tableNameInput.trim();
    if (!cleanTable) {
      triggerFlash('Escribe el nombre o número de la mesa (ej: Mesa 1).');
      return;
    }
    if (cart.length === 0) {
      triggerFlash('Agrega al menos una bebida al pedido de la mesa.');
      return;
    }

    const newLines: SaleLineItem[] = cart.map((c) => ({
      productId: c.productId,
      name: c.name,
      mode: c.mode,
      quantity: c.quantity,
      unitsDeducted: c.quantity * c.unitsPerQty,
      unitPriceUsd: c.unitPriceUsd,
      subtotalUsd: Number((c.unitPriceUsd * c.quantity).toFixed(2)),
      unitCostUsd: c.unitCostUsd,
    }));

    let mergedItems: SaleLineItem[] = newLines;
    if (matchingOpenTableByName) {
      const mergedMap = new Map<string, SaleLineItem>();
      for (const item of matchingOpenTableByName.items) {
        const key = `${item.productId || item.name}_${item.mode}`;
        mergedMap.set(key, { ...item });
      }
      for (const addItem of newLines) {
        const key = `${addItem.productId || addItem.name}_${addItem.mode}`;
        const prev = mergedMap.get(key);
        if (prev) {
          mergedMap.set(key, {
            ...prev,
            quantity: prev.quantity + addItem.quantity,
            unitsDeducted: prev.unitsDeducted + addItem.unitsDeducted,
            subtotalUsd: Number((prev.subtotalUsd + addItem.subtotalUsd).toFixed(2)),
          });
        } else {
          mergedMap.set(key, { ...addItem });
        }
      }
      mergedItems = Array.from(mergedMap.values());
    }

    setSavingTableOrder(true);
    try {
      await onSaveTableOrder({
        existingOrderId: matchingOpenTableByName?.id,
        tableName: matchingOpenTableByName
          ? matchingOpenTableByName.tableName
          : cleanTable,
        items: mergedItems,
        notes: tableNotesInput.trim() || matchingOpenTableByName?.notes,
        status:
          matchingOpenTableByName?.status === 'ready_to_close'
            ? 'ready_to_close'
            : 'open',
      });

      const targetLabel = matchingOpenTableByName
        ? matchingOpenTableByName.tableName
        : cleanTable;
      setCart([]);
      setCartQtyDrafts({});
      setTableNotesInput('');
      setEditingTableOrderId(null);
      triggerFlash(
        matchingOpenTableByName
          ? `Pedido sumado a ${targetLabel}.`
          : `${targetLabel} abierta con pedido registrado.`
      );
    } finally {
      setSavingTableOrder(false);
    }
  };

  // Fast 1-2 Click Taquilla Charge
  const ticketQty = Math.max(0, parseInt(ticketCountInput || '0', 10) || 0);
  const entryUnitPrice = activeParty.entryPriceUsd || 0;
  const taquillaSubtotalUsd = ticketQty * entryUnitPrice;
  const taquillaSubtotalBs = taquillaSubtotalUsd * effectiveRate;

  // Bi-directional Taquilla Shared values
  const taqComputedUsd1 =
    taquillaLastEdited === 1
      ? Math.min(
          taquillaSubtotalUsd,
          Math.max(0, parseFloat(taquillaSharedUsd1) || 0)
        )
      : Math.max(
          0,
          taquillaSubtotalUsd -
            Math.min(
              taquillaSubtotalUsd,
              Math.max(0, parseFloat(taquillaSharedUsd2) || 0)
            )
        );
  const taqComputedUsd2 = Math.max(0, taquillaSubtotalUsd - taqComputedUsd1);
  const taqComputedBs1 = taqComputedUsd1 * effectiveRate;
  const taqComputedBs2 = taqComputedUsd2 * effectiveRate;

  const adjustTicketQty = (delta: number) => {
    const next = Math.max(1, ticketQty + delta);
    setTicketCountInput(String(next));
  };

  const handleInstantTaquillaCharge = (method: PaymentMethod) => {
    if (ticketQty <= 0) return;

    let breakdown: PaymentBreakdown;
    if (method === 'efectivo_usd') {
      breakdown = {
        efectivoUsd: taquillaSubtotalUsd,
        zelleUsd: 0,
        bsAmount: 0,
        pagoMovilBs: 0,
        tarjetaBs: 0,
      };
    } else if (method === 'zelle') {
      breakdown = {
        efectivoUsd: 0,
        zelleUsd: taquillaSubtotalUsd,
        bsAmount: 0,
        pagoMovilBs: 0,
        tarjetaBs: 0,
      };
    } else if (method === 'pago_movil') {
      breakdown = {
        efectivoUsd: 0,
        zelleUsd: 0,
        bsAmount: taquillaSubtotalBs,
        pagoMovilBs: taquillaSubtotalBs,
        tarjetaBs: 0,
      };
    } else if (method === 'tarjeta') {
      breakdown = {
        efectivoUsd: 0,
        zelleUsd: 0,
        bsAmount: taquillaSubtotalBs,
        pagoMovilBs: 0,
        tarjetaBs: taquillaSubtotalBs,
      };
    } else {
      breakdown = buildSharedBreakdown(
        taquillaSharedM1,
        taquillaSharedM2,
        taqComputedUsd1,
        taqComputedUsd2,
        effectiveRate
      );
    }

    onRecordSale({
      kind: 'taquilla',
      items: [
        {
          name: `Entradas ${activeParty.name}`,
          mode: 'entry',
          quantity: ticketQty,
          unitsDeducted: 0,
          unitPriceUsd: entryUnitPrice,
          subtotalUsd: taquillaSubtotalUsd,
          unitCostUsd: 0,
        },
      ],
      paymentMethod: method,
      paymentBreakdown: breakdown,
    });

    setTaquillaSharedMode(false);
    triggerFlash(
      `Taquilla cobrada: +${ticketQty} persona(s) · ${formatUsd(taquillaSubtotalUsd)}`
    );
    setTicketCountInput('1');
  };

  // Cortesía Checkout
  const handleConfirmCourtesy = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    if (!courtesyRecipient.trim() || !courtesyReason.trim()) return;

    const courtesyItems: CourtesyItem[] = cart.map((c) => ({
      productId: c.productId,
      name: c.name,
      mode: c.mode,
      quantity: c.quantity,
      unitsDeducted: c.quantity * c.unitsPerQty,
      costUsd: c.unitCostUsd * c.quantity,
    }));

    onRecordCourtesy({
      recipient: courtesyRecipient.trim(),
      reason: courtesyReason.trim(),
      items: courtesyItems,
    });

    setCart([]);
    setCourtesyRecipient('');
    setCourtesyReason('');
    setShowCourtesyModal(false);
    triggerFlash('Cortesía / Consumo interno descontado de cava.');
  };

  // Suspend Sale Checkout
  const handleConfirmSuspend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendingSale) return;
    if (suspendNote.trim().length < 5) {
      setSuspendError(
        'Debes escribir una nota explicativa (mínimo 5 caracteres) para auditoría.'
      );
      return;
    }
    onSuspendSale(suspendingSale.id, suspendNote.trim());
    setSuspendingSale(null);
    setSuspendNote('');
    setSuspendError('');
    triggerFlash('Factura suspendida (sin afectar inventario ni ventas).');
  };

  const filteredProducts = products.filter((p) => {
    const matchesCat = categoryTab === 'all' || p.category === categoryTab;
    const matchesSearch =
      productSearch.trim() === '' ||
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.presentation || '').toLowerCase().includes(productSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Flash Feedback */}
      {flashMessage && (
        <div className="bg-[#0F172A] text-white px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>{flashMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setFlashMessage(null)}
            className="text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Fiesta Command Header (Dollar primary + Bs miniature) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-[#059669]">
            {role === 'mesero'
              ? `Estación Mesero · ${userName}`
              : isInternalParty
                ? 'Evento Interno Encendido · Taquilla y Facturación Barra'
                : `Evento Privado Encendido · ${activeParty.eventSubType || 'Alquiler Completo'}`}
          </div>
          <h2 className="font-display font-bold text-2xl text-[#0F172A] mt-0.5">
            {activeParty.name}
          </h2>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 mt-1.5 tabular-nums">
            <span>
              Apertura:{' '}
              <strong className="tabular-nums text-[#0F172A]">
                {activeParty.openedAt ? formatTime(activeParty.openedAt) : 'Hoy'}
              </strong>
            </span>
            {role !== 'mesero' && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Recaudado:{' '}
                  <strong className="tabular-nums text-base text-[#059669]">
                    {formatUsd(totalNightUsd)}
                  </strong>{' '}
                  <span className="tabular-nums text-[11px] text-slate-500">
                    ({formatBs(totalNightBs)})
                  </span>
                </span>
              </>
            )}
            {isInternalParty && role !== 'mesero' && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Aforo Taquilla:{' '}
                  <strong className="tabular-nums text-[#0F172A]">
                    {confirmedAttendees} personas
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>

        {role !== 'mesero' && (
          <button
            type="button"
            onClick={() => setShowCloseConfirm(true)}
            className="min-h-[50px] px-5 py-3 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <PowerOff className="w-4 h-4" />
            CERRAR FIESTA Y HACER CIERRE DE CAJA
          </button>
        )}
      </div>

      {/* Station Selector: Only Admin switches stations; Taquilla & Caja see ONLY their assigned station */}
      {role === 'admin' ? (
        isInternalParty ? (
          <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveStation('taquilla')}
              className={`min-h-[60px] px-4 py-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
                effectiveStation === 'taquilla'
                  ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-sm'
                  : 'bg-slate-50 text-[#0F172A] border-[#CBD5E1] hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    effectiveStation === 'taquilla'
                      ? 'bg-[#10B981] text-white'
                      : 'bg-[#ECFDF5] text-[#059669] border border-[#10B981]/30'
                  }`}
                >
                  <Ticket className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm sm:text-base truncate">
                    1. Taquilla (Entradas)
                  </div>
                  <div
                    className={`text-xs truncate ${
                      effectiveStation === 'taquilla'
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    Cobro de entradas y aforo
                  </div>
                </div>
              </div>
              <div className="text-right tabular-nums shrink-0">
                <div className="font-extrabold text-sm sm:text-base">
                  {formatUsd(taquillaTotalUsd)}
                </div>
                <div
                  className={`text-[11px] ${
                    effectiveStation === 'taquilla'
                      ? 'text-emerald-300'
                      : 'text-slate-500'
                  }`}
                >
                  {confirmedAttendees} pers.
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveStation('barra')}
              className={`min-h-[60px] px-4 py-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
                effectiveStation === 'barra'
                  ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-sm'
                  : 'bg-slate-50 text-[#0F172A] border-[#CBD5E1] hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    effectiveStation === 'barra'
                      ? 'bg-[#1D4ED8] text-white'
                      : 'bg-blue-50 text-[#1D4ED8] border border-blue-200'
                  }`}
                >
                  <Beer className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm sm:text-base truncate">
                    2. Barra y Licores
                  </div>
                  <div
                    className={`text-xs truncate ${
                      effectiveStation === 'barra'
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    Venta de bebidas, cajas y facturas
                  </div>
                </div>
              </div>
              <div className="text-right tabular-nums shrink-0">
                <div className="font-extrabold text-sm sm:text-base">
                  {formatUsd(barraTotalUsd)}
                </div>
                <div
                  className={`text-[11px] ${
                    effectiveStation === 'barra'
                      ? 'text-blue-300'
                      : 'text-slate-500'
                  }`}
                >
                  {activeBarraSales.length} fact.
                </div>
              </div>
            </button>
          </div>
        ) : (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <div className="font-display font-bold text-sm text-indigo-950">
                  Evento Privado · {activeParty.eventSubType || 'Alquiler Completo'}
                </div>
                <div className="text-xs text-indigo-800">
                  Organiza: {activeParty.organizer || activeParty.clientName || 'Particular'} · Local alquilado completo sin control de taquilla (vista exclusiva de Barra y Licores).
                </div>
              </div>
            </div>
          </div>
        )
      ) : role === 'taquilla' && !isInternalParty ? (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 text-center space-y-2">
          <Lock className="w-7 h-7 text-indigo-700 mx-auto" />
          <h3 className="font-display font-bold text-base text-indigo-950">
            Evento Privado Sin Taquilla ({activeParty.eventSubType || 'Alquiler Completo'})
          </h3>
          <p className="text-xs text-indigo-800 max-w-md mx-auto">
            Este evento es un alquiler privado y no cobra entradas en taquilla. Tu estación de Taquilla permanecerá en espera mientras opera la Barra.
          </p>
        </div>
      ) : null}

      {/* ===================================================================== */}
      {/* VISTA 1: TAQUILLA (ENTRADAS)                                         */}
      {/* ===================================================================== */}
      {isInternalParty && effectiveStation === 'taquilla' && (
        <div className="space-y-6">
          {/* Taquilla Live KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4">
              <div className="text-xs font-semibold text-slate-500">
                Total Entradas Vendidas
              </div>
              <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1">
                {confirmedAttendees}{' '}
                <span className="text-sm font-semibold text-slate-500">
                  pers.
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {activeTaquillaSales.length} cobro(s) activos
              </div>
            </div>

            <div className="bg-[#ECFDF5] border border-[#10B981]/40 rounded-2xl p-4">
              <div className="text-xs font-bold text-[#065F46]">
                Recaudado en Taquilla
              </div>
              <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1">
                {formatUsd(taquillaTotalUsd)}
              </div>
              <div className="text-[11px] text-[#065F46] tabular-nums">
                {formatBs(taquillaTotalBs)}
              </div>
            </div>

            <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4">
              <div className="text-xs font-semibold text-slate-500">
                Efectivo ($) + Zelle ($)
              </div>
              <div className="font-extrabold text-xl text-[#0F172A] tabular-nums mt-1">
                {formatUsd(
                  taquillaBreakdown.efectivoUsd + taquillaBreakdown.zelleUsd
                )}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                Efec: {formatUsd(taquillaBreakdown.efectivoUsd)} · Zelle:{' '}
                {formatUsd(taquillaBreakdown.zelleUsd)}
              </div>
            </div>

            <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4">
              <div className="text-xs font-semibold text-slate-500">
                Bolívares en Taquilla
              </div>
              <div className="font-extrabold text-xl text-[#1D4ED8] tabular-nums mt-1">
                {formatBs(taquillaBreakdown.bsAmount)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Pago Móvil / Punto
              </div>
            </div>
          </div>

          {/* Fast 1-2 Click Taquilla Charge Card */}
          <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#ECFDF5] border border-[#10B981]/30 text-[#059669] flex items-center justify-center shrink-0">
                  <Ticket className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-xl text-[#0F172A]">
                    Taquilla de Entradas · {activeParty.name}
                  </h3>
                  <p className="text-sm text-slate-600">
                    Precio por entrada:{' '}
                    <strong className="tabular-nums text-[#0F172A]">
                      {formatUsd(entryUnitPrice)}
                    </strong>{' '}
                    <span className="tabular-nums text-[11px] text-slate-500">
                      ({formatBs(entryUnitPrice * effectiveRate)})
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center border border-[#CBD5E1] rounded-xl bg-slate-100 p-1.5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => adjustTicketQty(-1)}
                    className="min-w-[46px] min-h-[46px] rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 font-bold text-sm flex items-center justify-center"
                  >
                    -1
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="5000"
                    aria-label="Cantidad de personas"
                    value={ticketCountInput}
                    onChange={(e) => setTicketCountInput(e.target.value)}
                    className="w-24 min-h-[46px] text-center font-extrabold text-2xl text-[#0F172A] bg-white border border-[#CBD5E1] rounded-lg tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => adjustTicketQty(1)}
                    className="min-w-[46px] min-h-[46px] rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustTicketQty(5)}
                    className="min-w-[46px] min-h-[46px] rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 font-bold text-xs px-2.5"
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustTicketQty(10)}
                    className="min-w-[46px] min-h-[46px] rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 font-bold text-xs px-2.5"
                  >
                    +10
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustTicketQty(50)}
                    className="min-w-[46px] min-h-[46px] rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 font-bold text-xs px-2.5"
                  >
                    +50
                  </button>
                </div>

                <div className="px-5 py-2.5 rounded-xl bg-[#ECFDF5] border border-[#10B981]/40 text-right tabular-nums min-w-[175px]">
                  <div className="text-[11px] font-bold uppercase text-[#065F46]">
                    Total {ticketQty} entrada{ticketQty === 1 ? '' : 's'}
                  </div>
                  <div className="tabular-nums font-extrabold text-2xl text-[#0F172A]">
                    {formatUsd(taquillaSubtotalUsd)}
                  </div>
                  <div className="tabular-nums text-xs text-slate-600">
                    {formatBs(taquillaSubtotalBs)}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={ticketQty <= 0}
                onClick={() => handleInstantTaquillaCharge('efectivo_usd')}
                className="min-h-[44px] px-2.5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Banknote className="w-4 h-4 shrink-0" />
                Efectivo ($)
              </button>
              <button
                type="button"
                disabled={ticketQty <= 0}
                onClick={() => handleInstantTaquillaCharge('zelle')}
                className="min-h-[44px] px-2.5 py-2 rounded-xl bg-[#6366F1] hover:bg-indigo-600 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Wallet className="w-4 h-4 shrink-0" />
                Zelle ($)
              </button>
              <button
                type="button"
                disabled={ticketQty <= 0}
                onClick={() => handleInstantTaquillaCharge('pago_movil')}
                className="min-h-[44px] px-2.5 py-2 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                Pago Móvil
              </button>
              <button
                type="button"
                disabled={ticketQty <= 0}
                onClick={() => handleInstantTaquillaCharge('tarjeta')}
                className="min-h-[44px] px-2.5 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                Tarjeta
              </button>
              <button
                type="button"
                disabled={ticketQty <= 0}
                onClick={() => {
                  const half = Number((taquillaSubtotalUsd / 2).toFixed(2));
                  const rem = Math.max(
                    0,
                    Number((taquillaSubtotalUsd - half).toFixed(2))
                  );
                  setTaquillaLastEdited(1);
                  setTaquillaSharedUsd1(half.toFixed(2));
                  setTaquillaSharedUsd2(rem.toFixed(2));
                  setTaquillaSharedMode((prev) => !prev);
                }}
                className="col-span-2 sm:col-span-1 min-h-[44px] px-2.5 py-2 rounded-xl bg-[#F59E0B] hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Split className="w-4 h-4 shrink-0" />
                Compartido
              </button>
            </div>

            {taquillaSharedMode && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-amber-950 text-xs uppercase tracking-wide">
                    Pago Compartido Taquilla (Edita cualquiera de los 2 montos)
                  </span>
                  <span className="font-bold text-slate-700 tabular-nums">
                    Total: {formatUsd(taquillaSubtotalUsd)} ·{' '}
                    {formatBs(taquillaSubtotalBs)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
                  {/* Método 1 */}
                  <div className="md:col-span-5 bg-white border border-amber-300 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-amber-950">Método 1:</span>
                      <select
                        value={taquillaSharedM1}
                        onChange={(e) => {
                          const ch = e.target.value as SinglePaymentChannel;
                          if (ch === taquillaSharedM2)
                            setTaquillaSharedM2(taquillaSharedM1);
                          setTaquillaSharedM1(ch);
                        }}
                        className="min-h-[36px] px-2.5 bg-slate-50 border border-amber-300 rounded-lg font-bold text-xs"
                      >
                        {PAYMENT_CHANNEL_META.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-500 text-sm">$</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={taquillaSubtotalUsd}
                        aria-label="Monto Método 1 en dólares"
                        value={
                          taquillaLastEdited === 1
                            ? taquillaSharedUsd1
                            : taqComputedUsd1.toFixed(2)
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          const num = Math.min(
                            taquillaSubtotalUsd,
                            Math.max(0, parseFloat(val) || 0)
                          );
                          setTaquillaLastEdited(1);
                          setTaquillaSharedUsd1(val);
                          setTaquillaSharedUsd2(
                            Math.max(0, taquillaSubtotalUsd - num).toFixed(2)
                          );
                        }}
                        className="flex-1 min-h-[42px] px-3 bg-white border border-amber-300 rounded-xl font-bold text-lg text-[#0F172A] tabular-nums"
                      />
                    </div>
                    {PAYMENT_CHANNEL_META.find((m) => m.id === taquillaSharedM1)
                      ?.isBs && (
                      <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between tabular-nums">
                        <span className="text-[11px] font-bold text-blue-900">
                          A cobrar en Bs.:
                        </span>
                        <span className="text-base font-bold text-[#1D4ED8]">
                          {formatBs(taqComputedBs1)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Método 2 */}
                  <div className="md:col-span-5 bg-white border border-amber-300 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-amber-950">Método 2:</span>
                      <select
                        value={taquillaSharedM2}
                        onChange={(e) => {
                          const ch = e.target.value as SinglePaymentChannel;
                          if (ch === taquillaSharedM1)
                            setTaquillaSharedM1(taquillaSharedM2);
                          setTaquillaSharedM2(ch);
                        }}
                        className="min-h-[36px] px-2.5 bg-slate-50 border border-amber-300 rounded-lg font-bold text-xs"
                      >
                        {PAYMENT_CHANNEL_META.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-500 text-sm">$</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={taquillaSubtotalUsd}
                        aria-label="Monto Método 2 en dólares"
                        value={
                          taquillaLastEdited === 2
                            ? taquillaSharedUsd2
                            : taqComputedUsd2.toFixed(2)
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          const num = Math.min(
                            taquillaSubtotalUsd,
                            Math.max(0, parseFloat(val) || 0)
                          );
                          setTaquillaLastEdited(2);
                          setTaquillaSharedUsd2(val);
                          setTaquillaSharedUsd1(
                            Math.max(0, taquillaSubtotalUsd - num).toFixed(2)
                          );
                        }}
                        className="flex-1 min-h-[42px] px-3 bg-white border border-amber-300 rounded-xl font-bold text-lg text-[#0F172A] tabular-nums"
                      />
                    </div>
                    {PAYMENT_CHANNEL_META.find((m) => m.id === taquillaSharedM2)
                      ?.isBs && (
                      <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between tabular-nums">
                        <span className="text-[11px] font-bold text-blue-900">
                          A cobrar en Bs.:
                        </span>
                        <span className="text-base font-bold text-[#1D4ED8]">
                          {formatBs(taqComputedBs2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirm Button */}
                  <div className="md:col-span-2 flex">
                    <button
                      type="button"
                      onClick={() => handleInstantTaquillaCharge('mixto')}
                      className="w-full min-h-[48px] px-3 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs flex flex-col items-center justify-center gap-0.5 transition-colors"
                    >
                      <span>Confirmar</span>
                      <span className="text-[11px] text-emerald-300 tabular-nums">
                        ({ticketQty} entr.)
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dedicated Taquilla Sales Log */}
          <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-lg text-[#0F172A]">
                  Control de Cobros en Taquilla ({taquillaSales.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Historial exclusivo de entradas registradas en la puerta.
                </p>
              </div>
              <div className="text-right tabular-nums">
                <div className="font-extrabold text-base text-[#059669]">
                  {confirmedAttendees} personas
                </div>
                <div className="text-xs text-slate-500">
                  {formatUsd(taquillaTotalUsd)}
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-200 max-h-[440px] overflow-y-auto">
              {taquillaSales.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Aún no se han cobrado entradas en este evento.
                </div>
              ) : (
                taquillaSales.map((sale) => {
                  const isSuspended = sale.status === 'suspended';
                  const qty = sale.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <div
                      key={sale.id}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSuspended ? 'bg-red-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-slate-600 tabular-nums">
                            {formatTime(sale.timestamp)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-bold text-[#0F172A]">
                            {getPaymentLabel(sale.paymentMethod)}
                          </span>
                          {isSuspended && (
                            <span className="font-bold text-[#EF4444]">
                              · SUSPENDIDA
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-sm font-semibold ${
                            isSuspended
                              ? 'line-through text-red-700'
                              : 'text-[#0F172A]'
                          }`}
                        >
                          {qty} Entrada{qty === 1 ? '' : 's'} ({formatUsd(entryUnitPrice)} c/u)
                        </div>
                        {isSuspended && sale.suspendReason && (
                          <div className="text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1 rounded-lg inline-block">
                            Motivo: {sale.suspendReason}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <div className="text-right tabular-nums mr-1">
                          <div
                            className={`font-bold text-base ${
                              isSuspended
                                ? 'line-through text-red-600'
                                : 'text-[#0F172A]'
                            }`}
                          >
                            {formatUsd(sale.totalUsd)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatBs(sale.totalBs)}
                          </div>
                        </div>

                        {!isSuspended && (
                          <button
                            type="button"
                            onClick={() => {
                              setSuspendingSale(sale);
                              setSuspendNote('');
                              setSuspendError('');
                            }}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
                            Suspender
                          </button>
                        )}

                        {role === 'admin' && (
                          <button
                            type="button"
                            onClick={() => setDeletingSale(sale)}
                            title="Eliminar cobro (Solo Admin)"
                            className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VISTA 2: BARRA Y LICORES (VENTAS DE BEBIDAS Y FACTURAS)               */}
      {/* ===================================================================== */}
      {effectiveStation === 'barra' && (
        <div className="space-y-6">
          {/* Barra Live KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-[#ECFDF5] border border-[#10B981]/40 rounded-2xl p-4">
              <div className="text-xs font-bold text-[#065F46]">
                Ventas de Barra y Licores
              </div>
              <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1">
                {formatUsd(barraTotalUsd)}
              </div>
              <div className="text-[11px] text-[#065F46] tabular-nums">
                {formatBs(barraTotalBs)}
              </div>
            </div>

            <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4">
              <div className="text-xs font-semibold text-slate-500">
                Facturas Pagadas en Barra
              </div>
              <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1">
                {activeBarraSales.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {barraSales.filter((s) => s.status === 'suspended').length}{' '}
                suspendida(s)
              </div>
            </div>

            <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4">
              <div className="text-xs font-semibold text-[#6366F1]">
                Cortesías / Consumo Interno
              </div>
              <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-1">
                {partyCourtesies.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Descontadas de cava a $0.00
              </div>
            </div>
          </div>

          {/* Compact Notification Box for Waiter Tables (does not cover the POS screen) */}
          {barraSubView === 'pos' ? (
            <>
              <div
                className={`rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  readyToCloseTables.length > 0
                    ? 'bg-amber-50 border-2 border-[#F59E0B] shadow-xs'
                    : 'bg-white border border-[#CBD5E1] shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      readyToCloseTables.length > 0
                        ? 'bg-[#F59E0B] text-white'
                        : pendingTableOrders.length > 0
                          ? 'bg-blue-50 text-[#1D4ED8] border border-blue-200'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {readyToCloseTables.length > 0 ? (
                      <Bell className="w-5 h-5" />
                    ) : (
                      <ClipboardList className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    {readyToCloseTables.length > 0 ? (
                      <>
                        <div className="font-display font-bold text-sm text-amber-950 flex flex-wrap items-center gap-1.5">
                          <span>
                            ¡Aviso de Cierre de Mesa! ({readyToCloseTables.length})
                          </span>
                          <span className="text-xs font-semibold text-amber-900">
                            ·{' '}
                            {readyToCloseTables
                              .map((t) => t.tableName)
                              .join(', ')}
                          </span>
                        </div>
                        <p className="text-xs text-amber-900 mt-0.5 tabular-nums">
                          {readyToCloseTables.length} mesa(s) pidiendo cobro y{' '}
                          {openOnlyTables.length} abierta(s) en curso.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="font-display font-bold text-sm text-[#0F172A]">
                          Mesas de Meseros
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                          {pendingTableOrders.length > 0
                            ? `${pendingTableOrders.length} mesa(s) abierta(s) sin solicitud de cierre aún`
                            : 'Sin solicitudes de cierre ni mesas abiertas en este momento'}
                          {closedTableOrders.length > 0
                            ? ` · ${closedTableOrders.length} cerrada(s)`
                            : ''}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setBarraSubView('mesas')}
                  className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                    readyToCloseTables.length > 0
                      ? 'bg-[#0F172A] hover:bg-slate-800 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-[#0F172A] border border-[#CBD5E1]'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" />
                  {readyToCloseTables.length > 0
                    ? `Ver Mesas y Cobrar (${pendingTableOrders.length})`
                    : `Ver Sección Mesas (${partyTableOrders.length})`}
                </button>
              </div>
            </>
          ) : (
            /* Dedicated Mesas Section inside Caja */
            <div className="space-y-5">
              <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setBarraSubView('pos')}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-[#0F172A] text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Volver a Caja / Barra
                  </button>
                  <div>
                    <h3 className="font-display font-bold text-lg text-[#0F172A]">
                      Mesas de Meseros · Avisos, Cobro y Cierre
                    </h3>
                    <p className="text-xs text-slate-600 tabular-nums">
                      {readyToCloseTables.length} pidiendo cierre ·{' '}
                      {openOnlyTables.length} abiertas ·{' '}
                      {closedTableOrders.length} cerradas hoy
                    </p>
                  </div>
                </div>
              </div>

              {readyToCloseTables.length > 0 && (
                <div className="bg-amber-50 border-2 border-[#F59E0B] rounded-2xl p-4 flex items-start gap-3">
                  <Bell className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950 space-y-1">
                    <div className="font-bold text-sm">
                      Aviso de Cierre Activo ({readyToCloseTables.length} mesa
                      {readyToCloseTables.length === 1 ? '' : 's'})
                    </div>
                    <p>
                      Los meseros solicitaron el cobro y cierre de:{' '}
                      <strong>
                        {readyToCloseTables
                          .map((t) => `${t.tableName} (${t.waiterName})`)
                          .join(', ')}
                      </strong>
                      . Presiona <strong>Cobrar y Cerrar Mesa</strong> para registrar el pago y descontar inventario.
                    </p>
                  </div>
                </div>
              )}

              {/* All Active Tables (Closure Requests first + Open Tables) */}
              <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 bg-[#F8FAFC] border-b border-slate-200 flex items-center justify-between gap-2">
                  <h4 className="font-display font-bold text-base text-[#0F172A]">
                    Mesas Activas por Cobrar y Cerrar ({pendingTableOrders.length})
                  </h4>
                </div>

                {pendingTableOrders.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No hay mesas abiertas ni solicitudes de cierre pendientes en este momento.
                  </div>
                ) : (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {pendingTableOrders.map((order) => {
                      const isReady = order.status === 'ready_to_close';
                      const orderTotalUsd = order.items.reduce(
                        (sum, i) => sum + i.subtotalUsd,
                        0
                      );
                      const orderTotalBs = orderTotalUsd * effectiveRate;
                      return (
                        <div
                          key={order.id}
                          className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${
                            isReady
                              ? 'bg-amber-50/90 border-2 border-[#F59E0B]'
                              : 'bg-[#F8FAFC] border-[#CBD5E1]'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-display font-bold text-base text-[#0F172A]">
                                  {order.tableName}
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  Mesero: <strong>{order.waiterName}</strong> ·{' '}
                                  <span className="tabular-nums">
                                    {formatTime(order.openedAt)}
                                  </span>
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase shrink-0 ${
                                  isReady
                                    ? 'bg-[#F59E0B] text-white'
                                    : 'bg-emerald-100 text-[#065F46]'
                                }`}
                              >
                                {isReady ? '¡Aviso de Cierre!' : 'Mesa Abierta'}
                              </span>
                            </div>

                            {order.notes && (
                              <div className="text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700">
                                Nota: {order.notes}
                              </div>
                            )}

                            <div className="text-xs text-slate-700 space-y-1 max-h-36 overflow-y-auto pr-1">
                              {order.items.map((it, idx) => (
                                <div
                                  key={`${it.productId || it.name}_${idx}`}
                                  className="flex justify-between gap-2 tabular-nums"
                                >
                                  <span className="truncate">
                                    {it.quantity}x {it.name}
                                  </span>
                                  <span className="font-semibold text-[#0F172A] shrink-0">
                                    {formatUsd(it.subtotalUsd)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="pt-2.5 border-t border-slate-200 space-y-2.5">
                            <div className="flex items-baseline justify-between tabular-nums">
                              <span className="text-xs font-bold text-slate-600">
                                Total Mesa:
                              </span>
                              <div className="text-right">
                                <span className="font-extrabold text-lg text-[#0F172A]">
                                  {formatUsd(orderTotalUsd)}
                                </span>
                                <div className="text-[11px] text-[#1D4ED8] font-semibold">
                                  {formatBs(orderTotalBs)}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openPayTableOrderModal(order)}
                                className="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold transition-colors"
                              >
                                Cobrar y Cerrar Mesa
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void onCancelTableOrder(order.id);
                                  triggerFlash(`Mesa ${order.tableName} anulada.`);
                                }}
                                title="Anular mesa abierta"
                                className="min-h-[42px] px-2.5 py-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Closed Tables History */}
              <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 bg-[#F8FAFC] border-b border-slate-200 flex items-center justify-between">
                  <h4 className="font-display font-bold text-base text-[#0F172A]">
                    Mesas Ya Cerradas y Cobradas ({closedTableOrders.length})
                  </h4>
                </div>
                {closedTableOrders.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">
                    Aún no se han cerrado mesas de meseros en este turno.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 max-h-80 overflow-y-auto">
                    {closedTableOrders.map((order) => {
                      const totalUsd =
                        order.subtotalUsd ??
                        order.items.reduce((s, i) => s + i.subtotalUsd, 0);
                      return (
                        <div
                          key={order.id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50"
                        >
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-bold text-[#0F172A] text-sm">
                                {order.tableName}
                              </span>
                              <span className="text-slate-500">·</span>
                              <span className="text-slate-700">
                                Mesero: <strong>{order.waiterName}</strong>
                              </span>
                              {order.closedAt && (
                                <span className="text-slate-500 tabular-nums">
                                  · Cerrada {formatTime(order.closedAt)}
                                </span>
                              )}
                              {order.paymentMethod && (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-[#065F46] font-bold">
                                  {getPaymentLabel(order.paymentMethod)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-600">
                              {order.items
                                .map((i) => `${i.quantity}x ${i.name}`)
                                .join(' · ')}
                            </div>
                          </div>
                          <div className="text-right tabular-nums shrink-0">
                            <div className="font-extrabold text-base text-[#059669]">
                              {formatUsd(totalUsd)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {formatBs(order.subtotalBs ?? totalUsd * effectiveRate)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {barraSubView === 'pos' && (
            <>

          {/* POS Split: Search + Compact Beverages (Left 7/12) + Always-Visible Sticky Invoice/Cart (Right 5/12) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Barra POS Catalog with Name Search */}
            <div className="lg:col-span-7 space-y-3">
              <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-2.5 space-y-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar bebida por nombre (ej. Polar, Cacique, Hielo)..."
                    className="w-full min-h-[40px] pl-9 pr-9 py-1.5 bg-slate-50 border border-[#CBD5E1] rounded-xl text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => setProductSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0F172A]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {(
                    [
                      ['all', 'Todo'],
                      ['cervezas', 'Cervezas'],
                      ['licores', 'Licores'],
                      ['refrescos', 'Refrescos'],
                      ['hielo_otros', 'Hielo/Otros'],
                    ] as const
                  ).map(([cat, label]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryTab(cat)}
                      className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                        categoryTab === cat
                          ? 'bg-[#0F172A] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredProducts.length === 0 ? (
                <div className="bg-white border border-[#CBD5E1] rounded-2xl p-8 text-center text-sm text-slate-500">
                  No se encontraron bebidas con &ldquo;{productSearch}&rdquo;.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filteredProducts.map((product) => {
                    const isOut = product.stockUnits <= 0;
                    const hasPack =
                      (product.unitType === 'case_36' ||
                        product.unitType === 'pack') &&
                      product.caseSize > 1;
                    const canSellCase =
                      hasPack && product.stockUnits >= product.caseSize;

                    return (
                      <div
                        key={product.id}
                        className="bg-white border border-[#CBD5E1] shadow-xs rounded-xl p-2.5 flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-start gap-2">
                          {product.photoUrl ? (
                            <img
                              src={product.photoUrl}
                              alt={product.name}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                              <Beer className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="font-display font-bold text-xs text-[#0F172A] leading-tight line-clamp-2">
                              {product.name}
                            </h4>
                            <div className="text-[10px] text-slate-600 tabular-nums mt-0.5 truncate">
                              Quedan:{' '}
                              <span
                                className={
                                  product.stockUnits <= product.lowStockThreshold
                                    ? 'text-[#D97706] font-bold'
                                    : 'text-[#0F172A] font-semibold'
                                }
                              >
                                {formatStockShort(
                                  product.stockUnits,
                                  product.unitType,
                                  product.caseSize
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {hasPack ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              disabled={isOut}
                              onClick={() => addToCart(product, 'unit')}
                              className={`min-h-[44px] px-1.5 py-1 rounded-lg border text-left transition-colors active:scale-[0.98] ${
                                isOut
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-[#ECFDF5] border-[#10B981]/60 hover:bg-[#D1FAE5] text-[#065F46]'
                              }`}
                            >
                              <div className="text-[10px] font-bold leading-none">
                                +1 u.
                              </div>
                              <div className="font-extrabold text-sm text-[#0F172A] tabular-nums mt-0.5">
                                {formatUsd(product.priceUnitUsd)}
                              </div>
                            </button>

                            <button
                              type="button"
                              disabled={!canSellCase}
                              onClick={() => addToCart(product, 'case')}
                              className={`min-h-[44px] px-1.5 py-1 rounded-lg border text-left transition-colors active:scale-[0.98] ${
                                !canSellCase
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-[#EFF6FF] border-[#1D4ED8]/50 hover:bg-blue-100 text-[#1E3A8A]'
                              }`}
                            >
                              <div className="text-[10px] font-bold leading-none">
                                +Caja ({product.caseSize})
                              </div>
                              <div className="font-extrabold text-sm text-[#0F172A] tabular-nums mt-0.5">
                                {formatUsd(
                                  product.priceCaseUsd ||
                                    product.priceUnitUsd * product.caseSize
                                )}
                              </div>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isOut}
                            onClick={() => addToCart(product, 'unit')}
                            className={`w-full min-h-[44px] px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 transition-colors active:scale-[0.98] ${
                              isOut
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-[#0F172A] hover:bg-slate-800 text-white'
                            }`}
                          >
                            <span className="text-xs font-bold">+ Agregar</span>
                            <span className="font-extrabold text-sm tabular-nums">
                              {formatUsd(product.priceUnitUsd)}
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Clean Sticky Receipt-Style Invoice / Carrito (Always visible alongside compact grid) */}
            <div className="lg:col-span-5 bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4 space-y-3 lg:sticky lg:top-20">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-[#0F172A]" />
                  <div>
                    <h3 className="font-display font-bold text-base text-[#0F172A]">
                      Carrito / Factura
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {cart.reduce((s, c) => s + c.quantity, 0)} ítem(s) en el
                      pedido
                    </p>
                  </div>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-xs font-semibold text-slate-500 hover:text-[#EF4444] flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpiar
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-slate-300 bg-slate-50 rounded-xl text-xs text-slate-500 px-3">
                  Toca las bebidas a la izquierda para ir sumando al carrito y
                  luego presiona <strong>Cobrar</strong>.
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-200 max-h-60 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div
                        key={item.key}
                        className="py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-[#0F172A] truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-600 tabular-nums">
                            {formatUsd(item.unitPriceUsd)} c/u ·{' '}
                            <strong className="text-[#0F172A]">
                              {formatUsd(item.unitPriceUsd * item.quantity)}
                            </strong>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.key, -1)}
                            className="w-8 h-8 rounded-lg border border-[#CBD5E1] bg-slate-50 flex items-center justify-center hover:bg-slate-200"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            aria-label={`Cantidad de ${item.name}`}
                            value={
                              cartQtyDrafts[item.key] !== undefined
                                ? cartQtyDrafts[item.key]
                                : String(item.quantity)
                            }
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              setCartExactQty(item.key, e.target.value)
                            }
                            onBlur={() => {
                              setCartQtyDrafts((prev) => {
                                if (!(item.key in prev)) return prev;
                                const next = { ...prev };
                                delete next[item.key];
                                return next;
                              });
                            }}
                            className="w-14 h-8 text-center font-bold text-xs border border-[#CBD5E1] rounded-lg bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                          />
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.key, 1)}
                            className="w-8 h-8 rounded-lg border border-[#CBD5E1] bg-slate-50 flex items-center justify-center hover:bg-slate-200"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total in Dollars (Big) + Bolívares Miniature */}
                  <div className="p-3 rounded-xl bg-slate-100 border border-[#CBD5E1]">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        Total Factura
                      </span>
                      <span className="font-extrabold text-2xl text-[#0F172A] tabular-nums">
                        {formatUsd(cartTotalUsd)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-end">
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {formatBs(cartTotalBs)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-0.5">
                    <button
                      type="button"
                      onClick={openPayInvoiceModal}
                      className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white font-display font-bold text-sm transition-colors"
                    >
                      Cobrar Factura · {formatUsd(cartTotalUsd)}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowCourtesyModal(true)}
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#6366F1] hover:bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      Cortesía / Consumo Interno ($0)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Barra Ledger with Dual View: Consolidated Summary vs Detailed Ticket-by-Ticket */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-lg text-[#0F172A]">
                    Facturas y Resumen de Barra
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Las facturas cerradas no pueden ser eliminadas por empleados
                    (solo por el Dueño). Puedes suspender una factura con nota
                    obligatoria.
                  </p>
                </div>

                <div className="inline-flex p-1 bg-slate-100 border border-[#CBD5E1] rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => setLedgerView('resumen')}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      ledgerView === 'resumen'
                        ? 'bg-[#0F172A] text-white'
                        : 'text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    Resumen por Producto
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerView('detalle')}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      ledgerView === 'detalle'
                        ? 'bg-[#0F172A] text-white'
                        : 'text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    Facturas Barra ({barraSales.length})
                  </button>
                </div>
              </div>

              {ledgerView === 'resumen' ? (
                <div className="divide-y divide-slate-200">
                  {consolidatedProductsSummary.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      Aún no hay bebidas vendidas en barra para resumir.
                    </div>
                  ) : (
                    consolidatedProductsSummary.map((prod) => (
                      <div
                        key={prod.name}
                        className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-semibold text-sm text-[#0F172A]">
                            {prod.name}
                          </div>
                          <div className="text-xs text-slate-600 tabular-nums mt-0.5">
                            {prod.casesSold > 0
                              ? `${prod.casesSold} Cajas (${prod.caseSize}u) + ${prod.looseUnitsSold} sueltas · Total: ${prod.totalUnitsSold} u.`
                              : `${prod.totalUnitsSold} unidades vendidas`}
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="font-bold text-base text-[#0F172A]">
                            {formatUsd(prod.revenueUsd)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatBs(prod.revenueUsd * effectiveRate)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-200 max-h-[480px] overflow-y-auto">
                  {barraSales.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">
                      Aún no se registran facturas de barra en este turno.
                    </div>
                  ) : (
                    barraSales.map((sale) => {
                      const isSuspended = sale.status === 'suspended';
                      return (
                        <div
                          key={sale.id}
                          className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isSuspended ? 'bg-red-50/80' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-bold text-slate-600 tabular-nums">
                                {formatTime(sale.timestamp)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-[#0F172A] uppercase">
                                Factura Barra
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-slate-700">
                                {getPaymentLabel(sale.paymentMethod)}
                              </span>
                              {isSuspended && (
                                <span className="font-bold text-[#EF4444]">
                                  · SUSPENDIDA
                                </span>
                              )}
                            </div>

                            <div
                              className={`text-sm font-medium ${
                                isSuspended
                                  ? 'line-through text-red-700'
                                  : 'text-[#0F172A]'
                              }`}
                            >
                              {sale.items
                                .map((i) => `${i.quantity}x ${i.name}`)
                                .join(' · ')}
                            </div>

                            {!isSuspended &&
                              sale.changeGivenUsd !== undefined &&
                              sale.changeGivenUsd > 0 && (
                                <div className="text-xs tabular-nums text-slate-600">
                                  Recibido:{' '}
                                  {formatUsd(
                                    sale.amountReceivedUsd || sale.totalUsd
                                  )}{' '}
                                  · Vuelto entregado:{' '}
                                  <strong className="text-[#059669]">
                                    {formatUsd(sale.changeGivenUsd)}
                                  </strong>
                                  {sale.changeNote
                                    ? ` (${sale.changeNote})`
                                    : ''}
                                </div>
                              )}

                            {isSuspended && sale.suspendReason && (
                              <div className="text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1.5 rounded-lg inline-block">
                                Motivo auditoría: {sale.suspendReason}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                            <div className="text-right tabular-nums mr-1">
                              <div
                                className={`font-bold text-base ${
                                  isSuspended
                                    ? 'line-through text-red-600'
                                    : 'text-[#0F172A]'
                                }`}
                              >
                                {formatUsd(sale.totalUsd)}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {formatBs(sale.totalBs)}
                              </div>
                            </div>

                            {!isSuspended && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSuspendingSale(sale);
                                  setSuspendNote('');
                                  setSuspendError('');
                                }}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
                                Suspender
                              </button>
                            )}

                            {role === 'admin' && (
                              <button
                                type="button"
                                onClick={() => setDeletingSale(sale)}
                                title="Eliminar factura (Solo Admin)"
                                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Cortesías List */}
            <div className="lg:col-span-4 bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-display font-bold text-base text-[#6366F1] flex items-center gap-2">
                  <Gift className="w-4 h-4" />
                  Cortesías / Consumo Interno
                </h3>
                <span className="text-xs font-bold text-slate-600 tabular-nums">
                  {partyCourtesies.length}
                </span>
              </div>

              <div className="divide-y divide-slate-200">
                {partyCourtesies.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">
                    Sin cortesías registradas hoy.
                  </div>
                ) : (
                  partyCourtesies.map((cort) => (
                    <div key={cort.id} className="p-4 space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="tabular-nums">
                          {formatTime(cort.timestamp)}
                        </span>
                        <span className="font-bold text-[#6366F1]">$0.00</span>
                      </div>
                      <div className="font-semibold text-sm text-[#0F172A]">
                        {cort.recipient}
                      </div>
                      <div className="text-xs text-slate-600">{cort.reason}</div>
                      <div className="text-xs font-medium text-indigo-800 pt-0.5">
                        {cort.items
                          .map((i) => `${i.quantity}x ${i.name}`)
                          .join(', ')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VISTA 3: MESERO (MESAS, PEDIDOS Y CIERRE TOTAL A PAGAR)               */}
      {/* ===================================================================== */}
      {effectiveStation === 'mesero' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left 7/12: Table Selector + Product Picker + Add Order to Table */}
            <div className="lg:col-span-7 space-y-4">
              {/* Step 1: Select or Create Table */}
              <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-[#F59E0B]" />
                    <h3 className="font-display font-bold text-base text-[#0F172A]">
                      1. Seleccionar o Abrir Mesa
                    </h3>
                  </div>
                  {matchingOpenTableByName && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTableOrderId(null);
                        setTableNameInput('');
                        setTableNotesInput('');
                      }}
                      className="text-xs font-bold text-[#1D4ED8] hover:underline"
                    >
                      + Abrir otra mesa nueva
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Mesa 1',
                    'Mesa 2',
                    'Mesa 3',
                    'Mesa 4',
                    'Mesa 5',
                    'VIP 1',
                    'VIP 2',
                    'Barra 1',
                  ].map((preset) => {
                    const existingOpen = pendingTableOrders.find(
                      (t) => t.tableName.toLowerCase() === preset.toLowerCase()
                    );
                    const isSelected =
                      tableNameInput.trim().toLowerCase() ===
                      preset.toLowerCase();
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setTableNameInput(preset);
                          setEditingTableOrderId(existingOpen?.id || null);
                        }}
                        className={`min-h-[36px] px-3 py-1 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                          isSelected
                            ? 'bg-[#0F172A] border-[#0F172A] text-white'
                            : existingOpen
                              ? 'bg-amber-50 border-amber-300 text-amber-950 hover:bg-amber-100'
                              : 'bg-slate-50 border-[#CBD5E1] text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span>{preset}</span>
                        {existingOpen && (
                          <span className="tabular-nums text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                            {formatUsd(
                              existingOpen.items.reduce(
                                (s, i) => s + i.subtotalUsd,
                                0
                              )
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Nombre o Número de Mesa
                    </label>
                    <input
                      type="text"
                      value={tableNameInput}
                      onChange={(e) => {
                        setTableNameInput(e.target.value);
                        setEditingTableOrderId(null);
                      }}
                      placeholder="Ej: Mesa 6 - Familia Pérez"
                      className="w-full min-h-[42px] px-3 bg-white border border-[#CBD5E1] rounded-xl text-sm font-bold text-[#0F172A]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Nota de Servicio (Opcional)
                    </label>
                    <input
                      type="text"
                      value={tableNotesInput}
                      onChange={(e) => setTableNotesInput(e.target.value)}
                      placeholder="Ej: Con bastante hielo / Vasos"
                      className="w-full min-h-[42px] px-3 bg-white border border-[#CBD5E1] rounded-xl text-sm text-[#0F172A]"
                    />
                  </div>
                </div>

                {matchingOpenTableByName && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-center justify-between gap-2">
                    <span>
                      Sumando ronda nueva a cuenta abierta:{' '}
                      <strong>{matchingOpenTableByName.tableName}</strong>
                    </span>
                    <span className="font-bold tabular-nums">
                      Lleva:{' '}
                      {formatUsd(
                        matchingOpenTableByName.items.reduce(
                          (s, i) => s + i.subtotalUsd,
                          0
                        )
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Step 2: Product Search & Grid */}
              <div className="space-y-3">
                <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-2.5 space-y-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Buscar bebida para agregar a la mesa..."
                      className="w-full min-h-[40px] pl-9 pr-9 py-1.5 bg-slate-50 border border-[#CBD5E1] rounded-xl text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                    {productSearch && (
                      <button
                        type="button"
                        onClick={() => setProductSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0F172A]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {(
                      [
                        ['all', 'Todo'],
                        ['cervezas', 'Cervezas'],
                        ['licores', 'Licores'],
                        ['refrescos', 'Refrescos'],
                        ['hielo_otros', 'Hielo/Otros'],
                      ] as const
                    ).map(([cat, label]) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryTab(cat)}
                        className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                          categoryTab === cat
                            ? 'bg-[#0F172A] text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="bg-white border border-[#CBD5E1] rounded-2xl p-8 text-center text-sm text-slate-500">
                    No se encontraron bebidas con &ldquo;{productSearch}&rdquo;.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {filteredProducts.map((product) => {
                      const available = getAvailableStockForCart(
                        product.id,
                        product.stockUnits
                      );
                      const isOut = available <= 0;
                      const hasPack =
                        (product.unitType === 'case_36' ||
                          product.unitType === 'pack') &&
                        product.caseSize > 1;
                      const canSellCase = hasPack && available >= product.caseSize;

                      return (
                        <div
                          key={product.id}
                          className="bg-white border border-[#CBD5E1] shadow-xs rounded-xl p-2.5 flex flex-col justify-between gap-2"
                        >
                          <div className="flex items-start gap-2">
                            {product.photoUrl ? (
                              <img
                                src={product.photoUrl}
                                alt={product.name}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                                <Beer className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <h4 className="font-display font-bold text-xs text-[#0F172A] leading-tight line-clamp-2">
                                {product.name}
                              </h4>
                              <div className="text-[10px] text-slate-600 tabular-nums mt-0.5 truncate">
                                Disp.:{' '}
                                <span
                                  className={
                                    available <= product.lowStockThreshold
                                      ? 'text-[#D97706] font-bold'
                                      : 'text-[#0F172A] font-semibold'
                                  }
                                >
                                  {formatStockShort(
                                    available,
                                    product.unitType,
                                    product.caseSize
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          {hasPack ? (
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                disabled={isOut}
                                onClick={() => addToCart(product, 'unit')}
                                className={`min-h-[44px] px-1.5 py-1 rounded-lg border text-left transition-colors active:scale-[0.98] ${
                                  isOut
                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                    : 'bg-[#ECFDF5] border-[#10B981]/60 hover:bg-[#D1FAE5] text-[#065F46]'
                                }`}
                              >
                                <div className="text-[10px] font-bold leading-none">
                                  +1 u.
                                </div>
                                <div className="font-extrabold text-sm text-[#0F172A] tabular-nums mt-0.5">
                                  {formatUsd(product.priceUnitUsd)}
                                </div>
                              </button>

                              <button
                                type="button"
                                disabled={!canSellCase}
                                onClick={() => addToCart(product, 'case')}
                                className={`min-h-[44px] px-1.5 py-1 rounded-lg border text-left transition-colors active:scale-[0.98] ${
                                  !canSellCase
                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                    : 'bg-[#EFF6FF] border-[#1D4ED8]/50 hover:bg-blue-100 text-[#1E3A8A]'
                                }`}
                              >
                                <div className="text-[10px] font-bold leading-none">
                                  +Caja ({product.caseSize})
                                </div>
                                <div className="font-extrabold text-sm text-[#0F172A] tabular-nums mt-0.5">
                                  {formatUsd(
                                    product.priceCaseUsd ||
                                      product.priceUnitUsd * product.caseSize
                                  )}
                                </div>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isOut}
                              onClick={() => addToCart(product, 'unit')}
                              className={`w-full min-h-[44px] px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 transition-colors active:scale-[0.98] ${
                                isOut
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-[#0F172A] hover:bg-slate-800 text-white'
                              }`}
                            >
                              <span className="text-xs font-bold">+ Agregar</span>
                              <span className="font-extrabold text-sm tabular-nums">
                                {formatUsd(product.priceUnitUsd)}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Current Order Draft to Send/Append to Selected Table */}
              <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h4 className="font-display font-bold text-base text-[#0F172A]">
                      Pedido para {tableNameInput.trim() || 'Mesa'}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {cart.reduce((s, c) => s + c.quantity, 0)} ítem(s) por
                      registrar en esta ronda
                    </p>
                  </div>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      className="text-xs font-semibold text-slate-500 hover:text-[#EF4444] flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpiar
                    </button>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div className="py-5 text-center border border-dashed border-slate-300 bg-slate-50 rounded-xl text-xs text-slate-500 px-3">
                    Toca las bebidas arriba para armar el pedido de{' '}
                    <strong>{tableNameInput.trim() || 'esta mesa'}</strong>.
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-slate-200 max-h-52 overflow-y-auto pr-1">
                      {cart.map((item) => (
                        <div
                          key={item.key}
                          className="py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-xs text-[#0F172A] truncate">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-slate-600 tabular-nums">
                              {formatUsd(item.unitPriceUsd)} c/u ·{' '}
                              <strong className="text-[#0F172A]">
                                {formatUsd(item.unitPriceUsd * item.quantity)}
                              </strong>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateCartQty(item.key, -1)}
                              className="w-8 h-8 rounded-lg border border-[#CBD5E1] bg-slate-50 flex items-center justify-center hover:bg-slate-200"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              aria-label={`Cantidad de ${item.name}`}
                              value={
                                cartQtyDrafts[item.key] !== undefined
                                  ? cartQtyDrafts[item.key]
                                  : String(item.quantity)
                              }
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                setCartExactQty(item.key, e.target.value)
                              }
                              onBlur={() => {
                                setCartQtyDrafts((prev) => {
                                  if (!(item.key in prev)) return prev;
                                  const next = { ...prev };
                                  delete next[item.key];
                                  return next;
                                });
                              }}
                              className="w-14 h-8 text-center font-bold text-xs border border-[#CBD5E1] rounded-lg bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                            />
                            <button
                              type="button"
                              onClick={() => updateCartQty(item.key, 1)}
                              className="w-8 h-8 rounded-lg border border-[#CBD5E1] bg-slate-50 flex items-center justify-center hover:bg-slate-200"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-3 rounded-xl bg-slate-100 border border-[#CBD5E1] flex items-center justify-between tabular-nums">
                      <span className="text-xs font-bold text-slate-600">
                        Subtotal de esta ronda:
                      </span>
                      <div className="text-right">
                        <div className="font-extrabold text-xl text-[#0F172A]">
                          {formatUsd(cartTotalUsd)}
                        </div>
                        <div className="text-[11px] text-[#1D4ED8] font-semibold">
                          {formatBs(cartTotalBs)}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={savingTableOrder}
                      onClick={() => void handleSubmitMeseroOrder()}
                      className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      {savingTableOrder
                        ? 'Registrando Pedido...'
                        : matchingOpenTableByName
                          ? `Sumar Pedido a ${matchingOpenTableByName.tableName} · +${formatUsd(cartTotalUsd)}`
                          : `Abrir ${tableNameInput.trim() || 'Mesa'} y Registrar Pedido · ${formatUsd(cartTotalUsd)}`}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Right 5/12: Mis Mesas Abiertas + Cierres Totales que Deben Pagar */}
            <div className="lg:col-span-5 space-y-4">
              {/* Open / Ready-to-close Tables */}
              <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-bold text-base text-[#0F172A]">
                      Mis Mesas Abiertas ({myWaiterTableOrders.filter((t) => t.status === 'open' || t.status === 'ready_to_close').length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Lleva la factura aquí y pide el cierre al Cajero cuando el cliente vaya a pagar.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-200 max-h-[520px] overflow-y-auto">
                  {myWaiterTableOrders.filter(
                    (t) => t.status === 'open' || t.status === 'ready_to_close'
                  ).length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">
                      Aún no tienes mesas abiertas en este turno.
                    </div>
                  ) : (
                    myWaiterTableOrders
                      .filter(
                        (t) =>
                          t.status === 'open' || t.status === 'ready_to_close'
                      )
                      .map((order) => {
                        const isReady = order.status === 'ready_to_close';
                        const totalUsd = order.items.reduce(
                          (s, i) => s + i.subtotalUsd,
                          0
                        );
                        const totalBs = totalUsd * effectiveRate;
                        return (
                          <div
                            key={order.id}
                            className={`p-4 space-y-3 ${
                              isReady ? 'bg-amber-50/70' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-display font-bold text-base text-[#0F172A]">
                                  {order.tableName}
                                </div>
                                <div className="text-[11px] text-slate-500 tabular-nums">
                                  Abierta: {formatTime(order.openedAt)}
                                  {order.notes ? ` · ${order.notes}` : ''}
                                </div>
                              </div>
                              <span
                                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase shrink-0 ${
                                  isReady
                                    ? 'bg-[#F59E0B] text-white'
                                    : 'bg-emerald-100 text-[#065F46]'
                                }`}
                              >
                                {isReady
                                  ? 'Cierre Solicitado'
                                  : 'Abierta'}
                              </span>
                            </div>

                            <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-2.5 space-y-1 text-xs">
                              {order.items.map((it, idx) => (
                                <div
                                  key={`${it.productId || it.name}_${idx}`}
                                  className="flex justify-between gap-2 tabular-nums"
                                >
                                  <span className="text-slate-700">
                                    <strong>{it.quantity}x</strong> {it.name}
                                  </span>
                                  <span className="font-semibold text-[#0F172A]">
                                    {formatUsd(it.subtotalUsd)}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Total Cierre que Deben Pagar */}
                            <div className="p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between tabular-nums">
                              <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
                                Cierre Total a Pagar
                              </span>
                              <div className="text-right">
                                <div className="font-extrabold text-xl text-[#10B981]">
                                  {formatUsd(totalUsd)}
                                </div>
                                <div className="text-xs text-slate-300">
                                  {formatBs(totalBs)}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTableOrderId(order.id);
                                  setTableNameInput(order.tableName);
                                  triggerFlash(
                                    `Agregando bebidas a ${order.tableName}.`
                                  );
                                }}
                                className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[#0F172A] text-xs font-bold flex items-center justify-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Agregar Pedido
                              </button>

                              {order.status === 'open' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void onRequestTableClose(order.id);
                                    triggerFlash(
                                      `Solicitud de cierre enviada a Caja para ${order.tableName}.`
                                    );
                                  }}
                                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-[#F59E0B] hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                  Pedir Cierre a Caja
                                </button>
                              ) : (
                                <div className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-950 text-[11px] font-bold flex items-center justify-center gap-1.5 text-center">
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  Esperando Cajero
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Closed Tables History (Visible to Mesero to verify final amount closed by Caja) */}
              <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-bold text-base text-[#0F172A]">
                      Mesas Cerradas por Caja ({myWaiterTableOrders.filter((t) => t.status === 'closed').length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Cierre total confirmado y cobrado por el Cajero.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-200 max-h-[360px] overflow-y-auto">
                  {myWaiterTableOrders.filter((t) => t.status === 'closed')
                    .length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Cuando el Cajero cierre alguna mesa tuya, verás aquí el total cobrado.
                    </div>
                  ) : (
                    myWaiterTableOrders
                      .filter((t) => t.status === 'closed')
                      .map((order) => {
                        const totalUsd = order.items.reduce(
                          (s, i) => s + i.subtotalUsd,
                          0
                        );
                        const totalBs = totalUsd * effectiveRate;
                        return (
                          <div key={order.id} className="p-4 space-y-2 bg-emerald-50/40">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-display font-bold text-sm text-[#0F172A]">
                                  {order.tableName}
                                </div>
                                <div className="text-[11px] text-slate-500 tabular-nums">
                                  Cerrada: {order.closedAt ? formatTime(order.closedAt) : ''} ·{' '}
                                  {order.paymentMethod
                                    ? getPaymentLabel(order.paymentMethod)
                                    : 'Pagado'}
                                </div>
                              </div>
                              <div className="text-right tabular-nums">
                                <div className="font-extrabold text-base text-[#059669]">
                                  {formatUsd(totalUsd)}
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  {formatBs(totalBs)}
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-slate-600">
                              {order.items
                                .map((i) => `${i.quantity}x ${i.name}`)
                                .join(' · ')}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pagar Factura (Botones compactos + Pago Único o Pago Compartido entre 2 Métodos) */}
      {showPayInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmClosePaidInvoice}
            className="bg-white w-full max-w-lg rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          >
            <div className="px-5 py-3.5 bg-[#0F172A] text-white flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base">
                  {chargingTableOrder
                    ? `Cobrar y Cerrar ${chargingTableOrder.tableName}`
                    : 'Cobrar y Cerrar Factura'}
                </h3>
                <p className="text-[11px] text-slate-300">
                  {chargingTableOrder
                    ? `Mesero: ${chargingTableOrder.waiterName} · ${chargingTableOrder.items.length} ítem(s)`
                    : `${cart.length} producto(s)`}{' '}
                  · Pago único o compartido en 2 métodos
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPayInvoiceModal(false);
                  setChargingTableOrder(null);
                }}
                className="p-1 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
              {/* Total Box */}
              <div className="px-4 py-3 rounded-xl bg-slate-100 border border-[#CBD5E1] flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase text-slate-500">
                    Total a Pagar
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {formatBs(checkoutTotalBs)}
                  </div>
                </div>
                <div className="font-extrabold text-3xl text-[#0F172A] tabular-nums">
                  {formatUsd(checkoutTotalUsd)}
                </div>
              </div>

              {/* Mode Selector: Pago Único vs Pago Compartido */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 border border-[#CBD5E1] rounded-xl">
                <button
                  type="button"
                  onClick={() => setPaymentMode('single')}
                  className={`min-h-[36px] rounded-lg text-xs font-bold transition-colors ${
                    paymentMode === 'single'
                      ? 'bg-[#0F172A] text-white shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  Pago Único (1 Método)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('shared')}
                  className={`min-h-[36px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    paymentMode === 'shared'
                      ? 'bg-[#F59E0B] text-white shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <Split className="w-3.5 h-3.5" />
                  Pago Compartido (2)
                </button>
              </div>

              {paymentMode === 'single' ? (
                <>
                  {/* Compact 4 Payment Method Buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        {
                          id: 'efectivo_usd',
                          label: 'Efectivo ($)',
                          icon: Banknote,
                          activeClass: 'bg-[#10B981] text-white border-[#10B981]',
                        },
                        {
                          id: 'zelle',
                          label: 'Zelle ($)',
                          icon: Wallet,
                          activeClass: 'bg-[#6366F1] text-white border-[#6366F1]',
                        },
                        {
                          id: 'pago_movil',
                          label: 'Pago Móvil',
                          icon: Smartphone,
                          activeClass: 'bg-[#1D4ED8] text-white border-[#1D4ED8]',
                        },
                        {
                          id: 'tarjeta',
                          label: 'Tarjeta / Punto',
                          icon: CreditCard,
                          activeClass: 'bg-[#0F172A] text-white border-[#0F172A]',
                        },
                      ] as const
                    ).map((m) => {
                      const Icon = m.icon;
                      const isSel = singleMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelectSingleMethod(m.id)}
                          className={`min-h-[40px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                            isSel
                              ? m.activeClass
                              : 'bg-white text-[#0F172A] border-[#CBD5E1] hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Amount Received & Vuelto Calculator */}
                  {singleMethod === 'efectivo_usd' && (
                    <div className="p-3.5 rounded-xl bg-[#ECFDF5]/60 border border-[#10B981]/40 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <label className="text-xs font-bold text-[#065F46]">
                          Recibido ($):
                        </label>
                        <div className="flex gap-1">
                          {[
                            { label: 'Exacto', val: checkoutTotalUsd },
                            { label: '$20', val: 20 },
                            { label: '$50', val: 50 },
                            { label: '$100', val: 100 },
                          ].map((chip) => (
                            <button
                              key={chip.label}
                              type="button"
                              onClick={() =>
                                setReceivedAmountInput(chip.val.toFixed(2))
                              }
                              className="px-2 py-0.5 rounded-md bg-white border border-[#CBD5E1] text-[11px] tabular-nums font-bold hover:bg-slate-100"
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={receivedAmountInput}
                        onChange={(e) => setReceivedAmountInput(e.target.value)}
                        className="w-full min-h-[40px] px-3 bg-white border border-[#CBD5E1] rounded-xl font-bold text-base tabular-nums"
                      />
                      <div className="flex items-center justify-between pt-1 border-t border-[#10B981]/25 text-xs">
                        <span className="font-bold text-slate-700">
                          Vuelto a entregar:
                        </span>
                        <span className="font-extrabold text-base text-[#059669] tabular-nums">
                          {formatUsd(changeUsd)}{' '}
                          <span className="text-[11px] font-normal text-slate-500">
                            ({formatBs(changeBs)})
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  {(singleMethod === 'pago_movil' ||
                    singleMethod === 'tarjeta') && (
                    <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#1D4ED8]">
                          Monto en Bolívares (Bs.):
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setReceivedAmountInput(checkoutTotalBs.toFixed(2))
                          }
                          className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-[11px] font-bold"
                        >
                          Exacto
                        </button>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={receivedAmountInput}
                        onChange={(e) => setReceivedAmountInput(e.target.value)}
                        className="w-full min-h-[40px] px-3 bg-white border border-blue-300 rounded-xl font-bold text-sm tabular-nums"
                      />
                    </div>
                  )}
                </>
              ) : (
                /* PAGO COMPARTIDO BI-DIRECCIONAL (Edita Método 1 o Método 2 y el otro se ajusta automático) */
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-3 text-xs">
                  {/* Método 1 */}
                  <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                    <div className="font-bold text-amber-950">
                      1. Primer Método de Pago:
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PAYMENT_CHANNEL_META.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelectSharedM1(m.id)}
                          className={`min-h-[34px] px-1.5 py-1 rounded-lg border text-[11px] font-bold transition-colors truncate ${
                            sharedMethod1 === m.id
                              ? 'bg-[#0F172A] text-white border-[#0F172A]'
                              : 'bg-slate-50 text-slate-700 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {m.shortLabel}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={
                          sharedMethod1Currency === 'bs'
                            ? checkoutTotalBs
                            : checkoutTotalUsd
                        }
                        value={
                          sharedLastEdited === 1
                            ? sharedMethod1Amount
                            : sharedMethod1Currency === 'bs'
                              ? sharedBs1.toFixed(2)
                              : sharedUsd1.toFixed(2)
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          const num = Math.max(0, parseFloat(val) || 0);
                          const u1 = Math.min(
                            checkoutTotalUsd,
                            sharedMethod1Currency === 'bs' && effectiveRate > 0
                              ? num / effectiveRate
                              : num
                          );
                          const u2 = Math.max(0, checkoutTotalUsd - u1);
                          setSharedLastEdited(1);
                          setSharedMethod1Amount(val);
                          setSharedMethod2Amount(
                            (sharedMethod2Currency === 'bs'
                              ? u2 * effectiveRate
                              : u2
                            ).toFixed(2)
                          );
                        }}
                        className="flex-1 min-h-[44px] px-3 bg-white border border-amber-300 rounded-xl font-bold text-lg text-[#0F172A] tabular-nums"
                      />
                      {PAYMENT_CHANNEL_META.find((m) => m.id === sharedMethod1)
                        ?.isBs ? (
                        <div className="inline-flex rounded-lg border border-amber-300 bg-slate-50 p-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (sharedMethod1Currency === 'bs') {
                                setSharedMethod1Currency('usd');
                                setSharedMethod1Amount(sharedUsd1.toFixed(2));
                              }
                            }}
                            className={`px-3 py-1.5 rounded text-xs font-bold ${
                              sharedMethod1Currency === 'usd'
                                ? 'bg-[#0F172A] text-white'
                                : 'text-slate-600'
                            }`}
                          >
                            $
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (sharedMethod1Currency === 'usd') {
                                setSharedMethod1Currency('bs');
                                setSharedMethod1Amount(sharedBs1.toFixed(2));
                              }
                            }}
                            className={`px-3 py-1.5 rounded text-xs font-bold ${
                              sharedMethod1Currency === 'bs'
                                ? 'bg-[#1D4ED8] text-white'
                                : 'text-slate-600'
                            }`}
                          >
                            Bs.
                          </button>
                        </div>
                      ) : (
                        <span className="font-bold text-sm text-amber-950 px-2">
                          USD ($)
                        </span>
                      )}
                    </div>

                    <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 tabular-nums">
                      <span className="text-sm font-bold text-[#0F172A]">
                        {formatUsd(sharedUsd1)}
                      </span>
                      <span className="text-sm font-bold text-[#1D4ED8]">
                        {formatBs(sharedBs1)}
                      </span>
                    </div>
                  </div>

                  {/* Método 2 */}
                  <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2">
                    <div className="font-bold text-amber-950">
                      2. Segundo Método de Pago (Editable viceversa):
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PAYMENT_CHANNEL_META.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleSelectSharedM2(m.id)}
                          className={`min-h-[34px] px-1.5 py-1 rounded-lg border text-[11px] font-bold transition-colors truncate ${
                            sharedMethod2 === m.id
                              ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                              : 'bg-slate-50 text-slate-700 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {m.shortLabel}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={
                          sharedMethod2Currency === 'bs'
                            ? checkoutTotalBs
                            : checkoutTotalUsd
                        }
                        value={
                          sharedLastEdited === 2
                            ? sharedMethod2Amount
                            : sharedMethod2Currency === 'bs'
                              ? sharedBs2.toFixed(2)
                              : sharedUsd2.toFixed(2)
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          const num = Math.max(0, parseFloat(val) || 0);
                          const u2 = Math.min(
                            checkoutTotalUsd,
                            sharedMethod2Currency === 'bs' && effectiveRate > 0
                              ? num / effectiveRate
                              : num
                          );
                          const u1 = Math.max(0, checkoutTotalUsd - u2);
                          setSharedLastEdited(2);
                          setSharedMethod2Amount(val);
                          setSharedMethod1Amount(
                            (sharedMethod1Currency === 'bs'
                              ? u1 * effectiveRate
                              : u1
                            ).toFixed(2)
                          );
                        }}
                        className="flex-1 min-h-[44px] px-3 bg-white border border-blue-300 rounded-xl font-bold text-lg text-[#0F172A] tabular-nums"
                      />
                      {PAYMENT_CHANNEL_META.find((m) => m.id === sharedMethod2)
                        ?.isBs ? (
                        <div className="inline-flex rounded-lg border border-blue-300 bg-slate-50 p-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (sharedMethod2Currency === 'bs') {
                                setSharedMethod2Currency('usd');
                                setSharedMethod2Amount(sharedUsd2.toFixed(2));
                              }
                            }}
                            className={`px-3 py-1.5 rounded text-xs font-bold ${
                              sharedMethod2Currency === 'usd'
                                ? 'bg-[#0F172A] text-white'
                                : 'text-slate-600'
                            }`}
                          >
                            $
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (sharedMethod2Currency === 'usd') {
                                setSharedMethod2Currency('bs');
                                setSharedMethod2Amount(sharedBs2.toFixed(2));
                              }
                            }}
                            className={`px-3 py-1.5 rounded text-xs font-bold ${
                              sharedMethod2Currency === 'bs'
                                ? 'bg-[#1D4ED8] text-white'
                                : 'text-slate-600'
                            }`}
                          >
                            Bs.
                          </button>
                        </div>
                      ) : (
                        <span className="font-bold text-sm text-[#1D4ED8] px-2">
                          USD ($)
                        </span>
                      )}
                    </div>

                    <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between gap-2 tabular-nums">
                      <span className="text-sm font-bold text-[#0F172A]">
                        {formatUsd(sharedUsd2)}
                      </span>
                      <span className="text-sm font-bold text-[#1D4ED8]">
                        {formatBs(sharedBs2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nota o Referencia (Opcional)
                </label>
                <input
                  type="text"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder="Ej: Ref. 4821 / Vuelto entregado en Bs."
                  className="w-full min-h-[38px] px-3 border border-[#CBD5E1] rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowPayInvoiceModal(false);
                  setChargingTableOrder(null);
                }}
                className="min-h-[44px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Volver
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold"
              >
                {chargingTableOrder
                  ? 'Confirmar Cobro de Mesa'
                  : 'Cerrar Factura Pagada'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Cortesía / Consumo Interno */}
      {showCourtesyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmCourtesy}
            className="bg-white w-full max-w-md rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 bg-[#6366F1] text-white flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                Registrar Cortesía / Consumo Interno
              </h3>
              <button
                type="button"
                onClick={() => setShowCourtesyModal(false)}
                className="p-1 text-indigo-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950">
                <strong>Productos a descontar a $0.00:</strong>{' '}
                {cart.map((c) => `${c.quantity}x ${c.name}`).join(', ')}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Destinatario (Músicos, DJ, Personal, Invitado)
                </label>
                <input
                  type="text"
                  required
                  value={courtesyRecipient}
                  onChange={(e) => setCourtesyRecipient(e.target.value)}
                  placeholder="Ej: DJ Invitado / Portero"
                  className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Motivo Autorizado
                </label>
                <input
                  type="text"
                  required
                  value={courtesyReason}
                  onChange={(e) => setCourtesyReason(e.target.value)}
                  placeholder="Ej: Hidratación de turno / Atención VIP"
                  className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="px-5 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowCourtesyModal(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#6366F1] hover:bg-indigo-600 text-white text-sm font-bold"
              >
                Descontar Cortesía ($0)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Suspender / Revertir Factura (Nota Obligatoria) */}
      {suspendingSale && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmSuspend}
            className="bg-white w-full max-w-md rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 bg-[#EF4444] text-white flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                Suspender / Revertir Factura
              </h3>
              <button
                type="button"
                onClick={() => setSuspendingSale(null)}
                className="p-1 text-red-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm">
                <div className="font-bold text-red-900">
                  Monto: {formatUsd(suspendingSale.totalUsd)} (
                  {getPaymentLabel(suspendingSale.paymentMethod)})
                </div>
                <div className="text-xs text-red-800 mt-1">
                  {suspendingSale.items
                    .map((i) => `${i.quantity}x ${i.name}`)
                    .join(', ')}
                </div>
              </div>

              <p className="text-xs text-slate-600">
                Al suspender, esta factura no afecta inventario ni suma en las
                ventas de la noche, pero queda registrada en rojo en los
                detalles al final del evento.
              </p>

              <div>
                <label className="block text-xs font-bold text-[#0F172A] mb-1.5">
                  Nota explicativa obligatoria (Auditoría)
                </label>
                <textarea
                  rows={3}
                  required
                  value={suspendNote}
                  onChange={(e) => {
                    setSuspendNote(e.target.value);
                    setSuspendError('');
                  }}
                  placeholder="Explica por qué se suspende esta factura..."
                  className="w-full px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
                />
                {suspendError && (
                  <p className="text-xs text-[#EF4444] font-semibold mt-1">
                    {suspendError}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSuspendingSale(null)}
                className="min-h-[44px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-sm font-bold"
              >
                Confirmar Suspensión
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Eliminar Factura (Exclusivo Admin) */}
      {deletingSale && role === 'admin' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-[#CBD5E1] shadow-2xl p-5 space-y-4">
            <h3 className="font-display font-bold text-lg text-[#0F172A]">
              ¿Eliminar factura definitivamente?
            </h3>
            <p className="text-sm text-slate-600">
              Se eliminará la factura de{' '}
              <strong className="tabular-nums text-[#0F172A]">
                {formatUsd(deletingSale.totalUsd)}
              </strong>{' '}
              y se restaurará su inventario si estaba activa. Acción exclusiva
              del Administrador.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingSale(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteSale(deletingSale.id);
                  setDeletingSale(null);
                  triggerFlash('Factura eliminada por el Dueño.');
                }}
                className="min-h-[42px] px-4 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-sm font-bold"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Cierre de Fiesta */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#CBD5E1] shadow-2xl p-6 space-y-4">
            <h3 className="font-display font-bold text-xl text-[#0F172A]">
              ¿Cerrar fiesta y generar cierre de caja?
            </h3>
            <p className="text-sm text-slate-600">
              Se consolidarán las ventas de{' '}
              <strong className="text-[#0F172A]">{activeParty.name}</strong>{' '}
              ({formatUsd(totalNightUsd)}), se guardará el inventario restante en
              cava y se abrirá el PDF de cierre listo para descargar.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Seguir Operando
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirm(false);
                  onCloseParty();
                }}
                className="min-h-[44px] px-5 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-sm font-bold"
              >
                Sí, Cerrar Caja Ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
