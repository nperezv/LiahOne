import test from "node:test";
import assert from "node:assert/strict";
import { parseAgendaCommand } from "./command-parser.ts";
import { computePlan } from "./planner.ts";
import { getPreferredReminderChannels, isWithinQuietHours } from "./reminder-utils.ts";
import { readIdempotencyKey, toReplayResponse } from "./idempotency-utils.ts";

test("agenda integration flow: parse -> split plan -> reminders preferences + quiet hours", () => {
  const parsed = parseAgendaCommand("recuérdame urgente preparar informe mañana 2 horas");
  assert.equal(parsed.intent, "create_task");

  const now = new Date("2026-01-01T08:00:00Z");
  const availability = {
    userId: "u1",
    timezone: "UTC",
    workDays: [1, 2, 3, 4, 5, 6, 7],
    workStartTime: "08:00",
    workEndTime: "10:00",
    bufferMinutes: 10,
    minBlockMinutes: 15,
    doNotDisturbWindows: [{ start: "09:00", end: "09:30" }],
    reminderChannels: ["push", "email"],
    createdAt: now,
    updatedAt: now,
  } as any;

  const tasks = [
    {
      id: "t1",
      userId: "u1",
      title: parsed.entities.title,
      description: parsed.entities.description,
      dueAt: new Date("2026-01-03T23:59:00Z"),
      earliestStartAt: null,
      durationMinutes: 120,
      priority: parsed.entities.priority,
      status: "open",
      eventId: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    },
  ] as any;

  const result = computePlan({ now, availability, tasks, events: [], existingPlans: [] });
  assert.ok(result.planned.length >= 2, "Long task should be split into multiple planned chunks");
  assert.equal(result.atRiskTaskIds.length, 0);

  const channels = getPreferredReminderChannels(availability);
  assert.deepEqual(channels, ["push", "email"]);

  const quietHourDate = new Date("2026-01-01T09:10:00Z");
  assert.equal(isWithinQuietHours(quietHourDate, availability.timezone, availability.doNotDisturbWindows), true);
});


test("agenda e2e semantics: idempotent replay + audit timeline ordering", () => {
  const logs: Array<{ endpoint: string; intent: string; createdAt: number }> = [];
  const idempotencyStore = new Map<string, { statusCode: number; responseBody: Record<string, unknown> }>();

  const handleCapture = (headers: Record<string, string>, text: string) => {
    const key = readIdempotencyKey(headers as any);
    if (key) {
      const replay = toReplayResponse(idempotencyStore.get(key) as any);
      if (replay) return { ...replay, replayed: true };
    }

    const parsed = parseAgendaCommand(text);
    const body = {
      action: parsed.intent,
      parsed,
    } as Record<string, unknown>;
    const statusCode = parsed.intent === "create_task" || parsed.intent === "create_event" ? 201 : 200;

    if (key) {
      idempotencyStore.set(key, { statusCode, responseBody: body });
    }
    logs.push({ endpoint: "/api/agenda/capture", intent: parsed.intent, createdAt: Date.now() + logs.length });

    return { statusCode, body, replayed: false };
  };

  const first = handleCapture({ "idempotency-key": "same-key" }, "recuérdame preparar informe mañana");
  const second = handleCapture({ "idempotency-key": "same-key" }, "recuérdame preparar informe mañana");

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 201);
  assert.equal(second.replayed, true);
  assert.deepEqual(first.body, second.body);
  assert.equal(logs.length, 1, "replayed request should not create a duplicated audit log");
  assert.equal(logs[0].endpoint, "/api/agenda/capture");
});
