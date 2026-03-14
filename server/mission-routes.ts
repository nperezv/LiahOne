import type { Express, Request, Response, RequestHandler } from "express";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
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
} from "@shared/schema";

const MISSION_ROLES = new Set([
  "mission_leader",
  "ward_missionary",
  "full_time_missionary",
  "obispo",
  "consejero_obispo",
]);

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

      const unitId = user.unitId || user.organizationId;
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

      const unitId = user.unitId || user.organizationId;
      if (!unitId) return res.status(400).json({ message: "Sin unidad asignada" });

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
          proximoEvento: data.proximoEvento || null,
          notas: data.notas || null,
          fotoUrl: data.fotoUrl || null,
          phone: data.phone || null,
          email: data.email || null,
          memberId: data.memberId || null,
        })
        .returning();

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
        proximoEvento: z.string().nullable().optional(),
        notas: z.string().nullable().optional(),
        fotoUrl: z.string().nullable().optional(),
      });

      const data = schema.parse(req.body);

      const [updated] = await db
        .update(missionPersonas)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(missionPersonas.id, req.params.id))
        .returning();

      if (!updated) return res.status(404).json({ message: "No encontrado" });
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

        const schema = z.object({ fecha_invitado: z.string().nullable() });
        const { fecha_invitado } = schema.parse(req.body);

        await db
          .update(missionCompromisoBautismo)
          .set({ fechaInvitado: fecha_invitado })
          .where(
            and(
              eq(missionCompromisoBautismo.personaId, req.params.id),
              eq(missionCompromisoBautismo.commitmentKey, req.params.key)
            )
          );

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
}
