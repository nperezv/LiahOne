import { jsPDF } from "jspdf";

const BUDGET_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "actividades",              label: "Actividades" },
  { value: "administracion",           label: "Administración" },
  { value: "asignacion_presupuesto",   label: "Asignación de Presupuesto" },
  { value: "curriculo",                label: "Currículo" },
  { value: "centro_distribucion",      label: "Centro de Distribución" },
  { value: "quorum_elderes",           label: "Quórum Élderes" },
  { value: "historia_familiar",        label: "Centro de Historia Familiar" },
  { value: "pfj",                      label: "PFJ" },
  { value: "biblioteca",               label: "Biblioteca" },
  { value: "miscelaneo",               label: "Misceláneo" },
  { value: "primaria",                 label: "Primaria" },
  { value: "sociedad_socorro",         label: "Sociedad de Socorro" },
  { value: "adultos_solteros",         label: "Adultos Solteros" },
  { value: "jovenes_adultos_solteros", label: "Jóvenes Adultos Solteros" },
  { value: "escuela_dominical",        label: "Escuela Dominical" },
  { value: "hombres_jovenes",          label: "Hombres Jóvenes" },
  { value: "mujeres_jovenes",          label: "Mujeres Jóvenes" },
  { value: "obra_misional",            label: "Obra Misional" },
  { value: "otros",                    label: "Otros" },
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
  direccion?: string | null;
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
  wardName?: string | null;
}): Promise<Buffer> {
  const { data, requesterName, applicantSignatureDataUrl, bishopSignatureDataUrl, signerName, wardName } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const black: [number, number, number] = [0, 0, 0];
  const darkGray: [number, number, number] = [80, 80, 80];
  const midGray: [number, number, number] = [100, 100, 100];
  const lightGray: [number, number, number] = [245, 245, 245];
  const blue: [number, number, number] = [37, 99, 235];
  const green: [number, number, number] = [22, 163, 74];

  let y = margin;

  // ── TOP BORDER ──
  doc.setDrawColor(...black);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + contentWidth, y);
  y += 3;

  // ── HEADER: left = ward + title, right = checkbox box ──
  const headerBoxX = margin + contentWidth - 52;
  const headerBoxW = 52;
  const headerBoxH = 28;

  // Right box: gray header
  doc.setFillColor(120, 120, 120);
  doc.rect(headerBoxX, y, headerBoxW, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("Propósito del gasto", headerBoxX + headerBoxW / 2, y + 4.2, { align: "center" });

  // Right box: checkboxes
  doc.setTextColor(...black);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const chkY1 = y + 10;
  const chkY2 = y + 17;
  const chkX = headerBoxX + 4;
  const boxSize = 3.5;

  doc.text("Reembolso", chkX + boxSize + 2, chkY1 + 2.8);
  doc.setDrawColor(...darkGray);
  doc.setLineWidth(0.3);
  doc.rect(headerBoxX + headerBoxW - 8, chkY1, boxSize, boxSize);
  if (data.requestType === "reembolso") {
    doc.setFillColor(...darkGray);
    doc.rect(headerBoxX + headerBoxW - 8, chkY1, boxSize, boxSize, "F");
  }

  doc.text("Por adelantado", chkX + boxSize + 2, chkY2 + 2.8);
  doc.rect(headerBoxX + headerBoxW - 8, chkY2, boxSize, boxSize);
  if (data.requestType !== "reembolso") {
    doc.setFillColor(...darkGray);
    doc.rect(headerBoxX + headerBoxW - 8, chkY2, boxSize, boxSize, "F");
  }

  // Right box: outer border
  doc.setDrawColor(...darkGray);
  doc.setLineWidth(0.3);
  doc.rect(headerBoxX, y, headerBoxW, headerBoxH);

  // Left: ward name + title
  doc.setTextColor(...black);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(wardName || "Barrio", margin, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("SOLICITUD DE", margin, y + 13);
  doc.text("GASTOS", margin, y + 21);

  y += headerBoxH + 4;

  // ── SECTION HELPERS ──
  const drawSectionTitle = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...black);
    doc.text(title, margin, y + 4);
    doc.setDrawColor(...black);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 5.5, margin + contentWidth, y + 5.5);
    y += 8;
  };

  const drawFieldRow = (label: string, value: string, colX: number, colW: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...midGray);
    doc.text(label, colX, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...black);
    const lines = doc.splitTextToSize(value || "", colW - 2);
    doc.text(lines, colX, y + 8);
    const rowH = Math.max(14, lines.length * 4.5 + 6);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.line(colX, y + rowH, colX + colW, y + rowH);
    return rowH;
  };

  // ── SOLICITANTE ──
  drawSectionTitle("Solicitante");
  const solH = drawFieldRow("Nombre", requesterName, margin, contentWidth - 44);
  drawFieldRow("Fecha", new Date().toLocaleDateString("es-ES"), margin + contentWidth - 42, 42);
  y += solH + 3;

  // ── PAGAR A ──
  drawSectionTitle("PAGAR A");
  const pagarH = drawFieldRow("Nombre", data.pagarA || "", margin, contentWidth);
  y += pagarH + 2;
  const dirH = drawFieldRow("Dirección", data.direccion || "", margin, contentWidth);
  y += dirH + 5;

  // ── PROPÓSITO DEL GASTO ──
  drawSectionTitle("PROPÓSITO DEL GASTO");

  // "Razón" label + value
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...black);
  doc.text("Razón", margin, y + 4);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const reasonLines = doc.splitTextToSize(data.description || "", contentWidth - 2);
  doc.text(reasonLines, margin, y + 4);
  y += Math.max(8, reasonLines.length * 4.5) + 2;

  // Category rows
  const catColW = contentWidth * 0.72;
  const amtColW = contentWidth - catColW;
  const amtColX = margin + catColW;

  let total = 0;
  for (const cat of data.budgetCategories) {
    const catLabel = BUDGET_CATEGORY_OPTIONS.find((o) => o.value === cat.category)?.label ?? cat.category;
    const displayLabel = cat.category === "otros" && cat.detail?.trim()
      ? `Otros - ${cat.detail.trim()}`
      : catLabel;
    const amt = parseBudgetNumber(cat.amount);
    total += amt;

    // row border
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...midGray);
    doc.text("Categoría", margin, y + 3);
    doc.text("Cantidad", amtColX, y + 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...black);
    const catLines = doc.splitTextToSize(displayLabel, catColW - 4);
    doc.text(catLines, margin, y + 8);
    doc.text(`€ ${amt.toFixed(2)}`, amtColX, y + 8);

    const rowH = Math.max(14, catLines.length * 4.5 + 6);
    // vertical separator between cat and amount
    doc.line(amtColX - 1, y, amtColX - 1, y + rowH);
    // bottom border
    doc.line(margin, y + rowH, margin + contentWidth, y + rowH);
    y += rowH;
  }

  // Category options grid + Total
  const optColX = margin;
  const optColW = contentWidth * 0.72;
  const totalColX = margin + optColW + 2;
  const gridStartY = y;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...midGray);
  doc.text("Opciones de la categoría", optColX, gridStartY + 4);

  // 4-column label grid
  const cols = 4;
  const colW = optColW / cols;
  const labels = BUDGET_CATEGORY_OPTIONS.map((o) => o.label);
  const rows = Math.ceil(labels.length / cols);
  doc.setFontSize(6);
  doc.setTextColor(60, 60, 60);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < labels.length) {
        doc.text(labels[idx], optColX + c * colW, gridStartY + 8 + r * 4);
      }
    }
  }

  // Total box on the right
  const gridH = Math.max(rows * 4 + 10, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text("Total", totalColX, gridStartY + gridH / 2 - 2);
  doc.setFontSize(9);
  doc.text(`€ ${total.toFixed(2)}`, totalColX, gridStartY + gridH / 2 + 4);

  // borders for the options/total row
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(totalColX - 1, gridStartY, totalColX - 1, gridStartY + gridH);
  doc.line(margin, gridStartY + gridH, margin + contentWidth, gridStartY + gridH);
  y = gridStartY + gridH + 4;

  // ── NOTA LEGAL ──
  const legalText =
    "Un formulario de gastos similar a este debe utilizarse para cada gasto, incluso un lugar para la firma del líder de la organización, " +
    "el nombre de la persona a quien se pagará el dinero, una descripción del gasto, la categoría del presupuesto o la organización que ha incurrido en el gasto, " +
    "el monto del gasto, el monto del impuesto sobre las ventas (si corresponde), y toda otra información necesaria. " +
    "Si es posible, deben adjuntarse documentos —preferiblemente originales— que justifiquen el gasto como por ejemplo recibos de compra o facturas.";
  const legalLines = doc.splitTextToSize(legalText, contentWidth - 6);
  const legalH = legalLines.length * 3.8 + 6;
  doc.setFillColor(...lightGray);
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.rect(margin, y, contentWidth, legalH, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text(legalLines, margin + 3, y + 4.5);
  y += legalH + 5;

  // ── PARA USO EXCLUSIVO DEL SECRETARIO ──
  drawSectionTitle("Para uso exclusivo del secretario");

  const sigColW = contentWidth - 42;
  const dateColW = 42;
  const sigImgH = 18;
  const sigRowH = sigImgH + 10;

  // Row 1: Firma del solicitante
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...midGray);
  doc.text("Firma del Solicitante", margin, y + 3);
  doc.text("Fecha", margin + sigColW + 2, y + 3);
  y += 5;

  if (applicantSignatureDataUrl && applicantSignatureDataUrl.length > 100) {
    const fmt = applicantSignatureDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(applicantSignatureDataUrl, fmt, margin, y, 60, sigImgH);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text(new Date().toLocaleDateString("es-ES"), margin + sigColW + 2, y + sigImgH - 2);

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(margin + sigColW, y, margin + sigColW, y + sigRowH);
  doc.line(margin, y + sigRowH, margin + contentWidth, y + sigRowH);
  y += sigRowH + 2;

  // Row 2: Firma del obispo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...midGray);
  doc.text("Firma del El obispo (Opcional)", margin, y + 3);
  doc.text("Fecha", margin + sigColW + 2, y + 3);
  y += 5;

  if (bishopSignatureDataUrl && bishopSignatureDataUrl.length > 100) {
    const fmt = bishopSignatureDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    doc.addImage(bishopSignatureDataUrl, fmt, margin, y, 60, sigImgH);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...black);
  doc.text(new Date().toLocaleDateString("es-ES"), margin + sigColW + 2, y + sigImgH - 2);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...midGray);
  doc.text(`Obispo: ${signerName}`, margin + sigColW + 2, y + sigImgH + 3);

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(margin + sigColW, y, margin + sigColW, y + sigRowH + 4);
  doc.line(margin, y + sigRowH + 4, margin + contentWidth, y + sigRowH + 4);
  y += sigRowH + 10;

  // ── LÍNEA PUNTEADA ──
  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.line(margin, y, margin + contentWidth, y);
  doc.setLineDashPattern([], 0);
  y += 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    "Por motivos de seguridad no lo envíe de manera electrónica cuando se concluya la información EFT. Corte sobre la línea punteada y destrúyalo después de utilizarlo.",
    pageWidth / 2,
    y + 3,
    { align: "center", maxWidth: contentWidth },
  );
  y += 10;

  // ── ESP CITIBANK DTA ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...black);
  doc.text("ESP CITIBANK DTA", margin, y + 5);
  doc.setDrawColor(...black);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 6.5, margin + contentWidth * 0.55, y + 6.5);
  y += 10;

  const bankInSystem = data.bankData?.bankInSystem ?? false;
  const titularVal = data.pagarA || "—";
  const swiftVal = bankInSystem ? "Registrado en sistema LCR/CUFS" : (data.bankData?.swift || "—");
  const ibanVal = bankInSystem ? "Registrado en sistema LCR/CUFS" : (data.bankData?.iban || "—");

  const bankFields: [string, string][] = [
    ["Titular de la cuenta", titularVal],
    ["Codigo bancario (SWIF o BIC)", swiftVal],
    ["No. cuenta (IBAN)", ibanVal],
  ];

  for (const [label, val] of bankFields) {
    const isSystem = bankInSystem && label !== "Titular de la cuenta";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...midGray);
    doc.text(label, margin, y + 3);
    doc.setFont("helvetica", isSystem ? "italic" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(isSystem ? blue[0] : black[0], isSystem ? blue[1] : black[1], isSystem ? blue[2] : black[2]);
    doc.text(val, margin, y + 8);
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 10, margin + contentWidth * 0.55, y + 10);
    y += 13;
  }

  if (bankInSystem) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...blue);
    doc.text("✓ Datos bancarios verificados en sistema LCR/CUFS de la Iglesia", margin, y);
  } else if (data.hasReceiptAttached) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...green);
    doc.text("✓ Justificante de titularidad adjunto a la solicitud", margin, y);
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
