import { jsPDF } from "jspdf";

const BUDGET_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "actividades", label: "Actividades" },
  { value: "administracion", label: "Administración" },
  { value: "asignacion_presupuesto", label: "Asignación de Presupuesto" },
  { value: "curriculo", label: "Currículo" },
  { value: "centro_distribucion", label: "Centro de Distribución" },
  { value: "quorum_elderes", label: "Quórum Élderes" },
  { value: "historia_familiar", label: "Centro de Historia Familiar" },
  { value: "pfj", label: "PFJ" },
  { value: "biblioteca", label: "Biblioteca" },
  { value: "miscelaneo", label: "Misceláneo" },
  { value: "primaria", label: "Primaria" },
  { value: "sociedad_socorro", label: "Sociedad de Socorro" },
  { value: "adultos_solteros", label: "Adultos Solteros" },
  { value: "jovenes_adultos_solteros", label: "Jóvenes Adultos Solteros" },
  { value: "escuela_dominical", label: "Escuela Dominical" },
  { value: "hombres_jovenes", label: "Hombres Jóvenes" },
  { value: "mujeres_jovenes", label: "Mujeres Jóvenes" },
  { value: "obra_misional", label: "Obra Misional" },
  { value: "otros", label: "Otros" },
];

function parseBudgetNumber(value: string): number {
  const normalized = value.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface BudgetPdfData {
  description: string;
  requestType: string;
  activityDate: Date | null;
  budgetCategories: { category: string; amount: string; detail?: string }[];
  pagarA?: string | null;
  bankData?: { bankInSystem: boolean; swift?: string; iban?: string } | null;
  notes?: string | null;
  hasReceiptAttached?: boolean;
}

export async function generateBudgetRequestPdf(params: {
  data: BudgetPdfData;
  requesterName: string;
  organizationName: string;
  applicantSignatureDataUrl: string;
  bishopSignatureDataUrl: string;
  signerName: string;
}): Promise<Buffer> {
  const { data, requesterName, organizationName, applicantSignatureDataUrl, bishopSignatureDataUrl, signerName } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // Header bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SOLICITUD DE GASTOS", margin, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Barrio Madrid 8", margin, 21);

  const requestTypeLabel = data.requestType === "reembolso" ? "Reembolso" : "Pago por adelantado";
  doc.setFontSize(9);
  doc.text(requestTypeLabel, pageWidth - margin, 14, { align: "right" });
  doc.text(new Date().toLocaleDateString("es-ES"), pageWidth - margin, 21, { align: "right" });

  let y = 40;

  const drawSection = (title: string) => {
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 7, 1, 1, "F");
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title.toUpperCase(), margin + 3, y + 4.8);
    y += 10;
  };

  const drawField = (label: string, value: string, halfWidth = false, rightCol = false) => {
    const colWidth = halfWidth ? contentWidth / 2 - 2 : contentWidth;
    const colX = rightCol ? margin + contentWidth / 2 + 2 : margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, colX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(value || "—", colWidth - 2);
    doc.text(lines, colX, y + 5);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(colX, y + 7.5, colX + colWidth, y + 7.5);
    return lines.length * 5;
  };

  // Solicitante
  drawSection("Solicitante");
  drawField("Nombre", requesterName, true, false);
  drawField("Organización", organizationName, true, true);
  y += 15;
  drawField("Fecha de solicitud", new Date().toLocaleDateString("es-ES"), true, false);
  drawField(
    "Fecha prevista del gasto",
    data.activityDate ? data.activityDate.toLocaleDateString("es-ES") : "—",
    true,
    true,
  );
  y += 15;

  // Propósito del gasto
  drawSection("Propósito del gasto");
  const descLines = drawField("Propósito del gasto", data.description);
  y += Math.max(15, descLines * 5 + 8);

  drawField("Tipo de solicitud", requestTypeLabel, true, false);
  drawField(
    "Fecha prevista",
    data.activityDate ? data.activityDate.toLocaleDateString("es-ES") : "—",
    true,
    true,
  );
  y += 15;

  // Categorías
  drawSection("Categorías y montos");
  const categoryColW = contentWidth * 0.6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("CATEGORÍA", margin, y);
  doc.text("IMPORTE", margin + categoryColW + 2, y);
  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + contentWidth, y);
  y += 3;

  let total = 0;
  for (const cat of data.budgetCategories) {
    const catLabel = BUDGET_CATEGORY_OPTIONS.find((o) => o.value === cat.category)?.label ?? cat.category;
    const displayLabel =
      cat.category === "otros" && cat.detail?.trim() ? `Otros - ${cat.detail.trim()}` : catLabel;
    const amt = parseBudgetNumber(cat.amount);
    total += amt;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const catLines = doc.splitTextToSize(displayLabel, categoryColW - 2);
    doc.text(catLines, margin, y + 4);
    doc.text(`€ ${amt.toFixed(2)}`, margin + categoryColW + 2, y + 4);
    y += Math.max(7, catLines.length * 5);
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(margin, y, margin + contentWidth, y);
    y += 2;
  }

  // Total
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, 12, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL", margin + 4, y + 4.5);
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`€ ${total.toFixed(2)}`, margin + contentWidth - 4, y + 9, { align: "right" });
  y += 17;

  if (data.notes) {
    drawSection("Notas");
    const notesLines = drawField("Observaciones", data.notes);
    y += Math.max(15, notesLines * 5 + 8);
  }

  // ── Signatures section ──
  const sigSectionY = pageHeight - 72;
  y = Math.max(y + 4, sigSectionY);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Labels
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("FIRMA DEL SOLICITANTE", margin, y);
  doc.text("FIRMA DEL OBISPO", pageWidth / 2 + 4, y);
  y += 2;

  const sigImgH = 20;

  // Requester signature
  if (applicantSignatureDataUrl && applicantSignatureDataUrl.length > 100) {
    const imgFormat = applicantSignatureDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(applicantSignatureDataUrl, imgFormat, margin, y, 70, sigImgH);
  }

  // Bishop signature
  if (bishopSignatureDataUrl && bishopSignatureDataUrl.length > 100) {
    const imgFormat = bishopSignatureDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(bishopSignatureDataUrl, imgFormat, pageWidth / 2 + 4, y, 70, sigImgH);
  }

  // Signature underlines
  const sigLineY = y + sigImgH + 2;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(margin, sigLineY, margin + 80, sigLineY);
  doc.line(pageWidth / 2 + 4, sigLineY, pageWidth - margin, sigLineY);

  // Names below lines
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(requesterName, margin, sigLineY + 4);
  doc.text(`Obispo: ${signerName}`, pageWidth / 2 + 4, sigLineY + 4);

  const signatureDate = new Date().toLocaleDateString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "numeric",
  });
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(signatureDate, pageWidth / 2 + 4, sigLineY + 9);

  // ── ESP CITIBANK DTA ──
  const bankSectionY = sigLineY + 14;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, bankSectionY, pageWidth - margin, bankSectionY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("ESP CITIBANK DTA", margin, bankSectionY + 6);

  const bY = bankSectionY + 11;
  const bankInSystem = data.bankData?.bankInSystem ?? false;
  const titularVal = data.pagarA || "—";
  const swiftVal = bankInSystem ? "Registrado en sistema LCR/CUFS" : (data.bankData?.swift || "—");
  const ibanVal = bankInSystem ? "Registrado en sistema LCR/CUFS" : (data.bankData?.iban || "—");

  const bankFields: [string, string][] = [
    ["Titular de la cuenta", titularVal],
    ["Codigo bancario (SWIF o BIC)", swiftVal],
    ["No. cuenta (IBAN)", ibanVal],
  ];

  bankFields.forEach(([label, val], bi) => {
    const fieldY = bY + bi * 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(label, margin, fieldY);
    doc.setFont("helvetica", bankInSystem && bi > 0 ? "italic" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(
      bankInSystem && bi > 0 ? 37 : 15,
      bankInSystem && bi > 0 ? 99 : 23,
      bankInSystem && bi > 0 ? 235 : 42,
    );
    doc.text(val, margin, fieldY + 4.5);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, fieldY + 6, margin + contentWidth, fieldY + 6);
  });

  if (bankInSystem) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(37, 99, 235);
    doc.text("✓ Datos bancarios verificados en sistema LCR/CUFS de la Iglesia", margin, bY + 32);
  } else if (data.hasReceiptAttached) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(22, 163, 74);
    doc.text("✓ Justificante de titularidad adjunto a la solicitud", margin, bY + 32);
  }

  // Footer
  doc.setFillColor(248, 250, 252);
  doc.rect(0, pageHeight - 10, pageWidth, 10, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Documento generado automáticamente · Barrio Madrid 8 · ESP CITIBANK DTA",
    pageWidth / 2,
    pageHeight - 5,
    { align: "center" },
  );

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
