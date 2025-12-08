import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { apiRequest } from "./queryClient";

interface PdfTemplate {
  wardName: string;
  stakeName?: string;
  country?: string;
  headerColor: string;
  accentColor: string;
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
  const days = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  return days[date.getDay()];
}

function getMonthName(date: Date): string {
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
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
 * Header/Footer (igual que el tuyo, solo ajustada la altura un poco)
 */
async function addHeaderFooter(
  doc: jsPDF,
  template: PdfTemplate,
  title: string
) {
  const pageCount = doc.getNumberOfPages();
  const headerColor = hexToRGB(`#${template.headerColor}`);

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Header
    doc.setFillColor(headerColor.r, headerColor.g, headerColor.b);
    doc.rect(0, 0, 210, 20, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text(template.wardName, 15, 8);

    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    const stakeCountryText = `${template.stakeName || "Estaca"} - ${
      template.country || "País"
    }`;
    doc.text(stakeCountryText, 15, 12);
    doc.text(title, 15, 16);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.setFont(undefined, "normal");
    const stakeCountryFooter = `${template.stakeName || "Estaca"} - ${
      template.country || "País"
    }`;
    doc.text(stakeCountryFooter, 15, 290);
    doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: "center" });
    doc.text(template.footerText, 195, 290, { align: "right" });
  }

  doc.setTextColor(0, 0, 0);
}

/**
 * MAIN: generateSacramentalMeetingPDF
 * Misma lógica de datos, nuevo layout con bloques suaves y barra vertical
 */
