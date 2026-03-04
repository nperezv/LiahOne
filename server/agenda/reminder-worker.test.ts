import test from "node:test";
import assert from "node:assert/strict";
import { processAgendaReminder } from "./reminder-worker.ts";

const baseReminder = {
  id: "r1",
  userId: "u1",
  eventId: null,
  taskId: null,
  remindAt: new Date(),
  status: "pending",
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

const baseAvailability = {
  userId: "u1",
  timezone: "UTC",
  workDays: [1, 2, 3, 4, 5],
  workStartTime: "09:00",
  workEndTime: "18:00",
  bufferMinutes: 10,
  minBlockMinutes: 15,
  doNotDisturbWindows: null,
  reminderChannels: ["push"],
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

test("processAgendaReminder sends email when channel=email and user has email", async () => {
  let sent = false;
  const result = await processAgendaReminder({
    reminder: { ...baseReminder, channel: "email", taskId: "t1" } as any,
    availability: baseAvailability,
    deps: {
      getUserById: async () => ({ id: "u1", email: "user@test.com" } as any),
      getEventById: async () => undefined,
      getTaskById: async () => ({ id: "t1", title: "Preparar clase", dueAt: new Date("2026-01-02T10:00:00Z") } as any),
      sendPush: async () => {},
      sendEmail: async (payload) => {
        sent = payload.toEmail === "user@test.com" && payload.subject?.includes("Preparar clase") === true;
      },
      isPushConfigured: () => true,
    },
  });

  assert.equal(result.action, "sent");
  assert.equal(sent, true);
});

test("processAgendaReminder fails email when user has no email", async () => {
  const result = await processAgendaReminder({
    reminder: { ...baseReminder, channel: "email" } as any,
    availability: baseAvailability,
    deps: {
      getUserById: async () => ({ id: "u1", email: null } as any),
      getEventById: async () => undefined,
      getTaskById: async () => undefined,
      sendPush: async () => {},
      sendEmail: async () => {},
      isPushConfigured: () => true,
    },
  });

  assert.equal(result.action, "failed");
});

test("processAgendaReminder reschedules in quiet hours", async () => {
  const result = await processAgendaReminder({
    reminder: { ...baseReminder, channel: "push" } as any,
    availability: { ...baseAvailability, doNotDisturbWindows: [{ start: "00:00", end: "23:59" }] },
    deps: {
      getUserById: async () => undefined,
      getEventById: async () => undefined,
      getTaskById: async () => undefined,
      sendPush: async () => {},
      sendEmail: async () => {},
      isPushConfigured: () => true,
    },
    now: new Date("2026-01-01T12:00:00Z"),
  });

  assert.equal(result.action, "reschedule");
  assert.ok(result.nextRemindAt instanceof Date);
});
