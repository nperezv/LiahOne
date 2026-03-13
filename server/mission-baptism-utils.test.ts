import test from "node:test";
import assert from "node:assert/strict";
import { computeExpiresAt, containsBlockedUrl, isSessionActive, rotatePublicLinkSession } from "./mission-baptism-utils.ts";

test("expires_at is +24h", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");
  const expires = computeExpiresAt(now);
  assert.equal(expires.toISOString(), "2026-01-02T10:00:00.000Z");
});

test("re-publish keeps slug and rotates code", () => {
  const first = rotatePublicLinkSession(null, new Date("2026-01-01T00:00:00.000Z"), "abc123");
  const second = rotatePublicLinkSession(first, new Date("2026-01-01T02:00:00.000Z"), "def789");
  assert.equal(second.slug, first.slug);
  assert.notEqual(second.code, first.code);
});

test("old code is blocked", () => {
  const session = rotatePublicLinkSession(null, new Date("2026-01-01T00:00:00.000Z"), "new123");
  assert.equal(isSessionActive(session, new Date("2026-01-01T01:00:00.000Z"), "old123"), false);
});

test("message with URL is invalid", () => {
  assert.equal(containsBlockedUrl("visita https://x.com"), true);
  assert.equal(containsBlockedUrl("felicidades familia"), false);
});
