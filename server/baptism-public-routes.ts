/**
 * Public baptism program routes — no auth required.
 * All queries use raw SQL (baptism tables have no Drizzle schema objects).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Express, Request } from "express";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { isRateLimited, normalizeDisplayName, containsBlockedUrl } from "./mission-baptism-public-rules";
import { toPublicServiceDTO } from "./mission-baptism-public-dto";
import { sendPushToMultipleUsers } from "./push-service";

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
  if (candidates.length === 0) return "nino";

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

async function getLeaderUserIds(): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT u.id FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id
    WHERE u.role IN ('obispo','consejero_obispo','secretario','secretario_ejecutivo','mission_leader')
       OR (u.role = 'presidente_organizacion' AND o.type IN ('cuorum_elderes','sociedad_socorro'))
  `);
  return (rows.rows as any[]).map((r) => r.id as string);
}

const publicPostSchema = z.object({
  code: z.string().min(1).optional().or(z.literal("")),
  displayName: z.string().max(40).optional().or(z.literal("")),
  message: z.string().min(1).max(240).refine((v) => !containsBlockedUrl(v), "message must not contain urls"),
  clientRequestId: z.string().min(3),
  company: z.string().optional(),
  recipientPersonaId: z.string().optional().nullable(),
});

// ── Theme → image mapping (must match client THEME_CONFIG) ───────────────────

const THEME_IMAGES: Record<BaptismTheme, string> = {
  nino:         "/covenantspathboy.png",
  nina:         "/covenantspathgirl.png",
  joven_varon:  "/covenanthspathhim.png",
  joven_mujer:  "/covenantspathher.png",
  adulto:       "/covenantspath.png",
  adulta:       "/theshepherd.png",
  multi_kids:   "/covenantspathkids.png",
  multi_family: "/covenantspathfamily.png",
  multi_adults: "/covenantspath.png",
  fallback:     "/theshepherd.png",
};

// ── OG image generator (1080×1350 portrait) ──────────────────────────────────

function resolvePublicImage(filename: string): Buffer | null {
  for (const base of ["dist/public", "client/public"]) {
    const p = path.resolve(process.cwd(), base, filename.replace(/^\//, ""));
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
}

async function generateBaptismOgImage(theme: BaptismTheme, flyerUrl?: string | null): Promise<Buffer> {
  // Activity flyer takes priority over theme image
  const uploadBuf = flyerUrl ? resolveUpload(flyerUrl) : null;
  const imageBuf = uploadBuf ?? resolvePublicImage(THEME_IMAGES[theme].replace(/^\//, ""));
  if (imageBuf) {
    return sharp(imageBuf).resize(1080, 1350, { fit: "cover", position: "centre" }).png().toBuffer();
  }
  return sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 10, g: 16, b: 36 } } }).png().toBuffer();
}

function resolveUpload(urlPath: string): Buffer | null {
  const p = path.resolve(process.cwd(), urlPath.replace(/^\//, ""));
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

// ── OG helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isSocialCrawler(ua: string): boolean {
  const l = ua.toLowerCase();
  return ["whatsapp", "facebookexternalhit", "twitterbot", "linkedinbot",
          "slackbot", "telegrambot", "discordbot", "applebot", "ia_archiver"].some(s => l.includes(s));
}

function getProto(req: Request): string {
  return ((req as any).get("x-forwarded-proto") as string | undefined)?.split(",")[0]?.trim() || req.protocol;
}
function absoluteUrl(req: Request, rel: string): string {
  if (/^https?:\/\//i.test(rel)) return rel;
  return `${getProto(req)}://${req.get("host")}${rel}`;
}

function buildCrawlerHtml(opts: {
  title: string; description: string; url: string;
  imageUrl?: string; imageWidth?: string; imageHeight?: string;
}): string {
  const { title, description, url, imageUrl, imageWidth = "1080", imageHeight = "1350" } = opts;
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Zendapp">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:url" content="${e(url)}">
${imageUrl ? `<meta property="og:image" content="${e(imageUrl)}">
<meta property="og:image:width" content="${imageWidth}">
<meta property="og:image:height" content="${imageHeight}">` : ""}
<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(description)}">
${imageUrl ? `<meta name="twitter:image" content="${e(imageUrl)}">` : ""}
<title>${e(title)}</title>
</head>
<body></body>
</html>`;
}

function baptismDateStr(serviceAt: string | Date | null): string {
  if (!serviceAt) return "";
  return new Date(serviceAt).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerBaptismPublicRoutes(app: Express) {

  // ── GET /og/bautismo/:slug — dynamic OG image (1200×630 PNG) ─────────────
  app.get("/og/bautismo/:slug", async (req: Request, res) => {
    try {
      const linkResult = await db.execute(sql`
        SELECT id, service_id FROM baptism_public_links
        WHERE slug = ${req.params.slug} AND revoked_at IS NULL
        ORDER BY published_at DESC LIMIT 1
      `);
      const link = linkResult.rows[0] as any;
      if (!link) return res.status(404).end();

      const svcRow = await db.execute(sql`
        SELECT service_at, candidate_meta FROM baptism_services WHERE id = ${link.service_id}
      `);
      const svc = svcRow.rows[0] as any;
      if (!svc) return res.status(404).end();

      const [candResult, nameItemsResult, tplResult] = await Promise.all([
        db.execute(sql`
          SELECT mp.nombre, mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${link.service_id}
        `),
        db.execute(sql`
          SELECT participant_display_name FROM baptism_program_items
          WHERE service_id = ${link.service_id} AND type = 'candidato_nombre'
        `),
        db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
      ]);

      const missionCands = candResult.rows as any[];
      const names = missionCands.map(r => r.nombre as string);
      if (names.length === 0)
        (nameItemsResult.rows as any[]).forEach(r => { if (r.participant_display_name) names.push(r.participant_display_name as string); });

      let themeCandidates = missionCands.map(r => ({ sexo: r.sexo ?? null, fechaNacimiento: r.fechaNacimiento ?? null }));
      if (themeCandidates.length === 0) {
        const meta: any[] = Array.isArray(svc.candidate_meta) ? svc.candidate_meta : [];
        if (meta.length > 0)
          themeCandidates = meta.map((m: any) => ({ sexo: m.sexo ?? null, fechaNacimiento: m.fechaNacimiento ?? null }));
      }
      const theme = computeTheme(themeCandidates);

      // Prefer the activity flyer if one exists for this service
      const actRow = await db.execute(sql`
        SELECT flyer_url FROM activities
        WHERE baptism_service_id = ${link.service_id}
           OR (section_data->>'baptism_service_ref') = ${link.service_id}
        LIMIT 1
      `);
      const flyerUrl: string | null = (actRow.rows[0] as any)?.flyer_url ?? null;

      const png = await generateBaptismOgImage(theme, flyerUrl);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(png);
    } catch (err) {
      console.error("[og-image /og/bautismo/:slug]", err);
      res.status(500).end();
    }
  });

  // ── GET /bautismo — OG inject for lobby (today's service) ─────────────────
  app.get("/bautismo", async (req: Request, res, next) => {
    try {
      if (!isSocialCrawler(req.get("user-agent") ?? "")) return next();

      const now = new Date();
      const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd   = new Date(now); todayEnd.setUTCHours(23, 59, 59, 999);

      const svcResult = await db.execute(sql`
        SELECT bs.id, bs.service_at, bs.candidate_meta, bpl.slug, t.ward_name
        FROM baptism_services bs
        JOIN baptism_public_links bpl ON bpl.service_id = bs.id
        LEFT JOIN pdf_templates t ON true
        WHERE bs.approval_status = 'approved'
          AND bs.service_at >= ${todayStart.toISOString()}
          AND bs.service_at <= ${todayEnd.toISOString()}
          AND bpl.revoked_at IS NULL
          AND bpl.expires_at > ${now.toISOString()}
        ORDER BY bpl.published_at DESC, bs.service_at ASC
        LIMIT 1
      `);

      const svc = svcResult.rows[0] as any;
      const wardName: string = svc?.ward_name ?? "Zendapp";

      let title = "Programa Bautismal";
      let description = wardName;
      let imageUrl = absoluteUrl(req, THEME_IMAGES.multi_family);

      if (svc) {
        const candResult = await db.execute(sql`
          SELECT mp.nombre FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${svc.id}
        `);
        const nameItems = await db.execute(sql`
          SELECT participant_display_name FROM baptism_program_items
          WHERE service_id = ${svc.id} AND type = 'candidato_nombre'
        `);
        const names = (candResult.rows as any[]).map(r => r.nombre as string);
        if (names.length === 0) {
          (nameItems.rows as any[]).forEach(r => { if (r.participant_display_name) names.push(r.participant_display_name); });
        }

        const candidateMeta: any[] = Array.isArray(svc.candidate_meta) ? svc.candidate_meta : [];
        const missionCandRows = (await db.execute(sql`
          SELECT mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${svc.id}
        `)).rows as any[];
        let themeCandidates = missionCandRows.map(r => ({ sexo: r.sexo ?? null, fechaNacimiento: r.fechaNacimiento ?? null }));
        if (themeCandidates.length === 0 && candidateMeta.length > 0)
          themeCandidates = candidateMeta.map((m: any) => ({ sexo: m.sexo ?? null, fechaNacimiento: m.fechaNacimiento ?? null }));
        const theme = computeTheme(themeCandidates);

        const dateStr = baptismDateStr(svc.service_at);
        title = names.length > 0 ? `Bautismo de ${names.join(" y ")}` : "Programa Bautismal";
        description = [dateStr, wardName].filter(Boolean).join(" · ");
        imageUrl = absoluteUrl(req, THEME_IMAGES[theme]);
      }

      const url = `${getProto(req)}://${req.get("host")}/bautismo`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(buildCrawlerHtml({ title, description, url, imageUrl }));
    } catch (err) {
      console.error("[og-inject /bautismo]", err);
      next();
    }
  });

  // ── GET /bautismo/:slug — OG inject for individual baptism program ─────────
  app.get("/bautismo/:slug", async (req: Request, res, next) => {
    try {
      if (!isSocialCrawler(req.get("user-agent") ?? "")) return next();

      const linkResult = await db.execute(sql`
        SELECT id, service_id FROM baptism_public_links
        WHERE slug = ${req.params.slug} AND revoked_at IS NULL
        ORDER BY published_at DESC LIMIT 1
      `);
      const link = linkResult.rows[0] as any;
      if (!link) return next();

      const svcRow = await db.execute(sql`
        SELECT approval_status, service_at, candidate_meta FROM baptism_services WHERE id = ${link.service_id}
      `);
      const svc = svcRow.rows[0] as any;
      if (!svc || svc.approval_status !== "approved") return next();

      const [candResult, nameItemsResult, tplResult] = await Promise.all([
        db.execute(sql`
          SELECT mp.nombre, mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${link.service_id}
        `),
        db.execute(sql`
          SELECT participant_display_name FROM baptism_program_items
          WHERE service_id = ${link.service_id} AND type = 'candidato_nombre'
        `),
        db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
      ]);

      const missionCands = candResult.rows as any[];
      const names = missionCands.map(r => r.nombre as string);
      if (names.length === 0)
        (nameItemsResult.rows as any[]).forEach(r => { if (r.participant_display_name) names.push(r.participant_display_name); });

      let themeCandidates = missionCands.map(r => ({ sexo: r.sexo ?? null, fechaNacimiento: r.fechaNacimiento ?? null }));
      if (themeCandidates.length === 0) {
        const meta: any[] = Array.isArray(svc.candidate_meta) ? svc.candidate_meta : [];
        if (meta.length > 0)
          themeCandidates = meta.map((m: any) => ({ sexo: m.sexo ?? null, fechaNacimiento: m.fechaNacimiento ?? null }));
      }
      const theme = computeTheme(themeCandidates);
      const wardName: string = (tplResult.rows[0] as any)?.ward_name ?? "Zendapp";
      const dateStr = baptismDateStr(svc.service_at);

      const title = names.length > 0 ? `Bautismo de ${names.join(" y ")}` : "Programa Bautismal";
      const description = [dateStr, wardName].filter(Boolean).join(" · ");
      const imageUrl = `${getProto(req)}://${req.get("host")}/og/bautismo/${req.params.slug}`;
      const url = `${getProto(req)}://${req.get("host")}/bautismo/${req.params.slug}`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(buildCrawlerHtml({ title, description, url, imageUrl }));
    } catch (err) {
      console.error("[og-inject /bautismo/:slug]", err);
      next();
    }
  });

  // ── Startup cleanup: remove stale/duplicate public links ──────────────────
  // Runs once at boot. Deletes:
  //   1. Expired links (expires_at already passed)
  //   2. Duplicate links for the same unit+day — keeps only the most recently published one
  void (async () => {
    try {
      // 1. Expired links
      await db.execute(sql`
        DELETE FROM baptism_public_links WHERE expires_at <= NOW()
      `);

      // 2. Duplicates per unit+day — keep the row with MAX(published_at)
      await db.execute(sql`
        DELETE FROM baptism_public_links
        WHERE id IN (
          SELECT bpl.id
          FROM baptism_public_links bpl
          JOIN baptism_services bs ON bs.id = bpl.service_id
          WHERE bpl.revoked_at IS NULL
            AND bpl.id NOT IN (
              SELECT DISTINCT ON (bs2.unit_id, date_trunc('day', bs2.service_at))
                bpl2.id
              FROM baptism_public_links bpl2
              JOIN baptism_services bs2 ON bs2.id = bpl2.service_id
              WHERE bpl2.revoked_at IS NULL
              ORDER BY bs2.unit_id, date_trunc('day', bs2.service_at), bpl2.published_at DESC
            )
        )
      `);
    } catch (e) {
      console.error("[baptism-public-routes] startup cleanup error:", e);
    }
  })();

  // ── Lobby: today's active service ─────────────────────────────────────────
  app.get("/api/bautismo", async (_req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      // Find an approved service whose service_at is today.
      // Order by published_at DESC so the most recently published link wins
      // when multiple services exist for the same day.
      const svcResult = await db.execute(sql`
        SELECT bs.id, bs.service_at, bpl.slug
        FROM baptism_services bs
        JOIN baptism_public_links bpl ON bpl.service_id = bs.id
        WHERE bs.approval_status = 'approved'
          AND bs.service_at >= ${todayStart.toISOString()}
          AND bs.service_at <= ${todayEnd.toISOString()}
          AND bpl.revoked_at IS NULL
          AND bpl.expires_at > ${now.toISOString()}
        ORDER BY bpl.published_at DESC, bs.service_at ASC
        LIMIT 1
      `);

      const svc = svcResult.rows[0] as any;
      if (!svc) return res.json({ service: null });

      const [candResult, tplResult] = await Promise.all([
        db.execute(sql`
          SELECT mp.id AS persona_id, mp.nombre, mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${svc.id} ORDER BY mp.nombre
        `),
        db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
      ]);

      const candRows = candResult.rows as any[];
      let themeCandidates = candRows.map((r) => ({ sexo: r.sexo as string | null, fechaNacimiento: r.fechaNacimiento as string | null }));
      if (themeCandidates.length === 0) {
        // niño inscrito: no mission_personas — use candidate_meta stored on the service
        const metaRow = await db.execute(sql`SELECT candidate_meta FROM baptism_services WHERE id = ${svc.id}`);
        const meta = (metaRow.rows[0] as any)?.candidate_meta;
        if (Array.isArray(meta) && meta.length > 0)
          themeCandidates = meta.map((m: any) => ({ sexo: m.sexo ?? null, fechaNacimiento: m.fechaNacimiento ?? null }));
      }
      const theme = computeTheme(themeCandidates);
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

      const svcRow = await db.execute(sql`SELECT approval_status, service_at, candidate_meta FROM baptism_services WHERE id = ${link.service_id}`);
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
        // Public: names from mission_personas (converso) or program_items candidato_nombre (niño inscrito)
        db.execute(sql`
          SELECT mp.id AS persona_id, mp.nombre
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${link.service_id}
          ORDER BY mp.nombre
        `),
        // Internal: for theme computation (converso only)
        db.execute(sql`
          SELECT mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${link.service_id}
        `),
        db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
      ]);

      // For niño inscrito (no mission_personas), fall back to candidato_nombre program items
      let candidates = (candPublicResult.rows as any[]).map((r) => ({ nombre: r.nombre as string, personaId: r.persona_id as string }));
      if (candidates.length === 0) {
        const nameItems = (itemsResult.rows as any[]).filter((r) => r.type === "candidato_nombre");
        candidates = nameItems.map((r) => ({ nombre: r.title as string, personaId: "" }));
      }
      let slugThemeCandidates = (candThemeResult.rows as any[]).map((r) => ({
        sexo: r.sexo as string | null,
        fechaNacimiento: r.fechaNacimiento as string | null,
      }));
      if (slugThemeCandidates.length === 0) {
        // niño inscrito: use candidate_meta stored on the service
        const meta = svc?.candidate_meta;
        if (Array.isArray(meta) && meta.length > 0)
          slugThemeCandidates = meta.map((m: any) => ({ sexo: m.sexo ?? null, fechaNacimiento: m.fechaNacimiento ?? null }));
      }
      const theme = computeTheme(slugThemeCandidates);
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

    const recipientId = parsed.data.recipientPersonaId || null;
    const row = await db.execute(sql`
      INSERT INTO baptism_public_posts (public_link_id, display_name, message, client_request_id, ip_hash, status, recipient_persona_id)
      VALUES (${link.id}, ${normalizeDisplayName(parsed.data.displayName)}, ${parsed.data.message}, ${parsed.data.clientRequestId}, ${hash}, 'pending', ${recipientId})
      RETURNING *
    `);

    // Push notification to leaders
    getLeaderUserIds().then((leaderIds) => {
      if (!leaderIds.length) return;
      const candResult = db.execute(sql`
        SELECT mp.nombre FROM baptism_service_candidates bsc
        JOIN mission_personas mp ON mp.id = bsc.persona_id
        WHERE bsc.service_id = ${link.service_id} ORDER BY mp.nombre
      `);
      candResult.then((cr) => {
        const names = (cr.rows as any[]).map((r) => r.nombre).join(", ");
        sendPushToMultipleUsers(leaderIds, {
          title: "Felicitación pendiente de aprobación",
          body: `Nueva felicitación para el bautismo de ${names || "un candidato"}`,
          url: "/mission-work",
        }).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});

    res.status(201).json(row.rows[0]);
  });
}
