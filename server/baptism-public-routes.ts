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

// ── Theme computation (internal — never exposed raw dates/sex) ─────────────────

export type BaptismTheme =
  | "nino" | "nina"
  | "joven_varon" | "joven_mujer"
  | "adulto" | "adulta"
  | "multi_kids" | "multi_family" | "multi_adults"
  | "fallback";

function calcAge(fechaNacimiento: string | null): number | null {
  if (!fechaNacimiento) return null;
  const b = new Date(fechaNacimiento.split(/[T ]/)[0] + "T12:00:00");
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function computeTheme(candidates: Array<{ sexo: string | null; fechaNacimiento: string | null }>): BaptismTheme {
  if (candidates.length === 0) return "fallback";

  if (candidates.length === 1) {
    const c = candidates[0];
    const age = calcAge(c.fechaNacimiento);
    const female = c.sexo === "F";
    if (age !== null && age < 12) return female ? "nina" : "nino";
    if (age !== null && age < 18) return female ? "joven_mujer" : "joven_varon";
    return female ? "adulta" : "adulto";
  }

  // Multiple candidates — classify by group composition
  const ages = candidates.map((c) => calcAge(c.fechaNacimiento));
  const allKids = ages.every((a) => a !== null && a < 12);
  const anyKid  = ages.some((a) => a !== null && a < 12);
  if (allKids) return "multi_kids";
  if (anyKid)  return "multi_family";
  return "multi_adults";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ipHash(req: Request) {
  const value = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .split(",")[0].trim();
  return createHash("sha256").update(value || "unknown-ip").digest("hex");
}

const publicPostSchema = z.object({
  code: z.string().min(1).optional().or(z.literal("")),
  displayName: z.string().max(40).optional().or(z.literal("")),
  message: z.string().min(1).max(240).refine((v) => !containsBlockedUrl(v), "message must not contain urls"),
  clientRequestId: z.string().min(3),
  company: z.string().optional(),
});

// ── Route registration ────────────────────────────────────────────────────────

export function registerBaptismPublicRoutes(app: Express) {

  // ── Lobby: today's active service ─────────────────────────────────────────
  app.get("/api/bautismo", async (_req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      // Find an approved service whose service_at is today
      const svcResult = await db.execute(sql`
        SELECT bs.id, bs.service_at, bpl.slug
        FROM baptism_services bs
        JOIN baptism_public_links bpl ON bpl.service_id = bs.id
        WHERE bs.approval_status = 'approved'
          AND bs.service_at >= ${todayStart.toISOString()}
          AND bs.service_at <= ${todayEnd.toISOString()}
          AND bpl.revoked_at IS NULL
          AND bpl.expires_at > ${now.toISOString()}
        ORDER BY bs.service_at ASC
        LIMIT 1
      `);

      const svc = svcResult.rows[0] as any;
      if (!svc) return res.json({ service: null });

      const [candResult, tplResult] = await Promise.all([
        db.execute(sql`
          SELECT mp.nombre, mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${svc.id} ORDER BY mp.nombre
        `),
        db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
      ]);

      const candRows = candResult.rows as any[];
      const theme = computeTheme(candRows.map((r) => ({ sexo: r.sexo, fechaNacimiento: r.fechaNacimiento })));
      const candidateNames = candRows.map((r) => r.nombre as string);
      const wardName = (tplResult.rows[0] as any)?.ward_name ?? null;

      res.json({
        service: {
          slug: svc.slug,
          serviceAt: svc.service_at,
          candidateNames,
          wardName,
          theme,
        },
      });
    } catch (err) {
      console.error("[GET /bautismo lobby]", err);
      res.status(500).json({ message: "Error interno" });
    }
  });

  // ── Program: slug ─────────────────────────────────────────────────────────
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

      const [itemsResult, postsResult, candPublicResult, candThemeResult, tplResult] = await Promise.all([
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
        // Public: only names
        db.execute(sql`
          SELECT mp.nombre
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${link.service_id} ORDER BY mp.nombre
        `),
        // Internal: for theme computation only (never forwarded to client)
        db.execute(sql`
          SELECT mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${link.service_id}
        `),
        db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
      ]);

      const candidates = (candPublicResult.rows as any[]).map((r) => ({ nombre: r.nombre as string }));
      const theme = computeTheme((candThemeResult.rows as any[]).map((r) => ({
        sexo: r.sexo as string | null,
        fechaNacimiento: r.fechaNacimiento as string | null,
      })));
      const expiresAt = link.expires_at ? new Date(link.expires_at) : null;
      const wardName = (tplResult.rows[0] as any)?.ward_name ?? null;

      const dto = toPublicServiceDTO({ items: itemsResult.rows as any[], approvedPosts: postsResult.rows as any[], expiresAt, candidates, serviceAt, wardName });
      res.json({ ...dto, theme });
    } catch (err) {
      console.error("[GET /bautismo/:slug]", err);
      res.status(500).json({ message: "Error interno" });
    }
  });

  // ── Posts ─────────────────────────────────────────────────────────────────
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
      if (now >= new Date(serviceAtPost.getTime() + 24 * 60 * 60 * 1000))
        return res.status(403).json({ error: "El programa no está disponible" });
    }

    const hash = ipHash(req);
    const now = new Date();
    const tenMinutes = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const oneDay    = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
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
