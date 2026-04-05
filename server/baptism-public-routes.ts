/**
 * Public baptism program routes — no auth required.
 * All queries use raw SQL (baptism tables have no Drizzle schema objects).
 */
import type { Express, Request } from "express";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { isRateLimited, normalizeDisplayName, containsBlockedUrl } from "./mission-baptism-public-rules";
import { toPublicServiceDTO } from "./mission-baptism-public-dto";
import { isActiveSession } from "./mission-baptism-link-session";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ipHash(req: Request) {
  const value = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0]
    .trim();
  return createHash("sha256").update(value || "unknown-ip").digest("hex");
}

async function getActivePublicLink(slug: string, code?: string) {
  const now = new Date();
  const result = await db.execute(sql`
    SELECT id, service_id AS "serviceId", slug, code, published_at AS "publishedAt",
           expires_at AS "expiresAt", revoked_at AS "revokedAt"
    FROM baptism_public_links
    WHERE slug = ${slug} AND revoked_at IS NULL AND expires_at > ${now.toISOString()}
    ORDER BY published_at DESC LIMIT 1
  `);
  const active = result.rows[0] as any;
  if (!active) return null;
  const record = {
    slug: active.slug,
    code: active.code,
    publishedAt: active.publishedAt ? new Date(active.publishedAt) : new Date(),
    expiresAt: active.expiresAt ? new Date(active.expiresAt) : new Date(),
    revokedAt: active.revokedAt ? new Date(active.revokedAt) : null,
  };
  if (!isActiveSession(record, now, code)) {
    return code && code !== active.code ? ("invalid_code" as const) : null;
  }
  return { ...active, expiresAt: record.expiresAt };
}

const publicPostSchema = z.object({
  code: z.string().min(4),
  displayName: z.string().max(40).optional().or(z.literal("")),
  message: z.string().min(1).max(240).refine((v) => !containsBlockedUrl(v), "message must not contain urls"),
  clientRequestId: z.string().min(3),
  company: z.string().optional(),
});

// ── Route registration ────────────────────────────────────────────────────────

