import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiRequest } from "./queryClient";

interface PdfTemplate {
  wardName: string;
  stakeName?: string;
  country?: string;
  headerColor: string; // hex without #
  accentColor: string; // hex without #
  logoUrl?: string;
  footerText: string;
}

async function getTemplate(): Promise<PdfTemplate> {
  try {
    const response = await apiRequest("GET", "/api/pdf-template");
    return response;
  } catch {
    return {
      wardName: "Barrio",
      stakeName: "Estaca",
      country: "País",
      headerColor: "1F2937",
      accentColor: "3B82F6",
      logoUrl: undefined,
      footerText: "© Barrio - Todos los derechos reservados",
    };
  }
}

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

function getDayOfWeek(date: Date): string {
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return days[date.getDay()];
}

function getMonthName(date: Date): string {
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  return months[date.getMonth()];
}

function formatMeetingDate(date: Date): string {
  const dayOfWeek = getDayOfWeek(date);
  const day = date.getDate();
  const month = getMonthName(date);
  const year = date.getFullYear();
  return `${dayOfWeek} ${day} de ${month} de ${year}`;
}

/**
 * Header + Footer (aplicado a todas las páginas al final)
 */
function addHeaderFooterAllPages(doc: jsPDF, template: PdfTemplate, title: string) {
  const pageCount = doc.getNumberOfPages();
  const headerColor = hexToRGB(`#${template.headerColor}`);
  const wardName = template.wardName ?? "Barrio";
  const stakeName = template.stakeName ?? "Estaca";
  const country = template.country ?? "País";
  const footerText = template.footerText ?? "";

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Header background
    doc.setFillColor(headerColor.r, headerColor.g, headerColor.b);
    doc.rect(0, 0, 210, 28, "F");

    // Header text
    doc.setTextColor(255, 255, 255);

    // wardName: 14 bold
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(wardName, 15, 11);

    // stake + country: 10 normal
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`${stakeName} - ${country}`, 15, 18);

    // fecha/título pequeño: 9
    doc.setFontSize(9);
    doc.text(title, 15, 25);

    // Footer
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const leftFooter = `${stakeName} - ${country}`;
    doc.text(leftFooter, 15, 292);

    doc.text(`Página ${i} de ${pageCount}`, 105, 292, { align: "center" });

    doc.text(footerText, 195, 292, { align: "right" });

    // Reset color for body
    doc.setTextColor(0, 0, 0);
  }
}

type PdfCtx = {
  doc: jsPDF;
  template: PdfTemplate;
  y: number;
  marginX: number;
  pageWidth: number;
  pageHeight: number;
  bodyFont: number;
  lineHeight: number;
  accent: { r: number; g: number; b: number };
};

function ensureSpace(ctx: PdfCtx, neededHeight: number) {
  const bottomLimit = ctx.pageHeight - 22;
  if (ctx.y + neededHeight > bottomLimit) {
    ctx.doc.addPage();
    ctx.y = 40;
  }
}

function setBodyFont(
  ctx: PdfCtx,
  size = 11,
  style: "normal" | "bold" | "italic" | "bolditalic" = "normal"
) {
  ctx.doc.setFontSize(size);
  if (style === "bolditalic") ctx.doc.setFont("helvetica", "bolditalic");
  else ctx.doc.setFont("helvetica", style);
}

function wrapLines(ctx: PdfCtx, text: string, maxWidth: number): string[] {
  return ctx.doc.splitTextToSize(text, maxWidth);
}

function drawAccentRule(ctx: PdfCtx) {
  ensureSpace(ctx, 8);
  ctx.doc.setDrawColor(ctx.accent.r, ctx.accent.g, ctx.accent.b);
  ctx.doc.setLineWidth(0.8);
  ctx.doc.line(ctx.marginX, ctx.y, ctx.pageWidth - ctx.marginX, ctx.y);
  ctx.y += 10;
}

function drawSectionHeader(ctx: PdfCtx, title: string) {
  ensureSpace(ctx, 14);
  setBodyFont(ctx, 12, "bold");
  ctx.doc.setTextColor(0, 0, 0);

  const upper = title.toUpperCase();
  const x = ctx.marginX;
  const y = ctx.y;

  ctx.doc.text(upper, x, y);

  const textW = ctx.doc.getTextWidth(upper);
  const lineStartX = x + textW + 5;
  const lineEndX = ctx.pageWidth - ctx.marginX;

  ctx.doc.setDrawColor(0, 0, 0);
  ctx.doc.setLineWidth(0.3);
  ctx.doc.line(lineStartX, y + 0.8, lineEndX, y + 0.8);

  ctx.y += 10;
}

