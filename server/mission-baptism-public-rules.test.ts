import test from "node:test";
import assert from "node:assert/strict";
import { containsBlockedUrl, isPublicWindowActive, isRateLimited, normalizeDisplayName } from "./mission-baptism-public-rules.ts";

test("containsBlockedUrl detects URLs", () => {
  assert.equal(containsBlockedUrl("visita https://example.com"), true);
  assert.equal(containsBlockedUrl("www.example.com"), true);
  assert.equal(containsBlockedUrl("felicidades por tu bautismo"), false);
});

test("isRateLimited honors 5/10m and 20/24h", () => {
  assert.equal(isRateLimited(4, 19).blocked, false);
  assert.equal(isRateLimited(5, 19).over10Minutes, true);
  assert.equal(isRateLimited(1, 20).over24Hours, true);
});

test("normalizeDisplayName falls back to Anónimo", () => {
  assert.equal(normalizeDisplayName(""), "Anónimo");
  assert.equal(normalizeDisplayName("  "), "Anónimo");
  assert.equal(normalizeDisplayName("María"), "María");
});

test("isPublicWindowActive checks revoked/expiry", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");
  assert.equal(isPublicWindowActive(new Date("2026-01-01T11:00:00.000Z"), null, now), true);
  assert.equal(isPublicWindowActive(new Date("2026-01-01T09:00:00.000Z"), null, now), false);
  assert.equal(isPublicWindowActive(new Date("2026-01-01T11:00:00.000Z"), new Date("2026-01-01T10:30:00.000Z"), now), false);
});
