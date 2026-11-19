import React, { useState } from 'react';
import {
  AlertCircle,
  Beer,
  Camera,
  ClipboardList,
  Download,
  Edit3,
  ImagePlus,
  Lock,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  Product,
  ProductCategory,
  ProductUnitType,
  UserRole,
} from '../types';
import {
  formatBs,
  formatStockReadable,
  formatUsd,
  getCategoryLabel,
  getTodayISO,
} from '../utils/formatters';
import { compressImageFile } from '../utils/imageHelper';
import { downloadStockReportPdf } from '../utils/pdfGenerator';

interface InventoryModuleProps {
  role: UserRole;
  allowEmployeeProductEdit: boolean;
  onToggleAllowEmployeeEdit: (allowed: boolean) => void;
  products: Product[];
  bcvRate: number;
  effectiveRate: number;
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onUpdateProduct: (
    productId: string,
    updates: Partial<Omit<Product, 'id'>>
  ) => void;
  onRestockProduct: (params: {
    productId: string;
    casesAdded: number;
    unitsAdded: number;
    totalCostUsd: number;
    newPriceUnitUsd?: number;
    newPriceCaseUsd?: number;
    newCostUnitUsd?: number;
    newCostCaseUsd?: number;
    note?: string;
    date: string;
  }) => void;
  onDeleteProduct: (productId: string) => void;
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  role,
  allowEmployeeProductEdit,
  onToggleAllowEmployeeEdit,
  products,
  bcvRate,
  effectiveRate,
  onAddProduct,
  onUpdateProduct,
  onRestockProduct,
  onDeleteProduct,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<
    ProductCategory | 'all'
  >('all');

  const canEditExistingProducts = role === 'admin' || allowEmployeeProductEdit;

