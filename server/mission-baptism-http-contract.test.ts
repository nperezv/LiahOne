import test from "node:test";
import assert from "node:assert/strict";

import { nextSessionPayload, isActiveSession } from "./mission-baptism-link-session.ts";
import { isRateLimited, normalizeDisplayName, containsBlockedUrl } from "./mission-baptism-public-rules.ts";
import { toPublicServiceDTO } from "./mission-baptism-public-dto.ts";

type LinkRow = {
  id: string;
  serviceId: string;
  slug: string;
  code: string;
  publishedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

type PostRow = {
  id: string;
  publicLinkId: string;
  clientRequestId: string;
  displayName: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  ipHash: string;
  createdAt: Date;
};

function getActiveLink(rows: LinkRow[], slug: string, now: Date, code?: string) {
  const active = rows
    .filter((r) => r.slug === slug)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[0];
  if (!active) return null;
  if (!isActiveSession(active, now, code)) return null;
  return active;
}

test("http-contract: publish twice revokes previous and old code is rejected", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");
  const serviceId = "svc-1";
  const links: LinkRow[] = [];

  const first = nextSessionPayload({ serviceId, now, randomCode: "code-1", randomSlugHex: "aa11bb" });
  links.push({ id: "l1", serviceId, ...first, revokedAt: null });

  links[0].revokedAt = new Date("2026-01-01T11:00:00.000Z");
  const second = nextSessionPayload({ serviceId, now: new Date("2026-01-01T11:00:00.000Z"), randomCode: "code-2", previousSlug: first.slug });
  links.push({ id: "l2", serviceId, ...second, revokedAt: null });

  assert.equal(links[0].slug, links[1].slug);
  assert.notEqual(links[0].code, links[1].code);

  const withOldCode = getActiveLink(links, first.slug, new Date("2026-01-01T12:00:00.000Z"), "code-1");
  const withNewCode = getActiveLink(links, first.slug, new Date("2026-01-01T12:00:00.000Z"), "code-2");

  assert.equal(withOldCode, null);
  assert.equal(withNewCode?.id, "l2");
});

test("http-contract: POST /b/:slug/posts enforces idempotency + rate-limit + URL block", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const link: LinkRow = {
    id: "link-1",
    serviceId: "svc-1",
    slug: "svc-slug",
    code: "abc123",
    publishedAt: new Date("2026-01-01T10:00:00.000Z"),
    expiresAt: new Date("2026-01-02T10:00:00.000Z"),
    revokedAt: null,
  };

  const posts: PostRow[] = [];
  const ipHash = "hash-1";

  const submit = (payload: { code: string; message: string; displayName?: string; clientRequestId: string }, at: Date) => {
    if (!isActiveSession(link, at, payload.code)) return { status: 403 as const };
    if (containsBlockedUrl(payload.message)) return { status: 400 as const };

    const c10 = posts.filter((p) => p.ipHash === ipHash && p.createdAt.getTime() >= at.getTime() - 10 * 60 * 1000).length;
    const c24 = posts.filter((p) => p.ipHash === ipHash && p.createdAt.getTime() >= at.getTime() - 24 * 60 * 60 * 1000).length;
    if (isRateLimited(c10, c24).blocked) return { status: 429 as const };

    const existing = posts.find((p) => p.publicLinkId === link.id && p.clientRequestId === payload.clientRequestId);
    if (existing) return { status: 200 as const, row: existing };

    const row: PostRow = {
      id: `p-${posts.length + 1}`,
      publicLinkId: link.id,
      clientRequestId: payload.clientRequestId,
      displayName: normalizeDisplayName(payload.displayName),
      message: payload.message,
      status: "pending",
      ipHash,
      createdAt: at,
    };
    posts.push(row);
    return { status: 201 as const, row };
  };

  const first = submit({ code: "abc123", message: "Felicidades", clientRequestId: "r1" }, now);
  const replay = submit({ code: "abc123", message: "Felicidades", clientRequestId: "r1" }, now);
  assert.equal(first.status, 201);
  assert.equal(replay.status, 200);
  assert.equal(posts.length, 1);

  const withUrl = submit({ code: "abc123", message: "https://evil", clientRequestId: "r2" }, now);
  assert.equal(withUrl.status, 400);

  for (let i = 0; i < 4; i++) {
    const r = submit({ code: "abc123", message: `ok ${i}`, clientRequestId: `z${i}` }, new Date(now.getTime() + i * 1000));
    assert.equal(r.status, 201);
  }
  const limited = submit({ code: "abc123", message: "extra", clientRequestId: "zz" }, new Date(now.getTime() + 5000));
  assert.equal(limited.status, 429);
});

test("http-contract: moderation queue is scoped by unit and public dto only includes approved", () => {
  const services = [
    { id: "svc-1", unitId: "unit-a" },
    { id: "svc-2", unitId: "unit-b" },
  ];
  const links = [
    { id: "l1", serviceId: "svc-1" },
    { id: "l2", serviceId: "svc-2" },
  ];
  const posts = [
    { id: "p1", publicLinkId: "l1", status: "pending", displayName: null, message: "hola", createdAt: new Date() },
    { id: "p2", publicLinkId: "l2", status: "pending", displayName: null, message: "hola", createdAt: new Date() },
    { id: "p3", publicLinkId: "l1", status: "approved", displayName: "Ana", message: "bien", createdAt: new Date() },
  ];

  const queueUnitA = posts.filter((p) => {
    const link = links.find((l) => l.id === p.publicLinkId)!;
    const svc = services.find((s) => s.id === link.serviceId)!;
    return p.status === "pending" && svc.unitId === "unit-a";
  });
  assert.deepEqual(queueUnitA.map((x) => x.id), ["p1"]);

  const dto = toPublicServiceDTO({
    items: [{ type: "talk", title: "Tema", order: 1, publicVisibility: true, hymnId: null, hymnNumber: null, hymnTitle: null, hymnExternalUrl: null }],
    approvedPosts: posts.filter((p) => p.status === "approved") as any,
    expiresAt: new Date("2026-01-01T18:00:00.000Z"),
  });

  assert.equal(dto.posts.length, 1);
  assert.equal(dto.posts[0].id, "p3");
});
