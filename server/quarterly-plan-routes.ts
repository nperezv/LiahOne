import type { Express, Request, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { quarterlyPlans, quarterlyPlanItems, serviceTasks, organizations, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { sendPushNotification, isPushConfigured } from "./push-service";

// Roles allowed to manage plans for their organization
const ORG_PLAN_ROLES = new Set([
  "presidente_organizacion",
  "consejero_organizacion",
  "secretario_organizacion",
  "lider_actividades",
  "technology_specialist",
]);

// Roles allowed to approve/reject any plan (ward level)
const APPROVER_ROLES = new Set([
  "obispo",
  "consejero_obispo",
  "secretario",
  "secretario_ejecutivo",
]);

function canManagePlan(role: string) {
  return ORG_PLAN_ROLES.has(role) || APPROVER_ROLES.has(role);
}

function canApprove(role: string) {
  return APPROVER_ROLES.has(role);
}

const planBodySchema = z.object({
  organizationId: z.string().nullable().optional(),
  quarter: z.number().int().min(1).max(4),
  year: z.number().int().min(2020).max(2100),
});

const planItemBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  activityDate: z.string(), // ISO date string YYYY-MM-DD
  location: z.string().nullable().optional(),
  estimatedAttendance: z.number().int().nullable().optional(),
  budget: z.string().nullable().optional(), // numeric as string
  notes: z.string().nullable().optional(),
  order: z.number().int().optional(),
});

