import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "./db";
import { members, organizations, pdfTemplates, users } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import {
  sendRegistroConfirmationEmail,
  sendBajaConfirmationEmail,
  sendBajaLeaderNotificationEmail,
} from "./auth";

const registroSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido").max(60),
  apellidos: z.string().min(1, "Los apellidos son requeridos").max(80),
  sex: z.enum(["M", "F"]),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  maritalStatus: z.enum(["soltero", "casado", "divorciado", "viudo"]).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email("Email inválido").optional().nullable(),
  organizationId: z.string().optional().nullable(),
  consentEmail: z.boolean(),
  consentPhone: z.boolean(),
}).refine((d) => d.consentEmail || d.consentPhone, {
  message: "Debes aceptar al menos un tipo de contacto",
  path: ["consentEmail"],
});

const bajaSchema = z.object({
  nombre: z.string().min(1).max(60),
  apellidos: z.string().min(1).max(80),
  email: z.string().email("Email inválido"),
  motivo: z.string().max(500).optional().nullable(),
});

// In-memory rate limiter: max 10 requests per IP per hour
const ipTimestamps = new Map<string, number[]>();
function checkRateLimit(ip: string, max = 10): boolean {
  const now = Date.now();
  const window = 60 * 60 * 1000;
  const hits = (ipTimestamps.get(ip) ?? []).filter((t) => now - t < window);
  hits.push(now);
  ipTimestamps.set(ip, hits);
  return hits.length > max;
}

function getIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
}

const LEADER_ROLES = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"];

async function getWardContext(): Promise<{ wardName: string | null; leaderEmails: string[] }> {
  const [templateRow] = await db.select({ wardName: pdfTemplates.wardName }).from(pdfTemplates).limit(1);
  const wardName = templateRow?.wardName ?? null;
  const leaders = await db
    .select({ email: users.email })
    .from(users)
    .where(or(...LEADER_ROLES.map((r) => eq(users.role, r as any))));
  const leaderEmails = Array.from(new Set(leaders.map((u) => u.email).filter((e): e is string => Boolean(e))));
  return { wardName, leaderEmails };
}

export function registerMemberRegistrationPublicRoutes(app: Express) {
  app.get("/api/public/organizations", async (_req: Request, res: Response) => {
    try {
      const orgs = await db
        .select({ id: organizations.id, name: organizations.name, type: organizations.type })
        .from(organizations)
        .orderBy(organizations.name);
      res.json(orgs);
    } catch {
      res.status(500).json({ error: "Error al cargar organizaciones" });
    }
  });

  app.post("/api/public/registro", async (req: Request, res: Response) => {
    if (checkRateLimit(getIp(req))) {
      return res.status(429).json({ error: "Demasiados intentos. Inténtalo más tarde." });
    }

    const parsed = registroSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    }

    const data = parsed.data;

    // Verify minor (under 14 in Spain requires parental consent — reject self-registration)
    const birthDate = new Date(data.birthday + "T12:00:00");
    const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 14) {
      return res.status(400).json({ error: "Los menores de 14 años deben ser registrados por sus padres o tutores. Contacta al secretario del barrio." });
    }

    if (data.organizationId) {
      const org = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, data.organizationId));
      if (!org.length) {
        return res.status(400).json({ error: "Organización no encontrada" });
      }
    }

    const apellidos = data.apellidos.trim();
    const nombre = data.nombre.trim();
    const nameSurename = `${apellidos}, ${nombre}`;

    const consentAt = new Date();
    const memberEmail = data.email?.trim() || null;

    const [member] = await db
      .insert(members)
      .values({
        nameSurename,
        nombre,
        apellidos,
        sex: data.sex,
        birthday: birthDate,
        maritalStatus: data.maritalStatus ?? null,
        phone: data.phone?.trim() || null,
        email: memberEmail,
        organizationId: data.organizationId || null,
        memberStatus: "pending",
        emailConsentGranted: data.consentEmail || data.consentPhone,
        emailConsentDate: consentAt,
      })
      .returning({ id: members.id });

    if (memberEmail && data.consentEmail) {
      const { wardName } = await getWardContext();
      const baseUrl = process.env.APP_BASE_URL ?? "https://zendapp.org";
      sendRegistroConfirmationEmail({
        toEmail: memberEmail,
        nombre,
        apellidos,
        consentEmail: data.consentEmail,
        consentPhone: data.consentPhone,
        consentAt,
        wardName,
        bajaUrl: `${baseUrl}/baja`,
      }).catch((err) => console.warn("Registro confirmation email failed:", err));
    }

    res.status(201).json({ ok: true, id: member.id });
  });

  app.post("/api/public/baja", async (req: Request, res: Response) => {
    if (checkRateLimit(getIp(req), 5)) {
      return res.status(429).json({ error: "Demasiados intentos. Inténtalo más tarde." });
    }

    const parsed = bajaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    }

    const { nombre, apellidos, email, motivo } = parsed.data;

    console.info("[BAJA REQUEST]", { nombre, apellidos, email, motivo, ts: new Date().toISOString() });

    const { wardName, leaderEmails } = await getWardContext();
    const emailJobs: Promise<void>[] = [];

    if (email) {
      emailJobs.push(
        sendBajaConfirmationEmail({ toEmail: email, nombre, apellidos, wardName }).catch(
          (err) => console.warn("Baja confirmation email failed:", err)
        )
      );
    }

    const bajaRecipients = leaderEmails.length > 0
      ? leaderEmails
      : process.env.BISHOP_EMAIL ? [process.env.BISHOP_EMAIL] : [];

    bajaRecipients.forEach((leaderEmail) => {
      emailJobs.push(
        sendBajaLeaderNotificationEmail({ toEmail: leaderEmail, nombre, apellidos, email, motivo, wardName }).catch(
          (err) => console.warn("Baja leader notification failed:", err)
        )
      );
    });

    await Promise.all(emailJobs);

    res.status(200).json({ ok: true });
  });
}
