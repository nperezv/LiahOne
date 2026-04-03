import type { Express, Request, Response, RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { approvedSessionPayload } from "./mission-baptism-link-session";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { sendBaptismReminderEmail, sendAgendaReminderEmail } from "./auth";
import { syncBaptismInterviewChecklistItem } from "./mission-interview-sync";
import { isPushConfigured, sendPushNotification } from "./push-service";
import {
  organizations,
  users,
  missionPersonas,
  missionAsistencia,
  missionAmigos,
  missionPrincipios,
  missionSesionPrincipio,
  missionCompromisoBautismo,
  missionOtroCompromiso,
  missionOrdenacionSacerdocio,
  missionTemploOrdinanzas,
  missionSelfReliance,
  missionLlamamiento,
  missionMinistracion,
  activities,
  activityChecklistItems,
  notifications,
  serviceTasks,
} from "@shared/schema";

const MISSION_ROLES = new Set([
  "mission_leader",
  "ward_missionary",
  "full_time_missionary",
  "obispo",
  "consejero_obispo",
]);

// Returns the unit ID to use for mission queries.
// MISSION_ROLES users may be assigned to a "barrio" org, but mission personas
// are stored with the obispado org ID. We normalise to the obispado ID.
async function getMissionUnitId(user: any): Promise<string | null> {
  if (!user.organizationId) {
    // No org assigned – fall back to the obispado org
    const [ob] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.type, "obispado" as any))
      .limit(1);
    return ob?.id ?? null;
  }
  const [org] = await db
    .select({ type: organizations.type })
    .from(organizations)
    .where(eq(organizations.id, user.organizationId))
    .limit(1);
  if (!org) return null;
  // Barrio org is a satellite; personas live under the obispado unit
  if (org.type === "barrio") {
    const [ob] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.type, "obispado" as any))
      .limit(1);
    return ob?.id ?? null;
  }
  return user.organizationId;
}

async function canAccessMission(user: any): Promise<boolean> {
  if (!user) return false;
  if (MISSION_ROLES.has(user.role)) return true;
  if (
    !["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(
      user.role
    ) ||
    !user.organizationId
  )
    return false;
  const [org] = await db
    .select({ type: organizations.type })
    .from(organizations)
    .where(eq(organizations.id, user.organizationId))
    .limit(1);
  return org?.type === "cuorum_elderes" || org?.type === "sociedad_socorro";
}

// 10 fixed baptism commitments seeded per person on first access
const BAPTISM_COMMITMENTS = [
  { key: "leer_libro_mormon", nombre: "Leer el Libro de Mormón", orden: 1 },
  { key: "orar_jose_smith", nombre: "Orar acerca de José Smith y el Libro de Mormón", orden: 2 },
  {
    key: "guardar_dia_reposo",
    nombre: "Santificar el día de reposo y asistir a la Iglesia semanalmente",
    orden: 3,
  },
  { key: "diez_mandamientos", nombre: "Guardar los Diez Mandamientos", orden: 4 },
  { key: "ley_castidad", nombre: "Vivir la ley de castidad", orden: 5 },
  { key: "obedecer_ley", nombre: "Obedecer y honrar la ley", orden: 6 },
  {
    key: "diezmo",
    nombre: "Obedecer la ley del diezmo después del bautismo",
    orden: 7,
  },
  { key: "palabra_sabiduria", nombre: "Obedecer la Palabra de Sabiduría", orden: 8 },
  {
    key: "entrevista_bautismo",
    nombre: "Ser entrevistado para el bautismo y la confirmación",
    orden: 9,
  },
  { key: "bautizado_confirmado", nombre: "Ser bautizado y confirmado", orden: 10 },
];

