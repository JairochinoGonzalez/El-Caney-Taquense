import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  AlertCircle,
  Download,
  FileText,
  Loader2,
  Paperclip,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { db } from '../firebase';
import { StockRestockRecord } from '../types';
import {
  formatBs,
  formatDateSpanish,
  formatTime,
  formatUsd,
} from '../utils/formatters';
import {
  dataUrlToBlobUrl,
  formatFileSize,
  isSafeInvoiceDataUrl,
} from '../utils/invoiceFileHelper';

interface InvoiceViewerModalProps {
  record: StockRestockRecord;
  relatedRecords?: StockRestockRecord[];
  userEmail: string;
  isAdmin: boolean;
  canSeeCost: boolean;
  onClose: () => void;
}

export const InvoiceViewerModal: React.FC<InvoiceViewerModalProps> = ({
  record,
  relatedRecords,
  userEmail,
  isAdmin,
  canSeeCost,
  onClose,
}) => {
  const [activeRecord, setActiveRecord] = useState<StockRestockRecord>(record);
  const [resolvedDataUrl, setResolvedDataUrl] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setActiveRecord(record);
    setZoomed(false);
  }, [record]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setResolvedDataUrl(null);

    const loadAttachment = async () => {
      if (activeRecord.invoiceAttachmentDataUrl) {
        if (isSafeInvoiceDataUrl(activeRecord.invoiceAttachmentDataUrl)) {
          setResolvedDataUrl(activeRecord.invoiceAttachmentDataUrl);
        } else {
          setError('El formato del comprobante adjunto no es válido.');
        }
        return;
      }

      if (
        activeRecord.invoiceAttachmentChunkCount &&
        activeRecord.invoiceAttachmentChunkCount > 0
      ) {
        setLoading(true);
        try {
          const emailLower = userEmail.trim().toLowerCase();
          const chunksRef = collection(
            db,
            'restocks',
            activeRecord.id,
            'attachmentChunks'
          );
          const q = query(
            chunksRef,
            where(
              isAdmin ? 'adminEmails' : 'staffEmails',
              'array-contains',
              emailLower
            )
          );
          const snap = await getDocs(q);
          if (cancelled) return;

          const parts = snap.docs
            .map((d) => d.data() as { chunkIndex: number; data: string })
            .sort((a, b) => a.chunkIndex - b.chunkIndex);

          if (parts.length === 0) {
            setError('No se encontraron los datos del archivo PDF adjunto.');
            return;
          }

          const combined = parts.map((p) => p.data).join('');
          if (!isSafeInvoiceDataUrl(combined)) {
            setError('El archivo PDF adjunto no tiene un formato válido.');
            return;
          }
          setResolvedDataUrl(combined);
        } catch {
          if (!cancelled) {
            setError(
              'No se pudo cargar el archivo adjunto. Verifica tu conexión.'
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      setError('Este movimiento no tiene un comprobante adjunto.');
    };

    void loadAttachment();

    return () => {
      cancelled = true;
    };
  }, [activeRecord, userEmail, isAdmin]);

  useEffect(() => {
    if (!resolvedDataUrl) {
      setBlobUrl(null);
      return;
    }
    const created = dataUrlToBlobUrl(resolvedDataUrl);
    setBlobUrl(created);
    return () => {
      if (created) URL.revokeObjectURL(created);
    };
  }, [resolvedDataUrl]);

  const isPdf =
    activeRecord.invoiceAttachmentType === 'pdf' ||
    activeRecord.invoiceAttachmentMime === 'application/pdf';

  const downloadFileName =
    activeRecord.invoiceAttachmentName ||
    `factura_${activeRecord.productName.toLowerCase().replace(/\s+/g, '_')}.${
      isPdf ? 'pdf' : 'jpg'
    }`;

  const switcherList =
    relatedRecords && relatedRecords.length > 1 ? relatedRecords : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0F172A] text-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold text-[#FBBF24] uppercase tracking-wider">
              <Paperclip className="w-3.5 h-3.5" />
              <span>Comprobante / Factura de Compra</span>
            </div>
            <h3 className="font-display font-bold text-lg text-white truncate mt-0.5">
              {activeRecord.productName}
            </h3>
            <div className="text-xs text-slate-300 tabular-nums mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>
                {formatDateSpanish(activeRecord.date)} ·{' '}
                {formatTime(activeRecord.timestamp)}
              </span>
              <span>·</span>
              <span>
                +{activeRecord.totalUnitsAdded} unid.
                {activeRecord.casesAdded > 0
                  ? ` (${activeRecord.casesAdded} caja${
                      activeRecord.casesAdded === 1 ? '' : 's'
                    }${
                      activeRecord.unitsAdded > 0
                        ? ` + ${activeRecord.unitsAdded} u.`
                        : ''
                    })`
                  : ''}
              </span>
              {activeRecord.invoiceNumber && (
                <>
                  <span>·</span>
                  <span className="text-white font-semibold">
                    {activeRecord.invoiceNumber}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-invoice Switcher (if product has multiple attached invoices) */}
        {switcherList && (
          <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-bold text-slate-600 shrink-0">
              Facturas ({switcherList.length}):
            </span>
            {switcherList.map((rec) => {
              const isSelected = rec.id === activeRecord.id;
              return (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => {
                    setActiveRecord(rec);
                    setZoomed(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-[#1D4ED8] text-white'
                      : 'bg-white border border-[#CBD5E1] text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {formatDateSpanish(rec.date)}
                  {rec.invoiceNumber ? ` · ${rec.invoiceNumber}` : ''}
                </button>
              );
            })}
          </div>
        )}

        {/* Metadata Strip */}
        <div className="px-5 py-3 bg-[#F8FAFC] border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
            <span>
              Tipo:{' '}
              <strong className="text-[#0F172A]">
                {activeRecord.movementType === 'nuevo_producto'
                  ? 'Producto Nuevo'
                  : 'Entrada de Stock'}
              </strong>
            </span>
            {canSeeCost && (
              <span className="tabular-nums">
                Costo:{' '}
                <strong className="text-[#0F172A]">
                  {formatUsd(activeRecord.totalCostUsd)}
                </strong>
                {activeRecord.totalCostBs && activeRecord.totalCostBs > 0
                  ? ` (${formatBs(activeRecord.totalCostBs)})`
                  : ''}
              </span>
            )}
            {activeRecord.recordedByName && (
              <span>
                Registrado por:{' '}
                <strong className="text-[#0F172A]">
                  {activeRecord.recordedByName}
                </strong>
              </span>
            )}
            {activeRecord.note && (
              <span>
                Nota:{' '}
                <strong className="text-[#0F172A]">{activeRecord.note}</strong>
              </span>
            )}
          </div>

          {activeRecord.invoiceAttachmentSizeBytes && (
            <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
              {activeRecord.invoiceAttachmentName || 'Comprobante'} ·{' '}
              {formatFileSize(activeRecord.invoiceAttachmentSizeBytes)}
            </span>
          )}
        </div>

        {/* Viewer Canvas */}
        <div className="p-4 sm:p-5 overflow-auto flex-1 bg-slate-100 flex flex-col items-center justify-center min-h-[280px]">
          {loading ? (
            <div className="flex flex-col items-center gap-2.5 text-slate-600 py-12">
              <Loader2 className="w-7 h-7 animate-spin text-[#1D4ED8]" />
              <span className="text-sm font-semibold">
                Cargando comprobante...
              </span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 text-center max-w-md py-10">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-sm font-semibold text-red-700">{error}</p>
            </div>
          ) : isPdf && blobUrl ? (
            <div className="w-full space-y-2.5">
              <iframe
                src={blobUrl}
                title={downloadFileName}
                className="w-full h-[60vh] rounded-xl border border-[#CBD5E1] bg-white shadow-xs"
              />
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>
                  Si usas celular o quieres guardar una copia local, presiona{' '}
                  <strong>Descargar PDF</strong>.
                </span>
              </div>
            </div>
          ) : resolvedDataUrl ? (
            <div className="w-full flex flex-col items-center">
              <img
                src={resolvedDataUrl}
                alt={downloadFileName}
                onClick={() => setZoomed((z) => !z)}
                className={`rounded-xl border border-[#CBD5E1] bg-white shadow-sm transition-all cursor-zoom-in ${
                  zoomed
                    ? 'max-w-none w-full sm:w-[150%] cursor-zoom-out'
                    : 'max-h-[62vh] max-w-full object-contain'
                }`}
              />
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            {!isPdf && resolvedDataUrl && !loading && !error && (
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-xs font-bold text-[#0F172A] flex items-center gap-1.5"
              >
                {zoomed ? (
                  <>
                    <ZoomOut className="w-4 h-4" />
                    Ajustar a pantalla
                  </>
                ) : (
                  <>
                    <ZoomIn className="w-4 h-4" />
                    Ampliar foto
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-50 text-sm font-semibold text-[#0F172A]"
            >
              Cerrar
            </button>
            {blobUrl && !loading && !error && (
              <a
                href={blobUrl}
                download={downloadFileName}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 text-white text-sm font-bold flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                {isPdf ? 'Descargar PDF' : 'Descargar Imagen'}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
