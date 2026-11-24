import {
  InvoiceAttachmentDraft,
  InvoiceAttachmentMime,
  StockRestockRecord,
} from '../types';

export const MAX_PDF_BYTES = 2 * 1024 * 1024; // 2 MB
export const INLINE_DATAURL_LIMIT = 650_000; // Fits safely under Firestore 1 MiB doc limit
export const MAX_ATTACHMENT_CHUNKS = 5;

const ALLOWED_DATAURL_PREFIXES = [
  'data:image/jpeg;base64,',
  'data:image/png;base64,',
  'data:image/webp;base64,',
  'data:application/pdf;base64,',
];

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function isSafeInvoiceDataUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return ALLOWED_DATAURL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function hasInvoiceAttachment(record: StockRestockRecord): boolean {
  return Boolean(
    record.invoiceAttachmentDataUrl ||
      (record.invoiceAttachmentChunkCount &&
        record.invoiceAttachmentChunkCount > 0)
  );
}

export function splitDataUrlIntoChunks(dataUrl: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < dataUrl.length; i += INLINE_DATAURL_LIMIT) {
    chunks.push(dataUrl.slice(i, i + INLINE_DATAURL_LIMIT));
  }
  return chunks.slice(0, MAX_ATTACHMENT_CHUNKS);
}

export function dataUrlToBlobUrl(dataUrl: string): string | null {
  if (!isSafeInvoiceDataUrl(dataUrl)) return null;
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(0, commaIdx);
    const mimeMatch = header.match(/^data:([^;]+);base64$/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const base64 = dataUrl.slice(commaIdx + 1);
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function estimateBase64Bytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const b64Len = dataUrl.length - commaIdx - 1;
  return Math.max(1, Math.round((b64Len * 3) / 4));
}

function sanitizeFileName(rawName: string, fallbackExt: string): string {
  const cleaned = rawName.trim().replace(/\s+/g, ' ').slice(0, 160);
  if (cleaned) return cleaned;
  return `factura_${Date.now()}.${fallbackExt}`;
}

function compressInvoicePhoto(file: File): Promise<InvoiceAttachmentDraft> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('No se pudo leer la imagen seleccionada.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error('El archivo seleccionado no es una imagen válida.'));
      img.onload = () => {
        const maxWidth = 1200;
        const maxHeight = 1800;

        let targetW = img.width;
        let targetH = img.height;

        if (targetW > maxWidth) {
          const ratio = maxWidth / targetW;
          targetW = maxWidth;
          targetH = Math.round(targetH * ratio);
        }
        if (targetH > maxHeight) {
          const ratio = maxHeight / targetH;
          targetH = maxHeight;
          targetW = Math.round(targetW * ratio);
        }

        const renderJpeg = (w: number, h: number, quality: number): string => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, w);
          canvas.height = Math.max(1, h);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('No se pudo procesar la imagen en el navegador.');
          }
          // White backdrop avoids black background on transparent PNGs
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', quality);
        };

        try {
          let dataUrl = renderJpeg(targetW, targetH, 0.75);

          // Ensure photo always fits comfortably inline in Firestore (< 650 KB base64)
          const fallbackSteps: Array<[number, number]> = [
            [1, 0.65],
            [0.85, 0.58],
            [0.75, 0.5],
          ];
          for (const [scaleFactor, quality] of fallbackSteps) {
            if (dataUrl.length <= INLINE_DATAURL_LIMIT) break;
            dataUrl = renderJpeg(
              Math.round(targetW * scaleFactor),
              Math.round(targetH * scaleFactor),
              quality
            );
          }

          if (dataUrl.length > INLINE_DATAURL_LIMIT) {
            reject(
              new Error(
                'La imagen sigue siendo muy pesada después de comprimir. Intenta tomar la foto con menor resolución.'
              )
            );
            return;
          }

          const baseName = file.name
            ? file.name.replace(/\.[^.]+$/, '') + '.jpg'
            : `factura_${Date.now()}.jpg`;

          resolve({
            name: sanitizeFileName(baseName, 'jpg'),
            type: 'image',
            mime: 'image/jpeg' as InvoiceAttachmentMime,
            sizeBytes: Math.min(MAX_PDF_BYTES, estimateBase64Bytes(dataUrl)),
            dataUrl,
          });
        } catch (err) {
          reject(
            err instanceof Error
              ? err
              : new Error('Error al optimizar la imagen.')
          );
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function readInvoicePdf(file: File): Promise<InvoiceAttachmentDraft> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_PDF_BYTES) {
      reject(
        new Error(
          `El PDF pesa ${formatFileSize(file.size)} y supera el máximo permitido de 2 MB. Comprímelo o toma una foto de la factura.`
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('No se pudo leer el archivo PDF seleccionado.'));
    reader.onload = () => {
      const raw = String(reader.result || '');
      const commaIdx = raw.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('El archivo PDF no pudo procesarse correctamente.'));
        return;
      }
      const b64 = raw.slice(commaIdx + 1);
      // Verify PDF magic header (%PDF- -> JVBERi0 in base64)
      if (!b64.startsWith('JVBERi0')) {
        reject(
          new Error(
            'El archivo no tiene un formato PDF válido. Selecciona un PDF real o una imagen.'
          )
        );
        return;
      }

      const normalizedDataUrl = `data:application/pdf;base64,${b64}`;
      if (
        normalizedDataUrl.length >
        INLINE_DATAURL_LIMIT * MAX_ATTACHMENT_CHUNKS
      ) {
        reject(
          new Error(
            'El archivo PDF supera el límite de almacenamiento (2 MB). Comprímelo o sube una foto.'
          )
        );
        return;
      }

      resolve({
        name: sanitizeFileName(file.name, 'pdf'),
        type: 'pdf',
        mime: 'application/pdf',
        sizeBytes: Math.max(1, Math.min(MAX_PDF_BYTES, file.size)),
        dataUrl: normalizedDataUrl,
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Optimizes an uploaded invoice/receipt file:
 * - Images: resized to max 1200px width, JPEG quality 0.75 (inline Firestore friendly)
 * - PDFs: validated up to 2 MB with real %PDF- signature check
 */
export async function processInvoiceAttachment(
  file: File
): Promise<InvoiceAttachmentDraft> {
  const mime = (file.type || '').toLowerCase();
  const lowerName = (file.name || '').toLowerCase();

  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return readInvoicePdf(file);
  }

  if (
    mime.startsWith('image/') &&
    mime !== 'image/svg+xml' &&
    !lowerName.endsWith('.svg')
  ) {
    return compressInvoicePhoto(file);
  }

  throw new Error(
    'Formato no compatible. Selecciona una foto (JPG, PNG, WEBP) o un archivo PDF (máx. 2 MB).'
  );
}