export function registerMissionRoutes(app: Express, requireAuth: RequestHandler) {
  // -------------------------------------------------------
  // Access check
  // -------------------------------------------------------
  app.get("/api/mission/access", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowed = await canAccessMission(user);
      return res.json({ allowed });
    } catch (err) {
      console.error("[mission/access]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // -------------------------------------------------------
  // Principios (seed lookup)
  // -------------------------------------------------------
  app.get("/api/mission/principios", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const rows = await db
        .select()
        .from(missionPrincipios)
        .orderBy(missionPrincipios.orden);
      return res.json(rows);
    } catch (err) {
      console.error("[mission/principios]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // -------------------------------------------------------
  // Directory member search
  // -------------------------------------------------------
  app.get("/api/mission/directory-members", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const q = String(req.query.q || "").trim();
      if (!q) return res.json([]);
      const rows = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(ilike(users.name, `%${q}%`))
        .limit(20);
      return res.json(rows);
    } catch (err) {
      console.error("[mission/directory-members]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // -------------------------------------------------------
  // Personas list
  // -------------------------------------------------------
  app.get("/api/mission/personas", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

      const tipo = String(req.query.tipo || "");
      if (!["nuevo", "regresando", "enseñando"].includes(tipo)) {
        return res.status(400).json({ message: "tipo inválido" });
      }

      const unitId = await getMissionUnitId(user);
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });

      const rows = await db
        .select()
        .from(missionPersonas)
        .where(
          and(
            eq(missionPersonas.unitId, unitId),
            eq(missionPersonas.tipo, tipo as any),
            eq(missionPersonas.isArchived, false)
          )
        )
        .orderBy(missionPersonas.nombre);

      // Enrich with attendance + amigos counts
      const ids = rows.map((r) => r.id);
      let asistenciaMap: Record<string, { fecha_domingo: string; asistio: boolean }[]> = {};
      let amigosMap: Record<string, number> = {};

      if (ids.length > 0) {
        

        const asistRows = await db
          .select()
          .from(missionAsistencia)
          .where(inArray(missionAsistencia.personaId, ids));
        for (const a of asistRows) {
          if (!asistenciaMap[a.personaId]) asistenciaMap[a.personaId] = [];
          asistenciaMap[a.personaId].push({
            fecha_domingo: a.fechaDomingo,
            asistio: a.asistio,
          });
        }

        const amigosRows = await db
          .select({ personaId: missionAmigos.personaId })
          .from(missionAmigos)
          .where(inArray(missionAmigos.personaId, ids));
        for (const a of amigosRows) {
          amigosMap[a.personaId] = (amigosMap[a.personaId] || 0) + 1;
        }
      }

      const enriched = rows.map((p) => ({
        ...p,
        asistencia: asistenciaMap[p.id] || [],
        amigosCount: amigosMap[p.id] || 0,
      }));

      return res.json(enriched);
    } catch (err) {
      console.error("[mission/personas GET]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // -------------------------------------------------------
  // Create persona
  // -------------------------------------------------------
  app.post("/api/mission/personas", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

      const unitId = await getMissionUnitId(user);
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });

      // Nearest past Sunday (or today if Sunday) = attendance start date
      const ingresoDate = new Date();
      ingresoDate.setHours(0, 0, 0, 0);
      while (ingresoDate.getDay() !== 0) ingresoDate.setDate(ingresoDate.getDate() - 1);
      const fechaIngreso = ingresoDate.toISOString().split("T")[0];

      const schema = z.object({
        nombre: z.string().min(1),
        tipo: z.enum(["nuevo", "regresando", "enseñando"]),
        fechaPrimerContacto: z.string(),
        fechaBautismo: z.string().nullable().optional(),
        proximoEvento: z.string().nullable().optional(),
        notas: z.string().nullable().optional(),
        fotoUrl: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        memberId: z.string().nullable().optional(),
        fechaConfirmacion: z.string().nullable().optional(),
        sexo: z.enum(["M", "F"]).nullable().optional(),
        fechaNacimiento: z.string().nullable().optional(),
      });

      const data = schema.parse(req.body);

      const [created] = await db
        .insert(missionPersonas)
        .values({
          unitId,
          nombre: data.nombre,
          tipo: data.tipo,
          fechaPrimerContacto: data.fechaPrimerContacto,
          fechaBautismo: data.fechaBautismo || null,
          fechaConfirmacion: data.fechaConfirmacion || null,
          fechaIngreso,
          proximoEvento: data.proximoEvento || null,
          notas: data.notas || null,
          fotoUrl: data.fotoUrl || null,
          phone: data.phone || null,
          email: data.email || null,
          memberId: data.memberId || null,
          sexo: data.sexo || null,
          fechaNacimiento: data.fechaNacimiento || null,
        })
        .returning();

      // Notify mission team when a nuevo or regresando is added
      if (data.tipo === "nuevo" || data.tipo === "regresando") {
        const isRegresando = data.tipo === "regresando";
        const notifTitle = isRegresando
          ? `Miembro regresando: ${data.nombre}`
          : `Nuevo contacto: ${data.nombre}`;
        const notifMsg = isRegresando
          ? `${data.nombre} ha sido registrado como miembro que regresa a la actividad. Coordina una visita de bienvenida.`
          : `${data.nombre} ha sido registrado como nuevo contacto.`;

        const TEAM_ROLES = ["obispo", "consejero_obispo", "mission_leader", "ward_missionary"];
        const teamMembers = await db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(and(
            eq(users.organizationId, unitId),
            inArray(users.role as any, TEAM_ROLES as any),
          ));

        const wardName = (await storage.getPdfTemplate())?.wardName ?? null;

        for (const member of teamMembers) {
          await db.insert(notifications).values({
            userId: member.id,
            title: notifTitle,
            message: notifMsg,
            type: "reminder",
          });
          if (isPushConfigured()) {
            await sendPushNotification(member.id, {
              title: notifTitle,
              body: notifMsg,
              url: "/mission-work",
            });
          }
          if (member.email) {
            await sendAgendaReminderEmail({
              toEmail: member.email,
              subject: notifTitle,
              body: [`Estimado/a ${member.name},`, "", notifMsg, "", wardName || "Tu barrio"].join("\n"),
              wardName,
            });
          }
        }

        // For regresando: create an assignment to ward_missionary to visit within 7 days
        if (isRegresando) {
          const [wardMissionary] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.organizationId, unitId), eq(users.role as any, "ward_missionary" as any)))
            .limit(1);
          if (wardMissionary) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);
            await db.execute(sql`
              INSERT INTO assignments (title, description, assigned_to, assigned_by, due_date, status)
              VALUES (
                ${"Visita de bienvenida: " + data.nombre},
                ${"Visitar a " + data.nombre + " y darle la bienvenida a la actividad dentro de los próximos 7 días."},
                ${wardMissionary.id},
                ${user.id},
                ${dueDate.toISOString()},
                'pendiente'
              )
            `);
          }
        }
      }

      return res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
      console.error("[mission/personas POST]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // -------------------------------------------------------
  // Get single persona
  // -------------------------------------------------------
  app.get("/api/mission/personas/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

      const [persona] = await db
        .select()
        .from(missionPersonas)
        .where(eq(missionPersonas.id, req.params.id))
        .limit(1);

      if (!persona) return res.status(404).json({ message: "No encontrado" });
      return res.json(persona);
    } catch (err) {
      console.error("[mission/personas/:id GET]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // -------------------------------------------------------
  // Shared: auto-create/join baptism service when fecha_bautismo is set
  // -------------------------------------------------------
  async function autoLinkBaptismService(opts: {
    personaId: string;
    personaNombre: string;
    fechaBautismo: string;
    unitId: string;
    userId: string;
  }): Promise<void> {
    const { personaId, personaNombre, fechaBautismo, unitId, userId } = opts;

    const existingForPersona = await db.execute(sql`
      SELECT bs.id FROM baptism_services bs
      JOIN baptism_service_candidates bsc ON bsc.service_id = bs.id
      WHERE bsc.persona_id = ${personaId}
        AND bs.status != 'archived'
      LIMIT 1
    `);
    if (existingForPersona.rows.length > 0) return;

    const serviceAt = new Date(`${fechaBautismo}T12:00:00Z`);
    const prepDeadline = new Date(serviceAt);
    prepDeadline.setUTCDate(prepDeadline.getUTCDate() - 14);

    const existingForDate = await db.execute(sql`
      SELECT id FROM baptism_services
      WHERE unit_id = ${unitId}
        AND DATE(service_at AT TIME ZONE 'UTC') = DATE(${serviceAt.toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND status != 'archived'
      LIMIT 1
    `);

    let baptismServiceId: string | undefined;
    let isNewService = false;

    if (existingForDate.rows.length > 0) {
      baptismServiceId = (existingForDate.rows[0] as any).id;
      await db.execute(sql`
        INSERT INTO baptism_service_candidates (service_id, persona_id)
        VALUES (${baptismServiceId}, ${personaId})
        ON CONFLICT DO NOTHING
      `);
      const allCandidates = await db.execute(sql`
        SELECT mp.nombre FROM baptism_service_candidates bsc
        JOIN mission_personas mp ON mp.id = bsc.persona_id
        WHERE bsc.service_id = ${baptismServiceId}
        ORDER BY mp.nombre
      `);
      const allNames = (allCandidates.rows as any[]).map((r) => r.nombre).join(", ");
      await db.execute(sql`
        UPDATE activities SET title = ${"Servicio bautismal: " + allNames}
        WHERE baptism_service_id = ${baptismServiceId}
      `);
    } else {
      const serviceResult = await db.execute(sql`
        INSERT INTO baptism_services
          (unit_id, service_at, location_name, prep_deadline_at, approval_status, created_by)
        VALUES
          (${unitId}, ${serviceAt.toISOString()}, 'Por confirmar', ${prepDeadline.toISOString()}, 'draft', ${userId})
        RETURNING id
      `);
      baptismServiceId = (serviceResult.rows[0] as any)?.id as string | undefined;
      isNewService = true;

      if (baptismServiceId) {
        await db.execute(sql`
          INSERT INTO baptism_service_candidates (service_id, persona_id)
          VALUES (${baptismServiceId}, ${personaId})
        `);
        await storage.createActivity({
          title: `Servicio bautismal de ${personaNombre}`,
          date: serviceAt,
          type: "servicio_bautismal",
          status: "borrador",
          baptismServiceId,
          organizationId: unitId,
          createdBy: userId,
        });
      }
    }

    const now = new Date();
    const daysUntil = Math.ceil((serviceAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isException = daysUntil < 14;

    if (isNewService && baptismServiceId) {
      const [missionLeader] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.role, "mission_leader" as any), eq(users.organizationId, unitId)))
        .limit(1);
      if (missionLeader) {
        const assignmentDeadlineDays = isException ? 1 : 3;
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + assignmentDeadlineDays);

        // Legacy assignment (kept for backwards compat)
        await db.execute(sql`
          INSERT INTO assignments (title, description, assigned_to, assigned_by, due_date, status)
          VALUES (
            ${'Programa del Servicio Bautismal'},
            ${'Crear el programa del servicio bautismal de ' + personaNombre + ' antes de la fecha límite.'},
            ${missionLeader.id},
            ${userId},
            ${deadline.toISOString()},
            'pendiente'
          )
        `);

        // Service task — auto-completable when obispo approves
        await db.insert(serviceTasks).values({
          baptismServiceId,
          assignedTo: missionLeader.id,
          assignedRole: "mission_leader",
          organizationId: unitId,
          title: `Completar programa del servicio bautismal: ${personaNombre}`,
          description: `Rellenar el borrador del programa bautismal y enviarlo al obispado para aprobación antes del ${fechaBautismo}.`,
          status: "pending",
          dueDate: deadline,
          createdBy: userId,
        });

        // In-app notification
        const notif = await storage.createNotification({
          userId: missionLeader.id,
          type: "reminder",
          title: "Nueva fecha de bautismo fijada",
          description: `Se ha fijado una fecha de bautismo para ${personaNombre}. Completa el programa bautismal antes del ${fechaBautismo}.`,
          relatedId: baptismServiceId,
          isRead: false,
        });

        // Push notification
        if (isPushConfigured()) {
          await sendPushNotification(missionLeader.id, {
            title: "Nueva fecha de bautismo",
            body: `Completa el programa bautismal de ${personaNombre} (${fechaBautismo}).`,
            url: `/mission-work?section=servicios_bautismales&highlight=${baptismServiceId}`,
            notificationId: notif.id,
          });
        }

        // Email
        if (missionLeader.email) {
          const wardName = (await storage.getPdfTemplate())?.wardName ?? null;
          await sendBaptismReminderEmail({
            toEmail: missionLeader.email,
            recipientName: missionLeader.name,
            candidateName: personaNombre,
            baptismDate: fechaBautismo,
            wardName,
            isException,
            daysUntil,
          });
        }
      }
    }

    if (isException) {
      const BAPTISM_REMINDER_ROLES = new Set([
        "obispo", "consejero_obispo", "mission_leader", "ward_missionary", "full_time_missionary",
      ]);
      const allUsers = await storage.getAllUsers();
      const missionRecipients = allUsers.filter(
        (u: any) => u.organizationId === unitId && BAPTISM_REMINDER_ROLES.has(u.role),
      );
      const orgPresidentIds = await db.execute(sql`
        SELECT u.id FROM users u
        JOIN organizations o ON o.id = u.organization_id
        WHERE u.role = 'presidente_organizacion'
          AND o.type IN ('cuorum_elderes', 'sociedad_socorro')
      `);
      const orgPresidents = allUsers.filter((u: any) =>
        (orgPresidentIds.rows as any[]).some((r) => r.id === u.id),
      );
      const recipients = [
        ...missionRecipients,
        ...orgPresidents.filter((u: any) => !missionRecipients.find((m: any) => m.id === u.id)),
      ];
      const wardName = (await storage.getPdfTemplate())?.wardName ?? null;
      for (const recipient of recipients) {
        const title = `⚠️ URGENTE — Servicio Bautismal en ${daysUntil} día(s)`;
        const body = `El servicio bautismal de ${personaNombre} está programado para el ${fechaBautismo}. Quedan solo ${daysUntil} día(s) — se requiere acción inmediata.`;
        const notification = await storage.createNotification({
          userId: recipient.id,
          type: "reminder",
          title,
          description: body,
          relatedId: personaId,
          isRead: false,
        });
        if (isPushConfigured()) {
          await sendPushNotification(recipient.id, { title, body, url: "/mission-work", notificationId: notification.id });
        }
        if (recipient.email) {
          await sendBaptismReminderEmail({
            toEmail: recipient.email,
            recipientName: recipient.name,
            candidateName: personaNombre,
            baptismDate: fechaBautismo,
            wardName,
            isException: true,
            daysUntil,
          });
        }
      }
      console.log(`[autoLinkBaptismService] EXCEPTION baptism reminder sent for ${personaNombre}, ${daysUntil} days until baptism`);
    }
  }

  // -------------------------------------------------------
  // Update persona
  // -------------------------------------------------------
  app.put("/api/mission/personas/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

      const schema = z.object({
        nombre: z.string().min(1).optional(),
        tipo: z.enum(["nuevo", "regresando", "enseñando"]).optional(),
        fechaPrimerContacto: z.string().optional(),
        fechaBautismo: z.string().nullable().optional(),
        fechaEntrevistaBautismal: z.string().nullable().optional(),
        fechaVisitaMisioneros: z.string().nullable().optional(),
        proximoEvento: z.string().nullable().optional(),
        proximoEventoDescripcion: z.string().nullable().optional(),
        notas: z.string().nullable().optional(),
        fotoUrl: z.string().nullable().optional(),
        sexo: z.enum(["M", "F"]).nullable().optional(),
        fechaNacimiento: z.string().nullable().optional(),
      });

      const data = schema.parse(req.body);

      const [updated] = await db
        .update(missionPersonas)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(missionPersonas.id, req.params.id))
        .returning();

      if (!updated) return res.status(404).json({ message: "No encontrado" });

      // Auto-create/join draft baptism service when fechaBautismo is set
      if (data.fechaBautismo && updated.tipo === "enseñando") {
        getMissionUnitId(user).then((resolvedUnitId) => {
          if (!resolvedUnitId) return;
          autoLinkBaptismService({
            personaId: req.params.id,
            personaNombre: updated.nombre,
            fechaBautismo: data.fechaBautismo!,
            unitId: resolvedUnitId,
            userId: user.id,
          });
        }).catch((autoErr) => console.error("[mission/personas/:id PUT] autoLinkBaptismService error:", autoErr));
      }

      return res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
      console.error("[mission/personas/:id PUT]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // -------------------------------------------------------
  // Archive persona (soft delete)
  // -------------------------------------------------------
  app.delete("/api/mission/personas/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

      await db
        .update(missionPersonas)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(missionPersonas.id, req.params.id));

      return res.json({ success: true });
    } catch (err) {
      console.error("[mission/personas/:id DELETE]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // Permanent delete (obispado only)
  app.delete("/api/mission/personas/:id/permanent", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const canDelete = user.role === "obispo" || user.role === "consejero_obispo" || user.role === "mission_leader";
      if (!canDelete) return res.status(403).json({ message: "Sin acceso" });

      const personaId = req.params.id;
      // Delete linked baptism services first (FK is ON DELETE SET NULL, not CASCADE)
      await db.execute(sql`DELETE FROM baptism_services WHERE candidate_persona_id = ${personaId}`);
      await db.execute(sql`DELETE FROM mission_personas WHERE id = ${personaId}`);
      return res.json({ success: true });
    } catch (err) {
      console.error("[mission/personas/:id/permanent DELETE]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // -------------------------------------------------------
  // Asistencia
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/asistencia",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const rows = await db
          .select()
          .from(missionAsistencia)
          .where(eq(missionAsistencia.personaId, req.params.id))
          .orderBy(missionAsistencia.fechaDomingo);

        return res.json(rows.map((r) => ({ fecha_domingo: r.fechaDomingo, asistio: r.asistio })));
      } catch (err) {
        console.error("[mission asistencia GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.post(
    "/api/mission/personas/:id/asistencia",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({
          fecha_domingo: z.string(),
          asistio: z.boolean().default(true),
        });
        const { fecha_domingo, asistio } = schema.parse(req.body);

        

        // upsert
        await db.execute(
          sql`INSERT INTO mission_asistencia (persona_id, fecha_domingo, asistio)
            VALUES (${req.params.id}, ${fecha_domingo}, ${asistio})
            ON CONFLICT (persona_id, fecha_domingo) DO UPDATE SET asistio = EXCLUDED.asistio`
        );

        return res.json({ success: true });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission asistencia POST]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.delete(
    "/api/mission/personas/:id/asistencia/:fecha",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        await db
          .delete(missionAsistencia)
          .where(
            and(
              eq(missionAsistencia.personaId, req.params.id),
              eq(missionAsistencia.fechaDomingo, req.params.fecha)
            )
          );

        return res.json({ success: true });
      } catch (err) {
        console.error("[mission asistencia DELETE]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  // -------------------------------------------------------
  // Amigos
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/amigos",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const rows = await db
          .select()
          .from(missionAmigos)
          .where(eq(missionAmigos.personaId, req.params.id))
          .orderBy(missionAmigos.createdAt);

        return res.json(rows);
      } catch (err) {
        console.error("[mission amigos GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.post(
    "/api/mission/personas/:id/amigos",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({
          nombre: z.string().min(1),
          es_miembro: z.boolean().default(true),
        });
        const { nombre, es_miembro } = schema.parse(req.body);

        const [created] = await db
          .insert(missionAmigos)
          .values({ personaId: req.params.id, nombre, esMiembro: es_miembro })
          .returning();

        return res.status(201).json(created);
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission amigos POST]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.delete("/api/mission/amigos/:amigoId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

      await db.delete(missionAmigos).where(eq(missionAmigos.id, req.params.amigoId));
      return res.json({ success: true });
    } catch (err) {
      console.error("[mission amigos DELETE]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // -------------------------------------------------------
  // Sacerdocio
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/sacerdocio",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const [row] = await db
          .select()
          .from(missionOrdenacionSacerdocio)
          .where(eq(missionOrdenacionSacerdocio.personaId, req.params.id))
          .limit(1);

        return res.json(
          row || {
            personaId: req.params.id,
            oficio: null,
            fechaOrdenacion: null,
            fechaCalifica: null,
            estado: "pendiente",
          }
        );
      } catch (err) {
        console.error("[mission sacerdocio GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.put(
    "/api/mission/personas/:id/sacerdocio",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({
          oficio: z
            .enum(["diacono", "maestro", "sacerdote", "elder", "sumo_sacerdote"])
            .nullable()
            .optional(),
          fechaOrdenacion: z.string().nullable().optional(),
          fechaCalifica: z.string().nullable().optional(),
          estado: z.enum(["ordenado", "califica", "pendiente"]).optional(),
        });
        const data = schema.parse(req.body);

        
        await db.execute(
          sql`INSERT INTO mission_ordenacion_sacerdocio (persona_id, oficio, fecha_ordenacion, fecha_califica, estado, updated_at)
            VALUES (${req.params.id}, ${data.oficio ?? null}, ${data.fechaOrdenacion ?? null}, ${data.fechaCalifica ?? null}, ${data.estado ?? "pendiente"}, now())
            ON CONFLICT (persona_id) DO UPDATE SET
              oficio = EXCLUDED.oficio,
              fecha_ordenacion = EXCLUDED.fecha_ordenacion,
              fecha_califica = EXCLUDED.fecha_califica,
              estado = EXCLUDED.estado,
              updated_at = now()`
        );

        return res.json({ success: true });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission sacerdocio PUT]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  // -------------------------------------------------------
  // Templo ordinanzas
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/templo",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const [row] = await db
          .select()
          .from(missionTemploOrdinanzas)
          .where(eq(missionTemploOrdinanzas.personaId, req.params.id))
          .limit(1);

        return res.json(
          row || {
            personaId: req.params.id,
            nombreFamiliarPreparado: false,
            bautismoAntepasados: false,
            investido: false,
            selladoPadres: false,
            selladoConyuge: false,
            fechaCalificaInvestidura: null,
          }
        );
      } catch (err) {
        console.error("[mission templo GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.put(
    "/api/mission/personas/:id/templo",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({
          nombreFamiliarPreparado: z.boolean().optional(),
          bautismoAntepasados: z.boolean().optional(),
          investido: z.boolean().optional(),
          selladoPadres: z.boolean().optional(),
          selladoConyuge: z.boolean().optional(),
          fechaCalificaInvestidura: z.string().nullable().optional(),
        });
        const data = schema.parse(req.body);

        
        await db.execute(
          sql`INSERT INTO mission_templo_ordinanzas (persona_id, nombre_familiar_preparado, bautismo_antepasados, investido, sellado_padres, sellado_conyuge, fecha_califica_investidura, updated_at)
            VALUES (${req.params.id}, ${data.nombreFamiliarPreparado ?? false}, ${data.bautismoAntepasados ?? false}, ${data.investido ?? false}, ${data.selladoPadres ?? false}, ${data.selladoConyuge ?? false}, ${data.fechaCalificaInvestidura ?? null}, now())
            ON CONFLICT (persona_id) DO UPDATE SET
              nombre_familiar_preparado = EXCLUDED.nombre_familiar_preparado,
              bautismo_antepasados = EXCLUDED.bautismo_antepasados,
              investido = EXCLUDED.investido,
              sellado_padres = EXCLUDED.sellado_padres,
              sellado_conyuge = EXCLUDED.sellado_conyuge,
              fecha_califica_investidura = EXCLUDED.fecha_califica_investidura,
              updated_at = now()`
        );

        return res.json({ success: true });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission templo PUT]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  // -------------------------------------------------------
  // Self-reliance
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/self-reliance",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const [row] = await db
          .select()
          .from(missionSelfReliance)
          .where(eq(missionSelfReliance.personaId, req.params.id))
          .limit(1);

        return res.json(
          row || {
            personaId: req.params.id,
            resilienciaEmocional: false,
            finanzasPersonales: false,
            negocio: false,
            educacionEmpleo: false,
            buscarEmpleo: false,
          }
        );
      } catch (err) {
        console.error("[mission self-reliance GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.put(
    "/api/mission/personas/:id/self-reliance",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({
          resilienciaEmocional: z.boolean().optional(),
          finanzasPersonales: z.boolean().optional(),
          negocio: z.boolean().optional(),
          educacionEmpleo: z.boolean().optional(),
          buscarEmpleo: z.boolean().optional(),
        });
        const data = schema.parse(req.body);

        
        await db.execute(
          sql`INSERT INTO mission_self_reliance (persona_id, resiliencia_emocional, finanzas_personales, negocio, educacion_empleo, buscar_empleo, updated_at)
            VALUES (${req.params.id}, ${data.resilienciaEmocional ?? false}, ${data.finanzasPersonales ?? false}, ${data.negocio ?? false}, ${data.educacionEmpleo ?? false}, ${data.buscarEmpleo ?? false}, now())
            ON CONFLICT (persona_id) DO UPDATE SET
              resiliencia_emocional = EXCLUDED.resiliencia_emocional,
              finanzas_personales = EXCLUDED.finanzas_personales,
              negocio = EXCLUDED.negocio,
              educacion_empleo = EXCLUDED.educacion_empleo,
              buscar_empleo = EXCLUDED.buscar_empleo,
              updated_at = now()`
        );

        return res.json({ success: true });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission self-reliance PUT]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  // -------------------------------------------------------
  // Llamamiento
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/llamamiento",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const [row] = await db
          .select()
          .from(missionLlamamiento)
          .where(eq(missionLlamamiento.personaId, req.params.id))
          .limit(1);

        return res.json(row || { personaId: req.params.id, nombre: null });
      } catch (err) {
        console.error("[mission llamamiento GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.put(
    "/api/mission/personas/:id/llamamiento",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({ nombre: z.string().nullable().optional() });
        const data = schema.parse(req.body);

        
        await db.execute(
          sql`INSERT INTO mission_llamamiento (persona_id, nombre, updated_at)
            VALUES (${req.params.id}, ${data.nombre ?? null}, now())
            ON CONFLICT (persona_id) DO UPDATE SET nombre = EXCLUDED.nombre, updated_at = now()`
        );

        return res.json({ success: true });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission llamamiento PUT]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  // -------------------------------------------------------
  // Ministración
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/ministracion",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const [row] = await db
          .select()
          .from(missionMinistracion)
          .where(eq(missionMinistracion.personaId, req.params.id))
          .limit(1);

        return res.json(row || { personaId: req.params.id, descripcion: null });
      } catch (err) {
        console.error("[mission ministracion GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.put(
    "/api/mission/personas/:id/ministracion",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({ descripcion: z.string().nullable().optional() });
        const data = schema.parse(req.body);

        
        await db.execute(
          sql`INSERT INTO mission_ministracion (persona_id, descripcion, updated_at)
            VALUES (${req.params.id}, ${data.descripcion ?? null}, now())
            ON CONFLICT (persona_id) DO UPDATE SET descripcion = EXCLUDED.descripcion, updated_at = now()`
        );

        return res.json({ success: true });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission ministracion PUT]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  // -------------------------------------------------------
  // Otros compromisos
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/otros-compromisos",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const [row] = await db
          .select()
          .from(missionOtroCompromiso)
          .where(eq(missionOtroCompromiso.personaId, req.params.id))
          .limit(1);

        return res.json(
          row || { personaId: req.params.id, conocerObispo: false, historiaFamiliar: false }
        );
      } catch (err) {
        console.error("[mission otros-compromisos GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.put(
    "/api/mission/personas/:id/otros-compromisos",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({
          conocerObispo: z.boolean().optional(),
          historiaFamiliar: z.boolean().optional(),
        });
        const data = schema.parse(req.body);

        
        await db.execute(
          sql`INSERT INTO mission_otro_compromiso (persona_id, conocer_obispo, historia_familiar, updated_at)
            VALUES (${req.params.id}, ${data.conocerObispo ?? false}, ${data.historiaFamiliar ?? false}, now())
            ON CONFLICT (persona_id) DO UPDATE SET
              conocer_obispo = EXCLUDED.conocer_obispo,
              historia_familiar = EXCLUDED.historia_familiar,
              updated_at = now()`
        );

        return res.json({ success: true });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission otros-compromisos PUT]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  // -------------------------------------------------------
  // Compromisos bautismales (auto-create 10 on first access)
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/compromisos-bautismo",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        let rows = await db
          .select()
          .from(missionCompromisoBautismo)
          .where(eq(missionCompromisoBautismo.personaId, req.params.id))
          .orderBy(missionCompromisoBautismo.orden);

        if (rows.length === 0) {
          const inserts = BAPTISM_COMMITMENTS.map((c) => ({
            personaId: req.params.id,
            commitmentKey: c.key,
            nombre: c.nombre,
            orden: c.orden,
            fechaInvitado: null,
            fechaCumplido: null,
          }));
          rows = await db.insert(missionCompromisoBautismo).values(inserts).returning();
          rows.sort((a, b) => a.orden - b.orden);
        }

        return res.json(rows);
      } catch (err) {
        console.error("[mission compromisos-bautismo GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.put(
    "/api/mission/personas/:id/compromisos-bautismo/:key",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({
          fecha_invitado: z.string().nullable().optional(),
          fecha_cumplido: z.string().nullable().optional(),
        });
        const { fecha_invitado, fecha_cumplido } = schema.parse(req.body);

        const payload: { fechaInvitado?: string | null; fechaCumplido?: string | null } = {};
        if (fecha_invitado !== undefined) payload.fechaInvitado = fecha_invitado;
        if (fecha_cumplido !== undefined) payload.fechaCumplido = fecha_cumplido;

        if (Object.keys(payload).length === 0) {
          return res.status(400).json({ message: "Sin cambios" });
        }

        await db
          .update(missionCompromisoBautismo)
          .set(payload)
          .where(
            and(
              eq(missionCompromisoBautismo.personaId, req.params.id),
              eq(missionCompromisoBautismo.commitmentKey, req.params.key)
            )
          );

        // Sync interview date to mission_personas when the entrevista_bautismo commitment changes
        if (req.params.key === "entrevista_bautismo" && fecha_cumplido !== undefined) {
          await db.execute(
            sql`UPDATE mission_personas SET fecha_entrevista_bautismal = ${fecha_cumplido ?? null} WHERE id = ${req.params.id}`
          );
          // Trigger checklist sync for the baptism service linked to this persona
          const svcRow = await db.execute(
            sql`SELECT bs.id FROM baptism_services bs
                JOIN baptism_service_candidates bsc ON bsc.service_id = bs.id
                WHERE bsc.persona_id = ${req.params.id} AND bs.status != 'archived'
                UNION
                SELECT id FROM baptism_services
                WHERE candidate_persona_id = ${req.params.id} AND status != 'archived'
                LIMIT 1`
          );
          const svcId = (svcRow.rows[0] as any)?.id;
          if (svcId) syncBaptismInterviewChecklistItem(svcId).catch((e) => console.error("[compromisos-bautismo PUT] syncInterview error:", e));
        }

        // Sync baptism date and trigger service auto-creation when bautizado_confirmado fecha_invitado changes
        if (req.params.key === "bautizado_confirmado" && fecha_invitado !== undefined) {
          await db.execute(
            sql`UPDATE mission_personas SET fecha_bautismo = ${fecha_invitado ?? null} WHERE id = ${req.params.id}`
          );
          if (fecha_invitado) {
            const personaRow = await db.execute(
              sql`SELECT nombre, tipo FROM mission_personas WHERE id = ${req.params.id} LIMIT 1`
            );
            const persona = personaRow.rows[0] as any;
            if (persona?.tipo === "enseñando") {
              getMissionUnitId(user).then((resolvedUnitId) => {
                if (!resolvedUnitId) return;
                autoLinkBaptismService({
                  personaId: req.params.id,
                  personaNombre: persona.nombre,
                  fechaBautismo: fecha_invitado,
                  unitId: resolvedUnitId,
                  userId: user.id,
                });
              }).catch((err) => console.error("[compromisos-bautismo PUT] autoLinkBaptismService error:", err));
            }
          }
        }

        return res.json({ success: true });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission compromisos-bautismo PUT]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  // -------------------------------------------------------
  // Sesiones de principios
  // -------------------------------------------------------
  app.get(
    "/api/mission/personas/:id/sesiones",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const rows = await db
          .select()
          .from(missionSesionPrincipio)
          .where(eq(missionSesionPrincipio.personaId, req.params.id));

        return res.json(rows);
      } catch (err) {
        console.error("[mission sesiones GET]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.put(
    "/api/mission/personas/:id/sesiones",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const schema = z.object({
          principio_id: z.number().int(),
          sesion_num: z.number().int(),
          miembro_presente: z.boolean().default(false),
          fecha: z.string().nullable().optional(),
        });
        const data = schema.parse(req.body);

        
        await db.execute(
          sql`INSERT INTO mission_sesion_principio (persona_id, principio_id, sesion_num, miembro_presente, fecha)
            VALUES (${req.params.id}, ${data.principio_id}, ${data.sesion_num}, ${data.miembro_presente}, ${data.fecha ?? null})
            ON CONFLICT (persona_id, principio_id, sesion_num) DO UPDATE SET
              miembro_presente = EXCLUDED.miembro_presente,
              fecha = EXCLUDED.fecha`
        );

        return res.json({ success: true });
      } catch (err) {
        if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
        console.error("[mission sesiones PUT]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  app.delete(
    "/api/mission/personas/:id/sesiones/:principioId/:sesionNum",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

        const principioId = Number(req.params.principioId);
        const sesionNum = Number(req.params.sesionNum);
        if (!Number.isInteger(principioId) || !Number.isInteger(sesionNum)) {
          return res.status(400).json({ message: "Parámetros inválidos" });
        }

        await db
          .delete(missionSesionPrincipio)
          .where(
            and(
              eq(missionSesionPrincipio.personaId, req.params.id),
              eq(missionSesionPrincipio.principioId, principioId),
              eq(missionSesionPrincipio.sesionNum, sesionNum)
            )
          );

        return res.json({ success: true });
      } catch (err) {
        console.error("[mission sesiones DELETE]", err);
        return res.status(500).json({ message: "Error interno" });
      }
    }
  );

  // -------------------------------------------------------
  // Baptism services (persona-based)
  // -------------------------------------------------------

  // GET /api/mission/baptism-services — list all for the unit
  app.get("/api/mission/baptism-services", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const unitId = await getMissionUnitId(user);
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });
      const result = await db.execute(sql`
        SELECT bs.*,
          json_agg(json_build_object('id', mp.id, 'nombre', mp.nombre) ORDER BY mp.nombre) AS candidates,
          string_agg(mp.nombre, ', ' ORDER BY mp.nombre) AS persona_nombre
        FROM baptism_services bs
        JOIN baptism_service_candidates bsc ON bsc.service_id = bs.id
        JOIN mission_personas mp ON mp.id = bsc.persona_id
        WHERE bs.unit_id = ${unitId}
          AND bs.status != 'archived'
        GROUP BY bs.id
        ORDER BY bs.service_at ASC
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error("[mission/baptism-services GET]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // GET /api/mission/personas/:id/baptism-service — get service for a persona
  app.get("/api/mission/personas/:id/baptism-service", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const result = await db.execute(sql`
        SELECT bs.*,
          json_agg(DISTINCT jsonb_build_object('id', mp.id, 'nombre', mp.nombre) ORDER BY jsonb_build_object('id', mp.id, 'nombre', mp.nombre)) AS candidates,
          string_agg(DISTINCT mp.nombre ORDER BY mp.nombre) AS persona_nombre,
          (SELECT json_agg(pi ORDER BY pi.order)
           FROM baptism_program_items pi WHERE pi.service_id = bs.id) AS program_items,
          (SELECT json_agg(a)
           FROM baptism_assignments a WHERE a.service_id = bs.id) AS assignments
        FROM baptism_services bs
        JOIN baptism_service_candidates bsc ON bsc.service_id = bs.id
        JOIN mission_personas mp ON mp.id = bsc.persona_id
        WHERE bs.id = (
          SELECT bs2.id FROM baptism_services bs2
          JOIN baptism_service_candidates bsc2 ON bsc2.service_id = bs2.id
          WHERE bsc2.persona_id = ${req.params.id} AND bs2.status != 'archived'
          ORDER BY bs2.created_at DESC LIMIT 1
        )
        GROUP BY bs.id
      `);
      if (result.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
      return res.json(result.rows[0]);
    } catch (err) {
      console.error("[mission/personas/:id/baptism-service GET]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // GET /api/mission/baptism-services/:id — get service detail by service ID
  app.get("/api/mission/baptism-services/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const unitId = await getMissionUnitId(user);
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });
      const result = await db.execute(sql`
        SELECT bs.*,
          (SELECT json_agg(c ORDER BY c->>'nombre')
           FROM (
             SELECT jsonb_build_object(
               'id', mp2.id,
               'nombre', mp2.nombre,
               'entrevista_invitado', mcb.fecha_invitado,
               'entrevista_fecha', mcb.fecha_cumplido
             ) AS c
             FROM (
               SELECT persona_id FROM baptism_service_candidates WHERE service_id = bs.id
               UNION
               SELECT candidate_persona_id FROM baptism_services
               WHERE id = bs.id AND candidate_persona_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM baptism_service_candidates WHERE service_id = bs.id)
             ) cands
             JOIN mission_personas mp2 ON mp2.id = cands.persona_id
             LEFT JOIN mission_compromiso_bautismo mcb
               ON mcb.persona_id = cands.persona_id AND mcb.commitment_key = 'entrevista_bautismo'
           ) sub) AS candidates,
          (SELECT string_agg(mp2.nombre, ', ' ORDER BY mp2.nombre)
           FROM baptism_service_candidates bsc2
           JOIN mission_personas mp2 ON mp2.id = bsc2.persona_id
           WHERE bsc2.service_id = bs.id) AS persona_nombre,
          (SELECT json_agg(pi ORDER BY pi."order")
           FROM baptism_program_items pi WHERE pi.service_id = bs.id) AS program_items,
          (SELECT json_agg(a)
           FROM baptism_assignments a WHERE a.service_id = bs.id) AS assignments
        FROM baptism_services bs
        WHERE bs.id = ${req.params.id}
          AND bs.unit_id = ${unitId}
      `);
      if (result.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
      return res.json(result.rows[0]);
    } catch (err) {
      console.error("[mission/baptism-services/:id GET]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // DELETE /api/mission/baptism-services/:id — delete service + clear fechaBautismo on personas (obispado only)
  app.delete("/api/mission/baptism-services/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const canDelete = user.role === "obispo" || user.role === "consejero_obispo";
      if (!canDelete) return res.status(403).json({ message: "Sin acceso" });

      const serviceId = req.params.id;

      // Clear fecha_bautismo on all associated personas before deleting
      await db.execute(sql`
        UPDATE mission_personas SET fecha_bautismo = NULL, updated_at = NOW()
        WHERE id IN (
          SELECT persona_id FROM baptism_service_candidates WHERE service_id = ${serviceId}
        )
      `);

      // Delete linked activity (FK is ON DELETE SET NULL, so must delete manually)
      await db.execute(sql`DELETE FROM activities WHERE baptism_service_id = ${serviceId}`);

      // Delete linked service tasks (logistics)
      await db.execute(sql`DELETE FROM service_tasks WHERE baptism_service_id = ${serviceId}`);

      // Delete the service (CASCADE handles candidates, program_items, assignments, etc.)
      await db.execute(sql`DELETE FROM baptism_services WHERE id = ${serviceId}`);

      return res.json({ success: true });
    } catch (err) {
      console.error("[mission/baptism-services/:id DELETE]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // PATCH /api/mission/baptism-services/:id — update service info or approval status
  app.patch("/api/mission/baptism-services/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const unitId = await getMissionUnitId(user);
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });
      const schema = z.object({
        locationName: z.string().min(1).optional(),
        locationAddress: z.string().nullable().optional(),
        mapsUrl: z.string().nullable().optional(),
        serviceAt: z.string().optional(),
        approvalStatus: z.enum(["draft", "pending_approval", "approved", "needs_revision"]).optional(),
        approvalComment: z.string().nullable().optional(),
      });
      const data = schema.parse(req.body);

      // Only obispo/consejero can approve or mark as needs_revision
      if (data.approvalStatus === "approved" || data.approvalStatus === "needs_revision") {
        const isObispo = user.role === "obispo" || user.role === "consejero_obispo";
        if (!isObispo) return res.status(403).json({ message: "Solo el obispado puede aprobar o rechazar" });
      }

      const sets: string[] = ["updated_at = now()"];
      if (data.locationName) sets.push(`location_name = '${data.locationName.replace(/'/g, "''")}'`);
      if (data.locationAddress !== undefined) sets.push(`location_address = ${data.locationAddress ? `'${data.locationAddress.replace(/'/g, "''")}'` : "NULL"}`);
      if (data.mapsUrl !== undefined) sets.push(`maps_url = ${data.mapsUrl ? `'${data.mapsUrl.replace(/'/g, "''")}'` : "NULL"}`);
      if (data.serviceAt) {
        const serviceAt = new Date(data.serviceAt);
        const prepDeadline = new Date(serviceAt);
        prepDeadline.setUTCDate(prepDeadline.getUTCDate() - 14);
        sets.push(`service_at = '${serviceAt.toISOString()}'`);
        sets.push(`prep_deadline_at = '${prepDeadline.toISOString()}'`);
      }
      if (data.approvalStatus) {
        sets.push(`approval_status = '${data.approvalStatus}'`);
        if (data.approvalStatus === "approved") {
          sets.push(`approved_by = '${user.id}'`);
          sets.push(`approved_at = now()`);
        } else {
          sets.push(`approved_by = NULL`);
          sets.push(`approved_at = NULL`);
        }
      }
      if (data.approvalComment !== undefined) {
        sets.push(`approval_comment = ${data.approvalComment ? `'${data.approvalComment.replace(/'/g, "''")}'` : "NULL"}`);
      }

      await db.execute(sql`
        UPDATE baptism_services
        SET ${sql.raw(sets.join(", "))}
        WHERE id = ${req.params.id} AND unit_id = ${unitId}
      `);
      const result = await db.execute(sql`SELECT * FROM baptism_services WHERE id = ${req.params.id}`);
      return res.json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
      console.error("[mission/baptism-services/:id PATCH]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // PUT /api/mission/baptism-services/:id/program-items — upsert a program item
  app.put("/api/mission/baptism-services/:id/program-items", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const schema = z.object({
        type: z.enum(["opening_prayer", "hymn", "talk", "special_music", "ordinance_baptism", "closing_prayer"]),
        order: z.number().int().default(0),
        title: z.string().nullable().optional(),
        participantDisplayName: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        publicVisibility: z.boolean().default(true),
      });
      const data = schema.parse(req.body);
      await db.execute(sql`
        INSERT INTO baptism_program_items
          (service_id, "order", type, title, participant_display_name, notes, public_visibility, updated_by, updated_at)
        VALUES
          (${req.params.id}, ${data.order}, ${data.type}, ${data.title ?? null},
           ${data.participantDisplayName ?? null}, ${data.notes ?? null}, ${data.publicVisibility}, ${user.id}, now())
        ON CONFLICT DO NOTHING
      `);
      const result = await db.execute(sql`
        SELECT * FROM baptism_program_items WHERE service_id = ${req.params.id} ORDER BY "order"
      `);
      return res.json(result.rows);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
      console.error("[mission/baptism-services/:id/program-items PUT]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // PATCH /api/mission/baptism-program-items/:itemId — update a program item
  app.patch("/api/mission/baptism-program-items/:itemId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const schema = z.object({
        title: z.string().nullable().optional(),
        participantDisplayName: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        publicVisibility: z.boolean().optional(),
      });
      const data = schema.parse(req.body);
      await db.execute(sql`
        UPDATE baptism_program_items SET
          title = ${data.title ?? null},
          participant_display_name = ${data.participantDisplayName ?? null},
          notes = ${data.notes ?? null},
          public_visibility = ${data.publicVisibility ?? true},
          updated_by = ${user.id},
          updated_at = now()
        WHERE id = ${req.params.itemId}
      `);
      const result = await db.execute(sql`SELECT * FROM baptism_program_items WHERE id = ${req.params.itemId}`);
      return res.json(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.message });
      console.error("[mission/baptism-program-items/:itemId PATCH]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // Bulk upsert all program items at once
  app.put("/api/baptisms/services/:id/program", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const unitId = await getMissionUnitId(user);
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });

      const items: Array<{ type: string; participantDisplayName?: string | null }> = req.body.items ?? [];
      if (!Array.isArray(items)) return res.status(400).json({ message: "items debe ser un array" });

      const svcCheck = await db.execute(sql`
        SELECT id FROM baptism_services WHERE id = ${req.params.id} AND unit_id = ${unitId}
      `);
      if (!svcCheck.rows.length) return res.status(404).json({ message: "Servicio no encontrado" });

      for (let i = 0; i < items.length; i++) {
        const { type, participantDisplayName } = items[i];
        await db.execute(sql`
          INSERT INTO baptism_program_items (service_id, type, "order", participant_display_name, updated_by, updated_at)
          VALUES (${req.params.id}, ${type}, ${i}, ${participantDisplayName ?? null}, ${user.id}, NOW())
          ON CONFLICT (service_id, type) DO UPDATE SET
            participant_display_name = EXCLUDED.participant_display_name,
            "order" = EXCLUDED."order",
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
        `);
      }

      const updated = await db.execute(sql`
        SELECT * FROM baptism_program_items WHERE service_id = ${req.params.id} ORDER BY "order"
      `);

      // Auto-mark "programa" checklist item if all required program fields are filled
      const PROGRAM_ORDER = ["preside","dirige","dirige_musica","acompanamiento_piano","primer_himno","oracion_apertura","primer_mensaje","numero_especial","segundo_mensaje","ordenanza_bautismo","ordenanza_confirmacion","ultimo_himno","ultima_oracion"];
      const savedMap = new Map(items.map((it) => [it.type, it.participantDisplayName]));
      const programComplete = PROGRAM_ORDER.every((t) => savedMap.get(t)?.trim());
      if (programComplete) {
        const activityRow = await db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.baptismServiceId, req.params.id))
          .limit(1);
        if (activityRow.length > 0) {
          await db.execute(sql`
            UPDATE activity_checklist_items
            SET completed = true, completed_by = ${user.id}, completed_at = NOW()
            WHERE activity_id = ${activityRow[0].id} AND item_key = 'programa' AND completed = false
          `);
        }
      }

      return res.json(updated.rows);
    } catch (err) {
      console.error("[baptisms/services/:id/program PUT]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // Toggle a checklist item for a baptism service
  app.patch("/api/baptisms/services/:id/checklist-item/:itemId", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const { completed } = req.body;
      if (typeof completed !== "boolean") return res.status(400).json({ message: "completed requerido" });

      // Verify the item belongs to an activity linked to this service
      const check = await db.execute(sql`
        SELECT ci.id, ci.item_key FROM activity_checklist_items ci
        JOIN activities a ON a.id = ci.activity_id
        WHERE ci.id = ${req.params.itemId} AND a.baptism_service_id = ${req.params.id}
      `);
      if (!check.rows.length) return res.status(404).json({ message: "Ítem no encontrado" });

      await db.execute(sql`
        UPDATE activity_checklist_items
        SET completed = ${completed},
            completed_by = ${completed ? user.id : null},
            completed_at = ${completed ? sql`NOW()` : null}
        WHERE id = ${req.params.itemId}
      `);

      const result = await db.execute(sql`SELECT * FROM activity_checklist_items WHERE id = ${req.params.itemId}`);
      return res.json(result.rows[0]);
    } catch (err) {
      console.error("[baptisms/services/:id/checklist-item/:itemId PATCH]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // Checklist de actividad vinculada al servicio bautismal
  app.get("/api/baptisms/services/:id/activity-checklist", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });

      let [activity] = await db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.baptismServiceId, req.params.id))
        .limit(1);

      // Fallback: find orphaned servicio_bautismal activity for same unit and re-link it
      if (!activity) {
        const svcRow = await db.execute(sql`
          SELECT service_at, unit_id FROM baptism_services WHERE id = ${req.params.id}
        `);
        if (svcRow.rows.length > 0) {
          const svc = svcRow.rows[0] as any;
          const orphan = await db.execute(sql`
            SELECT id FROM activities
            WHERE type = 'servicio_bautismal'
              AND organization_id = ${svc.unit_id}
              AND (baptism_service_id IS NULL OR baptism_service_id = ${req.params.id})
              AND DATE(date) = DATE(${svc.service_at})
            ORDER BY created_at ASC
            LIMIT 1
          `);
          if (orphan.rows.length > 0) {
            const orphanId = (orphan.rows[0] as any).id;
            await db.execute(sql`
              UPDATE activities SET baptism_service_id = ${req.params.id} WHERE id = ${orphanId}
            `);
            [activity] = await db
              .select({ id: activities.id })
              .from(activities)
              .where(eq(activities.baptismServiceId, req.params.id))
              .limit(1);
          }
        }
      }

      if (!activity) return res.json({ items: [], completedCount: 0, totalCount: 0 });

      // Ensure all default checklist items exist for this activity (in case activity was created before checklist system)
      await db.execute(sql`
        INSERT INTO activity_checklist_items (activity_id, item_key, label, sort_order, completed)
        VALUES
          (${activity.id}, 'programa',              'Programa de la actividad',                            0, false),
          (${activity.id}, 'espacio_calendario',    'Espacio reservado en calendario de la iglesia',       1, false),
          (${activity.id}, 'arreglo_espacios',      'Arreglo de espacios (sillas, decoración, etc.)',      2, false),
          (${activity.id}, 'equipo_tecnologia',     'Equipo y tecnología coordinado con líderes',          3, false),
          (${activity.id}, 'presupuesto_refrigerio','Solicitud de presupuesto para refrigerio (si aplica)',4, false),
          (${activity.id}, 'limpieza',              'Limpieza de ambientes al terminar el servicio',       5, false),
          (${activity.id}, 'ropa_bautismal',        'Ropa bautismal coordinada',                           6, false),
          (${activity.id}, 'entrevista_bautismal',  'Candidatos han completado la entrevista bautismal',   7, false)
        ON CONFLICT (activity_id, item_key) DO UPDATE SET label = EXCLUDED.label
      `);

      // Sync 'programa' item: mark complete if all program fields are filled
      const PROGRAM_ORDER = ["preside","dirige","dirige_musica","acompanamiento_piano","primer_himno","oracion_apertura","primer_mensaje","numero_especial","segundo_mensaje","ordenanza_bautismo","ordenanza_confirmacion","ultimo_himno","ultima_oracion"];
      const programItemsRows = await db.execute(sql`
        SELECT type, participant_display_name FROM baptism_program_items
        WHERE service_id = ${req.params.id}
      `);
      const filledTypes = new Set(
        (programItemsRows.rows as any[])
          .filter((r) => PROGRAM_ORDER.includes(r.type) && r.participant_display_name?.trim())
          .map((r) => r.type)
      );
      const programComplete = PROGRAM_ORDER.every((t) => filledTypes.has(t));
      if (programComplete) {
        await db.execute(sql`
          UPDATE activity_checklist_items
          SET completed = true, completed_by = ${user.id}, completed_at = NOW()
          WHERE activity_id = ${activity.id} AND item_key = 'programa' AND completed = false
        `);
      } else {
        await db.execute(sql`
          UPDATE activity_checklist_items
          SET completed = false, completed_by = NULL, completed_at = NULL
          WHERE activity_id = ${activity.id} AND item_key = 'programa' AND completed = true
        `);
      }

      // Sync 'ropa_bautismal': complete when both prueba_responsable and ropa_responsable are set
      const ropaDetailsRow = await db.execute(sql`
        SELECT ropa_responsable, prueba_responsable FROM baptism_service_baptism_details
        WHERE service_id = ${req.params.id}
      `);
      const ropaDetails = ropaDetailsRow.rows[0] as any;
      const ropaComplete = !!(ropaDetails?.ropa_responsable?.trim()) && !!(ropaDetails?.prueba_responsable?.trim());
      if (ropaComplete) {
        await db.execute(sql`
          UPDATE activity_checklist_items
          SET completed = true, completed_by = ${user.id}, completed_at = NOW()
          WHERE activity_id = ${activity.id} AND item_key = 'ropa_bautismal' AND completed = false
        `);
      } else {
        await db.execute(sql`
          UPDATE activity_checklist_items
          SET completed = false, completed_by = NULL, completed_at = NULL
          WHERE activity_id = ${activity.id} AND item_key = 'ropa_bautismal' AND completed = true
        `);
      }

      const items = await db
        .select()
        .from(activityChecklistItems)
        .where(eq(activityChecklistItems.activityId, activity.id))
        .orderBy(asc(activityChecklistItems.sortOrder));

      return res.json({
        items,
        completedCount: items.filter((i) => i.completed).length,
        totalCount: items.length,
      });
    } catch (err) {
      console.error("[baptisms/services/:id/activity-checklist GET]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // Enviar servicio bautismal a aprobación del obispo
  app.post("/api/baptisms/services/:id/submit-for-approval", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ message: "Sin acceso" });
      const unitId = await getMissionUnitId(user);
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });

      const svcResult = await db.execute(sql`
        SELECT id, location_name, approval_status, unit_id
        FROM baptism_services WHERE id = ${req.params.id} AND unit_id = ${unitId}
      `);
      if (!svcResult.rows.length) return res.status(404).json({ message: "Servicio no encontrado" });
      const service = svcResult.rows[0] as any;

      if (!["draft", "needs_revision"].includes(service.approval_status)) {
        return res.status(400).json({ message: "Solo se puede enviar desde borrador o necesita revisión" });
      }

      await db.execute(sql`
        UPDATE baptism_services SET approval_status = 'pending_approval', approval_comment = NULL, updated_at = NOW()
        WHERE id = ${req.params.id}
      `);

      // Notify bishops (DB + push + email)
      const bishops = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.organizationId, unitId), eq(users.role, "obispo" as any)));

      const wardNameSubmit = (await storage.getPdfTemplate())?.wardName ?? null;
      for (const bishop of bishops) {
        const notifSubmit = await db.insert(notifications).values({
          userId: bishop.id,
          title: "Agenda bautismal pendiente de aprobación",
          message: `El servicio en ${service.location_name} está listo y necesita tu aprobación.`,
          type: "reminder",
          relatedId: req.params.id,
        }).returning();
        if (isPushConfigured()) {
          await sendPushNotification(bishop.id, {
            title: "Agenda bautismal pendiente de aprobación",
            body: `El servicio en ${service.location_name} está listo y necesita tu aprobación.`,
            url: `/mission-work?section=servicios_bautismales&highlight=${req.params.id}`,
            notificationId: (notifSubmit[0] as any)?.id,
          });
        }
        if (bishop.email) {
          await sendAgendaReminderEmail({
            toEmail: bishop.email,
            subject: "Agenda bautismal pendiente de aprobación",
            body: [
              `Estimado/a ${bishop.name},`,
              "",
              `El programa del servicio bautismal en ${service.location_name} ha sido enviado para tu aprobación.`,
              "",
              "Por favor, revísalo en la aplicación desde Obra Misional > Servicios Bautismales.",
              "",
              wardNameSubmit || "Tu barrio",
            ].join("\n"),
            wardName: wardNameSubmit,
          });
        }
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("[baptisms/services/:id/submit-for-approval POST]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // Convert JS array to PostgreSQL array literal string (e.g. ["a","b"] → '{"a","b"}')
  // Drizzle's sql template doesn't auto-serialize JS arrays as pg text[].
  const toDbArr = (val: any): string | null => {
    if (!val || !Array.isArray(val)) return null;
    const items = (val as any[]).filter((s) => s != null && String(s).trim() !== "");
    if (items.length === 0) return null;
    const escaped = items.map((s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
    return `{${escaped}}`;
  };

  // GET /api/baptisms/services/:id/coordination — fetch logistics + baptism details
  app.get("/api/baptisms/services/:id/coordination", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const unitId = await getMissionUnitId(user);
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });
      const svcCheck = await db.execute(sql`
        SELECT id FROM baptism_services WHERE id = ${id} AND unit_id = ${unitId}
      `);
      if (!svcCheck.rows.length) return res.status(404).json({ message: "No encontrado" });

      const [logRow, detRow] = await Promise.all([
        db.execute(sql`SELECT * FROM baptism_service_logistics WHERE service_id = ${id}`),
        db.execute(sql`SELECT * FROM baptism_service_baptism_details WHERE service_id = ${id}`),
      ]);
      return res.json({
        logistics: logRow.rows[0] ?? null,
        baptismDetails: detRow.rows[0] ?? null,
      });
    } catch (err) {
      console.error("[baptisms/services/:id/coordination GET]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // PUT /api/baptisms/services/:id/coordination — upsert logistics + baptism details
  app.put("/api/baptisms/services/:id/coordination", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const unitId = await getMissionUnitId(user);
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });
      const svcCheck = await db.execute(sql`
        SELECT id FROM baptism_services WHERE id = ${id} AND unit_id = ${unitId}
      `);
      if (!svcCheck.rows.length) return res.status(404).json({ message: "No encontrado" });

      const { logistics = {}, baptismDetails = {} } = req.body as {
        logistics?: Record<string, any>;
        baptismDetails?: Record<string, any>;
      };

      // Upsert logistics
      if (Object.keys(logistics).length) {
        await db.execute(sql`
          INSERT INTO baptism_service_logistics (
            service_id,
            espacio_responsable, espacio_fecha, espacio_hora_inicio, espacio_hora_fin, espacio_salas, espacio_notas,
            espacio_comprobante_url, espacio_comprobante_nombre,
            arreglo_responsable, arreglo_participantes, arreglo_hora, arreglo_tareas, arreglo_fecha, arreglo_notas,
            arreglo_tasks, arreglo_necesita_presupuesto, arreglo_presupuesto_solicitado,
            equipo_responsable, equipo_lista, equipo_fecha, equipo_notas,
            refrigerio_responsable, refrigerio_responsables, refrigerio_presupuesto_solicitado, refrigerio_necesita_presupuesto, refrigerio_detalle, refrigerio_notas,
            limpieza_responsable, limpieza_tareas, limpieza_fecha, limpieza_notas,
            updated_by, updated_at
          ) VALUES (
            ${id},
            ${logistics.espacio_responsable ?? null}, ${logistics.espacio_fecha ?? null},
            ${logistics.espacio_hora_inicio ?? null}, ${logistics.espacio_hora_fin ?? null},
            CAST(${toDbArr(logistics.espacio_salas)} AS text[]), ${logistics.espacio_notas ?? null},
            ${logistics.espacio_comprobante_url ?? null}, ${logistics.espacio_comprobante_nombre ?? null},
            ${logistics.arreglo_responsable ?? null}, CAST(${toDbArr(logistics.arreglo_participantes)} AS text[]), ${logistics.arreglo_hora ?? null},
            CAST(${toDbArr(logistics.arreglo_tareas)} AS text[]), ${logistics.arreglo_fecha ?? null}, ${logistics.arreglo_notas ?? null},
            ${logistics.arreglo_tasks != null ? JSON.stringify(logistics.arreglo_tasks) : null}::jsonb,
            ${logistics.arreglo_necesita_presupuesto ?? false}, ${logistics.arreglo_presupuesto_solicitado ?? false},
            ${logistics.equipo_responsable ?? null}, ${logistics.equipo_lista ?? null},
            ${logistics.equipo_fecha ?? null}, ${logistics.equipo_notas ?? null},
            ${logistics.refrigerio_responsable ?? null}, CAST(${toDbArr(logistics.refrigerio_responsables)} AS text[]),
            ${logistics.refrigerio_presupuesto_solicitado ?? false},
            ${logistics.refrigerio_necesita_presupuesto ?? false}, ${logistics.refrigerio_detalle ?? null}, ${logistics.refrigerio_notas ?? null},
            ${logistics.limpieza_responsable ?? null}, CAST(${toDbArr(logistics.limpieza_tareas)} AS text[]),
            ${logistics.limpieza_fecha ?? null}, ${logistics.limpieza_notas ?? null},
            ${user.id}, NOW()
          )
          ON CONFLICT (service_id) DO UPDATE SET
            espacio_responsable = EXCLUDED.espacio_responsable,
            espacio_fecha = EXCLUDED.espacio_fecha,
            espacio_hora_inicio = EXCLUDED.espacio_hora_inicio,
            espacio_hora_fin = EXCLUDED.espacio_hora_fin,
            espacio_salas = EXCLUDED.espacio_salas,
            espacio_notas = EXCLUDED.espacio_notas,
            espacio_comprobante_url = EXCLUDED.espacio_comprobante_url,
            espacio_comprobante_nombre = EXCLUDED.espacio_comprobante_nombre,
            arreglo_responsable = EXCLUDED.arreglo_responsable,
            arreglo_participantes = EXCLUDED.arreglo_participantes,
            arreglo_hora = EXCLUDED.arreglo_hora,
            arreglo_tareas = EXCLUDED.arreglo_tareas,
            arreglo_fecha = EXCLUDED.arreglo_fecha,
            arreglo_notas = EXCLUDED.arreglo_notas,
            arreglo_tasks = EXCLUDED.arreglo_tasks,
            arreglo_necesita_presupuesto = EXCLUDED.arreglo_necesita_presupuesto,
            arreglo_presupuesto_solicitado = EXCLUDED.arreglo_presupuesto_solicitado,
            equipo_responsable = EXCLUDED.equipo_responsable,
            equipo_lista = EXCLUDED.equipo_lista,
            equipo_fecha = EXCLUDED.equipo_fecha,
            equipo_notas = EXCLUDED.equipo_notas,
            refrigerio_responsable = EXCLUDED.refrigerio_responsable,
            refrigerio_responsables = EXCLUDED.refrigerio_responsables,
            refrigerio_presupuesto_solicitado = EXCLUDED.refrigerio_presupuesto_solicitado,
            refrigerio_necesita_presupuesto = EXCLUDED.refrigerio_necesita_presupuesto,
            refrigerio_detalle = EXCLUDED.refrigerio_detalle,
            refrigerio_notas = EXCLUDED.refrigerio_notas,
            limpieza_responsable = EXCLUDED.limpieza_responsable,
            limpieza_tareas = EXCLUDED.limpieza_tareas,
            limpieza_fecha = EXCLUDED.limpieza_fecha,
            limpieza_notas = EXCLUDED.limpieza_notas,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        `);
      }

      // Upsert baptism details
      if (Object.keys(baptismDetails).length) {
        await db.execute(sql`
          INSERT INTO baptism_service_baptism_details (
            service_id,
            ropa_responsable, ropa_origen, ropa_fecha, ropa_notas,
            prueba_responsable, prueba_confirmada, prueba_fecha, prueba_notas,
            entrevista_fecha, entrevista_autoridad, entrevista_notas,
            updated_by, updated_at
          ) VALUES (
            ${id},
            ${baptismDetails.ropa_responsable ?? null}, ${baptismDetails.ropa_origen ?? null},
            ${baptismDetails.ropa_fecha ?? null}, ${baptismDetails.ropa_notas ?? null},
            ${baptismDetails.prueba_responsable ?? null},
            ${baptismDetails.prueba_confirmada ?? false}, ${baptismDetails.prueba_fecha ?? null},
            ${baptismDetails.prueba_notas ?? null},
            ${baptismDetails.entrevista_fecha ?? null}, ${baptismDetails.entrevista_autoridad ?? null},
            ${baptismDetails.entrevista_notas ?? null},
            ${user.id}, NOW()
          )
          ON CONFLICT (service_id) DO UPDATE SET
            ropa_responsable = EXCLUDED.ropa_responsable,
            ropa_origen = EXCLUDED.ropa_origen,
            ropa_fecha = EXCLUDED.ropa_fecha,
            ropa_notas = EXCLUDED.ropa_notas,
            prueba_responsable = EXCLUDED.prueba_responsable,
            prueba_confirmada = EXCLUDED.prueba_confirmada,
            prueba_fecha = EXCLUDED.prueba_fecha,
            prueba_notas = EXCLUDED.prueba_notas,
            entrevista_fecha = EXCLUDED.entrevista_fecha,
            entrevista_autoridad = EXCLUDED.entrevista_autoridad,
            entrevista_notas = EXCLUDED.entrevista_notas,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        `);
      }

      const [logRow, detRow] = await Promise.all([
        db.execute(sql`SELECT * FROM baptism_service_logistics WHERE service_id = ${id}`),
        db.execute(sql`SELECT * FROM baptism_service_baptism_details WHERE service_id = ${id}`),
      ]);
      return res.json({
        logistics: logRow.rows[0] ?? null,
        baptismDetails: detRow.rows[0] ?? null,
      });
    } catch (err) {
      console.error("[baptisms/services/:id/coordination PUT]", err);
      return res.status(500).json({ message: "Error interno" });
    }
  });

  // POST /api/baptisms/services/:id/approve
  app.post("/api/baptisms/services/:id/approve", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!["obispo", "consejero_obispo"].includes(user.role))
        return res.status(403).json({ error: "Forbidden" });

      const svcResult = await db.execute(sql`
        SELECT id, unit_id, approval_status, created_by, location_name, candidate_persona_id, service_at
        FROM baptism_services WHERE id = ${req.params.id}
      `);
      const service = svcResult.rows[0] as any;
      if (!service) return res.status(404).json({ error: "Service not found" });
      if (service.approval_status !== "pending_approval")
        return res.status(400).json({ error: "El servicio no está pendiente de aprobación" });

      const now = new Date();
      await db.execute(sql`
        UPDATE baptism_services
        SET approval_status = 'approved', approved_by = ${user.id}, approved_at = ${now},
            approval_comment = NULL, updated_at = ${now}
        WHERE id = ${service.id}
      `);

      // Return success immediately — approval is committed
      res.json({ success: true });

      // Secondary operations: non-fatal, logged on failure
      try {
        await db.execute(sql`
          UPDATE baptism_public_links
          SET revoked_at = ${now}, revoked_by = ${user.id}
          WHERE service_id = ${service.id} AND revoked_at IS NULL AND expires_at > ${now}
        `);
        const latestSlugResult = await db.execute(sql`
          SELECT slug FROM baptism_public_links WHERE service_id = ${service.id}
          ORDER BY created_at DESC LIMIT 1
        `);
        const previousSlug = (latestSlugResult.rows[0] as any)?.slug ?? null;
        const session = approvedSessionPayload({
          serviceId: service.id,
          serviceAt: new Date(service.service_at),
          randomCode: randomBytes(3).toString("hex"),
          previousSlug,
          randomSlugHex: randomBytes(3).toString("hex"),
        });
        await db.execute(sql`
          INSERT INTO baptism_public_links (service_id, slug, code, published_at, expires_at, created_by)
          VALUES (${service.id}, ${session.slug}, ${session.code}, ${session.publishedAt}, ${session.expiresAt}, ${user.id})
        `);
      } catch (linkErr) {
        console.error("[approve] Failed to create public link:", linkErr);
      }

      // Auto-complete mission_leader's "Completar programa" task
      try {
        await db.execute(sql`
          UPDATE service_tasks
          SET status = 'completed', completed_at = ${now}, updated_at = ${now}
          WHERE baptism_service_id = ${service.id}
            AND assigned_role = 'mission_leader'
            AND status != 'completed'
        `);
      } catch (taskErr) {
        console.error("[approve] Failed to auto-complete mission_leader task:", taskErr);
      }

      try {
        if (service.created_by) {
          const notifApprove = await db.insert(notifications).values({
            userId: service.created_by,
            title: "Agenda bautismal aprobada",
            message: `El Obispo aprobó el servicio en ${service.location_name}. El enlace se activará el día del bautismo.`,
            type: "reminder",
            relatedId: service.id,
          }).returning();
          if (isPushConfigured()) {
            await sendPushNotification(service.created_by, {
              title: "Agenda bautismal aprobada ✓",
              body: `El Obispo aprobó el servicio en ${service.location_name}.`,
              url: `/mission-work?section=servicios_bautismales&highlight=${service.id}`,
              notificationId: (notifApprove[0] as any)?.id,
            });
          }
          const wardNameApprove = (await storage.getPdfTemplate())?.wardName ?? null;
          const leaderResult = await db.execute(sql`SELECT email, name FROM users WHERE id = ${service.created_by} LIMIT 1`);
          const leader = leaderResult.rows[0] as any;
          if (leader?.email) {
            await sendAgendaReminderEmail({
              toEmail: leader.email,
              subject: "Agenda bautismal aprobada",
              body: [
                `Estimado/a ${leader.name},`,
                "",
                `El Obispo ha aprobado el programa del servicio bautismal en ${service.location_name}.`,
                "El enlace público se activará el día del bautismo.",
                "",
                wardNameApprove || "Tu barrio",
              ].join("\n"),
              wardName: wardNameApprove,
            });
          }
        }
      } catch (notifErr) {
        console.error("[approve] Failed to send notification:", notifErr);
      }

      try {
        // Get all candidates from bridge table (supports multiple baptisms per service)
        const candidatesResult = await db.execute(sql`
          SELECT mp.nombre
          FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${service.id}
          ORDER BY mp.nombre
        `);
        const candidateName = candidatesResult.rows.length > 0
          ? (candidatesResult.rows as any[]).map((r) => r.nombre).join(" & ")
          : (service.location_name && service.location_name !== "Por confirmar"
              ? service.location_name
              : "Servicio bautismal");
        const svcDate = new Date(service.service_at);
        const dd = String(svcDate.getUTCDate()).padStart(2, "0");
        const mm = String(svcDate.getUTCMonth() + 1).padStart(2, "0");
        const yyyy = svcDate.getUTCFullYear();
        const serviceDateStr = `${dd}/${mm}/${yyyy}`;
        const [liderActividades] = await db
          .select({ id: users.id, organizationId: users.organizationId, email: users.email, name: users.name })
          .from(users)
          .innerJoin(organizations, eq(organizations.id, users.organizationId))
          .where(and(eq(users.role, "lider_actividades" as any), eq(organizations.type, "barrio" as any)))
          .limit(1);
        if (liderActividades) {
          await db.insert(serviceTasks).values({
            baptismServiceId: service.id,
            assignedTo: liderActividades.id,
            assignedRole: "lider_actividades",
            organizationId: liderActividades.organizationId,
            title: `Servicio Bautismal — Coordinación logística: ${candidateName}`,
            description: `Coordinar espacio, arreglo, equipo, refrigerio y limpieza para el servicio bautismal del ${serviceDateStr}`,
            status: "pending",
            createdBy: user.id,
          });
          const notifLogistics = await db.insert(notifications).values({
            userId: liderActividades.id,
            title: "Nueva tarea de logística bautismal",
            message: `Se te ha asignado la coordinación logística del servicio bautismal de ${candidateName} (${serviceDateStr}).`,
            type: "reminder",
            relatedId: service.id,
          }).returning();
          if (isPushConfigured()) {
            await sendPushNotification(liderActividades.id, {
              title: "Nueva tarea de logística",
              body: `Coordinar el servicio bautismal de ${candidateName} el ${serviceDateStr}.`,
              url: `/activity-logistics?highlight=${service.id}`,
              notificationId: (notifLogistics[0] as any)?.id,
            });
          }
          if (liderActividades.email) {
            const wardNameTask = (await storage.getPdfTemplate())?.wardName ?? null;
            await sendAgendaReminderEmail({
              toEmail: liderActividades.email,
              subject: "Nueva tarea de logística bautismal",
              body: [
                `Estimado/a ${liderActividades.name},`,
                "",
                `Se te ha asignado la coordinación logística del servicio bautismal de ${candidateName} programado para el ${serviceDateStr}.`,
                "",
                "Coordina el espacio, arreglo, equipo, refrigerio y limpieza desde Logística de Actividades en la aplicación.",
                "",
                wardNameTask || "Tu barrio",
              ].join("\n"),
              wardName: wardNameTask,
            });
          }
        }

        // Task for mission_leader: stay on top of logistics coordination
        const [missionLeaderForTask] = await db
          .select({ id: users.id, organizationId: users.organizationId })
          .from(users)
          .where(and(eq(users.role, "mission_leader" as any), eq(users.organizationId, service.unit_id)))
          .limit(1);

        if (missionLeaderForTask) {
          await db.insert(serviceTasks).values({
            baptismServiceId: service.id,
            assignedTo: missionLeaderForTask.id,
            assignedRole: "mission_leader_logistics",
            organizationId: missionLeaderForTask.organizationId,
            title: `Coordinar logística con el lider de actividades: ${candidateName}`,
            description: `Estar al pendiente de que el lider de actividades coordine la pila, arreglo, equipo, refrigerio y limpieza para el servicio bautismal del ${serviceDateStr}.`,
            status: "pending",
            dueDate: new Date(service.service_at),
            createdBy: user.id,
          });
        }
      } catch (taskErr) {
        console.error("[approve] Failed to create service_task:", taskErr);
      }
    } catch (err) {
      console.error("[baptisms/services/:id/approve POST]", err);
      return res.status(500).json({ error: "Error interno al aprobar el servicio" });
    }
  });

  // POST /api/baptisms/services/:id/reject
  app.post("/api/baptisms/services/:id/reject", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!["obispo", "consejero_obispo"].includes(user.role))
        return res.status(403).json({ error: "Forbidden" });
      const { comment } = (req.body as any);
      if (!comment?.trim()) return res.status(400).json({ error: "Se requiere un comentario" });

      const svcResult = await db.execute(sql`
        SELECT id, approval_status, created_by, location_name
        FROM baptism_services WHERE id = ${req.params.id}
      `);
      const service = svcResult.rows[0] as any;
      if (!service) return res.status(404).json({ error: "Service not found" });
      if (service.approval_status !== "pending_approval")
        return res.status(400).json({ error: "El servicio no está pendiente de aprobación" });

      await db.execute(sql`
        UPDATE baptism_services
        SET approval_status = 'needs_revision', approval_comment = ${comment}, updated_at = NOW()
        WHERE id = ${service.id}
      `);

      if (service.created_by) {
        const notifReject = await db.insert(notifications).values({
          userId: service.created_by,
          title: "Agenda bautismal requiere revisión",
          message: `El Obispo solicitó cambios en el servicio de ${service.location_name}: ${comment}`,
          type: "reminder",
          relatedId: req.params.id,
        }).returning();
        if (isPushConfigured()) {
          await sendPushNotification(service.created_by, {
            title: "Agenda bautismal requiere revisión",
            body: `El Obispo solicitó cambios: ${comment}`,
            url: `/mission-work?section=servicios_bautismales&highlight=${req.params.id}`,
            notificationId: (notifReject[0] as any)?.id,
          });
        }
        const rejectLeaderResult = await db.execute(sql`SELECT email, name FROM users WHERE id = ${service.created_by} LIMIT 1`);
        const rejectLeader = rejectLeaderResult.rows[0] as any;
        if (rejectLeader?.email) {
          const wardNameReject = (await storage.getPdfTemplate())?.wardName ?? null;
          await sendAgendaReminderEmail({
            toEmail: rejectLeader.email,
            subject: "Agenda bautismal — Se requieren correcciones",
            body: [
              `Estimado/a ${rejectLeader.name},`,
              "",
              `El Obispo ha solicitado correcciones en el programa del servicio bautismal de ${service.location_name}.`,
              "",
              `Comentario: ${comment}`,
              "",
              "Por favor, realiza los ajustes necesarios y vuelve a enviarlo para aprobación.",
              "",
              wardNameReject || "Tu barrio",
            ].join("\n"),
            wardName: wardNameReject,
          });
        }
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("[baptisms/services/:id/reject POST]", err);
      return res.status(500).json({ error: "Error interno al rechazar el servicio" });
    }
  });

  // GET /api/service-tasks — list service tasks visible to the authenticated user
  app.get("/api/service-tasks", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["lider_actividades", "obispo", "consejero_obispo", "technology_specialist", "mission_leader"];
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      let rows;
      if (user.role === "lider_actividades" || user.role === "mission_leader") {
        const result = await db.execute(sql`
          SELECT
            st.id,
            st.title,
            st.description,
            st.status,
            st.assigned_to,
            st.assigned_role,
            st.due_date,
            st.completed_at,
            st.created_at,
            st.updated_at,
            st.baptism_service_id,
            bs.service_at,
            bs.location_name,
            bs.approval_status
          FROM service_tasks st
          LEFT JOIN baptism_services bs ON bs.id = st.baptism_service_id
          WHERE st.assigned_to = ${user.id}
          ORDER BY st.created_at DESC
        `);
        rows = result.rows;
      } else {
        const result = await db.execute(sql`
          SELECT
            st.id,
            st.title,
            st.description,
            st.status,
            st.assigned_to,
            st.assigned_role,
            st.due_date,
            st.completed_at,
            st.created_at,
            st.updated_at,
            st.baptism_service_id,
            bs.service_at,
            bs.location_name,
            bs.approval_status
          FROM service_tasks st
          LEFT JOIN baptism_services bs ON bs.id = st.baptism_service_id
          ORDER BY st.created_at DESC
        `);
        rows = result.rows;
      }

      return res.json(rows);
    } catch (err) {
      console.error("[GET /api/service-tasks]", err);
      return res.status(500).json({ error: "Error interno" });
    }
  });

  // PATCH /api/service-tasks/:id/status — update status of a service task
  app.patch("/api/service-tasks/:id/status", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["lider_actividades", "obispo", "consejero_obispo", "technology_specialist"];
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { id } = req.params;
      const { status } = req.body as { status: string };
      const allowedStatuses = ["pending", "in_progress", "completed"];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: "Estado no válido" });
      }

      const result = await db.execute(sql`
        UPDATE service_tasks
        SET
          status = ${status},
          updated_at = now(),
          completed_at = ${status === "completed" ? sql`now()` : sql`NULL`}
        WHERE id = ${id}
        RETURNING *
      `);

      if (!result.rows.length) {
        return res.status(404).json({ error: "Tarea no encontrada" });
      }

      const updatedTask = result.rows[0] as any;

      // When lider_actividades completes their logistics task,
      // auto-complete the mission_leader_logistics task for the same service
      if (
        status === "completed" &&
        updatedTask.assigned_role === "lider_actividades" &&
        updatedTask.baptism_service_id
      ) {
        try {
          await db.execute(sql`
            UPDATE service_tasks
            SET status = 'completed', completed_at = now(), updated_at = now()
            WHERE baptism_service_id = ${updatedTask.baptism_service_id}
              AND assigned_role = 'mission_leader_logistics'
              AND status != 'completed'
          `);
        } catch (autoErr) {
          console.error("[PATCH /api/service-tasks/:id/status] Failed to auto-complete mission_leader_logistics task:", autoErr);
        }
      }

      return res.json(updatedTask);
    } catch (err) {
      console.error("[PATCH /api/service-tasks/:id/status]", err);
      return res.status(500).json({ error: "Error interno" });
    }
  });

  // DELETE /api/service-tasks/:id — only obispo can delete a service task
  app.delete("/api/service-tasks/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== "obispo") return res.status(403).json({ error: "Forbidden" });

      const result = await db.execute(sql`
        DELETE FROM service_tasks WHERE id = ${req.params.id} RETURNING id
      `);
      if (!result.rows.length) return res.status(404).json({ error: "Tarea no encontrada" });
      return res.json({ ok: true });
    } catch (err) {
      console.error("[DELETE /api/service-tasks/:id]", err);
      return res.status(500).json({ error: "Error interno" });
    }
  });
}
