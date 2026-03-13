import test from "node:test";
import assert from "node:assert/strict";
import { computeMinimumReady, computeReminderRule } from "./mission-baptism-readiness.ts";

test("minimum ready true when all required parts exist", () => {
  const result = computeMinimumReady({
    programItems: [
      { type: "opening_prayer" },
      { type: "hymn" },
      { type: "talk" },
      { type: "ordinance_baptism" },
      { type: "closing_prayer" },
    ],
    assignments: [
      { type: "cleaning", assigneeName: "A" },
      { type: "refreshments", assigneeName: "B" },
      { type: "baptism_clothing", assigneeName: "C" },
      { type: "wet_clothes_pickup", assigneeName: "D" },
    ],
    hasInterviewScheduledMilestone: true,
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.missingProgramTypes, []);
  assert.deepEqual(result.missingCriticalAssignments, []);
});

test("minimum ready false when interview milestone missing", () => {
  const result = computeMinimumReady({
    programItems: [{ type: "opening_prayer" }, { type: "hymn" }, { type: "talk" }, { type: "ordinance_baptism" }, { type: "closing_prayer" }],
    assignments: [{ type: "cleaning", assigneeName: "A" }, { type: "refreshments", assigneeName: "B" }, { type: "baptism_clothing", assigneeName: "C" }, { type: "wet_clothes_pickup", assigneeName: "D" }],
    hasInterviewScheduledMilestone: false,
  });

  assert.equal(result.ready, false);
});

test("reminder rule buckets", () => {
  assert.equal(computeReminderRule(20), null);
  assert.equal(computeReminderRule(13), "t14");
  assert.equal(computeReminderRule(9), "t10");
  assert.equal(computeReminderRule(6), "t7");
  assert.equal(computeReminderRule(2), "t2");
  assert.equal(computeReminderRule(1), "t1");
});
