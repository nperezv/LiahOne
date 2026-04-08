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
import { storage } from "./storage";

const ADMIN_ROLES = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"];

function isAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "No autenticado" }); return false; }
  if (!ADMIN_ROLES.includes(user.role)) { res.status(403).json({ error: "Sin permiso" }); return false; }
  return true;
}

// ── Occurrence helpers ────────────────────────────────────────────────────────

/** Returns all weekly occurrences of dayOfWeek from `from` through `to`, inclusive. */
export function getOccurrencesInRange(dayOfWeek: number, from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const cur = new Date(from);
  while (cur.getUTCDay() !== dayOfWeek) cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur <= to) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return dates;
}

/** Returns the nth occurrence of dayOfWeek in the given UTC year/month (n is 1-based). */
export function getNthWeekdayOfMonthUTC(year: number, month: number, dayOfWeek: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const daysUntil = (dayOfWeek - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + daysUntil + (n - 1) * 7));
}

/** Which nth weekday (1-based) of its UTC month is this date? */
export function getWeekdayOccurrenceInMonthUTC(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const dayOfWeek = date.getUTCDay();
  let count = 0;
  const cur = new Date(Date.UTC(year, month, 1));
  while (cur.getUTCDate() <= date.getUTCDate()) {
    if (cur.getUTCDay() === dayOfWeek) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/** Returns monthly occurrences (same nth weekday each month) from `from` through `to`. */
export function getMonthlyOccurrencesInRange(
  dayOfWeek: number, weekOfMonth: number, from: Date, to: Date,
): Date[] {
  const dates: Date[] = [];
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();
  // Start from the month before from in case the occurrence is still within range
  const toYear = to.getUTCFullYear();
  const toMonth = to.getUTCMonth();
  while (year < toYear || (year === toYear && month <= toMonth)) {
    const d = getNthWeekdayOfMonthUTC(year, month, dayOfWeek, weekOfMonth);
    if (d >= from && d <= to) dates.push(d);
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return dates;
}

/** Returns quarterly occurrences (every 3 months from seriesStart) from `from` through `to`. */
export function getQuarterlyOccurrencesInRange(
  dayOfWeek: number, weekOfMonth: number, seriesStart: Date, from: Date, to: Date,
): Date[] {
  const dates: Date[] = [];
  let year = seriesStart.getUTCFullYear();
  let month = seriesStart.getUTCMonth();
  // Walk forward 3 months at a time until past `to`
  while (true) {
    const d = getNthWeekdayOfMonthUTC(year, month, dayOfWeek, weekOfMonth);
    if (d > to) break;
    if (d >= from) dates.push(d);
    month += 3;
    if (month > 11) { month -= 12; year++; }
    if (year > to.getUTCFullYear() + 1) break; // safety
  }
  return dates;
}

/** Count occurrences of dayOfWeek between startDate (inclusive) and target (inclusive). Weekly. */
export function countOccurrencesBetween(dayOfWeek: number, startDate: Date, target: Date): number {
  const from = new Date(startDate);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(target);
  to.setUTCHours(0, 0, 0, 0);
  if (to < from) return 0;
  while (from.getUTCDay() !== dayOfWeek) from.setUTCDate(from.getUTCDate() + 1);
  if (from > to) return 0;
  return Math.floor((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

/** Count monthly occurrences between seriesStart and target (same nth weekday). */
export function countMonthlyOccurrencesBetween(
  dayOfWeek: number, weekOfMonth: number, seriesStart: Date, target: Date,
): number {
  let count = 0;
  let year = seriesStart.getUTCFullYear();
  let month = seriesStart.getUTCMonth();
  const targetMidnight = new Date(target); targetMidnight.setUTCHours(0, 0, 0, 0);
  while (true) {
    const d = getNthWeekdayOfMonthUTC(year, month, dayOfWeek, weekOfMonth);
    d.setUTCHours(0, 0, 0, 0);
    if (d > targetMidnight) break;
    count++;
    month++;
    if (month > 11) { month = 0; year++; }
    if (year > targetMidnight.getUTCFullYear() + 1) break;
  }
  return count;
}

/** Count quarterly occurrences between seriesStart and target. */
export function countQuarterlyOccurrencesBetween(
  dayOfWeek: number, weekOfMonth: number, seriesStart: Date, target: Date,
): number {
  let count = 0;
  let year = seriesStart.getUTCFullYear();
  let month = seriesStart.getUTCMonth();
  const targetMidnight = new Date(target); targetMidnight.setUTCHours(0, 0, 0, 0);
  while (true) {
    const d = getNthWeekdayOfMonthUTC(year, month, dayOfWeek, weekOfMonth);
    d.setUTCHours(0, 0, 0, 0);
    if (d > targetMidnight) break;
    count++;
    month += 3;
    if (month > 11) { month -= 12; year++; }
    if (year > targetMidnight.getUTCFullYear() + 1) break;
  }
  return count;
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
      const { title, description, location, dayOfWeek, timeOfDay, frequency, rotationOrgIds, rotationStartDate, rotationEndDate, notifyDaysBefore, activityType, isPublic } = req.body;
      if (!title || !rotationStartDate || !Array.isArray(rotationOrgIds) || rotationOrgIds.length === 0) {
        return res.status(400).json({ error: "Faltan campos requeridos" });
      }
      const result = await db.execute(sql`
        INSERT INTO recurring_series
          (title, description, location, day_of_week, time_of_day, frequency, rotation_org_ids, rotation_start_date, end_date, notify_days_before, activity_type, is_public)
        VALUES (
          ${title},
          ${description ?? null},
          ${location ?? null},
          ${dayOfWeek ?? 5},
          ${timeOfDay ?? "20:00"},
          ${frequency ?? "weekly"},
          ${JSON.stringify(rotationOrgIds)}::jsonb,
          ${rotationStartDate}::date,
          ${rotationEndDate || null}::date,
          ${notifyDaysBefore ?? 14},
          ${activityType ?? "actividad_org"},
          ${isPublic ?? false}
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
      const { title, description, location, dayOfWeek, timeOfDay, frequency, rotationOrgIds, rotationStartDate, rotationEndDate, notifyDaysBefore, active, activityType, isPublic } = req.body;
      const result = await db.execute(sql`
        UPDATE recurring_series SET
          title              = COALESCE(${title ?? null}, title),
          description        = COALESCE(${description ?? null}, description),
          location           = COALESCE(${location ?? null}, location),
          day_of_week        = COALESCE(${dayOfWeek ?? null}, day_of_week),
          time_of_day        = COALESCE(${timeOfDay ?? null}, time_of_day),
          frequency          = COALESCE(${frequency ?? null}, frequency),
          rotation_org_ids   = COALESCE(${rotationOrgIds ? JSON.stringify(rotationOrgIds) : null}::jsonb, rotation_org_ids),
          rotation_start_date= COALESCE(${rotationStartDate ?? null}::date, rotation_start_date),
          end_date           = ${rotationEndDate !== undefined ? (rotationEndDate || null) : null}::date,
          notify_days_before = COALESCE(${notifyDaysBefore ?? null}, notify_days_before),
          active             = COALESCE(${active ?? null}, active),
          activity_type      = COALESCE(${activityType ?? null}, activity_type),
          is_public          = COALESCE(${isPublic ?? null}, is_public)
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

  // ── POST /api/recurring-series/:id/generate-now ───────────────────────────
  // Immediately generate next 8 weeks of instances for this series.
  app.post("/api/recurring-series/:id/generate-now", requireAuth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
      const seriesResult = await db.execute(sql`
        SELECT * FROM recurring_series WHERE id = ${req.params.id} AND active = true
      `);
      if (!seriesResult.rows.length) return res.status(404).json({ error: "Serie no encontrada o inactiva" });
      const series = seriesResult.rows[0] as any;

      const systemUser = await db.execute(sql`SELECT id FROM users WHERE role = 'obispo' LIMIT 1`);
      const systemUserId = (systemUser.rows[0] as any)?.id;
      if (!systemUserId) return res.status(500).json({ error: "No se encontró un usuario obispo para crear instancias" });

      const orgIds: string[] = series.rotation_org_ids ?? [];
      if (!orgIds.length) return res.status(400).json({ error: "La serie no tiene organizaciones en rotación" });

      const now = new Date();
      const freq: string = series.frequency ?? "weekly";
      const windowEnd = new Date(now);
      // Window size: weekly=8w, monthly=6mo, quarterly=4 quarters (1 year)
      if (freq === "quarterly") windowEnd.setFullYear(windowEnd.getFullYear() + 1);
      else if (freq === "monthly") windowEnd.setMonth(windowEnd.getMonth() + 6);
      else windowEnd.setDate(windowEnd.getDate() + 7 * 8);
      // Respect end_date if set
      if (series.end_date) {
        const endDate = new Date(series.end_date);
        if (endDate < windowEnd) windowEnd.setTime(endDate.getTime());
      }

      const seriesStart = new Date(series.rotation_start_date);
      const weekOfMonth = getWeekdayOccurrenceInMonthUTC(seriesStart);

      let occurrences: Date[];
      if (freq === "monthly") {
        occurrences = getMonthlyOccurrencesInRange(series.day_of_week, weekOfMonth, now, windowEnd);
      } else if (freq === "quarterly") {
        occurrences = getQuarterlyOccurrencesInRange(series.day_of_week, weekOfMonth, seriesStart, now, windowEnd);
      } else {
        occurrences = getOccurrencesInRange(series.day_of_week, now, windowEnd);
      }

      let created = 0;
      let skipped = 0;
      let backfilled = 0;

      // Remove any baptism-specific checklist items that don't belong on recurring org activities
      await db.execute(sql`
        DELETE FROM activity_checklist_items
        WHERE item_key IN ('entrevista_bautismal', 'ropa_bautismal', 'visibilidad_evento')
          AND activity_id IN (
            SELECT id FROM activities WHERE recurring_series_id = ${series.id}
          )
      `);

      // Backfill: fix existing instances that have no checklist items
      const existingInstances = await db.execute(sql`
        SELECT a.id FROM activities a
        LEFT JOIN activity_checklist_items ci ON ci.activity_id = a.id
        WHERE a.recurring_series_id = ${series.id}
          AND ci.id IS NULL
      `);
      for (const row of existingInstances.rows as any[]) {
        // Insert ORG_ACTIVITY_CHECKLIST_ITEMS for this instance
        await db.execute(sql`
          INSERT INTO activity_checklist_items (activity_id, item_key, label, sort_order, completed)
          SELECT ${row.id}, t.key, t.label, t.sort, false
          FROM (VALUES
            ('prog_agenda',         'Programa y agenda preparados',         1),
            ('prog_flyer',          'Flyer o invitación lista',             2),
            ('coord_invitaciones',  'Invitaciones enviadas',               3),
            ('coord_participantes', 'Participantes confirmados',            4),
            ('coord_presupuesto',   'Presupuesto aprobado',                5),
            ('log_espacio',         'Espacio reservado y listo',           6),
            ('log_arreglo',         'Arreglo del lugar coordinado',        7),
            ('log_equipo',          'Equipo técnico listo',                8),
            ('log_refrigerio',      'Refrigerio o comida coordinada',      9),
            ('log_limpieza',        'Limpieza post-actividad asignada',    10)
          ) AS t(key, label, sort)
          WHERE NOT EXISTS (
            SELECT 1 FROM activity_checklist_items
            WHERE activity_id = ${row.id} AND item_key = t.key
          )
        `);
        backfilled++;
      }

      for (const date of occurrences) {
        const [hh, mm] = (series.time_of_day as string).split(":").map(Number);
        date.setUTCHours(hh, mm, 0, 0); // store as UTC so display is timezone-consistent
        const dateStart = new Date(date); dateStart.setUTCHours(0, 0, 0, 0);
        const dateEnd   = new Date(date); dateEnd.setUTCHours(23, 59, 59, 999);

        const existing = await db.execute(sql`
          SELECT id FROM activities
          WHERE recurring_series_id = ${series.id}
            AND date >= ${dateStart.toISOString()}
            AND date <= ${dateEnd.toISOString()}
          LIMIT 1
        `);
        if (existing.rows.length > 0) { skipped++; continue; }

        let nth: number;
        if (freq === "monthly") {
          nth = countMonthlyOccurrencesBetween(series.day_of_week, weekOfMonth, seriesStart, date);
        } else if (freq === "quarterly") {
          nth = countQuarterlyOccurrencesBetween(series.day_of_week, weekOfMonth, seriesStart, date);
        } else {
          nth = countOccurrencesBetween(series.day_of_week, seriesStart, date);
        }
        const orgId = orgIds[(nth - 1 + orgIds.length) % orgIds.length];

        const baseSlug = (series.title as string)
          .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 35);
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
        const rnd = Math.random().toString(36).slice(2, 6);
        const slug = `${baseSlug}-${dateStr}-${rnd}`;

        await storage.createActivity({
          title: series.title,
          description: series.description ?? null,
          location: series.location ?? null,
          date: date,
          type: (series.activity_type ?? "actividad_org") as any,
          status: "borrador",
          organizationId: orgId,
          createdBy: systemUserId,
          approvalStatus: "draft",
          isPublic: series.is_public ?? false,
          slug: series.is_public ? slug : undefined,
          recurringSeriesId: series.id,
        } as any);
        created++;
      }

      res.json({ created, skipped, backfilled, total: occurrences.length });
    } catch (err) {
      console.error("[RecurringSeries] generate-now error:", err);
      res.status(500).json({ error: "Error al generar instancias" });
    }
  });
}
