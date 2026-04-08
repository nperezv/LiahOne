/**
 * Public activity routes — no auth required.
 * Lobby: GET /actividades
 * Detail: GET /actividades/:slug
 * OG inject: GET /actividades/:slug (HTML, for social media crawlers)
 */
import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function registerActivityPublicRoutes(app: Express) {
  // ── OG helpers ───────────────────────────────────────────────────────────────
  function getIndexHtml(): string | null {
    const indexPath = path.resolve(process.cwd(), "dist/public/index.html");
    if (!fs.existsSync(indexPath)) return null;
    return fs.readFileSync(indexPath, "utf-8");
  }

  function absoluteUrl(req: any, maybeRelative: string | null | undefined): string {
    if (!maybeRelative) return "";
    if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
    return `${req.protocol}://${req.get("host")}${maybeRelative}`;
  }

  function buildOgHtml(baseHtml: string, opts: {
    title: string;
    description: string;
    url: string;
    imageUrl?: string;
  }): string {
    const { title, description, url, imageUrl } = opts;
    const tags = [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Liahonaap" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(url)}" />`,
      imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : "",
      imageUrl ? `<meta property="og:image:width" content="1080" />` : "",
      imageUrl ? `<meta property="og:image:height" content="1080" />` : "",
      `<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />`,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : "",
    ].filter(Boolean).map(t => `    ${t}`).join("\n");

    let html = baseHtml.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
    html = html.replace("</head>", `${tags}\n  </head>`);
    return html;
  }

  // ── GET /actividades — OG for the listing page (next upcoming activity) ──────
  app.get("/actividades", async (req, res, next) => {
    try {
      const baseHtml = getIndexHtml();
      if (!baseHtml) return next();

      // Use the next upcoming public activity for a richer preview
      const rows = await db.execute(sql`
        SELECT a.title, a.description, a.flyer_url, o.name AS organization_name
        FROM activities a
        LEFT JOIN organizations o ON o.id = a.organization_id
        WHERE a.approval_status = 'approved' AND a.is_public = true AND a.date >= NOW()
        ORDER BY a.date ASC
        LIMIT 1
      `);

      const act = rows.rows[0] as any;
      const title = act ? `${act.title} — Actividades` : "Actividades";
      const orgName = act?.organization_name ? ` · ${act.organization_name}` : "";
      const description = act?.description
        ? act.description.slice(0, 200)
        : `Próximas actividades${orgName}`;
      const imageUrl = absoluteUrl(req, act?.flyer_url);
      const url = `${req.protocol}://${req.get("host")}/actividades`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(buildOgHtml(baseHtml, { title, description, url, imageUrl: imageUrl || undefined }));
    } catch (err) {
      console.error("[og-inject /actividades] error:", err);
      next();
    }
  });

  // ── GET /actividades/:slug — OG for individual activity page ─────────────────
  app.get("/actividades/:slug", async (req, res, next) => {
    try {
      const baseHtml = getIndexHtml();
      if (!baseHtml) return next();

      const rows = await db.execute(sql`
        SELECT a.title, a.description, a.date, a.location, a.flyer_url, a.slug,
               o.name AS organization_name
        FROM activities a
        LEFT JOIN organizations o ON o.id = a.organization_id
        WHERE a.slug = ${req.params.slug}
          AND a.is_public = true
      `);
      if (!rows.rows.length) return next();

      const act = rows.rows[0] as any;
      const title = act.title ?? "Actividad";
      const orgName = act.organization_name ? ` · ${act.organization_name}` : "";
      const dateStr = act.date
        ? new Date(act.date).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        : "";
      const rawDesc = act.description
        ? act.description.slice(0, 200)
        : `${dateStr}${orgName}`.trim();
      const description = rawDesc || title;
      const imageUrl = absoluteUrl(req, act.flyer_url);
      const url = `${req.protocol}://${req.get("host")}/actividades/${act.slug}`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(buildOgHtml(baseHtml, { title, description, url, imageUrl: imageUrl || undefined }));
    } catch (err) {
      console.error("[og-inject /actividades/:slug] error:", err);
      next();
    }
  });

  // ── GET /api/actividades — upcoming approved public activities ──────────────
  app.get("/api/actividades", async (req, res) => {
    try {
      const past = req.query.past === "1";
      const [rows, tplResult] = await Promise.all([
        past
          ? db.execute(sql`
              SELECT
                a.id, a.title, a.description, a.date, a.location,
                a.flyer_url, a.slug, a.asistencia_esperada,
                o.name AS organization_name
              FROM activities a
              LEFT JOIN organizations o ON o.id = a.organization_id
              WHERE a.approval_status = 'approved'
                AND a.is_public = true
                AND a.date < NOW()
                AND a.slug IS NOT NULL
              ORDER BY a.date DESC
              LIMIT 50
            `)
          : db.execute(sql`
              SELECT
                a.id, a.title, a.description, a.date, a.location,
                a.flyer_url, a.slug, a.asistencia_esperada,
                o.name AS organization_name
              FROM activities a
              LEFT JOIN organizations o ON o.id = a.organization_id
              WHERE a.approval_status = 'approved'
                AND a.is_public = true
                AND a.date >= NOW()
                AND a.slug IS NOT NULL
              ORDER BY a.date ASC
              LIMIT 50
            `),
        db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
      ]);
      const wardName: string = (tplResult.rows[0] as any)?.ward_name ?? null;
      res.json({ activities: rows.rows, wardName });
    } catch (err) {
      console.error("[activity-public] GET list error:", err);
      res.status(500).json({ error: "Error al obtener actividades" });
    }
  });

  // ── GET /api/actividades/:slug — single activity detail ───────────────────
  app.get("/api/actividades/:slug", async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT
          a.id, a.title, a.description, a.date, a.location,
          a.flyer_url, a.slug, a.asistencia_esperada,
          a.objetivo, a.metas,
          o.name AS organization_name
        FROM activities a
        LEFT JOIN organizations o ON o.id = a.organization_id
        WHERE a.slug = ${req.params.slug}
          AND a.approval_status = 'approved'
          AND a.is_public = true
      `);

      if (!rows.rows.length) return res.status(404).json({ error: "Actividad no encontrada" });
      res.json(rows.rows[0]);
    } catch (err) {
      console.error("[activity-public] GET detail error:", err);
      res.status(500).json({ error: "Error al obtener actividad" });
    }
  });
}
