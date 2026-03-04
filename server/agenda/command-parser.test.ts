import test from "node:test";
import assert from "node:assert/strict";
import { parseAgendaCommand } from "./command-parser.ts";

test("parseAgendaCommand detects weekly planning intent", () => {
  const parsed = parseAgendaCommand("planifica mi semana");
  assert.equal(parsed.intent, "plan_week");
  assert.equal(parsed.needsConfirmation, false);
});

test("parseAgendaCommand detects task intent with priority", () => {
  const parsed = parseAgendaCommand("recuérdame urgente pagar el presupuesto mañana");
  assert.equal(parsed.intent, "create_task");
  assert.equal(parsed.entities.priority, "P1");
});

test("parseAgendaCommand detects event intent and schedule window", () => {
  const parsed = parseAgendaCommand("agenda reunión mañana a las 18:30");
  assert.equal(parsed.intent, "create_event");
  assert.equal(typeof parsed.entities.startTime, "string");
  assert.equal(typeof parsed.entities.endTime, "string");
});
