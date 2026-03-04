import test from "node:test";
import assert from "node:assert/strict";
import { getPreferredReminderChannels, isWithinQuietHours } from "./reminder-utils.ts";

test("getPreferredReminderChannels falls back to push", () => {
  assert.deepEqual(getPreferredReminderChannels(null), ["push"]);
  assert.deepEqual(getPreferredReminderChannels({ reminderChannels: [] } as any), ["push"]);
});

test("getPreferredReminderChannels filters unsupported channels", () => {
  assert.deepEqual(getPreferredReminderChannels({ reminderChannels: ["email", "sms", "push"] as any }), ["email", "push"]);
});

test("isWithinQuietHours respects timezone windows", () => {
  const utcDate = new Date("2026-01-01T04:30:00Z"); // 23:30 previous day in Bogota
  assert.equal(isWithinQuietHours(utcDate, "America/Bogota", [{ start: "22:00", end: "06:00" }]), true);
  const daytimeUtcDate = new Date("2026-01-01T12:30:00Z");
  assert.equal(isWithinQuietHours(daytimeUtcDate, "UTC", [{ start: "22:00", end: "06:00" }]), false);
});
