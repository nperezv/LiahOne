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
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return days[date.getDay()];
}

function getMonthName(date: Date): string {
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", 
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return months[date.getMonth()];
}

function formatMeetingDate(date: Date): string {
  const dayOfWeek = getDayOfWeek(date);
  const day = date.getDate();
  const month = getMonthName(date);
  const year = date.getFullYear();
  return `${dayOfWeek} ${day} de ${month} de ${year}`;
}

async function addHeaderFooter(doc: jsPDF, template: PdfTemplate, title: string) {
  const pageCount = doc.getNumberOfPages();
  const headerColor = hexToRGB(`#${template.headerColor}`);
  const accentColor = hexToRGB(`#${template.accentColor}`);

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Header background
    doc.setFillColor(headerColor.r, headerColor.g, headerColor.b);
    doc.rect(0, 0, 210, 25, "F");

    // Ward name and title with stake and country
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(template.wardName, 15, 8);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    const stakeCountryText = `${template.stakeName || "Estaca"} - ${template.country || "País"}`;
    doc.text(stakeCountryText, 15, 12);
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(title, 15, 18);

    // Footer with stake, country, and page number
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, "normal");
    const stakeCountryFooter = `${template.stakeName || "Estaca"} - ${template.country || "País"}`;
    doc.text(stakeCountryFooter, 15, 290);
    doc.text(
      `Página ${i} de ${pageCount}`,
      105,
      290,
      { align: "center" }
    );
    doc.text(template.footerText, 195, 290, { align: "right" });
  }

  // Reset text color
  doc.setTextColor(0, 0, 0);
}

