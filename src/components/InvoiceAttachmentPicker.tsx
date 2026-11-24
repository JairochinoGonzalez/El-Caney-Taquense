import React, { useRef, useState } from 'react';
import {
  Camera,
  FileText,
  FileUp,
  Loader2,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { InvoiceAttachmentDraft } from '../types';
import {
  formatFileSize,
  processInvoiceAttachment,
} from '../utils/invoiceFileHelper';

interface InvoiceAttachmentPickerProps {
  invoiceNumber: string;
  onChangeInvoiceNumber: (value: string) => void;
  attachment: InvoiceAttachmentDraft | null;
  onChangeAttachment: (next: InvoiceAttachmentDraft | null) => void;
  disabled?: boolean;
}

export const InvoiceAttachmentPicker: React.FC<
  InvoiceAttachmentPickerProps
> = ({
  invoiceNumber,
  onChangeInvoiceNumber,
  attachment,
  onChangeAttachment,
  disabled = false,
}) => {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    // Reset input value so selecting the same file again still triggers onChange
    e.target.value = '';
    if (!file) return;

    setError(null);
    setProcessing(true);
    try {
      const processed = await processInvoiceAttachment(file);
      onChangeAttachment(processed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo procesar el comprobante.'
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-3.5 rounded-xl bg-slate-50 border border-[#CBD5E1] space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
          <Paperclip className="w-4 h-4 text-[#1D4ED8] shrink-0" />
          <span>Comprobante / Factura de Compra (Opcional)</span>
        </div>
        <span className="text-[10px] font-semibold text-slate-500">
          Opcional
        </span>
      </div>

      {/* Optional short field for Invoice Number or Supplier */}
      <div>
        <label className="block text-[11px] font-bold text-slate-700 mb-1">
          N° de Factura o Proveedor (Opcional)
        </label>
        <input
          type="text"
          maxLength={120}
          disabled={disabled}
          value={invoiceNumber}
          onChange={(e) => onChangeInvoiceNumber(e.target.value)}
          placeholder="Ej: Dist. Polar - Fac #402"
          className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-xl text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        />
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label
          className={`min-h-[42px] px-3 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
            disabled || processing
              ? 'opacity-50 pointer-events-none'
              : 'cursor-pointer'
          }`}
        >
          <Camera className="w-4 h-4 shrink-0" />
          <span>Tomar Foto</span>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled || processing}
            onChange={handleFileSelected}
            className="hidden"
          />
        </label>

        <label
          className={`min-h-[42px] px-3 py-2 rounded-xl bg-white border border-[#CBD5E1] hover:bg-slate-100 text-[#0F172A] text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
            disabled || processing
              ? 'opacity-50 pointer-events-none'
              : 'cursor-pointer'
          }`}
        >
          <FileUp className="w-4 h-4 text-[#1D4ED8] shrink-0" />
          <span>Subir Imagen o PDF</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            disabled={disabled || processing}
            onChange={handleFileSelected}
            className="hidden"
          />
        </label>
      </div>

      {processing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-[#1D4ED8]">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Optimizando comprobante...</span>
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Preview Card */}
      {attachment && !processing && (
        <div className="p-2.5 rounded-xl bg-white border border-[#10B981]/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {attachment.type === 'image' ? (
              <img
                src={attachment.dataUrl}
                alt="Vista previa de factura"
                className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-red-50 border border-red-200 text-red-600 flex flex-col items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
                <span className="text-[9px] font-extrabold uppercase leading-none mt-0.5">
                  PDF
                </span>
              </div>
            )}

            <div className="min-w-0">
              <div className="text-xs font-bold text-[#0F172A] truncate">
                {attachment.name}
              </div>
              <div className="text-[11px] text-[#059669] font-semibold tabular-nums mt-0.5">
                {formatFileSize(attachment.sizeBytes)} ·{' '}
                {attachment.type === 'image'
                  ? 'Foto optimizada'
                  : 'Documento PDF listo'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onChangeAttachment(null);
              setError(null);
            }}
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1 shrink-0 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Quitar
          </button>
        </div>
      )}

      <p className="text-[11px] text-slate-500 leading-snug">
        Fotos se comprimen automáticamente (máx. 1200px) · PDF máx. 2 MB. Si no
        adjuntas nada, el inventario se guarda normalmente.
      </p>
    </div>
  );
};
