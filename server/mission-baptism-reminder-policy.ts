export type ReminderRule = "t14" | "t10" | "t7" | "t2" | "t1";

export function computeDaysUntilService(serviceAt: Date, now: Date) {
  return Math.ceil((serviceAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function resolveReminderRule(daysUntilService: number): ReminderRule | null {
  if (daysUntilService <= 1) return "t1";
  if (daysUntilService <= 2) return "t2";
  if (daysUntilService <= 7) return "t7";
  if (daysUntilService <= 10) return "t10";
  if (daysUntilService <= 14) return "t14";
  return null;
}

export function buildReminderDedupeKey(serviceId: string, rule: ReminderRule) {
  return `baptism:${serviceId}:${rule}`;
}
