/**
 * Shared helpers for creating activity tasks and assignments.
 * Called from routes.ts, recurring-series-routes.ts, and quarterly-plan-routes.ts.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { serviceTasks, users, organizations } from "@shared/schema";
import { storage } from "./storage";
import { sendPushNotification, isPushConfigured } from "./push-service";

function fmtDate(d: Date) {
  return `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}`;
}

/**
 * Creates all tasks and assignments for a newly created org activity.
 * - service_task for org lider_actividades (visible in /activity-logistics)
 * - service_task for barrio lider_actividades (if different)
 * - assignment for each lider_actividades (visible in /assignments)
 * - assignment for org presidency members → program
 */
export async function createActivityTasksAndAssignments(opts: {
  activityId: string;
  activityTitle: string;
  activityDate: Date;
  organizationId: string;
  createdBy: string;
}) {
  const { activityId, activityTitle, activityDate, organizationId, createdBy } = opts;
  const dateStr = fmtDate(activityDate);

  // Find org lider_actividades; fall back to barrio lider if none assigned yet
  const [orgLider] = await db
    .select({ id: users.id, organizationId: users.organizationId })
    .from(users)
    .where(and(eq(users.role, "lider_actividades" as any), eq(users.organizationId, organizationId)))
    .limit(1);

  let effectiveLider = orgLider ?? null;
  if (!effectiveLider) {
    const [barrioLider] = await db
      .select({ id: users.id, organizationId: users.organizationId })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.organizationId))
      .where(and(eq(users.role, "lider_actividades" as any), eq(organizations.type, "barrio" as any)))
      .limit(1);
    effectiveLider = barrioLider ?? null;
  }

  const liderIds: string[] = effectiveLider ? [effectiveLider.id] : [];

  // Find org presidency (presidente, consejeros)
  const presidencyRows = await db.execute(sql`
    SELECT id FROM users
    WHERE organization_id = ${organizationId}
      AND role IN ('presidente_organizacion', 'consejero_organizacion')
  `);
  const presidencyIds = (presidencyRows.rows as any[]).map(r => r.id as string);

  // ── Logistics: service_task + assignment per lider ──
  for (const liderId of liderIds) {
    // service_task (visible in /activity-logistics)
    const existingTask = await db.execute(sql`
      SELECT id FROM service_tasks WHERE activity_id = ${activityId} AND assigned_to = ${liderId}
    `);
    if (!existingTask.rows.length) {
      await db.insert(serviceTasks).values({
        activityId,
        assignedTo: liderId,
        assignedRole: "lider_actividades",
        organizationId,
        title: `Coordinación y Logística: ${activityTitle}`,
        description: `Coordinar espacio, arreglo, equipo, refrigerio y limpieza para la actividad del ${dateStr}`,
        status: "pending",
        dueDate: activityDate,
        createdBy,
      } as any);
    }

    // assignment (visible in /assignments)
    const existingAssign = await db.execute(sql`
      SELECT id FROM assignments WHERE related_to = ${activityId} AND assigned_to = ${liderId} AND area = 'logistica'
    `);
    if (!existingAssign.rows.length) {
      await storage.createAssignment({
        title: `Coordinación y Logística: ${activityTitle}`,
        description: `Coordinar espacio, arreglo, equipo, refrigerio y limpieza para la actividad del ${dateStr}`,
        assignedTo: liderId,
        assignedBy: createdBy,
        dueDate: activityDate,
        status: "pendiente" as any,
        relatedTo: activityId,
        area: "logistica",
      });
    }

    // Push + in-app notification
    try {
      if (isPushConfigured()) {
        await sendPushNotification(liderId, {
          title: "Nueva actividad asignada",
          body: `Coordinar logística: ${activityTitle} (${dateStr})`,
          url: "/activity-logistics",
        });
      }
      await storage.createNotification({
        userId: liderId,
        type: "reminder",
        title: "Coordinación y Logística asignada",
        description: `${activityTitle} — ${dateStr}`,
        relatedId: activityId,
        isRead: false,
      });
    } catch (notifErr) {
      console.error("[createActivityTasksAndAssignments] notification error:", notifErr);
    }
  }

  // ── Program: assignment per org presidency member ──
  for (const presidId of presidencyIds) {
    const existingAssign = await db.execute(sql`
      SELECT id FROM assignments WHERE related_to = ${activityId} AND assigned_to = ${presidId} AND area = 'programa'
    `);
    if (!existingAssign.rows.length) {
      await storage.createAssignment({
        title: `Programa de la actividad: ${activityTitle}`,
        description: `Preparar el programa (quién preside, dirige, himnos y oraciones) para la actividad del ${dateStr}`,
        assignedTo: presidId,
        assignedBy: createdBy,
        dueDate: activityDate,
        status: "pendiente" as any,
        relatedTo: activityId,
        area: "programa",
      });
    }

    try {
      if (isPushConfigured()) {
        await sendPushNotification(presidId, {
          title: "Actividad — Programa por preparar",
          body: `${activityTitle} (${dateStr})`,
          url: "/activities",
        });
      }
      await storage.createNotification({
        userId: presidId,
        type: "reminder",
        title: "Programa de actividad asignado",
        description: `Preparar el programa de: ${activityTitle} — ${dateStr}`,
        relatedId: activityId,
        isRead: false,
      });
    } catch (notifErr) {
      console.error("[createActivityTasksAndAssignments] notification error:", notifErr);
    }
  }
}

