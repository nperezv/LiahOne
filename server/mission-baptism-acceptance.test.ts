import test from "node:test";
import assert from "node:assert/strict";
import { nextSessionPayload, isActiveSession } from "./mission-baptism-link-session.ts";
import { containsBlockedUrl, isRateLimited, normalizeDisplayName } from "./mission-baptism-public-rules.ts";

test("acceptance: republish keeps slug and rotates code", () => {
  const first = nextSessionPayload({
    serviceId: "abcd1234-0000-0000",
    now: new Date("2026-01-01T08:00:00.000Z"),
    randomCode: "c111",
    randomSlugHex: "aa11bb",
  });

  const second = nextSessionPayload({
    serviceId: "abcd1234-0000-0000",
    now: new Date("2026-01-01T09:00:00.000Z"),
    randomCode: "c222",
    previousSlug: first.slug,
  });

  assert.equal(second.slug, first.slug);
  assert.notEqual(second.code, first.code);
});

test("acceptance: old code fails after republish", () => {
  const active = {
    ...nextSessionPayload({
      serviceId: "abcd1234-0000-0000",
      now: new Date("2026-01-01T09:00:00.000Z"),
      randomCode: "new-code",
      previousSlug: "svc-abcd1234-aa11bb",
    }),
    revokedAt: null,
  };

  const now = new Date("2026-01-01T10:00:00.000Z");
  assert.equal(isActiveSession(active, now, "old-code"), false);
  assert.equal(isActiveSession(active, now, "new-code"), true);
});

test("acceptance: message containing url is rejected", () => {
  assert.equal(containsBlockedUrl("https://evil.tld"), true);
  assert.equal(containsBlockedUrl("www.evil.tld"), true);
  assert.equal(containsBlockedUrl("felicidades por tu bautismo"), false);
});

test("acceptance: rate limit policy matches 5/10m and 20/24h", () => {
  assert.equal(isRateLimited(5, 0).blocked, true);
  assert.equal(isRateLimited(0, 20).blocked, true);
  assert.equal(isRateLimited(4, 19).blocked, false);
});

test("acceptance: display name falls back to Anónimo", () => {
  assert.equal(normalizeDisplayName("  "), "Anónimo");
  assert.equal(normalizeDisplayName("Carlos"), "Carlos");
});

test("acceptance: expires_at is exactly +24h", () => {
  const payload = nextSessionPayload({
    serviceId: "abcd1234-0000-0000",
    now: new Date("2026-01-01T10:00:00.000Z"),
    randomCode: "x",
    randomSlugHex: "abc123",
  });
  assert.equal(payload.expiresAt.toISOString(), "2026-01-02T10:00:00.000Z");
});