function drawKeyValueTwoColumns(ctx: PdfCtx, itemsLeft: Array<[string, string]>, itemsRight: Array<[string, string]>) {
  const colLeftX = ctx.marginX;
  const hasRightItems = itemsRight.some(([, value]) => Boolean(value));
  const colRightX = hasRightItems ? 110 : ctx.pageWidth - ctx.marginX;
  const colGap = 6;

  const maxLeftW = (colRightX - colGap) - colLeftX;
  const maxRightW = (ctx.pageWidth - ctx.marginX) - colRightX;

  const startY = ctx.y;
  let leftY = startY;
  let rightY = startY;

  setBodyFont(ctx, 11, "normal");

  const normalizeCallingLabel = (value: string) => value;
  const splitEntries = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const drawOne = (x: number, y: number, label: string, value: string, maxW: number) => {
    if (!value) return y;

    setBodyFont(ctx, 11, "bold");
    ctx.doc.text(`${label}:`, x, y);

    const labelW = ctx.doc.getTextWidth(`${label}:`);
    const isRecognition = label === "Reconocimiento";
    const valueX = isRecognition ? x : x + labelW + 4;

    const entries = splitEntries(value);
    const availableW = Math.max(10, maxW - (valueX - x));

    let currentY = isRecognition ? y + ctx.lineHeight : y;
    const stackCalling = label === "Preside" || label === "Dirige";

    entries.forEach((entry, index) => {
      const [namePart, callingPartRaw] = entry.split("|").map((part) => part.trim());
      const callingPart = callingPartRaw ? normalizeCallingLabel(callingPartRaw) : "";
      const nameText = namePart || entry;

      setBodyFont(ctx, 11, "normal");
      const lines = wrapLines(ctx, nameText, availableW);
      if (lines.length === 0) {
        currentY += ctx.lineHeight;
        return;
      }

      lines.forEach((line, lineIndex) => {
        ctx.doc.text(line, valueX, currentY);
        if (lineIndex < lines.length - 1) {
          currentY += ctx.lineHeight;
        }
      });

      if (callingPart) {
        const lastLine = lines[lines.length - 1] || "";
        setBodyFont(ctx, 11, "normal");
        const lastLineW = ctx.doc.getTextWidth(lastLine);
        const callingText = ` ${callingPart}`;
        setBodyFont(ctx, 9, "italic");
        ctx.doc.setTextColor(80, 80, 80);
        if (stackCalling) {
          currentY += ctx.lineHeight;
          ctx.doc.text(callingText.trim(), valueX, currentY);
        } else {
          const callingW = ctx.doc.getTextWidth(callingText);
          const inlineX = valueX + lastLineW + 2;
          const fitsInline = inlineX + callingW <= x + maxW;

          if (fitsInline) {
            ctx.doc.text(callingText, inlineX, currentY);
          } else {
            currentY += ctx.lineHeight;
            ctx.doc.text(callingText.trim(), valueX, currentY);
          }
        }

        ctx.doc.setTextColor(0, 0, 0);
        setBodyFont(ctx, 11, "normal");
      }

      currentY += ctx.lineHeight;
      if (index < entries.length - 1) {
        currentY += 1;
      }
    });

    return currentY;
  };

  const measureOne = (x: number, y: number, label: string, value: string, maxW: number) => {
    if (!value) return y;

    setBodyFont(ctx, 11, "bold");
    const labelW = ctx.doc.getTextWidth(`${label}:`);
    const isRecognition = label === "Reconocimiento";
    const valueX = isRecognition ? x : x + labelW + 4;

    const entries = splitEntries(value);
    const availableW = Math.max(10, maxW - (valueX - x));

    let currentY = isRecognition ? y + ctx.lineHeight : y;
    const stackCalling = label === "Preside" || label === "Dirige";

    entries.forEach((entry, index) => {
      const [namePart, callingPartRaw] = entry.split("|").map((part) => part.trim());
      const callingPart = callingPartRaw ? normalizeCallingLabel(callingPartRaw) : "";
      const nameText = namePart || entry;

      setBodyFont(ctx, 11, "normal");
      const lines = wrapLines(ctx, nameText, availableW);
      if (lines.length === 0) {
        currentY += ctx.lineHeight;
        return;
      }

      currentY += ctx.lineHeight * (lines.length - 1);

      if (callingPart) {
        setBodyFont(ctx, 11, "normal");
        const lastLine = lines[lines.length - 1] || "";
        const lastLineW = ctx.doc.getTextWidth(lastLine);
        const callingText = ` ${callingPart}`;
        setBodyFont(ctx, 9, "italic");
        const callingW = ctx.doc.getTextWidth(callingText);
        const inlineX = valueX + lastLineW + 2;
        const fitsInline = !stackCalling && inlineX + callingW <= x + maxW;

        if (!fitsInline) {
          currentY += ctx.lineHeight;
        }
        setBodyFont(ctx, 11, "normal");
      }

      currentY += ctx.lineHeight;
      if (index < entries.length - 1) {
        currentY += 1;
      }
    });

    return currentY;
  };

  let rightEndY = startY;
  if (hasRightItems) {
    itemsRight.forEach(([k, v]) => {
      rightEndY = measureOne(colRightX, rightEndY, k, v, maxRightW);
    });
  }

  itemsLeft.forEach(([k, v]) => {
    const canExpand = hasRightItems && leftY >= rightEndY;
    const expandedLeftW = ctx.pageWidth - ctx.marginX - colLeftX;
    leftY = drawOne(colLeftX, leftY, k, v, canExpand ? expandedLeftW : maxLeftW);
  });

  itemsRight.forEach(([k, v]) => {
    rightY = drawOne(colRightX, rightY, k, v, maxRightW);
  });

  ctx.y = Math.max(leftY, rightY) + 6;
}

function drawParagraph(
  ctx: PdfCtx,
  text: string,
  opts?: { size?: number; style?: "normal" | "bold" | "italic"; indent?: number }
) {
  const size = opts?.size ?? 11;
  const style = opts?.style ?? "normal";
  const indent = opts?.indent ?? 0;

  setBodyFont(ctx, size, style);
  const maxW = ctx.pageWidth - 2 * ctx.marginX - indent;
  const lines = wrapLines(ctx, text, maxW);

  for (const line of lines) {
    ensureSpace(ctx, ctx.lineHeight + 2);
    ctx.doc.text(line, ctx.marginX + indent, ctx.y);
    ctx.y += ctx.lineHeight;
  }

  ctx.y += 2;
}