/**
 * Called when a new lider_actividades is assigned to an org.
 * - Pending tasks that were falling back to the barrio lider → reassigned to the new lider + notify both.
 * - In-progress tasks → notify barrio lider so they can decide to transfer manually.
 */
export async function reassignPendingTasksToNewOrgLider(opts: {
  newUserId: string;
  newUserName: string;
  organizationId: string;
}) {
  const { newUserId, newUserName, organizationId } = opts;

  // Find the barrio lider (tasks were assigned here as fallback)
  const [barrioLider] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(and(eq(users.role, "lider_actividades" as any), eq(organizations.type, "barrio" as any)))
    .limit(1);

  if (!barrioLider || barrioLider.id === newUserId) return;

  // Reassign pending tasks for this org from barrio lider → new org lider
  const reassigned = await db.execute(sql`
    UPDATE service_tasks
    SET assigned_to = ${newUserId}, updated_at = NOW()
    WHERE organization_id = ${organizationId}
      AND assigned_to = ${barrioLider.id}
      AND status = 'pending'
    RETURNING id, title
  `);

  // Find in-progress tasks that still belong to barrio lider for this org
  const inProgressRows = await db.execute(sql`
    SELECT id, title FROM service_tasks
    WHERE organization_id = ${organizationId}
      AND assigned_to = ${barrioLider.id}
      AND status = 'in_progress'
  `);

  const orgRow = await db.execute(sql`SELECT name FROM organizations WHERE id = ${organizationId} LIMIT 1`);
  const orgName = (orgRow.rows[0] as any)?.name ?? "la organización";

  // Notify new lider about their reassigned tasks
  if (reassigned.rows.length > 0) {
    try {
      await storage.createNotification({
        userId: newUserId,
        type: "reminder",
        title: "Tareas de logística asignadas",
        description: `Se te asignaron ${reassigned.rows.length} tarea(s) de logística de ${orgName}`,
        relatedId: organizationId,
        isRead: false,
      });
      if (isPushConfigured()) {
        await sendPushNotification(newUserId, {
          title: "Tareas de logística asignadas",
          body: `${reassigned.rows.length} tarea(s) de logística de ${orgName}`,
          url: "/activity-logistics",
        });
      }
    } catch (_) {}
  }

  // Notify barrio lider about in-progress tasks they need to transfer manually
  if ((inProgressRows.rows as any[]).length > 0) {
    try {
      await storage.createNotification({
        userId: barrioLider.id,
        type: "reminder",
        title: "Transferir tareas de logística",
        description: `${orgName} tiene un nuevo lider de actividades (${newUserName}). Hay ${(inProgressRows.rows as any[]).length} tarea(s) en progreso que puedes transferirle.`,
        relatedId: organizationId,
        isRead: false,
      });
    } catch (_) {}
  }
}

/**
 * Called after saving a section — auto-completes related assignments
 * if the section is fully done (checks actual checklist items in DB).
 */
export async function autoCompleteAssignmentsForSection(opts: {
  activityId: string;
  section: string;
}) {
  const { activityId, section } = opts;

  const COORD_REQUIRED = ["coord_espacio", "coord_arreglo", "coord_limpieza"];
  const PROG_REQUIRED = ["prog_preside", "prog_dirige", "prog_oracion_apertura", "prog_oracion_cierre"];

  if (section === "coordinacion") {
    // Check if all required coord items are completed in DB
    const result = await db.execute(sql`
      SELECT item_key, completed FROM activity_checklist_items
      WHERE activity_id = ${activityId}
        AND item_key = ANY(ARRAY['coord_espacio','coord_arreglo','coord_limpieza']::text[])
    `);
    const rows = result.rows as any[];
    const allComplete = COORD_REQUIRED.every(k => {
      const row = rows.find((r: any) => r.item_key === k);
      return row?.completed === true;
    });
    if (!allComplete) return;

    await db.execute(sql`
      UPDATE assignments SET status = 'completado', updated_at = NOW()
      WHERE related_to = ${activityId} AND area = 'logistica' AND status = 'pendiente'
    `);
    await db.execute(sql`
      UPDATE service_tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE activity_id = ${activityId} AND status = 'pending'
    `);
  }

  if (section === "programa") {
    const result = await db.execute(sql`
      SELECT item_key, completed FROM activity_checklist_items
      WHERE activity_id = ${activityId}
        AND item_key = ANY(ARRAY['prog_preside','prog_dirige','prog_oracion_apertura','prog_oracion_cierre']::text[])
    `);
    const rows = result.rows as any[];
    const allComplete = PROG_REQUIRED.every(k => {
      const row = rows.find((r: any) => r.item_key === k);
      return row?.completed === true;
    });
    if (!allComplete) return;

    await db.execute(sql`
      UPDATE assignments SET status = 'completado', updated_at = NOW()
      WHERE related_to = ${activityId} AND area = 'programa' AND status = 'pendiente'
    `);
  }
}
