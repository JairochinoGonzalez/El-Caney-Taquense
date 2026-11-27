import jsPDF from 'jspdf';
import { ClosedShift, Product } from '../types';
import {
  formatBs,
  formatDateSpanish,
  formatStockReadable,
  formatTime,
  formatUsd,
  getPaymentLabel,
} from './formatters';

/**
 * Generates a mobile-friendly high-contrast PDF with LARGE typography
 * so the owner in the USA or staff on a phone can read every figure without zooming.
 */
export function downloadClosingShiftPdf(shift: ClosedShift): void {
  // Narrow mobile-friendly page width (140mm) with generous tall page height (297mm, auto-paginated)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [145, 280],
  });

  const pageWidth = 145;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  const checkPageBreak = (neededMm: number) => {
    if (y + neededMm > 266) {
      doc.addPage([145, 280]);
      y = 14;
    }
  };

  const drawDivider = () => {
    checkPageBreak(5);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('EL CANEY TAQUENSE', margin, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('CIERRE OFICIAL DE FIESTA Y CAJA', margin, 18);
  doc.setFontSize(9.5);
  doc.text('Los Taques, Estado Falcón · Venezuela', margin, 24);

  y = 36;
  doc.setTextColor(15, 23, 42);

  // Event summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(shift.eventName, contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  doc.text(`Fecha: ${formatDateSpanish(shift.eventDate)}`, margin, y);
  y += 5.5;
  doc.text(
    `Apertura: ${formatTime(shift.openedAt)}  |  Cierre: ${formatTime(shift.closedAt)}`,
    margin,
    y
  );
  y += 5.5;
  if (shift.eventType === 'fiesta') {
    doc.text(
      `Taquilla (Resumen): ${shift.totalAttendees} personas`,
      margin,
      y
    );
  } else {
    doc.text(
      `Evento Privado (${shift.eventSubType || 'Alquiler completo'}) · Sin taquilla`,
      margin,
      y
    );
  }
  y += 6;

  drawDivider();

  // Grand Totals Box
  checkPageBreak(30);
  doc.setFillColor(236, 253, 245); // Emerald-50
  doc.setDrawColor(16, 185, 129);
  doc.roundedRect(margin, y, contentWidth, 26, 2, 2, 'FD');

  doc.setTextColor(6, 95, 70);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL RECAUDADO EN LA NOCHE', margin + 4, y + 6.5);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(20);
  doc.text(formatUsd(shift.totalRevenueUsd), margin + 4, y + 15.5);

  doc.setFontSize(13);
  doc.setTextColor(29, 78, 216);
  doc.text(formatBs(shift.totalRevenueBs), margin + 4, y + 22.5);

  y += 32;

  // Breakdown Taquilla vs Barra
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('RESUMEN POR ÁREA', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  if (shift.eventType === 'fiesta') {
    doc.text(`Taquilla (${shift.totalAttendees} entr.):`, margin, y);
    doc.text(formatUsd(shift.taquillaUsd), pageWidth - margin, y, {
      align: 'right',
    });
    y += 6;
  }
  doc.text('Barra y Bebidas:', margin, y);
  doc.text(formatUsd(shift.barraUsd), pageWidth - margin, y, {
    align: 'right',
  });
  y += 6;

  drawDivider();

  // Payment Method Breakdown
  checkPageBreak(28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('DESGLOSE POR MÉTODO DE PAGO', margin, y);
  y += 6.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.text('Efectivo USD en Gaveta:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.text(formatUsd(shift.cashUsdTotal), pageWidth - margin, y, { align: 'right' });
  y += 6.5;

  doc.setFont('helvetica', 'normal');
  doc.text('Zelle Recibido:', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.text(formatUsd(shift.zelleUsdTotal), pageWidth - margin, y, { align: 'right' });
  y += 6.5;

  doc.setFont('helvetica', 'normal');
  doc.text('Pago Móvil (Bs.):', margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(29, 78, 216);
  doc.text(formatBs(shift.pagoMovilBsTotal), pageWidth - margin, y, { align: 'right' });
  doc.setTextColor(15, 23, 42);
  y += 6.5;

  if ((shift.tarjetaBsTotal || 0) > 0) {
    doc.setFont('helvetica', 'normal');
    doc.text('Tarjeta / Punto (Bs.):', margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(29, 78, 216);
    doc.text(formatBs(shift.tarjetaBsTotal || 0), pageWidth - margin, y, { align: 'right' });
    doc.setTextColor(15, 23, 42);
    y += 6.5;
  }
  y += 0.5;

  drawDivider();

  // Products Sold
  checkPageBreak(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('PRODUCTOS VENDIDOS', margin, y);
  y += 6.5;

  if (shift.productsSold.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Sin ventas de barra registradas.', margin, y);
    y += 6;
  } else {
    for (const item of shift.productsSold) {
      checkPageBreak(13);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      const nameLines = doc.splitTextToSize(item.name, contentWidth - 28);
      doc.text(nameLines, margin, y);
      doc.text(formatUsd(item.revenueUsd), pageWidth - margin, y, { align: 'right' });
      y += nameLines.length * 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(71, 85, 105);
      const detail =
        item.casesSold > 0
          ? `${item.casesSold} Cajas + ${item.looseUnitsSold} Bot. sueltas (${item.totalUnitsSold} unid.)`
          : `${item.totalUnitsSold} unidades`;
      doc.text(detail, margin, y);
      doc.setTextColor(15, 23, 42);
      y += 6;
    }
  }

  drawDivider();

  // Cortesias
  checkPageBreak(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(99, 102, 241); // Indigo
  doc.text('CORTESÍAS / CONSUMO INTERNO', margin, y);
  doc.setTextColor(15, 23, 42);
  y += 6.5;

  if (shift.courtesies.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Sin cortesías registradas.', margin, y);
    y += 6;
  } else {
    for (const cort of shift.courtesies) {
      checkPageBreak(18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`${formatTime(cort.timestamp)} · ${cort.recipient}`, margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      const reasonLines = doc.splitTextToSize(`Motivo: ${cort.reason}`, contentWidth);
      doc.text(reasonLines, margin, y);
      y += reasonLines.length * 4.8;
      const itemsText = cort.items
        .map((i) => `${i.quantity}x ${i.name}`)
        .join(', ');
      const itemLines = doc.splitTextToSize(`Entregado: ${itemsText}`, contentWidth);
      doc.setTextColor(71, 85, 105);
      doc.text(itemLines, margin, y);
      doc.setTextColor(15, 23, 42);
      y += itemLines.length * 4.8 + 2.5;
    }
  }

  drawDivider();

  // Mermas y Roturas (Perdida al Costo)
  const pdfShrinkages = shift.shrinkages || [];
  const pdfShrinkageLossUsd =
    shift.shrinkageLossUsd !== undefined
      ? shift.shrinkageLossUsd
      : pdfShrinkages.reduce((sum, s) => sum + s.totalLossCostUsd, 0);
  const pdfShrinkageUnits =
    shift.shrinkageUnitsTotal !== undefined
      ? shift.shrinkageUnitsTotal
      : pdfShrinkages.reduce((sum, s) => sum + s.quantityUnits, 0);

  checkPageBreak(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(234, 88, 12); // Orange-600
  doc.text('MERMAS Y ROTURAS (PÉRDIDA AL COSTO)', margin, y);
  doc.setTextColor(15, 23, 42);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Total perdido (${pdfShrinkageUnits} unid.):`, margin, y);
  doc.setTextColor(194, 65, 12);
  doc.text(formatUsd(pdfShrinkageLossUsd), pageWidth - margin, y, {
    align: 'right',
  });
  doc.setTextColor(15, 23, 42);
  y += 6;

  if (pdfShrinkages.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Sin mermas ni roturas registradas en este evento.', margin, y);
    y += 6;
  } else {
    for (const sh of pdfShrinkages) {
      checkPageBreak(18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      const lineTitle = `${formatTime(sh.timestamp)} · ${sh.quantityUnits}x ${sh.productName}`;
      doc.text(doc.splitTextToSize(lineTitle, contentWidth - 24), margin, y);
      doc.setTextColor(194, 65, 12);
      doc.text(`-${formatUsd(sh.totalLossCostUsd)}`, pageWidth - margin, y, {
        align: 'right',
      });
      doc.setTextColor(15, 23, 42);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const reasonLines = doc.splitTextToSize(
        `Motivo: ${sh.reason}${sh.observation ? ` — ${sh.observation}` : ''} (${sh.recordedByName})`,
        contentWidth
      );
      doc.setTextColor(71, 85, 105);
      doc.text(reasonLines, margin, y);
      doc.setTextColor(15, 23, 42);
      y += reasonLines.length * 4.6 + 2.5;
    }
  }

  drawDivider();

  // Auditoria de Ventas Suspendidas
  checkPageBreak(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(220, 38, 38); // Red
  doc.text('AUDITORÍA: VENTAS SUSPENDIDAS', margin, y);
  doc.setTextColor(15, 23, 42);
  y += 6.5;

  if (shift.suspendedSales.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Ninguna venta suspendida en este turno.', margin, y);
    y += 6;
  } else {
    for (const susp of shift.suspendedSales) {
      checkPageBreak(22);
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(239, 68, 68);
      const descText = susp.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
      const noteLines = doc.splitTextToSize(
        `Nota cajero: ${susp.suspendReason || 'Sin nota'}`,
        contentWidth - 6
      );
      const itemLines = doc.splitTextToSize(descText, contentWidth - 6);
      const boxH = 12 + (noteLines.length + itemLines.length) * 4.8;
      checkPageBreak(boxH + 3);

      doc.roundedRect(margin, y, contentWidth, boxH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(185, 28, 28);
      doc.text(
        `${formatTime(susp.suspendedAt || susp.timestamp)} · ${formatUsd(susp.totalUsd)} (${getPaymentLabel(susp.paymentMethod)})`,
        margin + 3,
        y + 5.5
      );
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(itemLines, margin + 3, y + 10.5);
      doc.text(noteLines, margin + 3, y + 10.5 + itemLines.length * 4.8);
      y += boxH + 4;
    }
  }

  drawDivider();

  // Remaining Inventory in Cave
  checkPageBreak(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('INVENTARIO RESTANTE EN CAVA', margin, y);
  y += 6.5;

  for (const stock of shift.remainingStock) {
    checkPageBreak(11);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(stock.name, margin, y);
    y += 4.8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(51, 65, 85);
    doc.text(
      formatStockReadable(stock.stockUnits, stock.unitType, stock.caseSize),
      margin,
      y
    );
    doc.setTextColor(15, 23, 42);
    y += 5.8;
  }

  const safeFileName = `Cierre_${shift.eventName.replace(/[^a-zA-Z0-9]/g, '_')}_${shift.eventDate}.pdf`;
  doc.save(safeFileName);
}

/**
 * Generates a clean printable/downloadable Physical Cave Stock Count PDF.
 */
export function downloadStockReportPdf(products: Product[]): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const margin = 14;
  let y = 18;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('EL CANEY TAQUENSE — REPORTE DE CONTEO FÍSICO EN CAVA', margin, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(
    `Los Taques, Venezuela · Emitido: ${new Date().toLocaleString('es-VE')}`,
    margin,
    21
  );

  y = 38;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PRODUCTO', margin, y);
  doc.text('STOCK EN SISTEMA', 110, y);
  doc.text('CONTEO FÍSICO', 172, y);
  y += 3;
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  for (const prod of products) {
    if (y > 272) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(prod.name, margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(
      formatStockReadable(prod.stockUnits, prod.unitType, prod.caseSize),
      110,
      y
    );

    doc.setDrawColor(203, 213, 225);
    doc.rect(172, y - 4.5, 24, 6.5);
    y += 9;
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y - 3.5, pageWidth - margin, y - 3.5);
  }

  doc.save(`Stock_Cava_ElCaney_${new Date().toISOString().slice(0, 10)}.pdf`);
}