export async function generateSacramentalMeetingPDF(meeting: any, organizations: any[] = []) {
  const template = await getTemplate();
  const doc = new jsPDF();

  // Parse JSON fields if they come as strings from database
  const normalizedMeeting = { ...meeting };
  
  // Fix boolean field - may come as string "true"/"false"
  if (typeof normalizedMeeting.isTestimonyMeeting === 'string') {
    normalizedMeeting.isTestimonyMeeting = normalizedMeeting.isTestimonyMeeting === 'true';
  }
  
  if (typeof normalizedMeeting.discourses === 'string') {
    normalizedMeeting.discourses = JSON.parse(normalizedMeeting.discourses);
  }
  if (typeof normalizedMeeting.releases === 'string') {
    normalizedMeeting.releases = JSON.parse(normalizedMeeting.releases);
  }
  if (typeof normalizedMeeting.sustainments === 'string') {
    normalizedMeeting.sustainments = JSON.parse(normalizedMeeting.sustainments);
  }
  if (typeof normalizedMeeting.newMembers === 'string') {
    normalizedMeeting.newMembers = JSON.parse(normalizedMeeting.newMembers);
  }
  if (typeof normalizedMeeting.aaronicOrderings === 'string') {
    normalizedMeeting.aaronicOrderings = JSON.parse(normalizedMeeting.aaronicOrderings);
  }
  if (typeof normalizedMeeting.childBlessings === 'string') {
    normalizedMeeting.childBlessings = JSON.parse(normalizedMeeting.childBlessings);
  }
  if (typeof normalizedMeeting.confirmations === 'string') {
    normalizedMeeting.confirmations = JSON.parse(normalizedMeeting.confirmations);
  }
  
  // Debug logging
  console.log("PDF: isTestimonyMeeting type:", typeof normalizedMeeting.isTestimonyMeeting, "value:", normalizedMeeting.isTestimonyMeeting);
  console.log("PDF: discourses type:", typeof normalizedMeeting.discourses, "length:", normalizedMeeting.discourses?.length);

  // Format date for header and content
  const meetingDate = new Date(normalizedMeeting.date);
  const formattedDate = formatMeetingDate(meetingDate);
  const dayOfWeek = getDayOfWeek(meetingDate);
  const day = meetingDate.getDate();
  const month = getMonthName(meetingDate);
  const year = meetingDate.getFullYear();

  // Add header and footer with formatted date
  await addHeaderFooter(doc, template, formattedDate);

  const accentColor = hexToRGB(`#${template.accentColor}`);
  doc.setDrawColor(accentColor.r, accentColor.g, accentColor.b);
  doc.setLineWidth(0.5);
  doc.line(15, 30, 195, 30);

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("Programa de Reunión Sacramental", 15, 42);

  let yPos = 50;
  const lineHeight = 4.5;
  const margin = 15;
  const pageWidth = 210;
  const maxWidth = pageWidth - 2 * margin - 10;
  let sectionIndex = 0;

  // Helper function to add section with gray box styling
  const addSection = (number: string, title: string, content: string[]) => {
    if (yPos > 270) {
      doc.addPage();
      yPos = 35;
    }

    sectionIndex++;
    
    // Alternate background colors (light gray and white)
    const bgColor = sectionIndex % 2 === 0 ? { r: 243, g: 244, b: 246 } : { r: 255, g: 255, b: 255 };
    doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    
    // Calculate section height for background
    let contentHeight = 0;
    content.forEach(line => {
      const wrappedText = doc.splitTextToSize(line, maxWidth - 8);
      contentHeight += wrappedText.length * lineHeight;
    });
    const sectionHeight = contentHeight + 13;
    
    // Draw background rectangle
    doc.rect(margin, yPos - 2, pageWidth - 2 * margin, sectionHeight, "F");

    // Draw left accent bar with accent color
    const accentColor = hexToRGB(`#${template.accentColor}`);
    doc.setFillColor(accentColor.r, accentColor.g, accentColor.b);
    doc.rect(margin, yPos - 2, 2, sectionHeight, "F"); // 2pt wide bar on the left

    // Section title - Bold, larger
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text(title, margin + 8, yPos + 3);
    yPos += 8;

    // Section content - detect lines ending with : and make them bold
    // Also detect specific key phrases that should be bold
    const keyPhrasesWithColon = [
      "Preside esta reunión:",
      "La dirige:",
      "Cantaremos el primer himno:",
      "La oración de apertura será ofrecida por:",
      "Entonaremos el himno sacramental número:",
      "Ahora escucharemos el mensaje del hermano",
      "Seguidamente, el coro del barrio cantara el himno:",
      "Seguidamente, entonaremos el himno número:",
      "Después del himno, escucharemos el mensaje del hermano",
      "Cantaremos el último himno:",
      "La oración final será ofrecida por:",
      "Confirmar a nuevos conversos:",
      "Asuntos de Estaca:",
      "Presentaremos nombres de hermanos",
      "Dar nombre y bendición a los niños",
      "Ahora os presentaremos algunos relevos y sostenimientos:",
    ];
    
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    
    content.forEach(line => {
      // Check if this is an organization header
      const isOrgHeader = line.includes("[ORG_HEADER]");
      
      if (isOrgHeader) {
        // Extract organization name
        const orgName = line.replace("[ORG_HEADER]", "").replace("[/ORG_HEADER]", "");
        
        // Draw light blue background for org name
        const lineWidth = doc.getTextWidth(orgName);
        doc.setFillColor(219, 234, 254); // Light blue (rgb: 219, 234, 254)
        doc.rect(margin + 8, yPos - 3, lineWidth + 4, lineHeight + 1, "F");
        
        // Draw org name in bold
        doc.setFont(undefined, "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(orgName, margin + 10, yPos);
        yPos += lineHeight;
        
        // Add space after org header
        yPos += 2;
      } else if (line.trim() === "") {
        // Empty line - add space
        yPos += 2;
      } else {
        // Check if line contains a key phrase with colon
        const colonIndex = line.indexOf(":");
        const hasKeyPhrase = keyPhrasesWithColon.some(phrase => line.includes(phrase));
        
        if (hasKeyPhrase && colonIndex !== -1) {
        // Split at the colon: bold part before colon + colon, normal part after
        const boldPart = line.substring(0, colonIndex + 1); // includes the :
        const normalPart = line.substring(colonIndex + 1).trim();
        
        // Render bold part
        doc.setFont(undefined, "bold");
        const boldWrapped = doc.splitTextToSize(boldPart, maxWidth - 8);
        boldWrapped.forEach((textLine, idx) => {
          if (yPos > 280) {
            doc.addPage();
            yPos = 35;
          }
          if (idx === boldWrapped.length - 1 && normalPart) {
            // Last line of bold - add normal part on same line if it fits
            doc.text(textLine, margin + 8, yPos);
            // Try to add normal part on same line
            const boldWidth = doc.getTextWidth(textLine);
            const normalStart = margin + 8 + boldWidth + 1;
            if (normalStart + doc.getTextWidth(normalPart) < pageWidth - margin) {
              doc.setFont(undefined, "normal");
              doc.text(normalPart, normalStart, yPos);
              doc.setFont(undefined, "bold");
            } else {
              // Normal part goes to next line
              yPos += lineHeight;
              if (yPos > 280) {
                doc.addPage();
                yPos = 35;
              }
              doc.setFont(undefined, "normal");
              doc.text(normalPart, margin + 8, yPos);
            }
          } else {
            doc.text(textLine, margin + 8, yPos);
          }
          yPos += lineHeight;
        });
        } else if (line.trim().endsWith(":")) {
          // Line ends with : - make entire line bold
          doc.setFont(undefined, "bold");
          const wrappedText = doc.splitTextToSize(line, maxWidth - 8);
          wrappedText.forEach(textLine => {
            if (yPos > 280) {
              doc.addPage();
              yPos = 35;
            }
            doc.text(textLine, margin + 8, yPos);
            yPos += lineHeight;
          });
        } else {
          // Normal text
          doc.setFont(undefined, "normal");
          doc.setTextColor(40, 40, 40);
          const wrappedText = doc.splitTextToSize(line, maxWidth - 8);
          wrappedText.forEach(textLine => {
            if (yPos > 280) {
              doc.addPage();
              yPos = 35;
            }
            doc.text(textLine, margin + 8, yPos);
            yPos += lineHeight;
          });
        }
      }
    });

    yPos += 2;
  };

  // Section 1: Prelude music
  addSection("Preludio", "", [
    "(Música reverente mientras los miembros entran.)",
    "Demos la bienvenida a todos con un momento de música para prepararnos espiritualmente.",
  ]);

  // Section 1.5: Opening of sacramental meeting
  const openingSection = (yPos: number) => {
    if (yPos > 260) {
      doc.addPage();
      yPos = 35;
    }
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("Inicio de los servicios sacramentales:", margin + 8, yPos + 5);
    return yPos + 10;
  };
  yPos = openingSection(yPos);

  // Section 2: Greeting
  addSection("Bienvenida", "", [
    `Buenos días, hermanos y hermanas. Bienvenidos a nuestra reunión sacramental de hoy, ${dayOfWeek} ${day} de ${month} de ${year}.`,
  ]);

  // Section 3: Authorities
  const authorities = [];
  if (normalizedMeeting.presider) {
    authorities.push(`Preside esta reunión: ${normalizedMeeting.presider}`);
  }
  if (normalizedMeeting.director) {
    authorities.push(`La dirige: ${normalizedMeeting.director}`);
  }
  if (normalizedMeeting.visitingAuthority) {
    authorities.push(`Reconocemos la visita de: ${normalizedMeeting.visitingAuthority}`);
  }
  authorities.push("Invitamos a estas autoridades a acompañarnos al frente y tomar asiento con nosotros, si aún no lo han hecho.");
  addSection("Autoridades", "", authorities);

  // Section 4: Announcements
  if (normalizedMeeting.announcements) {
    addSection("Anuncios", "", [
      "A continuación, algunos anuncios importantes del barrio o de la Estaca:",
      normalizedMeeting.announcements,
    ]);
  } else {
    addSection("Anuncios", "", [
      "A continuación, algunos anuncios importantes del barrio o de la Estaca:",
    ]);
  }

  // Section 5: Opening hymn
  const openingContent = [];
  if (normalizedMeeting.openingHymn) {
    openingContent.push(`Cantaremos el primer himno: ${normalizedMeeting.openingHymn}`);
  } else {
    openingContent.push("Cantaremos el primer himno:");
  }
  addSection("Primer himno", "", openingContent);

  // Section 6: Opening prayer
  const openingPrayerContent = [];
  if (normalizedMeeting.openingPrayer) {
    openingPrayerContent.push(`La oración de apertura será ofrecida por: ${normalizedMeeting.openingPrayer}`);
  } else {
    openingPrayerContent.push("La oración de apertura será ofrecida por:");
  }
  addSection("Primera oración", "", openingPrayerContent);

  // Section 7: Ward business
  const businessContent = [];

  // 1. Confirmations - must be first (so new members can follow)
  if (normalizedMeeting.confirmations && normalizedMeeting.confirmations.filter((n: string) => n).length > 0) {
    businessContent.push("Confirmar a nuevos conversos:");
    normalizedMeeting.confirmations.forEach((name: string) => {
      if (name) businessContent.push(`Invitamos a pasar al frente al hermano: ${name}, quien será confirmado miembro de la iglesia de Jesucristo de los santos de los ultimos dias`);
    });
  }

  // 2. New Members - comes after confirmations
  const hasNewMembers = normalizedMeeting.newMembers && normalizedMeeting.newMembers.filter((n: string) => n).length > 0;
  if (hasNewMembers) {
    normalizedMeeting.newMembers.forEach((name: string) => {
      if (name) businessContent.push(`Queremos dar un voto de bienvenida y de acogimiento al hermano: ${name} alzando la mano derecha en señal de apoyo.`);
    });
  }

  // 3. Aaronic orderings
  if (normalizedMeeting.aaronicOrderings && normalizedMeeting.aaronicOrderings.filter((n: string) => n).length > 0) {
    businessContent.push("Presentaremos nombres de hermanos a ser ordenados al Sacerdocio Aarónico.");
    normalizedMeeting.aaronicOrderings.forEach((name: string) => {
      if (name) businessContent.push(`Se ordena a: ${name}`);
    });
  }

  // 4. Child blessings
  if (normalizedMeeting.childBlessings && normalizedMeeting.childBlessings.filter((n: string) => n).length > 0) {
    businessContent.push("Dar nombre y bendición a los niños.");
    normalizedMeeting.childBlessings.forEach((name: string) => {
      if (name) businessContent.push(`Bendición para: ${name}`);
    });
  }

  // 5. Releases and sustainments
  const filteredReleases = normalizedMeeting.releases ? normalizedMeeting.releases.filter((r: any) => r.name && r.oldCalling) : [];
  const filteredSustainments = normalizedMeeting.sustainments ? normalizedMeeting.sustainments.filter((s: any) => s.name && s.calling) : [];
  const hasSustainmentsOrReleases = filteredReleases.length > 0 || filteredSustainments.length > 0;
  
  if (hasSustainmentsOrReleases) {
    businessContent.push("Ahora os presentaremos algunos relevos y sostenimientos:");
    
    // Add Releases section grouped by organization
    if (filteredReleases.length > 0) {
      businessContent.push("Relevos:");
      
      // Group releases by organizationId
      const releasesByOrg: { [key: string]: any[] } = {};
      filteredReleases.forEach((release: any) => {
        const orgId = release.organizationId || "sin-organizacion";
        if (!releasesByOrg[orgId]) {
          releasesByOrg[orgId] = [];
        }
        releasesByOrg[orgId].push(release);
      });
      
      // Process each organization
      const releaseOrgEntries = Object.entries(releasesByOrg);
      releaseOrgEntries.forEach(([orgId, orgReleases]: [string, any[]], index: number) => {
        // Get organization name from the organizations array
        const org = organizations.find((o: any) => o.id === orgId);
        const orgName = org?.name || orgId.replace(/-/g, " ");
        
        if (orgName !== "sin-organizacion") {
          businessContent.push(`[ORG_HEADER]${orgName}[/ORG_HEADER]`);
        }
        
        // Add first release with special format
        if (orgReleases.length > 0) {
          businessContent.push(`Se ha relevado a ${orgReleases[0].name} quien venía sirviendo como ${orgReleases[0].oldCalling} de ${orgName}.`);
          
          // Add remaining releases with "A" format
          for (let i = 1; i < orgReleases.length; i++) {
            businessContent.push(`A ${orgReleases[i].name} quien venía sirviendo como ${orgReleases[i].oldCalling} de ${orgName}.`);
          }
          
          // Add closing message (plural or singular)
          if (orgReleases.length > 1) {
            businessContent.push("Agradecemos sinceramente a estos buenos(as) hermanos(as) y sus familias, por el tiempo y la dedicación prestados al Señor en estos llamamientos, y lo haremos levantando la mano derecha en señal de agradecimiento.");
          } else {
            businessContent.push("Le agradecemos sinceramente por el tiempo y la dedicación prestados al Señor en estos llamamientos, y lo haremos levantando la mano derecha en señal de agradecimiento.");
          }
        }
        
        // Add blank line after each organization except the last
        if (index < releaseOrgEntries.length - 1) {
          businessContent.push("");
        }
      });
    }
    
    // Add Sustainments section grouped by organization
    if (filteredSustainments.length > 0) {
      businessContent.push("Sostenimientos:");
      
      // Group sustainments by organizationId
      const sustainmentsByOrg: { [key: string]: any[] } = {};
      filteredSustainments.forEach((sustainment: any) => {
        const orgId = sustainment.organizationId || "sin-organizacion";
        if (!sustainmentsByOrg[orgId]) {
          sustainmentsByOrg[orgId] = [];
        }
        sustainmentsByOrg[orgId].push(sustainment);
      });
      
      // Process each organization
      const sustainmentOrgEntries = Object.entries(sustainmentsByOrg);
      sustainmentOrgEntries.forEach(([orgId, orgSustainments]: [string, any[]], index: number) => {
        // Get organization name from the organizations array
        const org = organizations.find((o: any) => o.id === orgId);
        const orgName = org?.name || orgId.replace(/-/g, " ");
        
        if (orgName !== "sin-organizacion") {
          businessContent.push(`[ORG_HEADER]${orgName}[/ORG_HEADER]`);
        }
        
        // Add each sustainment with the format
        orgSustainments.forEach((sustainment: any) => {
          businessContent.push(`Se ha llamado a ${sustainment.name} como ${sustainment.calling} de ${orgName} y Proponemos su sostenimiento con la señal ya conocida. Contrarios si los hay, favor de manifestarlo.`);
        });
        
        // Add blank line after each organization except the last
        if (index < sustainmentOrgEntries.length - 1) {
          businessContent.push("");
        }
      });
    }
  }

  // 6. Stake business - only if it has content
  if (normalizedMeeting.stakeBusiness) {
    businessContent.push("Asuntos de Estaca:");
    businessContent.push(normalizedMeeting.stakeBusiness);
  }

  addSection("Asuntos de Barrio", "", businessContent);

  // Section 8: Sacrament hymn
  const sacramentContent = [];
  if (normalizedMeeting.sacramentHymn) {
    sacramentContent.push(`Entonaremos el himno sacramental número: ${normalizedMeeting.sacramentHymn}`);
  } else {
    sacramentContent.push("Entonaremos el himno sacramental número:");
  }
  sacramentContent.push("La bendición y el reparto de la Santa Cena estarán a cargo de los poseedores del sacerdocio.");

  addSection("Himno sacramental", "", sacramentContent);

  // Section 9: Discourses and music
  if (!normalizedMeeting.isTestimonyMeeting && normalizedMeeting.discourses && normalizedMeeting.discourses.length > 0) {
    const discoursesContent = [];
    
    // First discourse - show speaker even if topic is empty
    if (normalizedMeeting.discourses[0].speaker) {
      const speakerText = normalizedMeeting.discourses[0].topic 
        ? `Ahora escucharemos el mensaje del hermano(a): ${normalizedMeeting.discourses[0].speaker} - ${normalizedMeeting.discourses[0].topic}`
        : `Ahora escucharemos el mensaje del hermano(a): ${normalizedMeeting.discourses[0].speaker}`;
      discoursesContent.push(speakerText);
    }
    
    // Intermediate hymn after first discourse
    if (normalizedMeeting.intermediateHymn) {
      const hymnText = normalizedMeeting.intermediateHymnType === 'choir'
        ? `Seguidamente, el coro del barrio cantara el himno: ${normalizedMeeting.intermediateHymn}`
        : `Seguidamente, entonaremos el himno número: ${normalizedMeeting.intermediateHymn}`;
      discoursesContent.push(hymnText);
    }
    
    // Additional discourses after hymn - show speaker even if topic is empty
    if (normalizedMeeting.discourses.length > 1) {
      for (let i = 1; i < normalizedMeeting.discourses.length; i++) {
        const discourse = normalizedMeeting.discourses[i];
        if (discourse.speaker) {
          const speakerText = discourse.topic
            ? `Después del himno, escucharemos el mensaje del hermano(a): ${discourse.speaker} - ${discourse.topic}`
            : `Después del himno, escucharemos el mensaje del hermano(a): ${discourse.speaker}`;
          discoursesContent.push(speakerText);
        }
      }
    }
    
    addSection("Mensajes del Evangelio", "", discoursesContent);
  } else if (normalizedMeeting.isTestimonyMeeting) {
    addSection("Testimonio", "", [
      "(Se exhorta o se pide a los hermanos ser breves y generosos con los demás hermanos para que todos los que deseen puedan participar.)",
    ]);
  }

  // Section 10: Closing hymn
  const closingHymnContent = [];
  if (normalizedMeeting.closingHymn) {
    closingHymnContent.push(`Cantaremos el último himno: ${normalizedMeeting.closingHymn}`);
  } else {
    closingHymnContent.push("Cantaremos el último himno:");
  }
  addSection("Último himno", "", closingHymnContent);

  // Section 11: Closing prayer
  const closingPrayerContent = [];
  if (normalizedMeeting.closingPrayer) {
    closingPrayerContent.push(`La oración final será ofrecida por: ${normalizedMeeting.closingPrayer}`);
  } else {
    closingPrayerContent.push("La oración final será ofrecida por:");
  }
  addSection("Última oración", "", closingPrayerContent);

  // Section 12: Final music
  addSection("Música final", "", [
    "(Música reverente mientras los miembros salen.)",
  ]);

  return doc;
}

export async function exportSacramentalMeetings(meetings: any[]): Promise<void> {
  if (meetings.length === 0) {
    alert("No hay reuniones para exportar");
    return;
  }

  const doc = new jsPDF();
  const template = await getTemplate();

  let pageAdded = false;

  for (let i = 0; i < meetings.length; i++) {
    if (pageAdded) {
      doc.addPage();
    }
    pageAdded = true;

    const meeting = meetings[i];
    const meetingDate = new Date(meeting.date);
    const dayOfWeek = getDayOfWeek(meetingDate);
    const day = meetingDate.getDate();
    const month = getMonthName(meetingDate);
    const year = meetingDate.getFullYear();

    // Add header
    const headerColor = hexToRGB(`#${template.headerColor}`);
    doc.setFillColor(headerColor.r, headerColor.g, headerColor.b);
    doc.rect(0, 0, 210, 25, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(template.wardName, 15, 8);
    doc.setFontSize(12);
    doc.text("Reunión Sacramental", 15, 16);

    const accentColor = hexToRGB(`#${template.accentColor}`);
    doc.setDrawColor(accentColor.r, accentColor.g, accentColor.b);
    doc.setLineWidth(0.5);
    doc.line(15, 30, 195, 30);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont(undefined, "normal");
    doc.text(`Fecha: ${dayOfWeek} ${day} de ${month} de ${year}`, 15, 40);
  }

  // Add footer to all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Página ${i} de ${pageCount}`,
      105,
      290,
      { align: "center" }
    );
    doc.text(template.footerText, 15, 290);
  }

  doc.save("reuniones-sacramentales.pdf");
}

