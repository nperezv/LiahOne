import type { AgendaEvent, AgendaTask, AgendaTaskPlan, UserAvailability } from "@shared/schema";

export interface PlannerWarning {
  taskId: string;
  message: string;
}

export interface PlannerResult {
  planned: Array<Pick<AgendaTaskPlan, "taskId" | "startAt" | "endAt">>;
  atRiskTaskIds: string[];
  warnings: PlannerWarning[];
}

type TimeRange = { start: Date; end: Date };

const PRIORITY_ORDER: Record<AgendaTask["priority"], number> = {
  P1: 0,
  P2: 1,
  P3: 2,
  P4: 3,
};

function parseTime(baseDate: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const date = new Date(baseDate);
  date.setHours(Number.isNaN(h) ? 0 : h, Number.isNaN(m) ? 0 : m, 0, 0);
  return date;
}

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function buildFreeSlots(params: {
  now: Date;
  availability: UserAvailability;
  events: TimeRange[];
  plans: TimeRange[];
  horizonDays?: number;
}): TimeRange[] {
  const { now, availability, events, plans, horizonDays = 14 } = params;
  const busy = [...events, ...plans].sort((a, b) => a.start.getTime() - b.start.getTime());
  const slots: TimeRange[] = [];

  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + dayOffset);
    const jsDay = day.getDay();
    const normalizedDay = jsDay === 0 ? 7 : jsDay;
    if (!availability.workDays.includes(normalizedDay)) continue;

    const dayStart = parseTime(day, availability.workStartTime);
    const dayEnd = parseTime(day, availability.workEndTime);
    if (dayEnd <= dayStart) continue;

    let cursor = new Date(Math.max(dayStart.getTime(), now.getTime()));

    const dndWindows = availability.doNotDisturbWindows ?? [];
    const dndRanges: TimeRange[] = dndWindows.map((window) => ({
      start: parseTime(day, window.start),
      end: parseTime(day, window.end),
    }));

    const busyToday = [...busy, ...dndRanges]
      .filter((range) => range.end > dayStart && range.start < dayEnd)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    for (const range of busyToday) {
      const busyStart = new Date(range.start.getTime() - availability.bufferMinutes * 60_000);
      const busyEnd = new Date(range.end.getTime() + availability.bufferMinutes * 60_000);

      if (busyStart > cursor) {
        const slotEnd = busyStart < dayEnd ? busyStart : dayEnd;
        if (slotEnd.getTime() - cursor.getTime() >= availability.minBlockMinutes * 60_000) {
          slots.push({ start: new Date(cursor), end: new Date(slotEnd) });
        }
      }

      if (busyEnd > cursor) {
        cursor = new Date(Math.min(busyEnd.getTime(), dayEnd.getTime()));
      }
      if (cursor >= dayEnd) break;
    }

    if (cursor < dayEnd && dayEnd.getTime() - cursor.getTime() >= availability.minBlockMinutes * 60_000) {
      slots.push({ start: new Date(cursor), end: new Date(dayEnd) });
    }
  }

  return slots;
}

export function computePlan(params: {
  now: Date;
  availability: UserAvailability;
  tasks: AgendaTask[];
  events: TimeRange[];
  existingPlans: TimeRange[];
}): PlannerResult {
  const slots = buildFreeSlots({
    now: params.now,
    availability: params.availability,
    events: params.events,
    plans: params.existingPlans,
  });

  const tasks = [...params.tasks]
    .filter((task) => task.status === "open")
    .sort((a, b) => {
      const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      if (dueA !== dueB) return dueA - dueB;
      const prio = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (prio !== 0) return prio;
      return b.durationMinutes - a.durationMinutes;
    });

  const planned: PlannerResult["planned"] = [];
  const atRiskTaskIds: string[] = [];
  const warnings: PlannerWarning[] = [];

  const defaultChunkMinutes = Math.max(params.availability.minBlockMinutes, 60);

  for (const task of tasks) {
    let remainingMs = task.durationMinutes * 60_000;
    const earliest = task.earliestStartAt ? new Date(task.earliestStartAt).getTime() : params.now.getTime();
    const due = task.dueAt ? new Date(task.dueAt).getTime() : Number.POSITIVE_INFINITY;

    while (remainingMs > 0) {
      let placedChunk = false;
      for (const slot of slots) {
        const startMs = Math.max(slot.start.getTime(), earliest);
        const maxAllowedChunk = Math.min(remainingMs, defaultChunkMinutes * 60_000);
        const availableMs = slot.end.getTime() - startMs;
        if (availableMs < params.availability.minBlockMinutes * 60_000) continue;

        const chunkMs = Math.min(maxAllowedChunk, availableMs);
        const endMs = startMs + chunkMs;
        if (endMs > due) continue;

        planned.push({ taskId: task.id, startAt: new Date(startMs), endAt: new Date(endMs) });
        remainingMs -= chunkMs;
        slot.start = new Date(endMs + params.availability.bufferMinutes * 60_000);
        placedChunk = true;
        break;
      }

      if (!placedChunk) break;
    }

    if (remainingMs > 0) {
      atRiskTaskIds.push(task.id);
      warnings.push({
        taskId: task.id,
        message: `No se pudo planificar completamente "${task.title}". Tiempo restante: ${Math.ceil(remainingMs / 60000)} min.`,
      });
    }
  }

  return { planned, atRiskTaskIds, warnings };
}

export function findOverlappingPlanIds(
  plans: Array<Pick<AgendaTaskPlan, "id" | "startAt" | "endAt">>,
  eventRanges: TimeRange[]
): string[] {
  return plans
    .filter((plan) => {
      const planRange = { start: new Date(plan.startAt), end: new Date(plan.endAt) };
      return eventRanges.some((eventRange) => overlaps(planRange, eventRange));
    })
    .map((plan) => plan.id);
}

export function toRangeFromEvent(event: AgendaEvent): TimeRange {
  const base = new Date(`${event.date}T00:00:00`);
  const start = event.startTime ? parseTime(base, event.startTime) : parseTime(base, "09:00");
  const end = event.endTime ? parseTime(base, event.endTime) : new Date(start.getTime() + 60 * 60_000);
  return { start, end };
}
