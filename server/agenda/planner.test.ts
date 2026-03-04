import test from "node:test";
import assert from "node:assert/strict";
import { buildFreeSlots, computePlan, findOverlappingPlanIds } from "./planner.ts";

test("computePlan prioritizes due date then priority", () => {
  const now = new Date("2026-01-01T08:00:00Z");
  const availability = {
    userId: "u1",
    timezone: "UTC",
    workDays: [1, 2, 3, 4, 5, 6, 7],
    workStartTime: "08:00",
    workEndTime: "10:00",
    bufferMinutes: 0,
    minBlockMinutes: 15,
    doNotDisturbWindows: null,
    createdAt: now,
    updatedAt: now,
  } as any;

  const tasks = [
    { id: "t1", title: "T1", status: "open", dueAt: "2026-01-01T10:00:00Z", earliestStartAt: null, durationMinutes: 60, priority: "P2" },
    { id: "t2", title: "T2", status: "open", dueAt: "2026-01-01T09:30:00Z", earliestStartAt: null, durationMinutes: 30, priority: "P4" },
  ] as any;

  const result = computePlan({ now, availability, tasks, events: [], existingPlans: [] });
  assert.equal(result.planned[0]?.taskId, "t2");
  assert.equal(result.planned[1]?.taskId, "t1");
  assert.equal(result.atRiskTaskIds.length, 0);
});

test("buildFreeSlots excludes busy windows with buffer", () => {
  const now = new Date("2026-01-01T08:00:00Z");
  const availability = {
    userId: "u1",
    timezone: "UTC",
    workDays: [4],
    workStartTime: "08:00",
    workEndTime: "12:00",
    bufferMinutes: 10,
    minBlockMinutes: 15,
    doNotDisturbWindows: null,
    createdAt: now,
    updatedAt: now,
  } as any;

  const slots = buildFreeSlots({
    now,
    availability,
    events: [{ start: new Date("2026-01-01T09:00:00Z"), end: new Date("2026-01-01T10:00:00Z") }],
    plans: [],
    horizonDays: 1,
  });

  assert.equal(slots.length, 2);
  assert.equal(slots[0].start.toISOString(), "2026-01-01T08:00:00.000Z");
  assert.equal(slots[0].end.toISOString(), "2026-01-01T08:50:00.000Z");
  assert.equal(slots[1].start.toISOString(), "2026-01-01T10:10:00.000Z");
});


test("findOverlappingPlanIds returns overlapped plan ids", () => {
  const plans = [
    { id: "p1", startAt: new Date("2026-01-01T10:00:00Z"), endAt: new Date("2026-01-01T11:00:00Z") },
    { id: "p2", startAt: new Date("2026-01-01T12:00:00Z"), endAt: new Date("2026-01-01T13:00:00Z") },
  ] as any;

  const overlaps = findOverlappingPlanIds(plans, [
    { start: new Date("2026-01-01T10:30:00Z"), end: new Date("2026-01-01T10:45:00Z") },
  ]);

  assert.deepEqual(overlaps, ["p1"]);
});