export async function generateWardCouncilPDF(council: any) {
  const template = await getTemplate();
  const doc = new jsPDF();

  // Format date for header
  const councilDate = new Date(council.date);
  const formattedDate = formatMeetingDate(councilDate);

  // Add header and footer with formatted date
  await addHeaderFooter(doc, template, formattedDate);

  const accentColor = hexToRGB(`#${template.accentColor}`);
  doc.setDrawColor(accentColor.r, accentColor.g, accentColor.b);
  doc.setLineWidth(0.5);
  doc.line(15, 30, 195, 30);

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("Consejo de Barrio", 15, 45);

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text(`Fecha: ${councilDate.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`, 15, 55);

  let yPos = 70;

  if (council.agenda) {
    doc.setFont(undefined, "bold");
    doc.text("Agenda:", 15, yPos);
    yPos += 8;
    doc.setFont(undefined, "normal");
    const wrappedText = doc.splitTextToSize(council.agenda, 180);
    wrappedText.forEach(line => {
      doc.text(line, 15, yPos);
      yPos += 6;
    });
    yPos += 4;
  }

  if (council.attendance && council.attendance.length > 0) {
    doc.setFont(undefined, "bold");
    doc.text("Asistencia:", 15, yPos);
    yPos += 8;
    doc.setFont(undefined, "normal");
    council.attendance.forEach(person => {
      if (person) {
        doc.text(`• ${person}`, 20, yPos);
        yPos += 6;
      }
    });
    yPos += 4;
  }

  if (council.agreements && council.agreements.length > 0) {
    doc.setFont(undefined, "bold");
    doc.text("Acuerdos:", 15, yPos);
    yPos += 8;
    doc.setFont(undefined, "normal");
    council.agreements.forEach(agreement => {
      if (agreement.description) {
        const wrappedText = doc.splitTextToSize(`• ${agreement.description}${agreement.responsible ? ` (Responsable: ${agreement.responsible})` : ''}`, 175);
        wrappedText.forEach(line => {
          doc.text(line, 20, yPos);
          yPos += 6;
        });
      }
    });
    yPos += 4;
  }

  if (council.notes) {
    doc.setFont(undefined, "bold");
    doc.text("Notas:", 15, yPos);
    yPos += 8;
    doc.setFont(undefined, "normal");
    const wrappedText = doc.splitTextToSize(council.notes, 180);
    wrappedText.forEach(line => {
      doc.text(line, 15, yPos);
      yPos += 6;
    });
  }

  const date = new Date(council.date).toISOString().split('T')[0];
  doc.save(`consejo-barrio-${date}.pdf`);
}