function drawLabelLine(ctx: PdfCtx, label: string, value: string, opts?: { italicValue?: boolean }) {
  if (!value) return;
  ensureSpace(ctx, ctx.lineHeight + 4);

  setBodyFont(ctx, 11, "bold");
  const labelText = `${label}:`;
  ctx.doc.text(labelText, ctx.marginX, ctx.y);

  const labelW = ctx.doc.getTextWidth(labelText);

  setBodyFont(ctx, 11, opts?.italicValue ? "italic" : "normal");
  const availableW = ctx.pageWidth - ctx.marginX - (ctx.marginX + labelW + 4);
  const lines = wrapLines(ctx, value, availableW);

  if (lines.length > 0) {
    ctx.doc.text(lines[0], ctx.marginX + labelW + 4, ctx.y);
    ctx.y += ctx.lineHeight;
    for (let i = 1; i < lines.length; i++) {
      ensureSpace(ctx, ctx.lineHeight + 2);
      ctx.doc.text(lines[i], ctx.marginX, ctx.y);
      ctx.y += ctx.lineHeight;
    }
  } else {
    ctx.y += ctx.lineHeight;
  }

  ctx.y += 2;
}

function drawBulletList(ctx: PdfCtx, items: string[], opts?: { indent?: number; bullet?: string }) {
  const indent = opts?.indent ?? 10;
  const bullet = opts?.bullet ?? "–";

  setBodyFont(ctx, 11, "normal");
  const maxW = ctx.pageWidth - 2 * ctx.marginX - indent;

  for (const item of items) {
    if (!item.trim()) {
      ctx.y += 2;
      continue;
    }

    const lines = wrapLines(ctx, item, maxW);
    ensureSpace(ctx, (lines.length + 1) * ctx.lineHeight);

    ctx.doc.text(`${bullet} ${lines[0]}`, ctx.marginX + indent, ctx.y);
    ctx.y += ctx.lineHeight;

    for (let i = 1; i < lines.length; i++) {
      ctx.doc.text(lines[i], ctx.marginX + indent + 4, ctx.y);
      ctx.y += ctx.lineHeight;
    }
  }

  ctx.y += 4;
}

type BishopricMember = {
  name: string;
  role?: string;
  calling?: string;
};

function parsePersonName(value?: string) {
  if (!value) return "";
  const [namePart] = value.split("|").map((part) => part.trim());
  return namePart || "";
}

