export type AgendaCommandIntent =
  | "create_event"
  | "create_task"
  | "plan_week"
  | "unknown";

export interface AgendaCommandEntities {
  title?: string;
  description?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  dueAt?: Date | null;
  durationMinutes?: number;
  priority?: "P1" | "P2" | "P3" | "P4";
}

export interface AgendaCommandParseResult {
  intent: AgendaCommandIntent;
  entities: AgendaCommandEntities;
  confidence: number;
  needsConfirmation: boolean;
  parser: "rules";
}

export function parseNaturalDateEs(text: string): Date | null {
  const lowered = text.toLowerCase();
  const now = new Date();
  const timeMatch = lowered.match(/(?:a las|\b)(\d{1,2})(?::(\d{2}))?/);
  const hours = timeMatch ? Number(timeMatch[1]) : 9;
  const minutes = timeMatch ? Number(timeMatch[2] ?? "0") : 0;

  let base = new Date(now);
  if (lowered.includes("mañana")) {
    base.setDate(base.getDate() + 1);
  } else if (lowered.includes("hoy")) {
    // keep today
  } else {
    const dateMatch = lowered.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);
    if (dateMatch) {
      const day = Number(dateMatch[1]);
      const month = Number(dateMatch[2]) - 1;
      const yearRaw = Number(dateMatch[3] ?? now.getFullYear());
      const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
      base = new Date(year, month, day);
    } else if (!timeMatch) {
      return null;
    }
  }

  base.setHours(Number.isNaN(hours) ? 9 : hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
  return base;
}

function parseDurationMinutes(normalized: string): number | undefined {
  const minutesMatch = normalized.match(/(\d{1,3})\s*(min|minutos)/i);
  if (minutesMatch) return Math.max(15, Number(minutesMatch[1]));
  const hourMatch = normalized.match(/(\d{1,2})\s*(h|hora|horas)/i);
  if (hourMatch) return Math.max(15, Number(hourMatch[1]) * 60);
  return undefined;
}

function inferPriority(normalized: string): "P1" | "P2" | "P3" | "P4" {
  if (/(urgente|important[ií]simo|prioridad\s*1|p1)/i.test(normalized)) return "P1";
  if (/(importante|prioridad\s*2|p2)/i.test(normalized)) return "P2";
  if (/(baja prioridad|prioridad\s*4|p4)/i.test(normalized)) return "P4";
  return "P3";
}

export function parseAgendaCommand(text: string): AgendaCommandParseResult {
  const normalized = text.trim().toLowerCase();
  const parsedDate = parseNaturalDateEs(text);

  if (/(planifica|planear|planea|organiza).*(semana)/i.test(normalized)) {
    return {
      intent: "plan_week",
      entities: { description: text },
      confidence: 0.96,
      needsConfirmation: false,
      parser: "rules",
    };
  }

  const isTask = /(recordar|recu[eé]rd(?:a(?:me)?|en)?|tengo que|debo|antes de|pendiente|hacer|tarea|llamar)/i.test(normalized);
  const isExplicitEvent = /(reunión|entrevista|cita|evento|programa|agenda)/i.test(normalized);
  const isEvent = isExplicitEvent || /\ba las\b/i.test(normalized);

  if (isTask && !isExplicitEvent) {
    return {
      intent: "create_task",
      entities: {
        title: text.slice(0, 120),
        description: text,
        dueAt: parsedDate,
        durationMinutes: parseDurationMinutes(normalized) ?? 30,
        priority: inferPriority(normalized),
      },
      confidence: parsedDate ? 0.87 : 0.72,
      needsConfirmation: !parsedDate,
      parser: "rules",
    };
  }

  if (isEvent || parsedDate) {
    const when = parsedDate ?? new Date();
    const startTime = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
    const endDate = new Date(when.getTime() + (parseDurationMinutes(normalized) ?? 60) * 60_000);
    const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

    return {
      intent: "create_event",
      entities: {
        title: text.slice(0, 120),
        description: text,
        date: when.toISOString().slice(0, 10),
        startTime,
        endTime,
      },
      confidence: parsedDate ? 0.9 : 0.68,
      needsConfirmation: !parsedDate,
      parser: "rules",
    };
  }

  return {
    intent: "unknown",
    entities: { description: text },
    confidence: 0.4,
    needsConfirmation: true,
    parser: "rules",
  };
}
