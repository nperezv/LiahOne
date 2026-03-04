import type { UserAvailability } from "@shared/schema";

export type ReminderChannel = "push" | "email";

const DEFAULT_CHANNELS: ReminderChannel[] = ["push"];

export function getPreferredReminderChannels(availability?: Pick<UserAvailability, "reminderChannels"> | null): ReminderChannel[] {
  const channels = availability?.reminderChannels?.filter((channel): channel is ReminderChannel => channel === "push" || channel === "email");
  return channels && channels.length > 0 ? channels : DEFAULT_CHANNELS;
}

function getLocalMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return (Number.isNaN(hour) ? 0 : hour) * 60 + (Number.isNaN(minute) ? 0 : minute);
}

export function isWithinQuietHours(date: Date, timezone: string, windows?: Array<{ start: string; end: string }> | null): boolean {
  if (!windows || windows.length === 0) return false;

  const current = getLocalMinutes(date, timezone || "UTC");
  return windows.some((window) => {
    const [sh, sm] = window.start.split(":").map(Number);
    const [eh, em] = window.end.split(":").map(Number);
    const startMin = (Number.isNaN(sh) ? 0 : sh) * 60 + (Number.isNaN(sm) ? 0 : sm);
    const endMin = (Number.isNaN(eh) ? 0 : eh) * 60 + (Number.isNaN(em) ? 0 : em);

    if (endMin <= startMin) {
      return current >= startMin || current <= endMin;
    }

    return current >= startMin && current <= endMin;
  });
}
