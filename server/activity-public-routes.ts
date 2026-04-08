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
  // ── OG tag injection for /actividades/:slug (social media crawlers) ──────────
  // This must be registered BEFORE the static catch-all in index-prod.ts
  app.get("/actividades/:slug", async (req, res, next) => {
    try {
      // Only available in production build (dist/public/index.html)
      const indexPath = path.resolve(process.cwd(), "dist/public/index.html");
      if (!fs.existsSync(indexPath)) return next();

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
      const url = `${req.protocol}://${req.get("host")}/actividades/${act.slug}`;

      let html = fs.readFileSync(indexPath, "utf-8");

      const ogTags = [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="Liahonaap" />`,
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(description)}" />`,
        `<meta property="og:url" content="${escapeHtml(url)}" />`,
        act.flyer_url ? `<meta property="og:image" content="${escapeHtml(act.flyer_url)}" />` : "",
        act.flyer_url ? `<meta property="og:image:width" content="1080" />` : "",
        act.flyer_url ? `<meta property="og:image:height" content="1080" />` : "",
        `<meta name="twitter:card" content="${act.flyer_url ? "summary_large_image" : "summary"}" />`,
        `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
        `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
        act.flyer_url ? `<meta name="twitter:image" content="${escapeHtml(act.flyer_url)}" />` : "",
      ].filter(Boolean).map(t => `    ${t}`).join("\n");

      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
      html = html.replace("</head>", `${ogTags}\n  </head>`);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      console.error("[og-inject] error:", err);
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