export function registerQuarterlyPlanRoutes(
  app: Express,
  requireAuth: RequestHandler
) {
  // ── GET /api/quarterly-plans ──────────────────────────────────────────
  // List plans visible to the current user
  app.get("/api/quarterly-plans", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });

    try {
      let rows;
      if (canApprove(user.role)) {
        // Approvers see ALL plans
        rows = await db.execute(sql`
          SELECT qp.*,
                 o.name AS organization_name,
                 submitter.name AS submitted_by_name,
                 reviewer.name AS reviewed_by_name,
                 COUNT(qpi.id)::int AS item_count
          FROM quarterly_plans qp
          LEFT JOIN organizations o ON o.id = qp.organization_id
          LEFT JOIN users submitter ON submitter.id = qp.submitted_by
          LEFT JOIN users reviewer ON reviewer.id = qp.reviewed_by
          LEFT JOIN quarterly_plan_items qpi ON qpi.quarterly_plan_id = qp.id
          GROUP BY qp.id, o.name, submitter.name, reviewer.name
          ORDER BY qp.year DESC, qp.quarter DESC, o.name
        `);
      } else if (canManagePlan(user.role)) {
        // Org members see only their organization's plans
        rows = await db.execute(sql`
          SELECT qp.*,
                 o.name AS organization_name,
                 submitter.name AS submitted_by_name,
                 reviewer.name AS reviewed_by_name,
                 COUNT(qpi.id)::int AS item_count
          FROM quarterly_plans qp
          LEFT JOIN organizations o ON o.id = qp.organization_id
          LEFT JOIN users submitter ON submitter.id = qp.submitted_by
          LEFT JOIN users reviewer ON reviewer.id = qp.reviewed_by
          LEFT JOIN quarterly_plan_items qpi ON qpi.quarterly_plan_id = qp.id
          WHERE qp.organization_id = ${user.organizationId}
          GROUP BY qp.id, o.name, submitter.name, reviewer.name
          ORDER BY qp.year DESC, qp.quarter DESC
        `);
      } else {
        return res.status(403).json({ error: "Sin permiso" });
      }

      res.json(rows.rows);
    } catch (err) {
      console.error("[quarterly-plans] GET list error:", err);
      res.status(500).json({ error: "Error al obtener planes" });
    }
  });

  // ── GET /api/quarterly-plans/:id ─────────────────────────────────────
  app.get("/api/quarterly-plans/:id", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });

    try {
      const plan = await db.execute(sql`
        SELECT qp.*,
               o.name AS organization_name,
               submitter.name AS submitted_by_name,
               reviewer.name AS reviewed_by_name
        FROM quarterly_plans qp
        LEFT JOIN organizations o ON o.id = qp.organization_id
        LEFT JOIN users submitter ON submitter.id = qp.submitted_by
        LEFT JOIN users reviewer ON reviewer.id = qp.reviewed_by
        WHERE qp.id = ${req.params.id}
      `);

      if (!plan.rows.length) return res.status(404).json({ error: "Plan no encontrado" });
      const p = plan.rows[0] as any;

      // Access check
      if (!canApprove(user.role) && p.organization_id !== user.organizationId) {
        return res.status(403).json({ error: "Sin permiso" });
      }

      const items = await db.execute(sql`
        SELECT qpi.*
        FROM quarterly_plan_items qpi
        WHERE qpi.quarterly_plan_id = ${req.params.id}
        ORDER BY qpi."order", qpi.activity_date
      `);

      res.json({ ...p, items: items.rows });
    } catch (err) {
      console.error("[quarterly-plans] GET detail error:", err);
      res.status(500).json({ error: "Error al obtener plan" });
    }
  });

  // ── POST /api/quarterly-plans ─────────────────────────────────────────
  app.post("/api/quarterly-plans", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });
    if (!canManagePlan(user.role)) return res.status(403).json({ error: "Sin permiso" });

    const parsed = planBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { quarter, year } = parsed.data;
    // Org members can only create for their own org
    const orgId = canApprove(user.role)
      ? (parsed.data.organizationId ?? null)
      : (user.organizationId ?? null);

    try {
      const existing = await db.execute(sql`
        SELECT id FROM quarterly_plans
        WHERE quarter = ${quarter} AND year = ${year}
          AND (
            (organization_id IS NULL AND ${orgId}::text IS NULL)
            OR organization_id = ${orgId}
          )
      `);
      if (existing.rows.length) {
        return res.status(409).json({ error: "Ya existe un plan para ese trimestre y organización" });
      }

      const result = await db.execute(sql`
        INSERT INTO quarterly_plans (organization_id, quarter, year, status, created_at, updated_at)
        VALUES (${orgId}, ${quarter}, ${year}, 'draft', NOW(), NOW())
        RETURNING *
      `);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("[quarterly-plans] POST error:", err);
      res.status(500).json({ error: "Error al crear plan" });
    }
  });

  // ── PATCH /api/quarterly-plans/:id/submit ────────────────────────────
  app.patch("/api/quarterly-plans/:id/submit", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });

    try {
      const plan = await db.execute(sql`SELECT * FROM quarterly_plans WHERE id = ${req.params.id}`);
      if (!plan.rows.length) return res.status(404).json({ error: "Plan no encontrado" });
      const p = plan.rows[0] as any;

      if (!canApprove(user.role) && p.organization_id !== user.organizationId) {
        return res.status(403).json({ error: "Sin permiso" });
      }
      if (p.status !== "draft" && p.status !== "rejected") {
        return res.status(409).json({ error: "Solo se pueden enviar planes en borrador o rechazados" });
      }

      const items = await db.execute(sql`SELECT id FROM quarterly_plan_items WHERE quarterly_plan_id = ${req.params.id}`);
      if (!items.rows.length) {
        return res.status(400).json({ error: "El plan debe tener al menos una actividad antes de enviarse" });
      }

      const updated = await db.execute(sql`
        UPDATE quarterly_plans
        SET status = 'submitted', submitted_at = NOW(), submitted_by = ${user.id}, updated_at = NOW()
        WHERE id = ${req.params.id}
        RETURNING *
      `);
      res.json(updated.rows[0]);
    } catch (err) {
      console.error("[quarterly-plans] PATCH submit error:", err);
      res.status(500).json({ error: "Error al enviar plan" });
    }
  });

  // ── PATCH /api/quarterly-plans/:id/review ───────────────────────────
  // Approve or reject a submitted plan
  app.patch("/api/quarterly-plans/:id/review", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });
    if (!canApprove(user.role)) return res.status(403).json({ error: "Sin permiso" });

    const bodySchema = z.object({
      action: z.enum(["approved", "rejected"]),
      comment: z.string().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const plan = await db.execute(sql`SELECT * FROM quarterly_plans WHERE id = ${req.params.id}`);
      if (!plan.rows.length) return res.status(404).json({ error: "Plan no encontrado" });
      const p = plan.rows[0] as any;
      if (p.status !== "submitted") {
        return res.status(409).json({ error: "Solo se pueden revisar planes enviados" });
      }

      const updated = await db.execute(sql`
        UPDATE quarterly_plans
        SET status = ${parsed.data.action},
            reviewed_at = NOW(),
            reviewed_by = ${user.id},
            review_comment = ${parsed.data.comment ?? null},
            updated_at = NOW()
        WHERE id = ${req.params.id}
        RETURNING *
      `);

      // If approved: create draft activities + assign logistics task to org lider_actividades
      if (parsed.data.action === "approved") {
        const items = await db.execute(sql`
          SELECT * FROM quarterly_plan_items WHERE quarterly_plan_id = ${req.params.id}
        `);

        const orgId: string | null = p.organization_id ?? null;

        // Find org's lider_actividades
        let liderActividadesId: string | null = null;
        let liderActividadesEmail: string | null = null;
        let liderActividadesName: string | null = null;
        if (orgId) {
          const laRow = await db.execute(sql`
            SELECT id, email, name FROM users
            WHERE organization_id = ${orgId} AND role = 'lider_actividades' AND is_active = true
            LIMIT 1
          `);
          liderActividadesId = (laRow.rows[0] as any)?.id ?? null;
          liderActividadesEmail = (laRow.rows[0] as any)?.email ?? null;
          liderActividadesName = (laRow.rows[0] as any)?.name ?? null;
        }

        // Find org presidency members to notify
        const orgPresidencyRows = await db.execute(sql`
          SELECT id, email, name FROM users
          WHERE organization_id = ${orgId}
            AND role IN ('presidente_organizacion','consejero_organizacion','secretario_organizacion')
            AND is_active = true
        `);
        const presidencyMembers = orgPresidencyRows.rows as any[];

        for (const item of items.rows as any[]) {
          // Skip if activity already created for this item
          if (item.activity_id) continue;

          // Parse activity date (date column comes as YYYY-MM-DD string)
          const activityDate = new Date(item.activity_date + "T12:00:00");

          // Create draft activity via storage (so checklist items are auto-generated)
          const activity = await storage.createActivity({
            title: item.title,
            description: item.description ?? null,
            date: activityDate,
            location: item.location ?? null,
            type: "actividad_org" as any,
            organizationId: orgId ?? undefined,
            createdBy: user.id,
            approvalStatus: "draft",
            asistenciaEsperada: item.estimated_attendance ?? null,
            quarterlyPlanItemId: item.id,
          } as any);

          // Link plan item → activity
          await db.execute(sql`
            UPDATE quarterly_plan_items SET activity_id = ${activity.id} WHERE id = ${item.id}
          `);

          // Due date for logistics task: activity date - 14 days
          const dueDate = new Date(activityDate);
          dueDate.setDate(dueDate.getDate() - 14);
          const minDue = new Date(Date.now() + 24 * 60 * 60 * 1000);
          const taskDue = dueDate > minDue ? dueDate : minDue;

          // Create service_task for lider_actividades
          if (liderActividadesId) {
            await db.execute(sql`
              INSERT INTO service_tasks (
                activity_id, quarterly_plan_item_id, organization_id,
                assigned_to, assigned_role,
                title, description, status, due_date, created_by, created_at, updated_at
              ) VALUES (
                ${activity.id}, ${item.id}, ${orgId},
                ${liderActividadesId}, 'lider_actividades',
                ${'Logística: ' + item.title},
                ${'Coordinar logística (espacio, arreglo, equipo, refrigerio, limpieza) para la actividad del ' + item.activity_date},
                'pending', ${taskDue.toISOString()}, ${user.id}, NOW(), NOW()
              )
            `);

            // Push notification to lider_actividades
            if (isPushConfigured()) {
              await sendPushNotification(liderActividadesId, {
                title: "Nueva actividad asignada",
                body: `Coordinar logística: ${item.title} (${item.activity_date})`,
                url: "/activity-logistics",
              });
            }

            // In-app notification
            await storage.createNotification({
              userId: liderActividadesId,
              type: "reminder",
              title: "Nueva actividad asignada",
              description: `Coordinar logística: ${item.title} — ${item.activity_date}`,
              relatedId: activity.id,
              isRead: false,
            });
          }

          // Notify org presidency about their draft activity
          for (const member of presidencyMembers) {
            await storage.createNotification({
              userId: member.id,
              type: "reminder",
              title: "Actividad creada — Plan aprobado",
              description: `${item.title} está en borrador. Prepárala y envíala al obispado antes de 14 días previos a la actividad.`,
              relatedId: activity.id,
              isRead: false,
            });
            if (isPushConfigured()) {
              await sendPushNotification(member.id, {
                title: "Plan aprobado — Actividad creada",
                body: `${item.title}: prepara y envía al obispo 14 días antes (${item.activity_date})`,
                url: "/activities",
              });
            }
          }
        }
      }

      res.json(updated.rows[0]);
    } catch (err) {
      console.error("[quarterly-plans] PATCH review error:", err);
      res.status(500).json({ error: "Error al revisar plan" });
    }
  });

  // ── DELETE /api/quarterly-plans/:id ──────────────────────────────────
  app.delete("/api/quarterly-plans/:id", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });

    try {
      const plan = await db.execute(sql`SELECT * FROM quarterly_plans WHERE id = ${req.params.id}`);
      if (!plan.rows.length) return res.status(404).json({ error: "Plan no encontrado" });
      const p = plan.rows[0] as any;

      if (!canApprove(user.role) && p.organization_id !== user.organizationId) {
        return res.status(403).json({ error: "Sin permiso" });
      }
      if (p.status === "approved") {
        return res.status(409).json({ error: "No se puede eliminar un plan aprobado" });
      }

      await db.execute(sql`DELETE FROM quarterly_plans WHERE id = ${req.params.id}`);
      res.json({ ok: true });
    } catch (err) {
      console.error("[quarterly-plans] DELETE error:", err);
      res.status(500).json({ error: "Error al eliminar plan" });
    }
  });

  // ── POST /api/quarterly-plans/:id/items ──────────────────────────────
  app.post("/api/quarterly-plans/:id/items", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });

    const parsed = planItemBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const plan = await db.execute(sql`SELECT * FROM quarterly_plans WHERE id = ${req.params.id}`);
      if (!plan.rows.length) return res.status(404).json({ error: "Plan no encontrado" });
      const p = plan.rows[0] as any;

      if (!canApprove(user.role) && p.organization_id !== user.organizationId) {
        return res.status(403).json({ error: "Sin permiso" });
      }
      if (p.status === "submitted" || p.status === "approved") {
        return res.status(409).json({ error: "No se puede modificar un plan enviado o aprobado" });
      }

      const { title, description, activityDate, location, estimatedAttendance, budget, notes, order } = parsed.data;

      // Auto-order: max existing order + 1
      const maxOrder = await db.execute(sql`
        SELECT COALESCE(MAX("order"), -1) AS max_order FROM quarterly_plan_items WHERE quarterly_plan_id = ${req.params.id}
      `);
      const nextOrder = order ?? ((maxOrder.rows[0] as any).max_order + 1);

      const result = await db.execute(sql`
        INSERT INTO quarterly_plan_items
          (quarterly_plan_id, title, description, activity_date, location, estimated_attendance, budget, notes, "order", created_at, updated_at)
        VALUES
          (${req.params.id}, ${title}, ${description ?? null}, ${activityDate}, ${location ?? null},
           ${estimatedAttendance ?? null}, ${budget ?? null}, ${notes ?? null}, ${nextOrder}, NOW(), NOW())
        RETURNING *
      `);

      // Update plan updated_at
      await db.execute(sql`UPDATE quarterly_plans SET updated_at = NOW() WHERE id = ${req.params.id}`);

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("[quarterly-plans] POST item error:", err);
      res.status(500).json({ error: "Error al agregar actividad" });
    }
  });

  // ── PUT /api/quarterly-plans/:id/items/:itemId ───────────────────────
  app.put("/api/quarterly-plans/:id/items/:itemId", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });

    const parsed = planItemBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const plan = await db.execute(sql`SELECT * FROM quarterly_plans WHERE id = ${req.params.id}`);
      if (!plan.rows.length) return res.status(404).json({ error: "Plan no encontrado" });
      const p = plan.rows[0] as any;

      if (!canApprove(user.role) && p.organization_id !== user.organizationId) {
        return res.status(403).json({ error: "Sin permiso" });
      }
      if (p.status === "submitted" || p.status === "approved") {
        return res.status(409).json({ error: "No se puede modificar un plan enviado o aprobado" });
      }

      const { title, description, activityDate, location, estimatedAttendance, budget, notes, order } = parsed.data;

      const result = await db.execute(sql`
        UPDATE quarterly_plan_items
        SET title = ${title},
            description = ${description ?? null},
            activity_date = ${activityDate},
            location = ${location ?? null},
            estimated_attendance = ${estimatedAttendance ?? null},
            budget = ${budget ?? null},
            notes = ${notes ?? null},
            "order" = ${order ?? 0},
            updated_at = NOW()
        WHERE id = ${req.params.itemId} AND quarterly_plan_id = ${req.params.id}
        RETURNING *
      `);

      if (!result.rows.length) return res.status(404).json({ error: "Actividad no encontrada" });

      await db.execute(sql`UPDATE quarterly_plans SET updated_at = NOW() WHERE id = ${req.params.id}`);
      res.json(result.rows[0]);
    } catch (err) {
      console.error("[quarterly-plans] PUT item error:", err);
      res.status(500).json({ error: "Error al actualizar actividad" });
    }
  });

  // ── DELETE /api/quarterly-plans/:id/items/:itemId ────────────────────
  app.delete("/api/quarterly-plans/:id/items/:itemId", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });

    try {
      const plan = await db.execute(sql`SELECT * FROM quarterly_plans WHERE id = ${req.params.id}`);
      if (!plan.rows.length) return res.status(404).json({ error: "Plan no encontrado" });
      const p = plan.rows[0] as any;

      if (!canApprove(user.role) && p.organization_id !== user.organizationId) {
        return res.status(403).json({ error: "Sin permiso" });
      }
      if (p.status === "submitted" || p.status === "approved") {
        return res.status(409).json({ error: "No se puede modificar un plan enviado o aprobado" });
      }

      await db.execute(sql`DELETE FROM quarterly_plan_items WHERE id = ${req.params.itemId} AND quarterly_plan_id = ${req.params.id}`);
      await db.execute(sql`UPDATE quarterly_plans SET updated_at = NOW() WHERE id = ${req.params.id}`);
      res.json({ ok: true });
    } catch (err) {
      console.error("[quarterly-plans] DELETE item error:", err);
      res.status(500).json({ error: "Error al eliminar actividad" });
    }
  });

  // ── GET /api/quarterly-plans/dashboard/semaphore ─────────────────────
  // Returns plan status for current quarter for the user's org (for dashboard widget)
  app.get("/api/quarterly-plans/dashboard/semaphore", requireAuth, async (req: Request, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "No autenticado" });
    if (!canManagePlan(user.role) && !canApprove(user.role)) {
      return res.json({ status: null });
    }

    try {
      const now = new Date();
      const quarter = Math.ceil((now.getMonth() + 1) / 3);
      const year = now.getFullYear();

      const orgFilter = canApprove(user.role) ? null : (user.organizationId ?? null);

      const rows = await db.execute(sql`
        SELECT qp.id, qp.status, qp.organization_id, o.name AS organization_name,
               COUNT(qpi.id)::int AS item_count
        FROM quarterly_plans qp
        LEFT JOIN organizations o ON o.id = qp.organization_id
        LEFT JOIN quarterly_plan_items qpi ON qpi.quarterly_plan_id = qp.id
        WHERE qp.quarter = ${quarter} AND qp.year = ${year}
          AND (${orgFilter}::text IS NULL OR qp.organization_id = ${orgFilter})
        GROUP BY qp.id, o.name
        ORDER BY o.name
      `);

      // Semaphore logic:
      // - red: no plan or draft with 0 items past week 4 of quarter
      // - yellow: draft or submitted
      // - green: approved
      const plans = rows.rows as any[];

      const semaphore = plans.map((p) => {
        let color: "green" | "yellow" | "red";
        if (p.status === "approved") color = "green";
        else if (p.status === "submitted") color = "yellow";
        else if (p.status === "rejected") color = "red";
        else color = "yellow"; // draft
        return { ...p, semaphore: color };
      });

      res.json({ quarter, year, plans: semaphore });
    } catch (err) {
      console.error("[quarterly-plans] GET semaphore error:", err);
      res.status(500).json({ error: "Error al obtener semáforo" });
    }
  });
}
