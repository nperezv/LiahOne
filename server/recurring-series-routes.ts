/**
 * Recurring series routes — admin only.
 *
 * GET    /api/recurring-series              list all series
 * POST   /api/recurring-series              create a series
 * PATCH  /api/recurring-series/:id          update a series
 * DELETE /api/recurring-series/:id          delete series (keeps past instances)
 * GET    /api/recurring-series/:id/instances  all generated activity instances
 * POST   /api/recurring-series/:id/swap     swap org on two specific instance dates
 */

import type { Express, Request, Response, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";

const ADMIN_ROLES = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"];

function isAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "No autenticado" }); return false; }
  if (!ADMIN_ROLES.includes(user.role)) { res.status(403).json({ error: "Sin permiso" }); return false; }
  return true;
}

/** Returns all Fridays (day_of_week=5) from `from` through `to`, inclusive. */
export function getOccurrencesInRange(
  dayOfWeek: number,
  from: Date,
  to: Date,
): Date[] {
  const dates: Date[] = [];
  const cur = new Date(from);
  // Advance to first occurrence of dayOfWeek
  while (cur.getDay() !== dayOfWeek) {
    cur.setDate(cur.getDate() + 1);
  }
  while (cur <= to) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return dates;
}

/** Count occurrences of dayOfWeek between startDate (inclusive) and target (inclusive). */
export function countOccurrencesBetween(
  dayOfWeek: number,
  startDate: Date,
  target: Date,
): number {
  const from = new Date(startDate);
  // Normalise to midnight UTC
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(target);
  to.setUTCHours(0, 0, 0, 0);
  if (to < from) return 0;
  // Advance from to first dayOfWeek
  while (from.getUTCDay() !== dayOfWeek) {
    from.setUTCDate(from.getUTCDate() + 1);
  }
  if (from > to) return 0;
  return Math.floor((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function generateSlug(title: string, date: Date): string {
  const base = title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 35);
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${base}-${dateStr}-${rnd}`;
}

export function registerRecurringSeriesRoutes(app: Express, requireAuth: RequestHandler) {
  // ── GET /api/recurring-series ─────────────────────────────────────────────
  app.get("/api/recurring-series", requireAuth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      const rows = await db.execute(sql`
        SELECT rs.*,
          (SELECT COUNT(*) FROM activities a WHERE a.recurring_series_id = rs.id) AS instance_count
        FROM recurring_series rs
        ORDER BY rs.created_at DESC
      `);
      res.json(rows.rows);
    } catch (err) {
      console.error("[RecurringSeries] GET list error:", err);
      res.status(500).json({ error: "Error al listar series" });
    }
  });

  // ── POST /api/recurring-series ────────────────────────────────────────────
  app.post("/api/recurring-series", requireAuth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      const { title, description, location, dayOfWeek, timeOfDay, rotationOrgIds, rotationStartDate, notifyDaysBefore } = req.body;
      if (!title || !rotationStartDate || !Array.isArray(rotationOrgIds) || rotationOrgIds.length === 0) {
        return res.status(400).json({ error: "Faltan campos requeridos" });
      }
      const result = await db.execute(sql`
        INSERT INTO recurring_series
          (title, description, location, day_of_week, time_of_day, rotation_org_ids, rotation_start_date, notify_days_before)
        VALUES (
          ${title},
          ${description ?? null},
          ${location ?? null},
          ${dayOfWeek ?? 5},
          ${timeOfDay ?? "20:00"},
          ${JSON.stringify(rotationOrgIds)}::jsonb,
          ${rotationStartDate}::date,
          ${notifyDaysBefore ?? 14}
        )
        RETURNING *
      `);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("[RecurringSeries] POST error:", err);
      res.status(500).json({ error: "Error al crear serie" });
    }
  });

  // ── PATCH /api/recurring-series/:id ──────────────────────────────────────
  app.patch("/api/recurring-series/:id", requireAuth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      const { title, description, location, dayOfWeek, timeOfDay, rotationOrgIds, rotationStartDate, notifyDaysBefore, active } = req.body;
      const result = await db.execute(sql`
        UPDATE recurring_series SET
          title              = COALESCE(${title ?? null}, title),
          description        = COALESCE(${description ?? null}, description),
          location           = COALESCE(${location ?? null}, location),
          day_of_week        = COALESCE(${dayOfWeek ?? null}, day_of_week),
          time_of_day        = COALESCE(${timeOfDay ?? null}, time_of_day),
          rotation_org_ids   = COALESCE(${rotationOrgIds ? JSON.stringify(rotationOrgIds) : null}::jsonb, rotation_org_ids),
          rotation_start_date= COALESCE(${rotationStartDate ?? null}::date, rotation_start_date),
          notify_days_before = COALESCE(${notifyDaysBefore ?? null}, notify_days_before),
          active             = COALESCE(${active ?? null}, active)
        WHERE id = ${req.params.id}
        RETURNING *
      `);
      if (!result.rows.length) return res.status(404).json({ error: "Serie no encontrada" });
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[RecurringSeries] PATCH error:", err);
      res.status(500).json({ error: "Error al actualizar serie" });
    }
  });

  // ── DELETE /api/recurring-series/:id ─────────────────────────────────────
  app.delete("/api/recurring-series/:id", requireAuth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      // Detach future instances (keep past ones as historical record)
      const now = new Date().toISOString();
      await db.execute(sql`
        UPDATE activities
        SET recurring_series_id = NULL
        WHERE recurring_series_id = ${req.params.id}
          AND date > ${now}
      `);
      await db.execute(sql`DELETE FROM recurring_series WHERE id = ${req.params.id}`);
      res.json({ ok: true });
    } catch (err) {
      console.error("[RecurringSeries] DELETE error:", err);
      res.status(500).json({ error: "Error al eliminar serie" });
    }
  });

  // ── GET /api/recurring-series/:id/instances ───────────────────────────────
  app.get("/api/recurring-series/:id/instances", requireAuth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      const rows = await db.execute(sql`
        SELECT a.id, a.title, a.date, a.organization_id, a.approval_status,
               a.notified_rotation, a.slug, a.is_public,
               o.name AS organization_name
        FROM activities a
        LEFT JOIN organizations o ON o.id = a.organization_id
        WHERE a.recurring_series_id = ${req.params.id}
        ORDER BY a.date ASC
      `);
      res.json(rows.rows);
    } catch (err) {
      console.error("[RecurringSeries] GET instances error:", err);
      res.status(500).json({ error: "Error al obtener instancias" });
    }
  });

  // ── POST /api/recurring-series/:id/swap ───────────────────────────────────
  // Body: { activityIdA: string, activityIdB: string }
  app.post("/api/recurring-series/:id/swap", requireAuth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      const { activityIdA, activityIdB } = req.body;
      if (!activityIdA || !activityIdB) return res.status(400).json({ error: "Faltan IDs de actividades" });

      const rows = await db.execute(sql`
        SELECT id, organization_id FROM activities
        WHERE id IN (${activityIdA}, ${activityIdB})
          AND recurring_series_id = ${req.params.id}
      `);
      if (rows.rows.length !== 2) return res.status(404).json({ error: "Instancias no encontradas en esta serie" });

      const [a, b] = rows.rows as any[];
      await db.execute(sql`UPDATE activities SET organization_id = ${b.organization_id} WHERE id = ${a.id}`);
      await db.execute(sql`UPDATE activities SET organization_id = ${a.organization_id} WHERE id = ${b.id}`);

      res.json({ ok: true });
    } catch (err) {
      console.error("[RecurringSeries] SWAP error:", err);
      res.status(500).json({ error: "Error al intercambiar" });
    }
  });
}
