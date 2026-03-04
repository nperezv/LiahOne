import test from "node:test";
import assert from "node:assert/strict";
import { readIdempotencyKey, toReplayResponse } from "./idempotency-utils.ts";

test("readIdempotencyKey handles string and array headers", () => {
  assert.equal(readIdempotencyKey({ "idempotency-key": " abc " }), "abc");
  assert.equal(readIdempotencyKey({ "idempotency-key": [" x ", "y"] }), "x");
});

test("readIdempotencyKey returns null for missing/blank values", () => {
  assert.equal(readIdempotencyKey({}), null);
  assert.equal(readIdempotencyKey({ "idempotency-key": "   " }), null);
});

test("toReplayResponse returns null when status/body is incomplete", () => {
  assert.equal(toReplayResponse(null), null);
  assert.equal(toReplayResponse({ statusCode: null, responseBody: {} }), null);
  assert.equal(toReplayResponse({ statusCode: 200, responseBody: null }), null);
});

test("toReplayResponse returns response payload when complete", () => {
  const replay = toReplayResponse({ statusCode: 201, responseBody: { ok: true } });
  assert.deepEqual(replay, { statusCode: 201, body: { ok: true } });
});