export function registerBaptismPublicRoutes(app: Express) {
  app.get("/api/bautismo/:slug", async (req, res) => {
    try {
    const linkResult = await db.execute(sql`
      SELECT id, service_id, expires_at FROM baptism_public_links
      WHERE slug = ${req.params.slug} AND revoked_at IS NULL
      ORDER BY published_at DESC LIMIT 1
    `);
    const link = linkResult.rows[0] as any;
    if (!link) return res.status(404).json({ message: "Enlace no encontrado" });

    const svcRow = await db.execute(sql`SELECT approval_status, service_at FROM baptism_services WHERE id = ${link.service_id}`);
    const svc = svcRow.rows[0] as any;
    if (svc?.approval_status !== "approved") return res.json({ unavailable: "not_approved" });

    const serviceAt = svc?.service_at ? new Date(svc.service_at) : null;
    if (serviceAt) {
      const now = new Date();
      const windowEnd = new Date(serviceAt.getTime() + 24 * 60 * 60 * 1000);
      if (now >= windowEnd) return res.json({ unavailable: "outside_window" });
    }

    // Bishop approval is the readiness gate — no additional logistics check needed

    const [itemsResult, postsResult, candidatesResult, tplResult] = await Promise.all([
      db.execute(sql`
        SELECT bpi.id, bpi.type,
               COALESCE(bpi.participant_display_name, bpi.title) AS title,
               bpi.order, bpi.public_visibility AS "publicVisibility",
               bpi.hymn_id AS "hymnId", h.number AS "hymnNumber", h.title AS "hymnTitle", h.external_url AS "hymnExternalUrl"
        FROM baptism_program_items bpi
        LEFT JOIN hymns h ON h.id = bpi.hymn_id
        WHERE bpi.service_id = ${link.service_id}
      `),
      db.execute(sql`SELECT * FROM baptism_public_posts WHERE public_link_id = ${link.id} AND status = 'approved' ORDER BY created_at DESC`),
      db.execute(sql`
        SELECT mp.nombre, mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
        FROM baptism_service_candidates bsc
        JOIN mission_personas mp ON mp.id = bsc.persona_id
        WHERE bsc.service_id = ${link.service_id} ORDER BY mp.nombre
      `),
      db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
    ]);
    const candidates = (candidatesResult.rows as any[]).map((r) => ({
      nombre: r.nombre as string,
      sexo: r.sexo as string | null,
      fechaNacimiento: r.fechaNacimiento as string | null,
    }));
    const expiresAt = link.expires_at ? new Date(link.expires_at) : null;
    const wardName = (tplResult.rows[0] as any)?.ward_name ?? null;
    res.json(toPublicServiceDTO({ items: itemsResult.rows as any[], approvedPosts: postsResult.rows as any[], expiresAt, candidates, serviceAt, wardName }));
    } catch (err) {
      console.error("[GET /bautismo/:slug]", err);
      res.status(500).json({ message: "Error interno" });
    }
  });

  app.get("/api/b/:slug", async (req, res) => {
    try {
    const code = String(req.query.c || "");
    const active = await getActivePublicLink(req.params.slug, code);
    if (active === "invalid_code") return res.status(403).json({ error: "Invalid code" });
    if (!active) return res.status(410).json({ message: "Enlace caducado" });

    const [itemsResult, postsResult, candidatesResult, svcResult, tplResult] = await Promise.all([
      db.execute(sql`
        SELECT bpi.id, bpi.type,
               COALESCE(bpi.participant_display_name, bpi.title) AS title,
               bpi.order, bpi.public_visibility AS "publicVisibility",
               bpi.hymn_id AS "hymnId", h.number AS "hymnNumber", h.title AS "hymnTitle", h.external_url AS "hymnExternalUrl"
        FROM baptism_program_items bpi
        LEFT JOIN hymns h ON h.id = bpi.hymn_id
        WHERE bpi.service_id = ${active.serviceId}
      `),
      db.execute(sql`SELECT * FROM baptism_public_posts WHERE public_link_id = ${active.id} AND status = 'approved' ORDER BY created_at DESC`),
      db.execute(sql`
        SELECT mp.nombre, mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
        FROM baptism_service_candidates bsc
        JOIN mission_personas mp ON mp.id = bsc.persona_id
        WHERE bsc.service_id = ${active.serviceId} ORDER BY mp.nombre
      `),
      db.execute(sql`SELECT service_at FROM baptism_services WHERE id = ${active.serviceId}`),
      db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
    ]);
    const candidates = (candidatesResult.rows as any[]).map((r) => ({
      nombre: r.nombre as string,
      sexo: r.sexo as string | null,
      fechaNacimiento: r.fechaNacimiento as string | null,
    }));
    const serviceAt = (svcResult.rows[0] as any)?.service_at ? new Date((svcResult.rows[0] as any).service_at) : null;
    const wardName = (tplResult.rows[0] as any)?.ward_name ?? null;
    res.json(toPublicServiceDTO({ items: itemsResult.rows as any[], approvedPosts: postsResult.rows as any[], expiresAt: active.expiresAt, candidates, serviceAt, wardName }));
    } catch (err) {
      console.error("[GET /b/:slug]", err);
      res.status(500).json({ message: "Error interno" });
    }
  });

  app.post("/api/b/:slug/posts", async (req, res) => {
    const parsed = publicPostSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payload" });
    if (parsed.data.company?.trim()) return res.status(400).json({ error: "Bot detected" });

    const active = await getActivePublicLink(req.params.slug, parsed.data.code);
    if (active === "invalid_code") return res.status(403).json({ error: "Invalid code" });
    if (!active) return res.status(403).json({ error: "ventana terminada" });

    const hash = ipHash(req);
    const now = new Date();
    const tenMinutes = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [r10, r24] = await Promise.all([
      db.execute(sql`SELECT 1 FROM baptism_public_posts WHERE ip_hash = ${hash} AND created_at > ${tenMinutes}`),
      db.execute(sql`SELECT 1 FROM baptism_public_posts WHERE ip_hash = ${hash} AND created_at > ${oneDay}`),
    ]);
    if (isRateLimited(r10.rows.length, r24.rows.length).blocked) return res.status(429).json({ error: "Rate limit" });

    const existing = await db.execute(sql`SELECT * FROM baptism_public_posts WHERE public_link_id = ${active.id} AND client_request_id = ${parsed.data.clientRequestId} LIMIT 1`);
    if (existing.rows[0]) return res.status(200).json(existing.rows[0]);

    const row = await db.execute(sql`
      INSERT INTO baptism_public_posts (public_link_id, display_name, message, client_request_id, ip_hash, status)
      VALUES (${active.id}, ${normalizeDisplayName(parsed.data.displayName)}, ${parsed.data.message}, ${parsed.data.clientRequestId}, ${hash}, 'pending')
      RETURNING *
    `);
    res.status(201).json(row.rows[0]);
  });

  app.post("/api/bautismo/:slug/posts", async (req, res) => {
    const parsed = publicPostSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payload" });
    if (parsed.data.company?.trim()) return res.status(400).json({ error: "Bot detected" });

    const linkResult = await db.execute(sql`
      SELECT id, service_id FROM baptism_public_links
      WHERE slug = ${req.params.slug} AND revoked_at IS NULL
      ORDER BY published_at DESC LIMIT 1
    `);
    const link = linkResult.rows[0] as any;
    if (!link) return res.status(404).json({ error: "Enlace no encontrado" });

    const svcResult = await db.execute(sql`SELECT approval_status, service_at FROM baptism_services WHERE id = ${link.service_id}`);
    const svc = svcResult.rows[0] as any;
    if (svc?.approval_status !== "approved") return res.status(403).json({ error: "El programa no está disponible" });

    const serviceAtPost = svc?.service_at ? new Date(svc.service_at) : null;
    if (serviceAtPost) {
      const now = new Date();
      if (now < serviceAtPost || now >= new Date(serviceAtPost.getTime() + 24 * 60 * 60 * 1000))
        return res.status(403).json({ error: "El programa no está disponible" });
    }

    const hash = ipHash(req);
    const now = new Date();
    const tenMinutes = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [r10, r24] = await Promise.all([
      db.execute(sql`SELECT 1 FROM baptism_public_posts WHERE ip_hash = ${hash} AND created_at > ${tenMinutes}`),
      db.execute(sql`SELECT 1 FROM baptism_public_posts WHERE ip_hash = ${hash} AND created_at > ${oneDay}`),
    ]);
    if (isRateLimited(r10.rows.length, r24.rows.length).blocked) return res.status(429).json({ error: "Rate limit" });

    const existing = await db.execute(sql`SELECT * FROM baptism_public_posts WHERE public_link_id = ${link.id} AND client_request_id = ${parsed.data.clientRequestId} LIMIT 1`);
    if (existing.rows[0]) return res.status(200).json(existing.rows[0]);

    const row = await db.execute(sql`
      INSERT INTO baptism_public_posts (public_link_id, display_name, message, client_request_id, ip_hash, status)
      VALUES (${link.id}, ${normalizeDisplayName(parsed.data.displayName)}, ${parsed.data.message}, ${parsed.data.clientRequestId}, ${hash}, 'pending')
      RETURNING *
    `);
    res.status(201).json(row.rows[0]);
  });
}