export async function generateSacramentalMeetingPDF(
  meeting: any,
  organizations: any[] = []
) {
  const template = await getTemplate();
  const doc = new jsPDF();

  // Normalizar meeting
  const normalizedMeeting = { ...meeting };

  if (typeof normalizedMeeting.isTestimonyMeeting === "string") {
    normalizedMeeting.isTestimonyMeeting =
      normalizedMeeting.isTestimonyMeeting === "true";
  }

  const parseIfString = (field: any) => {
    if (typeof field === "string") {
      try {
        return JSON.parse(field);
      } catch {
        return [];
      }
    }
    return field || [];
  };

  normalizedMeeting.discourses = parseIfString(
    normalizedMeeting.discourses
  );
  normalizedMeeting.releases = parseIfString(
    normalizedMeeting.releases
  );
  normalizedMeeting.sustainments = parseIfString(
    normalizedMeeting.sustainments
  );
  normalizedMeeting.newMembers = parseIfString(
    normalizedMeeting.newMembers
  );
  normalizedMeeting.aaronicOrderings = parseIfString(
    normalizedMeeting.aaronicOrderings
  );
  normalizedMeeting.childBlessings = parseIfString(
    normalizedMeeting.childBlessings
  );
  normalizedMeeting.confirmations = parseIfString(
    normalizedMeeting.confirmations
  );

  // Fecha
  const meetingDate = new Date(normalizedMeeting.date);
  const formattedDate = formatMeetingDate(meetingDate);

  // Header/footer
  await addHeaderFooter(doc, template, formattedDate);

  // Layout helpers
  const margin = 15;
  const pageWidth = 210;
  const lineHeight = 6;
  const maxWidth = pageWidth - margin * 2;
  let yPos = 30;
  let sectionIndex = 0;

  const ensureSpace = (heightNeeded: number) => {
    const bottomLimit = 270;
    if (yPos + heightNeeded > bottomLimit) {
      doc.addPage();
      yPos = 30;
    }
  };

  /**
   * Bloque: fondo gris tenue + barra izquierda ajustada a alto del bloque.
   * title: puede ser null (sin título, solo contenido).
   * lines: texto ya formateado con "•" o "-" si lo deseas.
   */
  const addBlock = (title: string | null, lines: string[]) => {
    sectionIndex++;

    // Calcular altura
    const blockPaddingY = 4;
    const innerX = margin + 6; // texto después de la barra
    let blockHeight = blockPaddingY * 2;

    if (title) {
      const wrappedTitle = doc.splitTextToSize(title, maxWidth - 10);
      blockHeight += wrappedTitle.length * lineHeight;
    }

    lines.forEach((text) => {
      const wrapped = doc.splitTextToSize(text, maxWidth - 10);
      blockHeight += wrapped.length * lineHeight;
    });

    ensureSpace(blockHeight + 4);

    // Fondo
    const bg = { r: 248, g: 250, b: 252 }; // gris muy tenue
    doc.setFillColor(bg.r, bg.g, bg.b);
    doc.rect(margin, yPos, pageWidth - 2 * margin, blockHeight, "F");

    // Barra vertical izquierda
    const accentColor = hexToRGB(`#${template.accentColor}`);
    doc.setFillColor(accentColor.r, accentColor.g, accentColor.b);
    doc.rect(margin, yPos, 2, blockHeight, "F");

    // Título
    let textY = yPos + blockPaddingY + 1;
    if (title) {
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.setTextColor(25, 25, 25);
      const wrappedTitle = doc.splitTextToSize(title, maxWidth - 10);
      wrappedTitle.forEach((line) => {
        doc.text(line, innerX + 2, textY);
        textY += lineHeight;
      });
      textY += 1;
    }

    // Líneas
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.setTextColor(55, 65, 81);
    lines.forEach((text) => {
      const wrapped = doc.splitTextToSize(text, maxWidth - 10);
      wrapped.forEach((wLine) => {
        doc.text(wLine, innerX + 2, textY);
        textY += lineHeight;
      });
    });

    yPos += blockHeight + 4;
  };

  // Título grande antes de los bloques
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("Programa de Reunión Sacramental", margin, yPos);
  yPos += 10;

  // 1) Bienvenida y reconocimiento (+ título principal del bloque)
  addBlock("Programa de Reunión Sacramental", [
    "• Bienvenida y reconocimiento",
    `  - Preside: ${normalizedMeeting.presider || ""}`,
    `  - Dirige: ${normalizedMeeting.director || ""}`,
    `  - Autoridades visitantes: ${
      normalizedMeeting.visitingAuthority || ""
    }`,
    `  - Dirección de los himnos: ${
      normalizedMeeting.hymnDirector || ""
    }`,
    `  - Acompañamiento en el piano: ${
      normalizedMeeting.pianoAccompaniment || ""
    }`,
  ]);

  // 2) Himno inicial + Oración de apertura
  addBlock(null, [
    `• Himno inicial: ${normalizedMeeting.openingHymn || ""}`,
    `• Oración de apertura: ${normalizedMeeting.openingPrayer || ""}`,
  ]);

  // 3) Anuncios y asuntos del barrio
  const announcementsLines: string[] = [
    "• Anuncios y asuntos del barrio",
  ];

  const announcementsText =
    normalizedMeeting.announcements &&
    normalizedMeeting.announcements.trim()
      ? normalizedMeeting.announcements
      : "";
  announcementsLines.push(`${announcementsText}`);

  const filteredReleases = normalizedMeeting.releases
    ? normalizedMeeting.releases.filter(
        (r: any) => r.name && r.oldCalling
      )
    : [];
  const filteredSustainments = normalizedMeeting.sustainments
    ? normalizedMeeting.sustainments.filter(
        (s: any) => s.name && s.calling
      )
    : [];

  if (filteredReleases.length > 0 || filteredSustainments.length > 0) {
    announcementsLines.push("• Relevos y sostenimientos:");
    // Agrupar por organización, como antes
    if (filteredReleases.length > 0) {
      const releasesByOrg: { [key: string]: any[] } = {};
      filteredReleases.forEach((rel: any) => {
        const orgId = rel.organizationId || "sin-organizacion";
        if (!releasesByOrg[orgId]) releasesByOrg[orgId] = [];
        releasesByOrg[orgId].push(rel);
      });
      Object.entries(releasesByOrg).forEach(([orgId, arr]) => {
        const org = organizations.find((o: any) => o.id === orgId);
        const orgName =
          org?.name ||
          (orgId === "sin-organizacion" ? "Sin organización" : orgId);
        announcementsLines.push(`    ${orgName}:`);
        arr.forEach((r: any) => {
          announcementsLines.push(
            `      - ${r.name} (antes: ${r.oldCalling})`
          );
        });
      });
    }

    if (filteredSustainments.length > 0) {
      const sustainByOrg: { [key: string]: any[] } = {};
      filteredSustainments.forEach((s: any) => {
        const orgId = s.organizationId || "sin-organizacion";
        if (!sustainByOrg[orgId]) sustainByOrg[orgId] = [];
        sustainByOrg[orgId].push(s);
      });
      Object.entries(sustainByOrg).forEach(([orgId, arr]) => {
        const org = organizations.find((o: any) => o.id === orgId);
        const orgName =
          org?.name ||
          (orgId === "sin-organizacion" ? "Sin organización" : orgId);
        announcementsLines.push(`    ${orgName}:`);
        arr.forEach((s: any) => {
          announcementsLines.push(
            `      - ${s.name} como ${s.calling}`
          );
        });
      });
    }
  }

  if (
    normalizedMeeting.confirmations &&
    normalizedMeeting.confirmations.length > 0
  ) {
    const names = normalizedMeeting.confirmations
      .filter((n: string) => n)
      .join(", ");
    announcementsLines.push(`  - Confirmaciones: ${names}`);
  }

  if (
    normalizedMeeting.newMembers &&
    normalizedMeeting.newMembers.length > 0
  ) {
    const names = normalizedMeeting.newMembers
      .filter((n: string) => n)
      .join(", ");
    announcementsLines.push(`  - Nuevos miembros: ${names}`);
  }

  if (
    normalizedMeeting.aaronicOrderings &&
    normalizedMeeting.aaronicOrderings.length > 0
  ) {
    const names = normalizedMeeting.aaronicOrderings
      .filter((n: string) => n)
      .join(", ");
    announcementsLines.push(
      `  - Ordenaciones al Sacerdocio Aarónico: ${names}`
    );
  }

  if (
    normalizedMeeting.childBlessings &&
    normalizedMeeting.childBlessings.length > 0
  ) {
    const names = normalizedMeeting.childBlessings
      .filter((n: string) => n)
      .join(", ");
    announcementsLines.push(`  - Bendiciones de niños: ${names}`);
  }

  if (normalizedMeeting.stakeBusiness) {
    announcementsLines.push(
      `• Asuntos de Estaca: ${normalizedMeeting.stakeBusiness}`
    );
  }

  addBlock(null, announcementsLines);

  // 4) Santa Cena
  addBlock(null, [
    "• Santa Cena",
    `  - Himno sacramental: ${
      normalizedMeeting.sacramentHymn || ""
    }`,
  ]);

  // 5) Mensajes
  const messagesLines: string[] = ["• Mensajes"];

  if (normalizedMeeting.isTestimonyMeeting) {
    messagesLines.push("  - Reunión de Ayuno y Testimonios");
    messagesLines.push(
      "  - Se invita a los miembros a compartir breves testimonios."
    );
  } else {
    const discourses = Array.isArray(normalizedMeeting.discourses)
      ? normalizedMeeting.discourses
      : [];
    const first = discourses[0];
    const second = discourses[1];

    const or1 = first
      ? `Orador 1: ${first.speaker || ""}${
          first.topic ? " — " + first.topic : ""
        }`
      : "Orador 1:";
    messagesLines.push(`  - ${or1}`);

    if (normalizedMeeting.intermediateHymn) {
      const hymnText =
        normalizedMeeting.intermediateHymnType === "choir"
          ? `Himno intermedio (coro): ${normalizedMeeting.intermediateHymn}`
          : `Himno intermedio (si aplica): ${normalizedMeeting.intermediateHymn}`;
      messagesLines.push(`  - ${hymnText}`);
    }

    const or2 = second
      ? `Orador 2: ${second.speaker || ""}${
          second.topic ? " — " + second.topic : ""
        }`
      : "Orador 2:";
    messagesLines.push(`  - ${or2}`);

    if (discourses.length > 2) {
      for (let i = 2; i < discourses.length; i++) {
        const d = discourses[i];
        const idx = i + 1;
        const line = d
          ? `Orador ${idx}: ${d.speaker || ""}${
              d.topic ? " — " + d.topic : ""
            }`
          : `Orador ${idx}:`;
        messagesLines.push(`  - ${line}`);
      }
    }
  }

  addBlock(null, messagesLines);

  // 6) Último himno y Oración final
  addBlock(null, [
    `• Último himno: ${normalizedMeeting.closingHymn || ""}`,
    `• Oración final: ${normalizedMeeting.closingPrayer || ""}`,
  ]);

  return doc;
}
