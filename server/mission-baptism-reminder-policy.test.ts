import test from "node:test";
import assert from "node:assert/strict";
import { buildReminderDedupeKey, computeDaysUntilService, resolveReminderRule } from "./mission-baptism-reminder-policy.ts";

test("computeDaysUntilService rounds up day window", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");
  const serviceAt = new Date("2026-01-03T09:00:00.000Z");
  assert.equal(computeDaysUntilService(serviceAt, now), 2);
});

test("resolveReminderRule maps expected windows", () => {
  assert.equal(resolveReminderRule(15), null);
  assert.equal(resolveReminderRule(14), "t14");
  assert.equal(resolveReminderRule(10), "t10");
  assert.equal(resolveReminderRule(7), "t7");
  assert.equal(resolveReminderRule(2), "t2");
  assert.equal(resolveReminderRule(1), "t1");
});

test("buildReminderDedupeKey format", () => {
  assert.equal(buildReminderDedupeKey("svc-1", "t7"), "baptism:svc-1:t7");
});
