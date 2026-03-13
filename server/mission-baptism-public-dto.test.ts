import test from "node:test";
import assert from "node:assert/strict";
import { toPublicServiceDTO } from "./mission-baptism-public-dto.ts";

test("toPublicServiceDTO exposes only allowed program fields and visible items", () => {
  const dto = toPublicServiceDTO({
    items: [
      {
        type: "talk",
        title: "Mensaje",
        order: 2,
        publicVisibility: true,
        hymnId: null,
        hymnNumber: null,
        hymnTitle: null,
        hymnExternalUrl: null,
        participantUserId: "secret",
        participantDisplayName: "Interno",
        notes: "privado",
      },
      {
        type: "hymn",
        title: "Himno",
        order: 1,
        publicVisibility: false,
        hymnId: "h1",
        hymnNumber: 5,
        hymnTitle: "Faith",
        hymnExternalUrl: "https://example.com/hymn",
      },
    ],
    approvedPosts: [],
    expiresAt: new Date("2026-01-01T12:00:00.000Z"),
  });

  assert.equal(dto.program.length, 1);
  assert.deepEqual(dto.program[0], { type: "talk", title: "Mensaje", order: 2, hymn: null });
  assert.equal("participantUserId" in dto.program[0], false);
  assert.equal("notes" in dto.program[0], false);
});

test("toPublicServiceDTO normalizes post display name and keeps approved payload", () => {
  const dto = toPublicServiceDTO({
    items: [],
    approvedPosts: [
      {
        id: "p1",
        displayName: "",
        message: "Felicidades",
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
        status: "approved",
        clientRequestId: "abc",
      },
    ],
    expiresAt: new Date("2026-01-01T12:00:00.000Z"),
  });

  assert.equal(dto.posts[0].displayName, "Anónimo");
  assert.equal("status" in dto.posts[0], false);
  assert.equal("clientRequestId" in dto.posts[0], false);
});