function normalizeSingleLine(value?: string) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCompareText(value?: string) {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function formatOrganizationConnector(orgName: string) {
  const normalized = normalizeCompareText(orgName);
  if (!normalized) return "de";
  if (normalized.includes("mujeres jovenes")) return "de las";
  if (normalized.includes("hombres jovenes")) return "de los";
  if (normalized.includes("cuorum") || normalized.includes("barrio")) return "del";
  if (
    normalized.includes("sociedad") ||
    normalized.includes("escuela") ||
    normalized.includes("primaria")
  ) {
    return "de la";
  }
  return "de";
}

function normalizeMeeting(meeting: any) {
  const normalizedMeeting = { ...meeting };

  if (typeof normalizedMeeting.isTestimonyMeeting === "string") {
    normalizedMeeting.isTestimonyMeeting = normalizedMeeting.isTestimonyMeeting === "true";
  }

  const maybeParse = (key: string) => {
    if (typeof normalizedMeeting[key] === "string") {
      try {
        normalizedMeeting[key] = JSON.parse(normalizedMeeting[key]);
      } catch {
        // ignore
      }
    }
  };

  maybeParse("discourses");
  maybeParse("releases");
  maybeParse("sustainments");
  maybeParse("newMembers");
  maybeParse("aaronicOrderings");
  maybeParse("childBlessings");
  maybeParse("confirmations");

  if (typeof normalizedMeeting.visitingAuthority === "string") {
    const directorName = parsePersonName(String(normalizedMeeting.director || ""));
    const presiderName = parsePersonName(String(normalizedMeeting.presider || ""));
    const filteredAuthorities = normalizedMeeting.visitingAuthority
      .split(",")
      .map((entry: string) => entry.trim())
      .filter((entry: string) => {
        const entryName = parsePersonName(entry);
        if (!entryName) return false;
        if (directorName && entryName === directorName) return false;
        if (presiderName && entryName === presiderName) return false;
        return true;
      });
    normalizedMeeting.visitingAuthority = filteredAuthorities.join(", ");
  }

  return normalizedMeeting;
}

function formatPersonWithCalling(value?: string) {
  if (!value) return "";
  const [namePart, callingPart] = value.split("|").map((part) => part.trim());
  if (!callingPart) return namePart || "";
  const normalizedCalling = callingPart;
  return `${namePart || ""} - ${normalizedCalling}`;
}

function groupBy<T>(arr: T[], keyFn: (t: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = keyFn(item) || "sin-organizacion";
    acc[k] = acc[k] || [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function orgById(organizations: any[], id: string) {
  if (!id || id === "sin-organizacion") return null;
  return organizations.find((o: any) => o.id === id) ?? null;
}

function formatCallingWithOrganization(calling: string, organization?: any) {
  const trimmedCalling = normalizeSingleLine(calling);
  if (!trimmedCalling) return "";
  const orgName = organization?.name?.trim();
  if (!orgName) return trimmedCalling;
  const normalizedCalling = normalizeCompareText(trimmedCalling);
  const normalizedOrg = normalizeCompareText(orgName);
  if (normalizedCalling.includes(normalizedOrg)) return trimmedCalling;
  const connector = formatOrganizationConnector(orgName);
  return `${trimmedCalling} ${connector} ${orgName}`.trim();
}

function formatBishopricCalling(calling?: string, role?: string) {
  const trimmed = calling?.trim();
  if (trimmed) {
    const lower = trimmed.toLowerCase();
    if (lower.includes("consejero") && !lower.includes("obispado")) {
      return `${trimmed} del Obispado`;
    }
    return trimmed;
  }
  if (role === "obispo") return "Obispo";
  if (role === "consejero_obispo") return "Consejero del Obispado";
  return "";
}

function drawInlineLabelValue(
  ctx: PdfCtx,
  label: string,
  value: string,
  options?: { italicValue?: boolean; boldLabel?: boolean }
) {
  if (typeof label !== "string" || !label.trim()) return;
  if (typeof value !== "string") return;

  ensureSpace(ctx, ctx.lineHeight + 2);

  const x = ctx.marginX;
  const y = ctx.y;

  setBodyFont(ctx, 11, options?.boldLabel === false ? "normal" : "bold");
  ctx.doc.text(String(label), x, y);

  const labelWidth = ctx.doc.getTextWidth(String(label)) + 1;

  setBodyFont(ctx, 11, options?.italicValue ? "italic" : "normal");
  ctx.doc.text(String(value), x + labelWidth, y);

  ctx.y += ctx.lineHeight + 2;
}

function formatInterviewTypeLabel(type: string) {
  const map: Record<string, string> = {
    recomendacion_templo: "Recomendación del Templo",
    llamamiento: "Llamamiento",
    anual: "Entrevista Anual",
    orientacion: "Orientación",
    otra: "Otra",
  };
  return map[type] ?? type;
}

function formatInterviewStatus(status: string) {
  const map: Record<string, string> = {
    programada: "Programada",
    completada: "Completada",
    cancelada: "Cancelada",
    archivada: "Archivada",
  };
  return map[status] ?? status;
}

function formatDateTimeShort(date: Date) {
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type InterviewAgendaEntry = {
  date: string | Date;
  personName: string;
  type: string;
  interviewerName?: string;
  location?: string;
  status?: string;
};

export async function generateInterviewAgendaPDF(
  interviews: InterviewAgendaEntry[],
  options: { startDate: Date; endDate: Date; interviewerLabel: string }
) {
  const template = await getTemplate();
  const doc = new jsPDF();

  const accent = hexToRGB(`#${template.accentColor}`);
  const ctx: PdfCtx = {
    doc,
    template,
    y: 40,
    marginX: 15,
    pageWidth: 210,
    pageHeight: 297,
    bodyFont: 11,
    lineHeight: 5.2,
    accent,
  };

  const rangeLabel = `${options.startDate.toLocaleDateString("es-ES")} - ${options.endDate.toLocaleDateString("es-ES")}`;

  ctx.y = 35;
  drawAccentRule(ctx);

  ensureSpace(ctx, 16);
  setBodyFont(ctx, 16, "bold");
  ctx.doc.text("Agenda de Entrevistas", ctx.marginX, ctx.y);
  ctx.y += 12;

  drawInlineLabelValue(ctx, "Periodo:", rangeLabel);
  drawInlineLabelValue(ctx, "Entrevistador:", options.interviewerLabel);

  ctx.y += 2;

  if (!interviews.length) {
    drawParagraph(ctx, "No hay entrevistas programadas en este periodo.", { indent: 0 });
    addHeaderFooterAllPages(doc, template, `Agenda de entrevistas | ${rangeLabel}`);
    doc.save(`agenda-entrevistas-${options.startDate.toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const rows = interviews.map((interview) => [
    formatDateTimeShort(new Date(interview.date)),
    interview.personName,
    formatInterviewTypeLabel(interview.type),
    interview.interviewerName || "—",
    interview.location || "Oficina",
    interview.status ? formatInterviewStatus(interview.status) : "Programada",
  ]);

  autoTable(doc, {
    startY: ctx.y + 4,
    head: [["Fecha", "Persona", "Tipo", "Entrevistador", "Lugar", "Estado"]],
    body: rows,
    styles: {
      fontSize: 9,
      cellPadding: 2,
      valign: "middle",
    },
    headStyles: {
      fillColor: [accent.r, accent.g, accent.b],
      textColor: [255, 255, 255],
    },
    margin: { left: ctx.marginX, right: ctx.marginX },
  });

  addHeaderFooterAllPages(doc, template, `Agenda de entrevistas | ${rangeLabel}`);
  doc.save(`agenda-entrevistas-${options.startDate.toISOString().slice(0, 10)}.pdf`);
}

/**
 * ✅ PDF - Reunión Sacramental
 */
export async function generateSacramentalMeetingPDF(
  meeting: any,
  organizations: any[] = [],
  bishopricMembers: BishopricMember[] = []
) {
  const template = await getTemplate();
  const doc = new jsPDF();

  const normalizedMeeting = normalizeMeeting(meeting);

  const accent = hexToRGB(`#${template.accentColor}`);

  const ctx: PdfCtx = {
    doc,
    template,
    y: 40,
    marginX: 15,
    pageWidth: 210,
    pageHeight: 297,
    bodyFont: 11,
    lineHeight: 5.2,
    accent,
  };

  const meetingDate = new Date(normalizedMeeting.date);
  const formattedDate = formatMeetingDate(meetingDate);

  ctx.y = 35;
  drawAccentRule(ctx);

  // Título principal
  ensureSpace(ctx, 16);
  setBodyFont(ctx, 16, "bold");
  ctx.doc.text("Programa de Reunión Sacramental", ctx.marginX, ctx.y);
  ctx.y += 10;

  // Bloque de roles inicio
  const leftItems: Array<[string, string]> = [];
  const rightItems: Array<[string, string]> = [];

  if (normalizedMeeting.presider) leftItems.push(["Preside", String(normalizedMeeting.presider)]);

  const manualRecognitionEntries = typeof normalizedMeeting.visitingAuthority === "string"
    ? normalizedMeeting.visitingAuthority
      .split(",")
      .map((entry: string) => entry.trim())
      .filter(Boolean)
    : [];
  const directorName = parsePersonName(String(normalizedMeeting.director || ""));
  const presiderName = parsePersonName(String(normalizedMeeting.presider || ""));
  const autoRecognitionEntries: string[] = [];
  const directorIsBishopric = directorName
    ? bishopricMembers.some((member) => parsePersonName(member.name) === directorName)
    : false;

  if (directorIsBishopric) {
    bishopricMembers.forEach((member) => {
      const memberName = member.name?.trim();
      if (!memberName) return;
      if (parsePersonName(memberName) === directorName) return;
      if (presiderName && parsePersonName(memberName) === presiderName) return;
      const calling = formatBishopricCalling(member.calling, member.role);
      autoRecognitionEntries.push(calling ? `${memberName} | ${calling}` : memberName);
    });
  }

  const recognitionEntries = [...manualRecognitionEntries, ...autoRecognitionEntries].filter(Boolean);
  if (recognitionEntries.length) {
    const seen = new Set<string>();
    const deduped = recognitionEntries.filter((entry) => {
      const name = parsePersonName(entry).toLowerCase();
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    if (deduped.length) leftItems.push(["Reconocimiento", deduped.join(", ")]);
  }
  if (normalizedMeeting.musicDirector) {
    const musicDirector = normalizeSingleLine(String(normalizedMeeting.musicDirector));
    if (musicDirector) leftItems.push(["Dirección de la música", musicDirector]);
  }

  if (normalizedMeeting.director) rightItems.push(["Dirige", String(normalizedMeeting.director)]);
  if (normalizedMeeting.pianist) rightItems.push(["Acompañamiento en el Piano", String(normalizedMeeting.pianist)]);

  drawKeyValueTwoColumns(ctx, leftItems, rightItems);

  // Apertura
  if (normalizedMeeting.openingHymn) {
    drawLabelLine(ctx, "Himno de apertura", String(normalizedMeeting.openingHymn), { italicValue: true });
  }

  if (normalizedMeeting.openingPrayer) {
    drawLabelLine(ctx, "Oración", String(normalizedMeeting.openingPrayer), { italicValue: true });
  }

  // --- ANUNCIOS Y ASUNTOS ---
  ctx.y += 4; // ESPACIO ENTRE SECCIONES
  drawSectionHeader(ctx, "ANUNCIOS Y ASUNTOS");

  setBodyFont(ctx, 11, "bold");
  ctx.doc.text("Anuncios:", ctx.marginX, ctx.y);
  ctx.y += 6;

  if (normalizedMeeting.announcements && String(normalizedMeeting.announcements).trim()) {
    const raw = String(normalizedMeeting.announcements);
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length > 1) {
      drawBulletList(ctx, lines, { indent: 14, bullet: "–" });
    } else {
      drawParagraph(ctx, raw, { indent: 14 });
    }
  } else {
    drawParagraph(ctx, "—", { indent: 14 });
  }

  if (normalizedMeeting.stakeBusiness && String(normalizedMeeting.stakeBusiness).trim()) {
    ctx.y += 2;
    setBodyFont(ctx, 11, "bold");
    ctx.doc.text("Asuntos de estaca:", ctx.marginX, ctx.y);
    ctx.y += 6;
    drawParagraph(ctx, String(normalizedMeeting.stakeBusiness), { indent: 14 });
  }

  const filteredReleases = Array.isArray(normalizedMeeting.releases)
    ? normalizedMeeting.releases.filter((r: any) => r?.name && r?.oldCalling)
    : [];
  const filteredSustainments = Array.isArray(normalizedMeeting.sustainments)
    ? normalizedMeeting.sustainments.filter((s: any) => s?.name && s?.calling)
    : [];

  const hasReleases = filteredReleases.length > 0;
  const hasSustainments = filteredSustainments.length > 0;

  const hasOtherBusiness =
    (Array.isArray(normalizedMeeting.confirmations) && normalizedMeeting.confirmations.filter((x: string) => x).length > 0) ||
    (Array.isArray(normalizedMeeting.newMembers) && normalizedMeeting.newMembers.filter((x: string) => x).length > 0) ||
    (Array.isArray(normalizedMeeting.aaronicOrderings) && normalizedMeeting.aaronicOrderings.filter((x: string) => x).length > 0) ||
    (Array.isArray(normalizedMeeting.childBlessings) && normalizedMeeting.childBlessings.filter((x: string) => x).length > 0);

  if (hasReleases || hasSustainments || hasOtherBusiness) {
    setBodyFont(ctx, 11, "bold");
    ctx.doc.text("Asuntos de barrio:", ctx.marginX, ctx.y);
    ctx.y += 6;

    if (hasReleases) {
      setBodyFont(ctx, 11, "bold");
      ctx.doc.text("Se ha relevado a:", ctx.marginX + 6, ctx.y);
      ctx.y += 6;

      const grouped = groupBy(filteredReleases, (r: any) => r.organizationId || "sin-organizacion");

      const bullets: string[] = [];
      Object.entries(grouped).forEach(([orgId, rels]) => {
        const org = orgById(organizations, orgId);
        rels.forEach((r: any) => {
          const callingWithOrg = formatCallingWithOrganization(r.oldCalling, org);
          const value = callingWithOrg || r.oldCalling;
          bullets.push(`${r.name}, venía sirviendo como ${value}.`);
        });
      });

      drawBulletList(ctx, bullets, { indent: 16, bullet: "–" });

      drawParagraph(
        ctx,
        "Quienes deseen expresar agradecimiento por el servicio de estos hermanos, sírvanse hacerlo levantando la mano.",
        { indent: 6, style: "italic" }
      );
    }

    if (hasSustainments) {
      setBodyFont(ctx, 11, "bold");
      ctx.doc.text("Han sido llamados los siguientes hermanos:", ctx.marginX + 6, ctx.y);
      ctx.y += 6;

      const grouped = groupBy(filteredSustainments, (s: any) => s.organizationId || "sin-organizacion");

      const bullets: string[] = [];
      Object.entries(grouped).forEach(([orgId, sus]) => {
        const org = orgById(organizations, orgId);
        sus.forEach((s: any) => {
          const callingWithOrg = formatCallingWithOrganization(s.calling, org);
          const value = callingWithOrg || s.calling;
          bullets.push(`${s.name}, como ${value}.`);
        });
      });

      drawBulletList(ctx, bullets, { indent: 16, bullet: "–" });

      drawParagraph(
        ctx,
        "Los que estén a favor, sírvanse hacerlo levantando la mano. Opuestos si los hay también pueden manifestarlo.",
        { indent: 6, style: "italic" }
      );
    }

    const confirmations = Array.isArray(normalizedMeeting.confirmations)
      ? normalizedMeeting.confirmations.filter((x: string) => x && x.trim())
      : [];
    const newMembers = Array.isArray(normalizedMeeting.newMembers)
      ? normalizedMeeting.newMembers.filter((x: string) => x && x.trim())
      : [];
    const aaronicOrderings = Array.isArray(normalizedMeeting.aaronicOrderings)
      ? normalizedMeeting.aaronicOrderings.filter((x: string) => x && x.trim())
      : [];
    const childBlessings = Array.isArray(normalizedMeeting.childBlessings)
      ? normalizedMeeting.childBlessings.filter((x: string) => x && x.trim())
      : [];

    if (confirmations.length) {
      setBodyFont(ctx, 11, "bold");
      ctx.doc.text("Confirmaciones:", ctx.marginX + 6, ctx.y);
      ctx.y += 6;
      const bullets = confirmations.map((n: string) => `${n}`);
      drawBulletList(ctx, bullets, { indent: 16, bullet: "–" });
    }

    if (newMembers.length) {
      setBodyFont(ctx, 11, "bold");
      ctx.doc.text("Bienvenida y voto de apoyo a los nuevos conversos:", ctx.marginX + 6, ctx.y);
      ctx.y += 6;
      const bullets = newMembers.map((n: string) => `${n}`);
      drawBulletList(ctx, bullets, { indent: 16, bullet: "–" });
    }

    if (aaronicOrderings.length) {
      setBodyFont(ctx, 11, "bold");
      ctx.doc.text("Propuestas de sostenimientos para recibir el Sacerdocio:", ctx.marginX + 6, ctx.y);
      ctx.y += 6;

      const bullets = aaronicOrderings.map(
        (n: string) =>
          `Proponemos que ${n} reciba el Sacerdocio Aarónico, y que sea ordenado al oficio de [       ].`
      );
      drawBulletList(ctx, bullets, { indent: 16, bullet: "–" });

      drawParagraph(
        ctx,
        "Los que estén a favor, sírvanse indicarlo levantando la mano. Opuestos si los hay, también pueden manifestarlo.",
        { indent: 6, style: "italic" }
      );
    }

    if (childBlessings.length) {
      setBodyFont(ctx, 11, "bold");
      ctx.doc.text("Bendición de niños:", ctx.marginX + 6, ctx.y);
      ctx.y += 6;
      const bullets = childBlessings.map((n: string) => `${n}`);
      drawBulletList(ctx, bullets, { indent: 16, bullet: "–" });
    }
  }

  // --- SANTA CENA ---
  ctx.y += 4; // ESPACIO ENTRE SECCIONES
  drawSectionHeader(ctx, "SANTA CENA");

  if (normalizedMeeting.sacramentHymn) {
    drawLabelLine(ctx, "Himno Sacramental", String(normalizedMeeting.sacramentHymn), { italicValue: true });
  } else {
    drawLabelLine(ctx, "Himno Sacramental", "—", { italicValue: true });
  }

  drawParagraph(
    ctx,
    "La bendición y el reparto de la Santa Cena estarán a cargo de los poseedores del Sacerdocio.",
    { indent: 0, style: "normal" }
  );

  // --- MENSAJES / TESTIMONIOS ---
  if (normalizedMeeting.isTestimonyMeeting) {
    ctx.y += 4; // ESPACIO ENTRE SECCIONES
    drawSectionHeader(ctx, "TESTIMONIOS");
    drawParagraph(
      ctx,
      "Reunión de Ayuno y Testimonio.",
      { style: "italic" }
    );
  } else {
    const discourses = Array.isArray(normalizedMeeting.discourses) ? normalizedMeeting.discourses : [];
    const hasDiscourses = discourses.some((d: any) => d?.speaker);

    if (hasDiscourses || normalizedMeeting.intermediateHymn) {
      ctx.y += 4; // ESPACIO ENTRE SECCIONES
      drawSectionHeader(ctx, "MENSAJES");

      if (discourses[0]?.speaker) {
        const d0 = discourses[0];
        const value = d0.topic
          ? `${d0.speaker} — ${d0.topic}.`
          : `${d0.speaker}.`;

        drawInlineLabelValue(ctx, "Mensaje: ", value, { italicValue: true });
      }

      if (normalizedMeeting.intermediateHymn) {
        const type = normalizedMeeting.intermediateHymnType === "choir" ? "Coro" : "Congregación";
        drawLabelLine(
          ctx,
          "Himno intermedio",
          `${normalizedMeeting.intermediateHymn} (${type})`,
          { italicValue: true }
        );
      }

      if (discourses.length > 1) {
        for (let i = 1; i < discourses.length; i++) {
          const d = discourses[i];
          if (!d?.speaker) continue;

          const value = d.topic
            ? `${d.speaker} — ${d.topic}.`
            : `${d.speaker}.`;

          drawInlineLabelValue(ctx, "Mensaje: ", value, { italicValue: true });
        }
      }
    }
  }

  // --- CLAUSURA ---
  if (normalizedMeeting.closingHymn || normalizedMeeting.closingPrayer) {
    ctx.y += 4; // ESPACIO ENTRE SECCIONES
    drawSectionHeader(ctx, "CLAUSURA");
    if (normalizedMeeting.closingHymn) {
      drawLabelLine(ctx, "Himno final", String(normalizedMeeting.closingHymn), { italicValue: true });
    }
    if (normalizedMeeting.closingPrayer) {
      drawLabelLine(ctx, "Oración", String(normalizedMeeting.closingPrayer), { italicValue: true });
    }
  }

  addHeaderFooterAllPages(doc, template, formattedDate);

  return doc;
}

/**
 * Export de reuniones
 */
export async function exportSacramentalMeetings(meetings: any[]): Promise<void> {
  if (meetings.length === 0) {
    alert("No hay reuniones para exportar");
    return;
  }

  const doc = new jsPDF();
  const template = await getTemplate();
  const wardName = template.wardName ?? "Barrio";
  const stakeName = template.stakeName ?? "Estaca";
  const country = template.country ?? "País";
  const footerText = template.footerText ?? "";

  let y = 45;

  const headerColor = hexToRGB(`#${template.headerColor}`);
  doc.setFillColor(headerColor.r, headerColor.g, headerColor.b);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(wardName, 15, 12);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${stakeName} - ${country}`, 15, 20);

  doc.setTextColor(0, 0, 0);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Reuniones Sacramentales", 15, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");

  for (const m of meetings) {
    const d = new Date(m.date);
    const line = `${formatMeetingDate(d)}  —  Preside: ${formatPersonWithCalling(m.presider) || "-"}  —  Dirige: ${formatPersonWithCalling(m.director) || "-"}`;
    const lines = doc.splitTextToSize(line, 180);
    lines.forEach((ln: string) => {
      if (y > 275) {
        doc.addPage();
        y = 45;
      }
      doc.text(ln, 15, y);
      y += 5;
    });
    y += 2;
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`${stakeName} - ${country}`, 15, 292);
    doc.text(`Página ${i} de ${pageCount}`, 105, 292, { align: "center" });
    doc.text(footerText, 195, 292, { align: "right" });
  }

  doc.save("reuniones-sacramentales.pdf");
}

export async function exportOrganizationAttendanceWeekPDF(params: {
  organizationName: string;
  sundayDate: Date;
  attendeeNames: string[];
}): Promise<void> {
  const doc = new jsPDF();
  const template = await getTemplate();
  const wardName = template.wardName ?? "Barrio";
  const stakeName = template.stakeName ?? "Estaca";
  const country = template.country ?? "País";

  const headerColor = hexToRGB(`#${template.headerColor}`);
  doc.setFillColor(headerColor.r, headerColor.g, headerColor.b);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(wardName, 15, 12);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${stakeName} - ${country}`, 15, 20);

  doc.setTextColor(0, 0, 0);

  const formattedDate = params.sundayDate.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Asistencia semanal", 15, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Organización: ${params.organizationName}`, 15, 51);
  doc.text(`Domingo: ${formattedDate}`, 15, 58);

  doc.setDrawColor(220, 220, 220);
  doc.line(15, 63, 195, 63);

  doc.setFont("helvetica", "bold");
  doc.text("Asistieron:", 15, 72);

  doc.setFont("helvetica", "normal");
  let y = 80;
  if (params.attendeeNames.length === 0) {
    doc.text("Sin asistentes registrados.", 15, y);
  } else {
    params.attendeeNames.forEach((name, index) => {
      if (y > 275) {
        doc.addPage();
        y = 24;
      }
      doc.text(`${index + 1}. ${name}`, 15, y);
      y += 7;
    });
  }

  doc.save(`asistencia-${params.organizationName.toLowerCase().replace(/\s+/g, "-")}-${formatLocalDate(params.sundayDate)}.pdf`);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Consejo de barrio
 */
export async function generateWardCouncilPDF(council: any) {
  const template = await getTemplate();
  const doc = new jsPDF();

  const councilDate = new Date(council.date);
  const formattedDate = formatMeetingDate(councilDate);
  const accent = hexToRGB(`#${template.accentColor}`);

  let yPos = 40;
  doc.setDrawColor(accent.r, accent.g, accent.b);
  doc.setLineWidth(0.8);
  doc.line(15, 35, 195, 35);
  yPos += 10;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Consejo de Barrio", 15, yPos);
  yPos += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${formattedDate}`, 15, yPos);
  yPos += 12;

  const writeBlock = (title: string, text?: string) => {
    if (!text) return;
    if (yPos > 270) {
      doc.addPage();
      yPos = 40;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`${title}:`, 15, yPos);
    yPos += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const wrapped = doc.splitTextToSize(text, 180);
    wrapped.forEach((line: string) => {
      if (yPos > 275) {
        doc.addPage();
        yPos = 40;
      }
      doc.text(line, 15, yPos);
      yPos += 6;
    });
    yPos += 6;
  };

  const openingParts = [
    council.presider ? `Preside: ${formatPersonWithCalling(council.presider)}` : null,
    council.director ? `Dirige: ${formatPersonWithCalling(council.director)}` : null,
    council.openingPrayer ? `Oración de apertura: ${council.openingPrayer}` : null,
    council.openingHymn ? `Himno: ${council.openingHymn}` : null,
    council.spiritualThoughtBy
      ? `Pensamiento espiritual asignado a: ${council.spiritualThoughtBy}`
      : null,
  ].filter(Boolean);
  if (openingParts.length) {
    writeBlock("Datos iniciales", openingParts.join("\n"));
  }

  if (
    council.previousAssignments &&
    Array.isArray(council.previousAssignments) &&
    council.previousAssignments.length > 0
  ) {
    const assignmentsText = council.previousAssignments
      .filter((a: any) => a?.assignment)
      .map((a: any) => {
        const status = a.status ? ` (${a.status.replace("_", " ")})` : "";
        const responsible = a.responsible ? ` - ${a.responsible}` : "";
        const notes = a.notes ? ` — ${a.notes}` : "";
        return `• ${a.assignment}${responsible}${status}${notes}`;
      })
      .join("\n");
    writeBlock("Revisión de compromisos anteriores", assignmentsText);
  }

  writeBlock("Ajustes o decisiones necesarias", council.adjustmentsNotes);

  writeBlock("Agenda", council.agenda);

  if (council.attendance && Array.isArray(council.attendance) && council.attendance.length > 0) {
    writeBlock("Asistencia", council.attendance.filter(Boolean).map((p: string) => `• ${p}`).join("\n"));
  }

  if (council.agreements && Array.isArray(council.agreements) && council.agreements.length > 0) {
    const agreementsText = council.agreements
      .filter((a: any) => a?.description)
      .map((a: any) => `• ${a.description}${a.responsible ? ` (Responsable: ${a.responsible})` : ""}`)
      .join("\n");
    writeBlock("Acuerdos", agreementsText);
  }

  writeBlock("Notas", council.notes);
  writeBlock("Personas y familias", council.ministryNotes);
  writeBlock("Obra de Salvación y Exaltación", council.salvationWorkNotes);
  writeBlock("Actividades del barrio", council.wardActivitiesNotes);
  if (council.newAssignments && Array.isArray(council.newAssignments) && council.newAssignments.length > 0) {
    const newAssignmentsText = council.newAssignments
      .filter((assignment: any) => assignment?.title)
      .map((assignment: any) => {
        const responsible = assignment.assignedToName
          ? ` - ${assignment.assignedToName}`
          : assignment.assignedTo
            ? ` - ${assignment.assignedTo}`
            : "";
        const dueDate = assignment.dueDate ? ` (Fecha: ${assignment.dueDate})` : "";
        const notes = assignment.notes ? ` — ${assignment.notes}` : "";
        return `• ${assignment.title}${responsible}${dueDate}${notes}`;
      })
      .join("\n");
    writeBlock("Nuevas asignaciones", newAssignmentsText);
  }
  writeBlock("Notas de asignaciones", council.newAssignmentsNotes);
  writeBlock("Resumen final del consejo", council.finalSummaryNotes);
  if (council.closingPrayer || council.closingPrayerBy) {
    writeBlock(
      "Oración final",
      council.closingPrayerBy || council.closingPrayer
    );
  }
  writeBlock("Notas del obispo/secretario", council.bishopNotes);

  addHeaderFooterAllPages(doc, template, formattedDate);

  const date = new Date(council.date).toISOString().split("T")[0];
  doc.save(`consejo-barrio-${date}.pdf`);
}
