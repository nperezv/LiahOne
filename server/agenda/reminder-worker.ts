import type { AgendaEvent, AgendaReminder, AgendaTask, User, UserAvailability } from "@shared/schema";
import { isWithinQuietHours } from "./reminder-utils.ts";

export interface ReminderWorkerDeps {
  getUserById: (userId: string) => Promise<User | undefined>;
  getEventById: (eventId: string) => Promise<AgendaEvent | undefined>;
  getTaskById: (taskId: string) => Promise<AgendaTask | undefined>;
  sendPush: (userId: string, payload: { title: string; body: string; url?: string }) => Promise<void>;
  sendEmail: (payload: { toEmail: string; subject?: string; body: string }) => Promise<void>;
  isPushConfigured: () => boolean;
}

export interface ReminderWorkerResult {
  action: "sent" | "failed" | "reschedule";
  nextRemindAt?: Date;
}

function buildReminderContent(event?: AgendaEvent, task?: AgendaTask) {
  const fallbackSubject = "Recordatorio de agenda";
  const fallbackBody = "Recordatorio de agenda";

  if (event) {
    return {
      subject: `Recordatorio: ${event.title}`,
      body: `Tienes el evento "${event.title}" programado para ${event.date}${event.startTime ? ` a las ${event.startTime}` : ""}.`,
    };
  }

  if (task) {
    return {
      subject: `Recordatorio de tarea: ${task.title}`,
      body: `Tarea pendiente: "${task.title}"${task.dueAt ? `. Vence el ${new Date(task.dueAt).toLocaleString("es-ES")}` : ""}.`,
    };
  }

  return { subject: fallbackSubject, body: fallbackBody };
}

export async function processAgendaReminder(params: {
  reminder: AgendaReminder;
  availability: UserAvailability;
  deps: ReminderWorkerDeps;
  now?: Date;
}): Promise<ReminderWorkerResult> {
  const { reminder, availability, deps } = params;
  const now = params.now ?? new Date();

  if (isWithinQuietHours(now, availability.timezone || "UTC", availability.doNotDisturbWindows ?? null)) {
    return { action: "reschedule", nextRemindAt: new Date(now.getTime() + 15 * 60_000) };
  }

  if (reminder.channel === "push") {
    if (!deps.isPushConfigured()) {
      return { action: "failed" };
    }

    await deps.sendPush(reminder.userId, {
      title: "Agenda",
      body: "Recordatorio de agenda",
      url: "/agenda",
    });
    return { action: "sent" };
  }

  if (reminder.channel === "email") {
    const recipient = await deps.getUserById(reminder.userId);
    if (!recipient?.email) {
      return { action: "failed" };
    }

    const [event, task] = await Promise.all([
      reminder.eventId ? deps.getEventById(reminder.eventId) : Promise.resolve(undefined),
      reminder.taskId ? deps.getTaskById(reminder.taskId) : Promise.resolve(undefined),
    ]);

    const content = buildReminderContent(event, task);
    await deps.sendEmail({ toEmail: recipient.email, subject: content.subject, body: content.body });
    return { action: "sent" };
  }

  return { action: "failed" };
}
