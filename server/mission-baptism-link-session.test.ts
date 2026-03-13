import test from "node:test";
import assert from "node:assert/strict";
import { buildStableSlug, computeExpiresAt24h, isActiveSession, nextSessionPayload } from "./mission-baptism-link-session.ts";

test("computeExpiresAt24h adds exactly 24h", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");
  assert.equal(computeExpiresAt24h(now).toISOString(), "2026-01-02T10:00:00.000Z");
});

test("nextSessionPayload keeps stable slug when previous exists", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");
  const first = nextSessionPayload({ serviceId: "12345678-aaaa", now, randomCode: "c1", randomSlugHex: "abc123" });
  const second = nextSessionPayload({ serviceId: "12345678-aaaa", now: new Date("2026-01-01T12:00:00.000Z"), randomCode: "c2", previousSlug: first.slug });
  assert.equal(second.slug, first.slug);
  assert.notEqual(second.code, first.code);
});

test("isActiveSession blocks revoked, expired and wrong code", () => {
  const active = { slug: "s", code: "ok", publishedAt: new Date(), expiresAt: new Date("2026-01-02T00:00:00.000Z"), revokedAt: null };
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(isActiveSession(active, now, "ok"), true);
  assert.equal(isActiveSession(active, now, "bad"), false);
  assert.equal(isActiveSession({ ...active, revokedAt: now }, now, "ok"), false);
  assert.equal(isActiveSession({ ...active, expiresAt: new Date("2025-12-31T00:00:00.000Z") }, now, "ok"), false);
});

test("buildStableSlug deterministic format", () => {
  assert.equal(buildStableSlug("12345678-aaaa-bbbb", "ffeecc"), "svc-12345678-ffeecc");
});
