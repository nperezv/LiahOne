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
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186mm

  // ── Color palette ──
  const black: [number, number, number]    = [0, 0, 0];
  const gray555: [number, number, number]  = [85, 85, 85];
  const gray999: [number, number, number]  = [153, 153, 153];
  const grayCcc: [number, number, number]  = [204, 204, 204];
  const grayLabel: [number, number, number]= [100, 100, 100];
  const lightBg: [number, number, number]  = [250, 250, 250];
  const blue: [number, number, number]     = [37, 99, 235];
  const green: [number, number, number]    = [22, 163, 74];

  let y = margin;

  // ═══════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════

  const rightBoxW = 55;
  const rightBoxX = margin + contentWidth - rightBoxW;
  const headerH   = 20;   // mm — header block height (distance between the two black lines)
  const frinjaH   = 6;    // mm — gray "Propósito del gasto" strip
  // The right box extends below the header bottom line all the way to the
  // "Solicitante" section-title underline:
  //   headerH + 3 (y-advance after bottom line) + 5.5 (underline pos in drawSectionTitle) = 28.5
  const rightBoxH = 28.5;

  // ── STEP 1: draw the right box FIRST (so black lines can cover it) ──

  // Gray franja
  doc.setFillColor(...grayCcc);
  doc.rect(rightBoxX, y, rightBoxW, frinjaH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...black);
  doc.text("Propósito del gasto", rightBoxX + rightBoxW / 2, y + 4.2, { align: "center" });

  // White area for the rest of the box (below franja)
  doc.setFillColor(255, 255, 255);
  doc.rect(rightBoxX, y + frinjaH, rightBoxW, rightBoxH - frinjaH, "F");

  // Checkboxes — centered vertically in the white area (rightBoxH - frinjaH = 22.5mm)
  const chkBoxSize   = 3.5;
  const chkTextX     = rightBoxX + 4;
  const chkBoxXR     = rightBoxX + rightBoxW - 8;
  const chkBlockH    = 11;  // total height of the two-checkbox block (2×3.5 + gap)
  const chkAreaH     = rightBoxH - frinjaH; // 22.5mm
  const chkStartY    = y + frinjaH + (chkAreaH - chkBlockH) / 2;
  const chkY1        = chkStartY;
  const chkY2        = chkY1 + 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...black);

  doc.text("Reembolso", chkTextX, chkY1 + 2.8);
  doc.setDrawColor(...gray555);
  doc.setLineWidth(0.3);
  doc.rect(chkBoxXR, chkY1, chkBoxSize, chkBoxSize);
  if (data.requestType === "reembolso") {
    doc.setFillColor(...gray555);
    doc.rect(chkBoxXR, chkY1, chkBoxSize, chkBoxSize, "F");
  }

  doc.text("Por adelantado", chkTextX, chkY2 + 2.8);
  doc.rect(chkBoxXR, chkY2, chkBoxSize, chkBoxSize);
  if (data.requestType !== "reembolso") {
    doc.setFillColor(...gray555);
    doc.rect(chkBoxXR, chkY2, chkBoxSize, chkBoxSize, "F");
  }

  // Box outer border (gray, full extended height)
  doc.setDrawColor(...gray999);
  doc.setLineWidth(0.2);
  doc.rect(rightBoxX, y, rightBoxW, rightBoxH);

  // ── STEP 2: draw top black 2pt line ON TOP of the box ──
  doc.setDrawColor(...black);
  doc.setLineWidth(0.7);
  doc.line(margin, y, margin + contentWidth, y);

  // ── STEP 3: left text (ward name + title) ──
  doc.setTextColor(...black);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(wardName || "Barrio", margin, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("SOLICITUD DE", margin, y + 13);
  doc.text("GASTOS", margin, y + 20);

  // No bottom header line — the Solicitante section-title underline
  // (drawn by drawSectionTitle) provides the visual separation.
  y += headerH + 3;

  // ── Helpers ──────────────────────────────────────

  const thinLine = (x1 = margin, x2 = margin + contentWidth) => {
    doc.setDrawColor(...gray999);
    doc.setLineWidth(0.18);
    doc.line(x1, y, x2, y);
  };

  const drawSectionTitle = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...black);
    doc.text(title, margin, y + 3.5);
    doc.setDrawColor(...black);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 5, margin + contentWidth, y + 5);
    y += 7;
  };

  // ═══════════════════════════════════════════════
  // SOLICITANTE
  // ═══════════════════════════════════════════════
  drawSectionTitle("Solicitante");

  const dateColW = 42;
  const dateColX = margin + contentWidth - dateColW;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...grayLabel);
  doc.text("Nombre", margin, y + 3);
  doc.text("Fecha", dateColX, y + 3);

  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text(requesterName, margin, y + 7.5);
  doc.text(new Date().toLocaleDateString("es-ES"), dateColX, y + 7.5);

  y += 10;
  thinLine();
  y += 2;

  // ═══════════════════════════════════════════════
  // PAGAR A
  // ═══════════════════════════════════════════════
  drawSectionTitle("PAGAR A");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...grayLabel);
  doc.text("Nombre", margin, y + 3);
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text(data.pagarA || "", margin, y + 7.5);
  y += 10;
  thinLine();
  y += 1;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...grayLabel);
  doc.text("Dirección", margin, y + 3);
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text(data.direccion || "", margin, y + 7.5);
  y += 10;
  thinLine();
  y += 4; // gap before PROPÓSITO

  // ═══════════════════════════════════════════════
  // PROPÓSITO DEL GASTO
  // ═══════════════════════════════════════════════
  drawSectionTitle("PROPÓSITO DEL GASTO");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...black);
  doc.text("Razón", margin, y + 3.5);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...black);
  const reasonLines = doc.splitTextToSize(data.description || "", contentWidth - 2);
  doc.text(reasonLines, margin, y + 4);
  y += Math.max(6, reasonLines.length * 4) + 2;
  thinLine();
  y += 2; // ~6pt gap before categories

  // ═══════════════════════════════════════════════
  // CATEGORY TABLE — minimum 3 rows
  // ═══════════════════════════════════════════════
  const catColW  = contentWidth * 0.72;
  const amtColX  = margin + catColW;
  const catRowH  = 10; // mm per row

  let total = 0;
  const realCats = data.budgetCategories;
  const totalRows = Math.max(realCats.length, 3);

  for (let i = 0; i < totalRows; i++) {
    const cat = realCats[i];

    // Column labels
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...grayLabel);
    doc.text("Categoría", margin, y + 3);
    doc.text("Cantidad", amtColX, y + 3);

    // Values (only for real rows)
    if (cat) {
      const catLabel = BUDGET_CATEGORY_OPTIONS.find((o) => o.value === cat.category)?.label ?? cat.category;
      const displayLabel = cat.category === "otros" && cat.detail?.trim()
        ? `Otros - ${cat.detail.trim()}`
        : catLabel;
      const amt = parseBudgetNumber(cat.amount);
      total += amt;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...black);
      const catLines = doc.splitTextToSize(displayLabel, catColW - 4);
      doc.text(catLines, margin, y + 7.5);
      doc.text(`€ ${amt.toFixed(2)}`, amtColX, y + 7.5);
    }

    // Vertical separator cat / amount
    doc.setDrawColor(...gray999);
    doc.setLineWidth(0.18);
    doc.line(amtColX - 1, y, amtColX - 1, y + catRowH);
    // Bottom border
    doc.line(margin, y + catRowH, margin + contentWidth, y + catRowH);
    y += catRowH;
  }

  // ── Options grid + Total ──
  const gridRows = Math.ceil(BUDGET_CATEGORY_OPTIONS.length / 4);
  const gridH    = gridRows * 3.4 + 8; // mm
  const optLblW  = catColW / 4;
  const gridStartY = y;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...grayLabel);
  doc.text("Opciones de la categoría", margin, gridStartY + 4);

  const allLabels = BUDGET_CATEGORY_OPTIONS.map((o) => o.label);
  doc.setFontSize(6);
  doc.setTextColor(60, 60, 60);
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      if (idx < allLabels.length) {
        doc.text(allLabels[idx], margin + c * optLblW, gridStartY + 8 + r * 3.4);
      }
    }
  }

  // Total (right column)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...black);
  doc.text("Total", amtColX, gridStartY + gridH / 2 - 1);
  doc.setFontSize(9);
  doc.text(`€ ${total.toFixed(2)}`, amtColX, gridStartY + gridH / 2 + 4);

  // Bottom + vertical border of options/total row
  doc.setDrawColor(...gray999);
  doc.setLineWidth(0.18);
  doc.line(amtColX - 1, gridStartY, amtColX - 1, gridStartY + gridH);
  doc.line(margin, gridStartY + gridH, margin + contentWidth, gridStartY + gridH);
  y = gridStartY + gridH + 2;

  // ═══════════════════════════════════════════════
  // NOTA LEGAL (abreviada a ~4 líneas)
  // ═══════════════════════════════════════════════
  const legalText =
    "Un formulario de gastos similar a este debe utilizarse para cada gasto, incluso un lugar para la firma del líder de la organización, " +
    "el nombre de la persona a quien se pagará el dinero, una descripción del gasto, la categoría del presupuesto o la organización que ha incurrido en el gasto, " +
    "el monto del gasto, el monto del impuesto sobre las ventas (si corresponde), y toda otra información necesaria. " +
    "Si es posible, deben adjuntarse documentos —preferiblemente originales— que justifiquen el gasto como por ejemplo recibos de compra o facturas.";
  // fontSize 6 + full width → fits in ~4 lines
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  const legalLines = doc.splitTextToSize(legalText, contentWidth - 4);
  const legalPad = 2;
  const legalH = legalLines.length * 3.2 + legalPad * 2;
  doc.setFillColor(...lightBg);
  doc.setDrawColor(...gray999);
  doc.setLineWidth(0.18);
  doc.rect(margin, y, contentWidth, legalH, "FD");
  doc.setTextColor(60, 60, 60);
  doc.text(legalLines, margin + 2, y + legalPad + 2.5);
  y += legalH + 2;

  // ═══════════════════════════════════════════════
  // PARA USO EXCLUSIVO DEL SECRETARIO
  // ═══════════════════════════════════════════════
  drawSectionTitle("Para uso exclusivo del secretario");

  // 2 equal columns, no vertical border between them
  const sigGap      = 6;  // mm gap between columns
  const sigColWidth = (contentWidth - sigGap) / 2;
  const col1X       = margin;
  const col2X       = margin + sigColWidth + sigGap;
  const sigImgH     = 15; // mm signature image height
  const sigImgW     = sigColWidth - 2;

  const drawSigCol = (colX: number, label: string, sigDataUrl: string, name: string, date: string) => {
    // CAPS bold label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...black);
    doc.text(label, colX, y + 4);

    const imgY = y + 6;

    // Signature image
    if (sigDataUrl && sigDataUrl.length > 100) {
      const fmt = sigDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(sigDataUrl, fmt, colX, imgY, sigImgW, sigImgH);
    }

    // Line under image
    doc.setDrawColor(...gray999);
    doc.setLineWidth(0.18);
    doc.line(colX, imgY + sigImgH + 1, colX + sigColWidth, imgY + sigImgH + 1);

    // Name
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...black);
    doc.text(name, colX, imgY + sigImgH + 4);

    // Date
    doc.text(date, colX, imgY + sigImgH + 8.5);
  };

  const todayStr = new Date().toLocaleDateString("es-ES");
  drawSigCol(col1X, "FIRMA DEL SOLICITANTE", applicantSignatureDataUrl, requesterName, todayStr);
  drawSigCol(col2X, "FIRMA DEL OBISPO", bishopSignatureDataUrl, `Obispo: ${signerName}`, todayStr);

  // Advance y past signature block: label(5) + image(15) + line(1) + name(4) + date(4.5) + margin
  y += 5 + sigImgH + 10;

  // ═══════════════════════════════════════════════
  // TEXTO DE SEGURIDAD + LÍNEA PUNTEADA (texto primero, línea debajo)
  // ═══════════════════════════════════════════════
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
  y += 7;

  doc.setDrawColor(...gray999);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.line(margin, y, margin + contentWidth, y);
  doc.setLineDashPattern([], 0);
  y += 5;

  // ═══════════════════════════════════════════════
  // ESP CITIBANK DTA
  // ═══════════════════════════════════════════════
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
  const ibanVal  = bankInSystem ? "Registrado en sistema LCR/CUFS" : (data.bankData?.iban  || "—");

  const bankFields: [string, string][] = [
    ["Titular de la cuenta",          titularVal],
    ["Codigo bancario (SWIF o BIC)",  swiftVal],
    ["No. cuenta (IBAN)",             ibanVal],
  ];

  for (const [label, val] of bankFields) {
    const isSystem = bankInSystem && label !== "Titular de la cuenta";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...grayLabel);
    doc.text(label, margin, y + 3);

    doc.setFont("helvetica", isSystem ? "italic" : "normal");
    doc.setFontSize(8);
    doc.setTextColor(
      isSystem ? blue[0]  : black[0],
      isSystem ? blue[1]  : black[1],
      isSystem ? blue[2]  : black[2],
    );
    doc.text(val, margin, y + 7.5);

    doc.setDrawColor(...gray999);
    doc.setLineWidth(0.18);
    doc.line(margin, y + 9.5, margin + contentWidth * 0.55, y + 9.5);
    y += 11;
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