  // Modals
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showStockReportModal, setShowStockReportModal] = useState(false);
  const [confirmDeleteProduct, setConfirmDeleteProduct] =
    useState<Product | null>(null);

  // Restock Form (Invoice in Bs -> converts to USD -> sets Sale Price in USD)
  const [restockProductId, setRestockProductId] = useState<string>(
    products[0]?.id || ''
  );
  const [restockCases, setRestockCases] = useState('1');
  const [restockUnits, setRestockUnits] = useState('0');
  const [restockInvoiceBs, setRestockInvoiceBs] = useState('');
  const [restockSaleUnitUsd, setRestockSaleUnitUsd] = useState('');
  const [restockSaleCaseUsd, setRestockSaleCaseUsd] = useState('');
  const [restockNote, setRestockNote] = useState('');

  // Create / Edit Product Form (Invoice in Bs -> converts to USD -> sets Sale Price in USD)
  const [formName, setFormName] = useState('');
  const [formPresentation, setFormPresentation] = useState('Botella 330ml');
  const [formPhotoUrl, setFormPhotoUrl] = useState<string | undefined>(
    undefined
  );
  const [formCategory, setFormCategory] =
    useState<ProductCategory>('cervezas');
  const [formIsPack, setFormIsPack] = useState<boolean>(true);
  const [formCaseSize, setFormCaseSize] = useState<string>('24');
  const [formReceivedCases, setFormReceivedCases] = useState<string>('2');
  const [formReceivedUnits, setFormReceivedUnits] = useState<string>('0');
  const [formInvoiceTotalBs, setFormInvoiceTotalBs] = useState<string>('30200');
  const [formPriceUnit, setFormPriceUnit] = useState<string>('1.25');
  const [formPriceCase, setFormPriceCase] = useState<string>('25.00');

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.presentation || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const selectedRestockProduct = products.find(
    (p) => p.id === restockProductId
  );

  const handleSelectRestockProduct = (id: string) => {
    setRestockProductId(id);
    const prod = products.find((p) => p.id === id);
    if (prod) {
      setRestockSaleUnitUsd(prod.priceUnitUsd.toFixed(2));
      setRestockSaleCaseUsd(
        prod.priceCaseUsd !== undefined ? prod.priceCaseUsd.toFixed(2) : ''
      );
      const defaultCaseCost =
        prod.costCaseUsd || prod.costUnitUsd * prod.caseSize;
      const estBs = defaultCaseCost * bcvRate;
      setRestockInvoiceBs(estBs > 0 ? estBs.toFixed(2) : '');
    }
  };

  const handleOpenRestock = (preselectId?: string) => {
    const targetId = preselectId || products[0]?.id || '';
    setRestockCases('1');
    setRestockUnits('0');
    setRestockNote('');
    handleSelectRestockProduct(targetId);
    setShowRestockModal(true);
  };

  const handleOpenNewProduct = () => {
    setEditingProduct(null);
    setFormName('');
    setFormPresentation('Botella 330ml');
    setFormPhotoUrl(undefined);
    setFormCategory('cervezas');
    setFormIsPack(true);
    setFormCaseSize('24');
    setFormReceivedCases('2');
    setFormReceivedUnits('0');
    setFormInvoiceTotalBs((33.0 * bcvRate).toFixed(2));
    setFormPriceUnit('1.25');
    setFormPriceCase('25.00');
    setShowProductModal(true);
  };

  const handleOpenEditProduct = (product: Product) => {
    if (!canEditExistingProducts) return;
    const isPack =
      (product.unitType === 'case_36' || product.unitType === 'pack') &&
      product.caseSize > 1;
    setEditingProduct(product);
    setFormName(product.name);
    setFormPresentation(product.presentation || '');
    setFormPhotoUrl(product.photoUrl);
    setFormCategory(product.category);
    setFormIsPack(isPack);
    setFormCaseSize(String(product.caseSize || 24));
    setFormPriceUnit(product.priceUnitUsd.toFixed(2));
    setFormPriceCase(
      product.priceCaseUsd !== undefined
        ? product.priceCaseUsd.toFixed(2)
        : (product.priceUnitUsd * (product.caseSize || 24)).toFixed(2)
    );
    const currentUsdCost = isPack
      ? product.costCaseUsd ?? product.costUnitUsd * (product.caseSize || 24)
      : product.costUnitUsd;
    setFormInvoiceTotalBs((currentUsdCost * bcvRate).toFixed(2));
    setShowProductModal(true);
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setFormPhotoUrl(compressed);
    } catch {
      // Ignore invalid image
    }
  };

  // Create/Edit Product Bs -> USD invoice conversion & live margin
  const parsedCaseSize = formIsPack
    ? Math.max(2, parseInt(formCaseSize || '24', 10) || 24)
    : 1;
  const parsedRecCases = formIsPack
    ? Math.max(0, parseInt(formReceivedCases || '0', 10) || 0)
    : 0;
  const parsedRecUnits = Math.max(
    0,
    parseInt(formReceivedUnits || '0', 10) || 0
  );
  const totalInitialUnits = editingProduct
    ? editingProduct.stockUnits
    : parsedRecCases * parsedCaseSize + parsedRecUnits;

  const parsedInvoiceBs = Math.max(
    0,
    parseFloat(formInvoiceTotalBs || '0') || 0
  );
  const convertedInvoiceUsd = bcvRate > 0 ? parsedInvoiceBs / bcvRate : 0;

  const calculatedUnitCost = editingProduct
    ? formIsPack
      ? convertedInvoiceUsd / parsedCaseSize
      : convertedInvoiceUsd
    : totalInitialUnits > 0
      ? convertedInvoiceUsd / totalInitialUnits
      : 0;
  const calculatedCaseCost = formIsPack
    ? calculatedUnitCost * parsedCaseSize
    : undefined;

  const parsedSaleUnit = Math.max(0, parseFloat(formPriceUnit || '0') || 0);
  const parsedSaleCase = formIsPack
    ? Math.max(0, parseFloat(formPriceCase || '0') || 0)
    : undefined;

  const unitMarginUsd = parsedSaleUnit - calculatedUnitCost;
  const unitMarginPct =
    parsedSaleUnit > 0 ? (unitMarginUsd / parsedSaleUnit) * 100 : 0;
  const caseMarginUsd =
    formIsPack &&
    parsedSaleCase !== undefined &&
    calculatedCaseCost !== undefined
      ? parsedSaleCase - calculatedCaseCost
      : null;

  const handleSubmitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const unitType: ProductUnitType = formIsPack
      ? parsedCaseSize === 36
        ? 'case_36'
        : 'pack'
      : 'unit';

    if (editingProduct) {
      if (!canEditExistingProducts) return;
      onUpdateProduct(editingProduct.id, {
        name: formName.trim(),
        presentation: formPresentation.trim() || undefined,
        photoUrl: formPhotoUrl,
        category: formCategory,
        unitType,
        caseSize: parsedCaseSize,
        priceUnitUsd: parsedSaleUnit,
        priceCaseUsd: parsedSaleCase,
        costUnitUsd: Number(calculatedUnitCost.toFixed(4)),
        costCaseUsd:
          calculatedCaseCost !== undefined
            ? Number(calculatedCaseCost.toFixed(2))
            : undefined,
      });
    } else {
      onAddProduct({
        name: formName.trim(),
        presentation: formPresentation.trim() || undefined,
        photoUrl: formPhotoUrl,
        category: formCategory,
        unitType,
        caseSize: parsedCaseSize,
        priceUnitUsd: parsedSaleUnit,
        priceCaseUsd: parsedSaleCase,
        costUnitUsd: Number(calculatedUnitCost.toFixed(4)),
        costCaseUsd:
          calculatedCaseCost !== undefined
            ? Number(calculatedCaseCost.toFixed(2))
            : undefined,
        stockUnits: totalInitialUnits,
        lowStockThreshold: formIsPack ? parsedCaseSize * 2 : 6,
      });
    }

    setShowProductModal(false);
  };

  // Restock Bs -> USD conversion & Sale Price setup
  const restockIsPack =
    selectedRestockProduct &&
    (selectedRestockProduct.unitType === 'case_36' ||
      selectedRestockProduct.unitType === 'pack') &&
    selectedRestockProduct.caseSize > 1;
  const rCases = restockIsPack
    ? Math.max(0, parseInt(restockCases || '0', 10) || 0)
    : 0;
  const rUnits = Math.max(0, parseInt(restockUnits || '0', 10) || 0);
  const rTotalUnitsAdded = selectedRestockProduct
    ? rCases * selectedRestockProduct.caseSize + rUnits
    : 0;
  const rInvoiceBs = Math.max(0, parseFloat(restockInvoiceBs || '0') || 0);
  const rInvoiceUsdConverted = bcvRate > 0 ? rInvoiceBs / bcvRate : 0;
  const rReceivedUnitUsd =
    rTotalUnitsAdded > 0 ? rInvoiceUsdConverted / rTotalUnitsAdded : 0;
  const rReceivedCaseUsd =
    selectedRestockProduct && restockIsPack
      ? rReceivedUnitUsd * selectedRestockProduct.caseSize
      : undefined;

  const rSaleUnit = Math.max(
    0,
    parseFloat(restockSaleUnitUsd || '0') ||
      selectedRestockProduct?.priceUnitUsd ||
      0
  );
  const rSaleCase = restockIsPack
    ? Math.max(
        0,
        parseFloat(restockSaleCaseUsd || '0') ||
          selectedRestockProduct?.priceCaseUsd ||
          0
      )
    : undefined;

  const rEstimatedSaleValue = selectedRestockProduct
    ? rCases * (rSaleCase || rSaleUnit * selectedRestockProduct.caseSize) +
      rUnits * rSaleUnit
    : 0;

  const handleSubmitRestock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRestockProduct || rTotalUnitsAdded <= 0) return;

    const fallbackCost =
      rCases *
        (selectedRestockProduct.costCaseUsd ||
          selectedRestockProduct.costUnitUsd *
            selectedRestockProduct.caseSize) +
      rUnits * selectedRestockProduct.costUnitUsd;

    const hasInvoiceBs = restockInvoiceBs !== '' && rInvoiceBs > 0;

    onRestockProduct({
      productId: selectedRestockProduct.id,
      casesAdded: rCases,
      unitsAdded: rUnits,
      totalCostUsd: hasInvoiceBs ? rInvoiceUsdConverted : fallbackCost,
      newPriceUnitUsd: canEditExistingProducts ? rSaleUnit : undefined,
      newPriceCaseUsd: canEditExistingProducts ? rSaleCase : undefined,
      newCostUnitUsd: hasInvoiceBs
        ? Number(rReceivedUnitUsd.toFixed(4))
        : undefined,
      newCostCaseUsd:
        hasInvoiceBs && rReceivedCaseUsd !== undefined
          ? Number(rReceivedCaseUsd.toFixed(2))
          : undefined,
      note: restockNote.trim() || undefined,
      date: getTodayISO(),
    });
    setShowRestockModal(false);
  };

  const lowStockCount = products.filter(
    (p) => p.stockUnits <= p.lowStockThreshold
  ).length;

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-xl text-[#0F172A]">
              Inventario y Catálogo Predeterminado en Cava
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Facturas de compra en Bs. (conversión automática a $) · Precios de
              venta en $ · {products.length} productos
              {lowStockCount > 0 && (
                <span className="text-[#D97706] font-semibold">
                  {' '}
                  · {lowStockCount} con stock bajo
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleOpenRestock()}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <PackagePlus className="w-4 h-4" />+ Recibir Mercancía
            </button>
            <button
              type="button"
              onClick={handleOpenNewProduct}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />+ Nuevo Producto
            </button>
            <button
              type="button"
              onClick={() => setShowStockReportModal(true)}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-50 border border-[#CBD5E1] hover:bg-slate-100 text-[#0F172A] text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <ClipboardList className="w-4 h-4 text-[#1D4ED8]" />
              Reporte de Stock Actual
            </button>
          </div>
        </div>

        {/* Owner Delegation Control */}
        {role === 'admin' ? (
          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              {allowEmployeeProductEdit ? (
                <Unlock className="w-4 h-4 text-[#10B981]" />
              ) : (
                <Lock className="w-4 h-4 text-[#1D4ED8]" />
              )}
              <span>
                Permisos de edición post-registro:{' '}
                <strong className="text-[#0F172A]">
                  {allowEmployeeProductEdit
                    ? 'Personal autorizado a editar precios y productos'
                    : 'Solo el Administrador puede editar precios y costos después de agregar un producto'}
                </strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onToggleAllowEmployeeEdit(!allowEmployeeProductEdit)
              }
              className={`min-h-[36px] px-3.5 py-1.5 rounded-lg border font-bold transition-colors ${
                allowEmployeeProductEdit
                  ? 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]'
                  : 'bg-slate-100 border-[#CBD5E1] text-slate-700 hover:bg-slate-200'
              }`}
            >
              {allowEmployeeProductEdit
                ? 'Revocar permiso a personal'
                : 'Dar acceso de edición a personal'}
            </button>
          </div>
        ) : (
          !allowEmployeeProductEdit && (
            <div className="pt-3 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-600">
              <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                Puedes consultar cuánto queda en stock de cada producto y
                recibir mercancía nueva. Solo el Administrador edita precios
                guardados.
              </span>
            </div>
          )
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-white border border-[#CBD5E1] shadow-xs rounded-xl overflow-x-auto">
          {(
            [
              ['all', 'Todos'],
              ['cervezas', 'Cervezas'],
              ['licores', 'Licores'],
              ['refrescos', 'Refrescos y Agua'],
              ['hielo_otros', 'Hielo y Otros'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setCategoryFilter(val)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                categoryFilter === val
                  ? 'bg-[#0F172A] text-white'
                  : 'text-slate-600 hover:text-[#0F172A] hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar bebida o presentación..."
            className="w-full min-h-[42px] pl-10 pr-4 py-2 bg-white border border-[#CBD5E1] shadow-xs rounded-xl text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          />
        </div>
      </div>

      {/* Inventory Grid View (Cuadrícula para todos los usuarios) */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-10 text-center text-sm text-slate-500">
          No hay productos que coincidan con el filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product) => {
            const isLow = product.stockUnits <= product.lowStockThreshold;
            const hasPack =
              (product.unitType === 'case_36' ||
                product.unitType === 'pack') &&
              product.caseSize > 1;
            const casesCount = hasPack
              ? Math.floor(product.stockUnits / product.caseSize)
              : 0;
            const looseCount = hasPack
              ? product.stockUnits % product.caseSize
              : product.stockUnits;
            const marginUnit = product.priceUnitUsd - product.costUnitUsd;
            const marginPct =
              product.priceUnitUsd > 0
                ? (marginUnit / product.priceUnitUsd) * 100
                : 0;

            return (
              <div
                key={product.id}
                className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-slate-400 transition-colors"
              >
                {/* Top: Photo + Name + Category */}
                <div className="flex items-start gap-3">
                  {product.photoUrl ? (
                    <img
                      src={product.photoUrl}
                      alt={product.name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                      <Beer className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-sm text-[#0F172A] leading-snug line-clamp-2">
                      {product.name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {getCategoryLabel(product.category)}
                      {product.presentation ? ` · ${product.presentation}` : ''}
                    </div>
                  </div>
                </div>

                {/* Stock Remaining Badge (Visible to Everyone) */}
                <div
                  className={`p-3 rounded-xl border ${
                    product.stockUnits === 0
                      ? 'bg-red-50 border-red-200'
                      : isLow
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-[#F8FAFC] border-[#CBD5E1]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      STOCK
                    </span>
                    {isLow && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#B45309]">
                        <AlertCircle className="w-3 h-3" />
                        Stock bajo
                      </span>
                    )}
                  </div>
                  <div className="font-extrabold text-xl text-[#0F172A] tabular-nums mt-0.5">
                    {product.stockUnits}{' '}
                    <span className="text-xs font-semibold text-slate-600">
                      unid.
                    </span>
                  </div>
                  {hasPack && (
                    <div className="text-xs text-slate-700 tabular-nums mt-0.5">
                      {casesCount} Caja{casesCount === 1 ? '' : 's'} (
                      {product.caseSize}u) + {looseCount} sueltas
                    </div>
                  )}
                </div>

                {/* Sale Price & Cost/Margin */}
                <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-100">
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-slate-500">
                      Venta Unidad
                    </div>
                    <div className="font-extrabold text-base text-[#0F172A] tabular-nums">
                      {formatUsd(product.priceUnitUsd)}
                    </div>
                    <div className="text-[10px] text-[#1D4ED8] tabular-nums">
                      {formatBs(product.priceUnitUsd * effectiveRate)}
                    </div>
                  </div>

                  {hasPack && product.priceCaseUsd !== undefined && (
                    <div className="text-right">
                      <div className="text-[10px] font-semibold uppercase text-slate-500">
                        Venta Caja ({product.caseSize}u)
                      </div>
                      <div className="font-bold text-sm text-[#0F172A] tabular-nums">
                        {formatUsd(product.priceCaseUsd)}
                      </div>
                      <div className="text-[10px] text-slate-500 tabular-nums">
                        {formatBs(product.priceCaseUsd * effectiveRate)}
                      </div>
                    </div>
                  )}
                </div>

                {canEditExistingProducts && (
                  <div className="px-2.5 py-2 rounded-lg bg-emerald-50/80 border border-emerald-200 text-[11px] tabular-nums flex items-center justify-between gap-2">
                    <span className="text-slate-700">
                      Costo: {formatUsd(product.costUnitUsd)}/u
                    </span>
                    <span className="font-bold text-[#059669]">
                      +{formatUsd(marginUnit)} ({marginPct.toFixed(0)}%)
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenRestock(product.id)}
                    className="flex-1 min-h-[40px] px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-xs font-bold text-[#0F172A] transition-colors whitespace-nowrap"
                  >
                    + Sumar Stock
                  </button>
                  {canEditExistingProducts && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditProduct(product)}
                      title="Editar producto y precios"
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-100 text-xs font-bold text-[#1D4ED8] flex items-center gap-1 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  )}
                  {role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteProduct(product)}
                      title="Eliminar producto"
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Recibir Mercancía (Factura en Bs -> Conversión a $ -> Precio de Venta en $) */}
      {showRestockModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitRestock}
            className="bg-white w-full max-w-lg rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                Recibir Mercancía (Factura en Bs. → Venta en $)
              </h3>
              <button
                type="button"
                onClick={() => setShowRestockModal(false)}
                className="p-1 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Producto Guardado (Predeterminado)
                </label>
                <select
                  value={restockProductId}
                  onChange={(e) => handleSelectRestockProduct(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm bg-white text-[#0F172A]"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.presentation ? ` (${p.presentation})` : ''} — Stock:{' '}
                      {p.stockUnits} u.
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {restockIsPack && selectedRestockProduct && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Cajas Recibidas ({selectedRestockProduct.caseSize} u. c/u)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={restockCases}
                      onChange={(e) => setRestockCases(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                    />
                  </div>
                )}
                <div className={restockIsPack ? '' : 'col-span-2'}>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Unidades sueltas recibidas
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={restockUnits}
                    onChange={(e) => setRestockUnits(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                  />
                </div>
              </div>

              {/* Invoice in Bs -> Automatic Conversion to USD */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
                <div>
                  <label className="block text-xs font-bold text-[#1D4ED8] mb-1">
                    Precio de Factura / Compra en Bolívares (Bs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={restockInvoiceBs}
                    onChange={(e) => setRestockInvoiceBs(e.target.value)}
                    placeholder="Ej: 15110.00"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-blue-300 rounded-xl text-sm font-bold tabular-nums"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                  <span className="text-slate-700">
                    Conversión a USD (BCV {formatBs(bcvRate)}):
                  </span>
                  <strong className="text-base text-[#0F172A]">
                    {formatUsd(rInvoiceUsdConverted)}
                  </strong>
                </div>

                {rTotalUnitsAdded > 0 && rInvoiceBs > 0 && (
                  <div className="text-xs font-semibold text-[#1D4ED8] tabular-nums">
                    Costo recibido: {formatUsd(rReceivedUnitUsd)} / unid.
                    {rReceivedCaseUsd !== undefined
                      ? ` · ${formatUsd(rReceivedCaseUsd)} / caja`
                      : ''}
                  </div>
                )}
              </div>

              {/* Sale Price in USD (visible while comparing against received cost) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Precio de Venta Unidad ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    disabled={!canEditExistingProducts}
                    value={restockSaleUnitUsd}
                    onChange={(e) => setRestockSaleUnitUsd(e.target.value)}
                    className={`w-full min-h-[44px] px-3.5 py-2 border rounded-xl text-sm tabular-nums ${
                      canEditExistingProducts
                        ? 'bg-white border-[#CBD5E1]'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  />
                </div>
                {restockIsPack && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Precio de Venta Caja ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      disabled={!canEditExistingProducts}
                      value={restockSaleCaseUsd}
                      onChange={(e) => setRestockSaleCaseUsd(e.target.value)}
                      className={`w-full min-h-[44px] px-3.5 py-2 border rounded-xl text-sm tabular-nums ${
                        canEditExistingProducts
                          ? 'bg-white border-[#CBD5E1]'
                          : 'bg-slate-100 border-slate-200 text-slate-600'
                      }`}
                    />
                  </div>
                )}
              </div>

              {rTotalUnitsAdded > 0 && rInvoiceBs > 0 && (
                <div className="p-3 rounded-xl bg-[#ECFDF5] border border-[#10B981]/50 text-xs tabular-nums flex flex-wrap justify-between gap-2">
                  <span>
                    Venta estimada lote:{' '}
                    <strong>{formatUsd(rEstimatedSaleValue)}</strong>
                  </span>
                  <span className="font-bold text-[#059669]">
                    Margen: +
                    {formatUsd(rEstimatedSaleValue - rInvoiceUsdConverted)}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nota / Proveedor (Opcional)
                </label>
                <input
                  type="text"
                  value={restockNote}
                  onChange={(e) => setRestockNote(e.target.value)}
                  placeholder="Ej: Camión Polar Los Taques"
                  className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="px-5 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowRestockModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={rTotalUnitsAdded <= 0}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-40 text-white text-sm font-bold"
              >
                Sumar +{rTotalUnitsAdded} unid. al Stock
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Nuevo Producto / Editar Producto */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitProduct}
            className="bg-white w-full max-w-xl rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                {editingProduct
                  ? `Editar Producto · ${editingProduct.name}`
                  : 'Agregar Nuevo Producto (Factura Bs. → Venta $)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="p-1 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Photo Capture / Upload */}
              <div className="flex flex-wrap items-center gap-4 p-3.5 rounded-xl bg-slate-100 border border-[#CBD5E1]">
                {formPhotoUrl ? (
                  <div className="relative">
                    <img
                      src={formPhotoUrl}
                      alt="Vista previa"
                      className="w-16 h-16 rounded-xl object-cover border border-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => setFormPhotoUrl(undefined)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#EF4444] text-white flex items-center justify-center text-xs font-bold"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-white border border-slate-300 text-slate-400 flex items-center justify-center">
                    <Beer className="w-7 h-7" />
                  </div>
                )}

                <div className="flex-1 min-w-[200px] space-y-1.5">
                  <div className="text-xs font-bold text-[#0F172A]">
                    Foto del Producto (Perfil Dinámico)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                      <Camera className="w-3.5 h-3.5" />
                      Tomar Foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                    <label className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#0F172A] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5" />
                      Subir Imagen
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Name & Presentation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nombre / Marca
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej: Cerveza Solera Azul"
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Tamaño / Presentación
                  </label>
                  <input
                    type="text"
                    value={formPresentation}
                    onChange={(e) => setFormPresentation(e.target.value)}
                    placeholder="Ej: Tercio 222ml, Botella 330ml, Lata 355ml"
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Category & Pack Format */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Categoría
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) =>
                      setFormCategory(e.target.value as ProductCategory)
                    }
                    className="w-full min-h-[44px] px-3 py-2 border border-[#CBD5E1] rounded-xl text-sm bg-white"
                  >
                    <option value="cervezas">Cervezas</option>
                    <option value="licores">Licores</option>
                    <option value="refrescos">Refrescos y Agua</option>
                    <option value="hielo_otros">Hielo y Otros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Venta por Empaque
                  </label>
                  <select
                    value={formIsPack ? 'pack' : 'unit'}
                    onChange={(e) => setFormIsPack(e.target.value === 'pack')}
                    className="w-full min-h-[44px] px-3 py-2 border border-[#CBD5E1] rounded-xl text-sm bg-white"
                  >
                    <option value="pack">Caja / Bulto + Unidad</option>
                    <option value="unit">Solo por Unidad</option>
                  </select>
                </div>

                {formIsPack && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Unidades por Caja
                    </label>
                    <input
                      type="number"
                      min="2"
                      max="100"
                      required
                      value={formCaseSize}
                      onChange={(e) => setFormCaseSize(e.target.value)}
                      placeholder="36, 24, 12, 6"
                      className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                    />
                  </div>
                )}
              </div>

              {/* Received Quantity (Only on Creation) */}
              {!editingProduct && (
                <div className="p-3.5 rounded-xl bg-slate-100 border border-[#CBD5E1] space-y-3">
                  <div className="text-xs font-bold text-[#0F172A]">
                    Cantidad Recibida Inicial (Se guarda en inventario)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {formIsPack && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Cajas Recibidas ({parsedCaseSize} u. c/u)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formReceivedCases}
                          onChange={(e) => setFormReceivedCases(e.target.value)}
                          className="w-full min-h-[42px] px-3 bg-white border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                        />
                      </div>
                    )}
                    <div className={formIsPack ? '' : 'col-span-2'}>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Unidades sueltas recibidas
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formReceivedUnits}
                        onChange={(e) => setFormReceivedUnits(e.target.value)}
                        className="w-full min-h-[42px] px-3 bg-white border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="text-xs tabular-nums font-semibold text-[#1D4ED8]">
                    Total unidades recibidas: {totalInitialUnits} u.
                  </div>
                </div>
              )}

              {/* Invoice Price in Bolívares -> Automatic Conversion to USD */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-[#1D4ED8]">
                    {editingProduct
                      ? formIsPack
                        ? 'Costo de Factura por Caja en Bolívares (Bs.)'
                        : 'Costo de Factura por Unidad en Bolívares (Bs.)'
                      : 'Monto Total de Factura Recibida en Bolívares (Bs.)'}
                  </label>
                  <span className="text-[11px] tabular-nums text-slate-600">
                    BCV: {formatBs(bcvRate)}/$
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formInvoiceTotalBs}
                  onChange={(e) => setFormInvoiceTotalBs(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-blue-300 rounded-xl text-sm font-bold tabular-nums"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums pt-0.5">
                  <span className="text-slate-700">
                    Equivalente Factura en USD:{' '}
                    <strong className="text-[#0F172A]">
                      {formatUsd(convertedInvoiceUsd)}
                    </strong>
                  </span>
                  <span className="text-[#1D4ED8] font-bold">
                    Recibido a: {formatUsd(calculatedUnitCost)}/u.
                    {calculatedCaseCost !== undefined
                      ? ` · ${formatUsd(calculatedCaseCost)}/caja`
                      : ''}
                  </span>
                </div>
              </div>

              {/* Sale Prices in USD */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Precio Venta Unidad ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    required
                    value={formPriceUnit}
                    onChange={(e) => setFormPriceUnit(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                  />
                </div>

                {formIsPack && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Precio Venta Caja ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={formPriceCase}
                      onChange={(e) => setFormPriceCase(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                    />
                  </div>
                )}
              </div>

              {/* Live Profit Margin Box */}
              <div className="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#10B981]/50 text-xs space-y-1">
                <div className="font-bold text-[#065F46]">
                  Margen de Ganancia Calculado al Momento
                </div>
                <div className="flex flex-wrap gap-4 tabular-nums text-[#0F172A]">
                  <span>
                    Recibido en: <strong>{formatUsd(calculatedUnitCost)}/u.</strong>
                  </span>
                  <span>
                    Ganancia Unit.:{' '}
                    <strong className="text-[#059669]">
                      +{formatUsd(unitMarginUsd)} ({unitMarginPct.toFixed(1)}%)
                    </strong>
                  </span>
                  {caseMarginUsd !== null && calculatedCaseCost !== undefined && (
                    <span>
                      Ganancia Caja:{' '}
                      <strong className="text-[#059669]">
                        +{formatUsd(caseMarginUsd)} (Costo{' '}
                        {formatUsd(calculatedCaseCost)})
                      </strong>
                    </span>
                  )}
                </div>
                {!editingProduct && role !== 'admin' && (
                  <div className="text-[11px] text-slate-600 pt-1">
                    Nota: Al guardar este producto, sus precios y factura
                    quedarán bloqueados y solo el Administrador podrá modificarlos.
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-bold"
              >
                {editingProduct
                  ? 'Guardar Cambios'
                  : 'Guardar en Catálogo e Inventario'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Reporte de Stock Actual */}
      {showStockReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-lg">
                  Reporte de Conteo Físico en Cava
                </h3>
                <p className="text-xs text-slate-300">
                  El Caney Taquense · Stock exacto en sistema para verificación
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStockReportModal(false)}
                className="p-1 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto divide-y divide-slate-200">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="py-3 flex items-center justify-between gap-4 text-sm"
                >
                  <div>
                    <div className="font-semibold text-[#0F172A]">
                      {p.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {getCategoryLabel(p.category)}
                      {p.presentation ? ` · ${p.presentation}` : ''}
                    </div>
                  </div>
                  <div className="font-bold text-sm text-[#0F172A] tabular-nums text-right">
                    {formatStockReadable(p.stockUnits, p.unitType, p.caseSize)}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowStockReportModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => downloadStockReportPdf(products)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 text-white text-sm font-bold flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Descargar PDF de Conteo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Product (Admin Only) */}
      {confirmDeleteProduct && role === 'admin' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-[#CBD5E1] shadow-2xl p-5 space-y-4">
            <h3 className="font-display font-bold text-lg text-[#0F172A]">
              ¿Eliminar producto del inventario?
            </h3>
            <p className="text-sm text-slate-600">
              Se eliminará{' '}
              <span className="font-semibold text-[#0F172A]">
                {confirmDeleteProduct.name}
              </span>{' '}
              del catálogo activo. Esta acción solo está disponible para el
              Administrador.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteProduct(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProduct(confirmDeleteProduct.id);
                  setConfirmDeleteProduct(null);
                }}
                className="min-h-[42px] px-4 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-sm font-bold"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
