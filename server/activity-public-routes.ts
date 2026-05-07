/**
 * Public activity routes — no auth required.
 * Lobby: GET /actividades
 * Detail: GET /actividades/:slug
 * OG inject: GET /actividades/:slug (HTML, for social media crawlers)
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
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

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function splitTitle(title: string, maxChars: number): [string, string] {
  if (title.length <= maxChars) return [title, ""];
  const words = title.split(" ");
  let line1 = "";
  for (let i = 0; i < words.length; i++) {
    const candidate = line1 ? `${line1} ${words[i]}` : words[i];
    if (candidate.length <= maxChars) { line1 = candidate; }
    else {
      const rest = words.slice(i).join(" ");
      return [line1 || truncate(words[i], maxChars), truncate(rest, maxChars)];
    }
  }
  return [line1, ""];
}

function resolveUpload(urlPath: string | null): Buffer | null {
  if (!urlPath) return null;
  const p = path.resolve(process.cwd(), urlPath.replace(/^\//, ""));
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

async function generateActivityOgImage(act: {
  title: string;
  date: string | null;
  location: string | null;
  organizationName: string | null;
  flyerUrl: string | null;
}): Promise<Buffer> {
  const flyerBuf = resolveUpload(act.flyerUrl);

  const W = 1200, H = 630;

  // With flyer: blurred background + full flyer centered + date overlay
  if (flyerBuf) {
    const dateStr = act.date
      ? new Date(act.date).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      : "";
    const timeStr = act.date
      ? new Date(act.date).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
      : "";
    const dateLine = [dateStr, timeStr ? `${timeStr} hrs` : ""].filter(Boolean).join(" · ");
    const locLine  = act.location ? truncate(act.location, 50) : "";
    const hasLoc   = !!locLine;
    const dateY    = hasLoc ? 558 : 590;
    const locY     = dateY + 52;

    // 1. Blurred background: flyer stretched + blurred + darkened
    const bgBuf = await sharp(flyerBuf)
      .resize(W, H, { fit: "cover", position: "centre" })
      .blur(22)
      .modulate({ brightness: 0.45 })
      .png()
      .toBuffer();

    // 2. Foreground: flyer scaled to full height, preserving ratio
    const meta = await sharp(flyerBuf).metadata();
    const fgH = H;
    const fgW = Math.min(W, Math.round(fgH * ((meta.width ?? H) / (meta.height ?? W))));
    const fgX = Math.floor((W - fgW) / 2);
    const fgBuf = await sharp(flyerBuf).resize(fgW, fgH, { fit: "fill" }).png().toBuffer();

    // 3. Gradient + text overlay
    const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
      <stop offset="55%"  stop-color="#000000" stop-opacity="0.68"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect x="0" y="370" width="${W}" height="260" fill="url(#fade)"/>
  ${dateLine ? `<text x="${W / 2}" y="${dateY}" font-family="Arial,sans-serif" font-size="28" fill="rgba(255,255,255,0.92)" text-anchor="middle">${escapeHtml(dateLine)}</text>` : ""}
  ${hasLoc   ? `<text x="${W / 2}" y="${locY}"  font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.72)" text-anchor="middle">${escapeHtml(locLine)}</text>` : ""}
</svg>`;

    return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
      .composite([
        { input: bgBuf,                  top: 0,   left: 0    },
        { input: fgBuf,                  top: 0,   left: fgX  },
        { input: Buffer.from(overlaySvg), top: 0,  left: 0    },
      ])
      .png()
      .toBuffer();
  }

  // No flyer: landscape dark card with centered text
  const dateStr = act.date
    ? new Date(act.date).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : "";
  const timeStr = act.date
    ? new Date(act.date).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
    : "";
  const dateLine = [dateStr, timeStr ? `${timeStr} hrs` : ""].filter(Boolean).join(" · ");
  const [t1, t2] = splitTitle(act.title || "Actividad", 30);

  const t1Y  = t2 ? 232 : 268;
  const t2Y  = t1Y + 62;
  const dateY = (t2 ? t2Y : t1Y) + 74;
  const locY  = dateY + 52;
  const orgY  = locY + 42;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0c1020"/>
      <stop offset="100%" stop-color="#1a1538"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="${W / 2}" y="${t1Y}" font-family="Georgia,serif" font-size="52" font-weight="bold" fill="white" text-anchor="middle">${escapeHtml(t1)}</text>
  ${t2 ? `<text x="${W / 2}" y="${t2Y}" font-family="Georgia,serif" font-size="52" font-weight="bold" fill="white" text-anchor="middle">${escapeHtml(t2)}</text>` : ""}
  ${dateLine ? `<text x="${W / 2}" y="${dateY}" font-family="Arial,sans-serif" font-size="28" fill="rgba(255,255,255,0.85)" text-anchor="middle">${escapeHtml(dateLine)}</text>` : ""}
  ${act.location ? `<text x="${W / 2}" y="${locY}" font-family="Arial,sans-serif" font-size="24" fill="rgba(255,255,255,0.68)" text-anchor="middle">${escapeHtml(truncate(act.location, 50))}</text>` : ""}
  ${act.organizationName ? `<text x="${W / 2}" y="${orgY}" font-family="Arial,sans-serif" font-size="20" fill="rgba(200,170,255,0.6)" text-anchor="middle">${escapeHtml(act.organizationName)}</text>` : ""}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function isSocialCrawler(ua: string): boolean {
  const l = ua.toLowerCase();
  return ["whatsapp", "facebookexternalhit", "twitterbot", "linkedinbot",
          "slackbot", "telegrambot", "discordbot", "applebot", "ia_archiver"].some(s => l.includes(s));
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

export function registerActivityPublicRoutes(app: Express) {
  function getProto(req: any): string {
    return (req.get("x-forwarded-proto") as string | undefined)?.split(",")[0]?.trim() || req.protocol;
  }
  function absoluteUrl(req: any, maybeRelative: string | null | undefined): string {
    if (!maybeRelative) return "";
    if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
    return `${getProto(req)}://${req.get("host")}${maybeRelative}`;
  }

  // kept for the lobby route (no-flyer fallback)
  function getIndexHtml(): string | null {
    const p = path.resolve(process.cwd(), "dist/public/index.html");
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf-8");
  }

  function buildOgHtml(baseHtml: string, opts: {
    title: string; description: string; url: string; imageUrl?: string;
  }): string {
    const { title, description, url, imageUrl } = opts;
    const tags = [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Zendapp" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(url)}" />`,
      imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : "",
      imageUrl ? `<meta property="og:image:width" content="1080" />` : "",
      imageUrl ? `<meta property="og:image:height" content="1350" />` : "",
      `<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />`,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : "",
    ].filter(Boolean).map(t => `    ${t}`).join("\n");
    let html = baseHtml
      .replace(/<meta\s+property="og:[^"]*"[^>]*\/?>/gi, "")
      .replace(/<meta\s+name="twitter:[^"]*"[^>]*\/?>/gi, "");
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
    html = html.replace("</head>", `${tags}\n  </head>`);
    return html;
  }

  // ── GET /og/actividades/:slug — dynamic OG image (1200×630 PNG) ─────────────
  app.get("/og/actividades/:slug", async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT a.title, a.date, a.location, a.flyer_url, o.name AS organization_name
        FROM activities a
        LEFT JOIN organizations o ON o.id = a.organization_id
        WHERE a.slug = ${req.params.slug} AND a.is_public = true
      `);
      if (!rows.rows.length) return res.status(404).end();

      const act = rows.rows[0] as any;
      const png = await generateActivityOgImage({
        title: act.title ?? "Actividad",
        date: act.date ?? null,
        location: act.location ?? null,
        organizationName: act.organization_name ?? null,
        flyerUrl: act.flyer_url ?? null,
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(png);
    } catch (err) {
      console.error("[og-image /og/actividades/:slug]", err);
      res.status(500).end();
    }
  });

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
      // Real users get the SPA; only crawlers need OG HTML
      if (!isSocialCrawler(req.get("user-agent") ?? "")) return next();

      const rows = await db.execute(sql`
        SELECT a.title, a.date, a.location, a.flyer_url, a.slug,
               o.name AS organization_name
        FROM activities a
        LEFT JOIN organizations o ON o.id = a.organization_id
        WHERE a.slug = ${req.params.slug}
          AND a.is_public = true
      `);
      if (!rows.rows.length) return next();

      const act = rows.rows[0] as any;
      const title = act.title ?? "Actividad";
      const dateStr = act.date
        ? new Date(act.date).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        : "";
      const timeStr = act.date
        ? new Date(act.date).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
        : "";
      const parts = [dateStr, timeStr ? `${timeStr} hrs` : "", act.location ?? ""].filter(Boolean);
      const description = parts.length > 0 ? parts.join(" · ") : title;
      const imageUrl = act.flyer_url
        ? absoluteUrl(req, act.flyer_url)
        : `${getProto(req)}://${req.get("host")}/og/actividades/${act.slug}`;
      const url = `${getProto(req)}://${req.get("host")}/actividades/${act.slug}`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(buildCrawlerHtml({ title, description, url, imageUrl }));
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
