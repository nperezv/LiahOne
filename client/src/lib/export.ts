/**
 * Utility functions for exporting data to Excel/CSV format
 */

export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    alert("No hay datos para exportar");
    return;
  }

  // Get all unique keys from all objects
  const keys = Array.from(
    new Set(data.flatMap((obj) => Object.keys(obj)))
  );

  // Create CSV header
  const header = keys.map((key) => `"${key}"`).join(",");

  // Create CSV rows
  const rows = data.map((obj) =>
    keys
      .map((key) => {
        const value = obj[key];
        if (value === null || value === undefined) {
          return '""';
        }
        // Escape quotes and wrap in quotes
        const stringValue = String(value).replace(/"/g, '""');
        return `"${stringValue}"`;
      })
      .join(",")
  );

  // Combine header and rows
  const csv = [header, ...rows].join("\n");

  // Create blob and download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export sacramental meetings data
 */
export function exportSacramentalMeetings(
  meetings: any[]
) {
  const data = meetings.map((m) => ({
    Fecha: new Date(m.date).toLocaleDateString("es-ES"),
    Tema: m.topic || "",
    Disertantes: m.speakers?.join(", ") || "",
    Asistentes: m.attendance || 0,
    Ubicación: m.location || "Salón sacramental",
  }));

  exportToCSV(data, "reuniones-sacramentales");
}

/**
 * Export ward councils data
 */
export function exportWardCouncils(councils: any[]) {
  const data = councils.map((c) => ({
    Fecha: new Date(c.date).toLocaleDateString("es-ES"),
    Tema: c.topic || "",
    Lugar: c.location || "Salón de consejeros",
    Presentes: c.attendees?.join(", ") || "",
    Estado: c.status || "programada",
  }));

  exportToCSV(data, "consejos-de-barrio");
}

/**
 * Export budget requests data
 */
export function exportBudgetRequests(requests: any[]) {
  const data = requests.map((r) => ({
    Descripción: r.description,
    Monto: `$${r.amount.toFixed(2)}`,
    Estado: r.status,
    Solicitante: r.requestedBy,
    Fecha: new Date(r.createdAt).toLocaleDateString("es-ES"),
    Notas: r.notes || "",
  }));

  exportToCSV(data, "solicitudes-presupuesto");
}

/**
 * Export interviews data
 */
export function exportInterviews(interviews: any[]) {
  const data = interviews.map((i) => ({
    Fecha: new Date(i.date).toLocaleDateString("es-ES"),
    Persona: i.personInterviewed,
    Tema: i.topic || "",
    Lugar: i.location || "Oficina",
    Estado: i.status,
    Notas: i.notes || "",
  }));

  exportToCSV(data, "entrevistas");
}

/**
 * Export goals data
 */
export function exportGoals(goals: any[]) {
  const data = goals.map((g) => ({
    Objetivo: g.title,
    Organización: g.organizationId,
    Meta: g.targetValue,
    "Valor Actual": g.currentValue,
    Progreso: `${Math.round((g.currentValue / g.targetValue) * 100)}%`,
    Descripción: g.description || "",
  }));

  exportToCSV(data, "objetivos");
}

/**
 * Export birthdays data
 */
export function exportBirthdays(birthdays: any[]) {
  const data = birthdays.map((b) => ({
    Nombre: b.name,
    Fecha: new Date(b.birthDate).toLocaleDateString("es-ES"),
    Email: b.email || "",
    Teléfono: b.phone || "",
  }));

  exportToCSV(data, "cumpleaños");
}

/**
 * Export activities data
 */
export function exportActivities(activities: any[]) {
  const data = activities.map((a) => ({
    Actividad: a.title,
    Fecha: new Date(a.date).toLocaleDateString("es-ES"),
    Lugar: a.location || "",
    Organización: a.organizationId,
    Descripción: a.description || "",
  }));

  exportToCSV(data, "actividades");
}

/**
 * Export assignments data
 */
export function exportAssignments(assignments: any[]) {
  const data = assignments.map((a) => ({
    Asignación: a.title,
    Responsable: a.assignedTo,
    Fecha: new Date(a.dueDate).toLocaleDateString("es-ES"),
    Estado: a.status,
    Descripción: a.description || "",
  }));

  exportToCSV(data, "asignaciones");
}
