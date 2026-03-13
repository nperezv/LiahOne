import type { Express, Request, Response, RequestHandler } from "express";
import { randomBytes, createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { sendPushNotification, isPushConfigured } from "./push-service";
import { computeMinimumReady } from "./mission-baptism-readiness";
import { buildReminderDedupeKey, computeDaysUntilService, resolveReminderRule } from "./mission-baptism-reminder-policy";
import { containsBlockedUrl, isPublicWindowActive, isRateLimited, normalizeDisplayName } from "./mission-baptism-public-rules";
import { toPublicServiceDTO } from "./mission-baptism-public-dto";
import { isActiveSession, nextSessionPayload } from "./mission-baptism-link-session";
import {
  baptismAssignments,
  baptismNotificationDeliveries,
  baptismProgramItems,
  baptismPublicLinks,
  baptismPublicPosts,
  baptismServices,
  hymns,
  missionContactAssignees,
  missionContactCommitments,
  missionContactLessons,
  missionContactMilestones,
  missionContactNotes,
  missionContacts,
  missionTemplateItems,
  missionTrackTemplates,
  notifications,
  users,
  organizations,
} from "@shared/schema";

const MISSION_ROLES = new Set(["mission_leader", "ward_missionary", "full_time_missionary", "obispo", "consejero_obispo"]);
const ORG_MISSION_ROLES = new Set(["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"]);
const LEADER_ONLY = new Set(["mission_leader"]);

const serviceSchema = z.object({
  candidateContactId: z.string().min(1),
  serviceAt: z.coerce.date(),
  locationName: z.string().min(1),
  locationAddress: z.string().optional(),
  mapsUrl: z.string().url().optional(),
});

const contactUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  personType: z.enum(["friend", "recent_convert", "less_active"]).optional(),
  stage: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

const assigneeSchema = z.object({
  userId: z.string().optional(),
  assigneeName: z.string().optional(),
  assigneeRole: z.enum(["missionary", "member_friend", "leader"]).default("missionary"),
  isPrimary: z.boolean().optional(),
});

const templateSchema = z.object({
  personType: z.enum(["friend", "recent_convert", "less_active"]),
  name: z.string().min(1),
  isDefault: z.boolean().optional(),
});

const templateItemSchema = z.object({
  order: z.number().int().min(0).optional(),
  title: z.string().min(1),
  itemType: z.enum(["lesson", "commitment", "checkpoint", "habit", "milestone"]),
  required: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

const servicePatchSchema = z.object({
  serviceAt: z.coerce.date().optional(),
  locationName: z.string().min(1).optional(),
  locationAddress: z.string().nullable().optional(),
  mapsUrl: z.string().url().nullable().optional(),
  status: z.enum(["scheduled", "live", "completed", "archived"]).optional(),
});

const programItemSchema = z.object({
  order: z.number().int().min(0).optional(),
  type: z.enum(["opening_prayer", "hymn", "talk", "special_music", "ordinance_baptism", "closing_prayer"]),
  title: z.string().optional(),
  participantUserId: z.string().nullable().optional(),
  participantDisplayName: z.string().nullable().optional(),
  publicVisibility: z.boolean().optional(),
  hymnId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const assignmentSchema = z.object({
  type: z.enum(["refreshments", "cleaning", "baptism_clothing", "wet_clothes_pickup", "reception", "music"]),
  assigneeUserId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  status: z.enum(["pending", "done"]).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const publicPostSchema = z.object({
  code: z.string().min(4),
  displayName: z.string().max(40).optional().or(z.literal("")),
  message: z.string().min(1).max(240).refine((value) => !containsBlockedUrl(value), "message must not contain urls"),
  clientRequestId: z.string().min(3),
  company: z.string().optional(),
});

const noteSchema = z.object({ note: z.string().min(1).max(2000) });

const lessonStatusSchema = z.object({ status: z.enum(["not_started", "taught", "completed", "repeated"]), notes: z.string().optional() });
const commitmentResultSchema = z.object({ result: z.enum(["pending", "done", "not_done", "partial"]), note: z.string().optional() });
const milestoneStatusSchema = z.object({ status: z.enum(["pending", "done", "waived"]), note: z.string().optional() });

// Milestone key helpers — match by metadata.milestoneKey so templates don't need a specific title
const milestoneKeyFilter = (key: string) =>
  sql`${missionTemplateItems.metadata}->>'milestoneKey' = ${key}`;

async function canAccessMission(user: any) {
  if (!user) return false;
  if (MISSION_ROLES.has(user.role)) return true;
  if (!ORG_MISSION_ROLES.has(user.role) || !user.organizationId) return false;

  const [org] = await db
    .select({ type: organizations.type })
    .from(organizations)
    .where(eq(organizations.id, user.organizationId))
    .limit(1);

  return org?.type === "cuorum_elderes" || org?.type === "sociedad_socorro";
}

function isMissionLeader(user: any) {
  return user && LEADER_ONLY.has(user.role);
}

function ipHash(req: Request) {
  const value = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  return createHash("sha256").update(value || "unknown-ip").digest("hex");
}

async function getActivePublicLink(slug: string, code?: string) {
  const now = new Date();
  const rows = await db
    .select()
    .from(baptismPublicLinks)
    .where(and(eq(baptismPublicLinks.slug, slug), isNull(baptismPublicLinks.revokedAt), gt(baptismPublicLinks.expiresAt, now)))
    .orderBy(desc(baptismPublicLinks.publishedAt))
    .limit(1);
  const active = rows[0];
  if (!active) return null;
  if (!isActiveSession(active, now, code)) {
    return code && code !== active.code ? "invalid_code" as const : null;
  }
  return active;
}

export function registerMissionBaptismRoutes(app: Express, requireAuth: RequestHandler) {
  app.use((req, res, next) => {
    if (req.path.startsWith("/b/") || req.path.startsWith("/bautismo/")) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  app.get("/api/mission/access", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const hasAccess = await canAccessMission(user);
    const missionLeader = isMissionLeader(user);

    res.json({
      hasAccess,
      isMissionLeader: missionLeader,
      canModeratePosts: missionLeader,
      role: user?.role ?? null,
    });
  });

  app.get("/api/mission/contacts", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const contacts = await db.select().from(missionContacts).where(eq(missionContacts.unitId, user.organizationId));
    res.json(contacts);
  });

  app.post("/api/mission/contacts", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = z.object({ fullName: z.string().min(1), personType: z.enum(["friend", "recent_convert", "less_active"]), stage: z.string().default("new"), phone: z.string().optional(), email: z.string().optional() }).parse(req.body);
    const [contact] = await db.insert(missionContacts).values({ ...payload, unitId: user.organizationId }).returning();
    res.status(201).json(contact);
  });

  app.get("/api/mission/contacts/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const [contact] = await db.select().from(missionContacts).where(and(eq(missionContacts.id, req.params.id), eq(missionContacts.unitId, user.organizationId))).limit(1);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.json(contact);
  });

  app.patch("/api/mission/contacts/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = contactUpdateSchema.parse(req.body);
    const [contact] = await db.update(missionContacts).set({ ...payload, updatedAt: new Date() }).where(and(eq(missionContacts.id, req.params.id), eq(missionContacts.unitId, user.organizationId))).returning();
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.json(contact);
  });

  app.delete("/api/mission/contacts/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const [deleted] = await db.delete(missionContacts).where(and(eq(missionContacts.id, req.params.id), eq(missionContacts.unitId, user.organizationId))).returning({ id: missionContacts.id });
    if (!deleted) return res.status(404).json({ error: "Contact not found" });
    res.status(204).send();
  });

  app.post("/api/mission/contacts/:id/assignees", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = assigneeSchema.parse(req.body);
    const [contact] = await db.select().from(missionContacts).where(and(eq(missionContacts.id, req.params.id), eq(missionContacts.unitId, user.organizationId))).limit(1);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    const [row] = await db.insert(missionContactAssignees).values({ contactId: req.params.id, userId: payload.userId, assigneeName: payload.assigneeName, assigneeRole: payload.assigneeRole, isPrimary: payload.isPrimary ?? false }).returning();
    res.status(201).json(row);
  });

  app.delete("/api/mission/contacts/:id/assignees", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = z.object({ userId: z.string().optional(), assigneeName: z.string().optional(), assigneeRole: z.enum(["missionary", "member_friend", "leader"]).default("missionary") }).parse(req.body ?? {});
    await db.delete(missionContactAssignees).where(and(eq(missionContactAssignees.contactId, req.params.id), eq(missionContactAssignees.assigneeRole, payload.assigneeRole), payload.userId ? eq(missionContactAssignees.userId, payload.userId) : eq(missionContactAssignees.assigneeName, payload.assigneeName ?? "")));
    res.status(204).send();
  });

  app.get("/api/mission/templates", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user)) return res.status(403).json({ error: "Forbidden" });
    const rows = await db.select().from(missionTrackTemplates).where(eq(missionTrackTemplates.unitId, user.organizationId));
    res.json(rows);
  });

  app.post("/api/mission/templates", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user)) return res.status(403).json({ error: "Forbidden" });
    const payload = templateSchema.parse(req.body);
    const [row] = await db.insert(missionTrackTemplates).values({ ...payload, unitId: user.organizationId, isDefault: payload.isDefault ?? false }).returning();
    res.status(201).json(row);
  });

  app.get("/api/mission/templates/:id/items", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const items = await db.select().from(missionTemplateItems).where(eq(missionTemplateItems.templateId, req.params.id));
    res.json(items);
  });

  app.post("/api/mission/templates/:id/items", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user)) return res.status(403).json({ error: "Forbidden" });
    const payload = templateItemSchema.parse(req.body);
    const [row] = await db.insert(missionTemplateItems).values({ templateId: req.params.id, order: payload.order ?? 0, title: payload.title, itemType: payload.itemType, required: payload.required ?? false, metadata: payload.metadata ?? {} }).returning();
    res.status(201).json(row);
  });

  app.get("/api/mission/contacts/:id/template-items", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const [contact] = await db.select().from(missionContacts).where(and(eq(missionContacts.id, req.params.id), eq(missionContacts.unitId, user.organizationId))).limit(1);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    const [template] = await db.select().from(missionTrackTemplates).where(and(eq(missionTrackTemplates.unitId, user.organizationId), eq(missionTrackTemplates.personType, contact.personType), eq(missionTrackTemplates.isDefault, true))).limit(1);
    if (!template) return res.json([]);
    const items = await db.select().from(missionTemplateItems).where(eq(missionTemplateItems.templateId, template.id)).orderBy(missionTemplateItems.order);
    res.json(items);
  });

  app.get("/api/mission/contacts/:id/assignees", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const [contact] = await db.select({ id: missionContacts.id }).from(missionContacts).where(and(eq(missionContacts.id, req.params.id), eq(missionContacts.unitId, user.organizationId))).limit(1);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    const rows = await db
      .select({
        id: missionContactAssignees.id,
        assigneeRole: missionContactAssignees.assigneeRole,
        isPrimary: missionContactAssignees.isPrimary,
        userId: missionContactAssignees.userId,
        assigneeName: missionContactAssignees.assigneeName,
        userName: users.name,
        createdAt: missionContactAssignees.createdAt,
      })
      .from(missionContactAssignees)
      .leftJoin(users, eq(users.id, missionContactAssignees.userId))
      .where(eq(missionContactAssignees.contactId, req.params.id))
      .orderBy(missionContactAssignees.createdAt);
    res.json(rows);
  });

  app.post("/api/mission/contacts/:id/notes", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = noteSchema.parse(req.body);
    const [note] = await db.insert(missionContactNotes).values({ contactId: req.params.id, authorUserId: user.id, note: payload.note }).returning();
    res.status(201).json(note);
  });

  app.post("/api/mission/contacts/:id/lessons/:lessonItemId/status", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = lessonStatusSchema.parse(req.body);
    const now = new Date();
    const [row] = await db.insert(missionContactLessons).values({ contactId: req.params.id, templateItemId: req.params.lessonItemId, status: payload.status, notes: payload.notes, taughtAt: payload.status === "taught" ? now : null, completedAt: payload.status === "completed" ? now : null }).onConflictDoUpdate({ target: [missionContactLessons.contactId, missionContactLessons.templateItemId], set: { status: payload.status, notes: payload.notes, taughtAt: payload.status === "taught" ? now : null, completedAt: payload.status === "completed" ? now : null } }).returning();
    res.json(row);
  });

  app.post("/api/mission/contacts/:id/commitments/:commitmentItemId/result", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = commitmentResultSchema.parse(req.body);
    const [row] = await db.insert(missionContactCommitments).values({ contactId: req.params.id, templateItemId: req.params.commitmentItemId, result: payload.result, note: payload.note, completedAt: payload.result === "done" ? new Date() : null }).onConflictDoUpdate({ target: [missionContactCommitments.contactId, missionContactCommitments.templateItemId], set: { result: payload.result, note: payload.note, completedAt: payload.result === "done" ? new Date() : null } }).returning();
    res.json(row);
  });

  app.post("/api/mission/contacts/:id/milestones/:milestoneItemId/status", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = milestoneStatusSchema.parse(req.body);

    if (payload.status === "done") {
      const [item] = await db.select().from(missionTemplateItems).where(eq(missionTemplateItems.id, req.params.milestoneItemId)).limit(1);
      if (item?.metadata && (item.metadata as any).milestoneKey === "interview_approved") {
        const requiredLessons = await db.select({ id: missionTemplateItems.id }).from(missionTemplateItems).where(and(eq(missionTemplateItems.templateId, item.templateId), eq(missionTemplateItems.itemType, "lesson"), eq(missionTemplateItems.required, true)));
        if (requiredLessons.length > 0) {
          const complete = await db.select({ templateItemId: missionContactLessons.templateItemId }).from(missionContactLessons).where(and(eq(missionContactLessons.contactId, req.params.id), eq(missionContactLessons.status, "completed"), inArray(missionContactLessons.templateItemId, requiredLessons.map((x) => x.id))));
          if (complete.length !== requiredLessons.length) {
            return res.status(400).json({ error: "Complete required lessons before interview approval milestone" });
          }
        }
      }
    }

    const [row] = await db.insert(missionContactMilestones).values({ contactId: req.params.id, templateItemId: req.params.milestoneItemId, status: payload.status, note: payload.note, doneAt: payload.status === "done" ? new Date() : null, doneBy: payload.status === "done" ? user.id : null }).onConflictDoUpdate({ target: [missionContactMilestones.contactId, missionContactMilestones.templateItemId], set: { status: payload.status, note: payload.note, doneAt: payload.status === "done" ? new Date() : null, doneBy: payload.status === "done" ? user.id : null } }).returning();
    res.json(row);
  });

  app.get("/api/mission/contacts/:id/notes", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const notes = await db
      .select({
        id: missionContactNotes.id,
        note: missionContactNotes.note,
        createdAt: missionContactNotes.createdAt,
        authorName: users.name,
      })
      .from(missionContactNotes)
      .leftJoin(users, eq(users.id, missionContactNotes.authorUserId))
      .where(eq(missionContactNotes.contactId, req.params.id))
      .orderBy(desc(missionContactNotes.createdAt));
    res.json(notes);
  });

  app.get("/api/mission/contacts/:id/progress", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const [lessons, commitments, milestones] = await Promise.all([
      db.select({
        id: missionContactLessons.id,
        templateItemId: missionContactLessons.templateItemId,
        status: missionContactLessons.status,
        taughtAt: missionContactLessons.taughtAt,
        completedAt: missionContactLessons.completedAt,
        notes: missionContactLessons.notes,
        itemTitle: missionTemplateItems.title,
        itemOrder: missionTemplateItems.order,
        itemRequired: missionTemplateItems.required,
      })
        .from(missionContactLessons)
        .leftJoin(missionTemplateItems, eq(missionTemplateItems.id, missionContactLessons.templateItemId))
        .where(eq(missionContactLessons.contactId, req.params.id))
        .orderBy(missionTemplateItems.order),
      db.select({
        id: missionContactCommitments.id,
        templateItemId: missionContactCommitments.templateItemId,
        result: missionContactCommitments.result,
        assignedAt: missionContactCommitments.assignedAt,
        dueAt: missionContactCommitments.dueAt,
        completedAt: missionContactCommitments.completedAt,
        note: missionContactCommitments.note,
        itemTitle: missionTemplateItems.title,
        itemOrder: missionTemplateItems.order,
        itemRequired: missionTemplateItems.required,
      })
        .from(missionContactCommitments)
        .leftJoin(missionTemplateItems, eq(missionTemplateItems.id, missionContactCommitments.templateItemId))
        .where(eq(missionContactCommitments.contactId, req.params.id))
        .orderBy(missionTemplateItems.order),
      db.select({
        id: missionContactMilestones.id,
        templateItemId: missionContactMilestones.templateItemId,
        status: missionContactMilestones.status,
        doneAt: missionContactMilestones.doneAt,
        note: missionContactMilestones.note,
        itemTitle: missionTemplateItems.title,
        itemOrder: missionTemplateItems.order,
        itemRequired: missionTemplateItems.required,
      })
        .from(missionContactMilestones)
        .leftJoin(missionTemplateItems, eq(missionTemplateItems.id, missionContactMilestones.templateItemId))
        .where(eq(missionContactMilestones.contactId, req.params.id))
        .orderBy(missionTemplateItems.order),
    ]);
    res.json({ lessons, commitments, milestones });
  });

  app.get("/api/baptisms/eligible-contacts", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });

    // Contacts with baptism_date_set milestone done
    const eligible = await db
      .selectDistinct({ id: missionContacts.id, fullName: missionContacts.fullName })
      .from(missionContacts)
      .innerJoin(missionContactMilestones, eq(missionContactMilestones.contactId, missionContacts.id))
      .innerJoin(missionTemplateItems, eq(missionTemplateItems.id, missionContactMilestones.templateItemId))
      .where(
        and(
          eq(missionContacts.unitId, user.organizationId),
          eq(missionContactMilestones.status, "done"),
          milestoneKeyFilter("baptism_date_set"),
        )
      );

    // Exclude those who already have a scheduled/live service
    const existing = await db
      .select({ candidateContactId: baptismServices.candidateContactId })
      .from(baptismServices)
      .where(and(eq(baptismServices.unitId, user.organizationId), inArray(baptismServices.status, ["scheduled", "live"])));

    const taken = new Set(existing.map((r) => r.candidateContactId));
    res.json(eligible.filter((c) => !taken.has(c.id)));
  });

  app.get("/api/baptisms/services", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const services = await db.select().from(baptismServices).where(eq(baptismServices.unitId, user.organizationId));
    res.json(services);
  });

  app.post("/api/baptisms/services", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = serviceSchema.parse(req.body);
    const [dateSetMilestone] = await db
      .select({ id: missionContactMilestones.id })
      .from(missionContactMilestones)
      .innerJoin(missionTemplateItems, eq(missionTemplateItems.id, missionContactMilestones.templateItemId))
      .where(and(eq(missionContactMilestones.contactId, payload.candidateContactId), eq(missionContactMilestones.status, "done"), eq(missionTemplateItems.itemType, "milestone"), milestoneKeyFilter("baptism_date_set")))
      .limit(1);
    if (!dateSetMilestone) return res.status(400).json({ error: "El hito de fecha bautismal no está completado" });

    const prepDeadline = new Date(payload.serviceAt);
    prepDeadline.setUTCDate(prepDeadline.getUTCDate() - 14);
    const [service] = await db.insert(baptismServices).values({ ...payload, unitId: user.organizationId, createdBy: user.id, prepDeadlineAt: prepDeadline }).returning();
    res.status(201).json(service);
  });

  app.get("/api/baptisms/services/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const [service] = await db.select().from(baptismServices).where(and(eq(baptismServices.id, req.params.id), eq(baptismServices.unitId, user.organizationId))).limit(1);
    if (!service) return res.status(404).json({ error: "Service not found" });
    const [program, assignments] = await Promise.all([
      db.select().from(baptismProgramItems).where(eq(baptismProgramItems.serviceId, service.id)),
      db.select().from(baptismAssignments).where(eq(baptismAssignments.serviceId, service.id)),
    ]);
    res.json({ ...service, programItems: program, assignments });
  });

  app.patch("/api/baptisms/services/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = servicePatchSchema.parse(req.body);
    const prepDeadlineAt = payload.serviceAt ? new Date(payload.serviceAt.getTime() - 14 * 24 * 60 * 60 * 1000) : undefined;
    const [service] = await db.update(baptismServices).set({ ...payload, ...(prepDeadlineAt ? { prepDeadlineAt } : {}), updatedAt: new Date() }).where(and(eq(baptismServices.id, req.params.id), eq(baptismServices.unitId, user.organizationId))).returning();
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  });

  app.delete("/api/baptisms/services/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const [deleted] = await db.delete(baptismServices).where(and(eq(baptismServices.id, req.params.id), eq(baptismServices.unitId, user.organizationId))).returning({ id: baptismServices.id });
    if (!deleted) return res.status(404).json({ error: "Service not found" });
    res.status(204).send();
  });

  app.post("/api/baptisms/services/:id/program-items", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = programItemSchema.parse(req.body);
    const [service] = await db.select({ id: baptismServices.id }).from(baptismServices).where(and(eq(baptismServices.id, req.params.id), eq(baptismServices.unitId, user.organizationId))).limit(1);
    if (!service) return res.status(404).json({ error: "Service not found" });
    const [row] = await db.insert(baptismProgramItems).values({ serviceId: req.params.id, ...payload, order: payload.order ?? 0, updatedBy: user.id, updatedAt: new Date() }).returning();
    res.status(201).json(row);
  });

  app.patch("/api/baptisms/program-items/:itemId", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = programItemSchema.partial({ type: true }).parse(req.body);
    const [target] = await db
      .select({ id: baptismProgramItems.id })
      .from(baptismProgramItems)
      .innerJoin(baptismServices, eq(baptismServices.id, baptismProgramItems.serviceId))
      .where(and(eq(baptismProgramItems.id, req.params.itemId), eq(baptismServices.unitId, user.organizationId)))
      .limit(1);
    if (!target) return res.status(404).json({ error: "Program item not found" });
    const [row] = await db.update(baptismProgramItems).set({ ...payload, updatedBy: user.id, updatedAt: new Date() }).where(eq(baptismProgramItems.id, req.params.itemId)).returning();
    res.json(row);
  });

  app.post("/api/baptisms/services/:id/assignments", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = assignmentSchema.parse(req.body);
    const [service] = await db.select({ id: baptismServices.id }).from(baptismServices).where(and(eq(baptismServices.id, req.params.id), eq(baptismServices.unitId, user.organizationId))).limit(1);
    if (!service) return res.status(404).json({ error: "Service not found" });
    const [row] = await db.insert(baptismAssignments).values({ serviceId: req.params.id, ...payload, status: payload.status ?? "pending" }).returning();
    res.status(201).json(row);
  });

  app.patch("/api/baptisms/assignments/:assignmentId", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });
    const payload = assignmentSchema.partial({ type: true }).parse(req.body);
    const [target] = await db
      .select({ id: baptismAssignments.id })
      .from(baptismAssignments)
      .innerJoin(baptismServices, eq(baptismServices.id, baptismAssignments.serviceId))
      .where(and(eq(baptismAssignments.id, req.params.assignmentId), eq(baptismServices.unitId, user.organizationId)))
      .limit(1);
    if (!target) return res.status(404).json({ error: "Assignment not found" });
    const [row] = await db.update(baptismAssignments).set(payload).where(eq(baptismAssignments.id, req.params.assignmentId)).returning();
    res.json(row);
  });

  app.get("/api/baptisms/services/:id/minimum-ready", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });

    const [service] = await db.select().from(baptismServices).where(and(eq(baptismServices.id, req.params.id), eq(baptismServices.unitId, user.organizationId))).limit(1);
    if (!service) return res.status(404).json({ error: "Service not found" });

    const [programItems, assignments, interviewScheduled] = await Promise.all([
      db.select({ type: baptismProgramItems.type }).from(baptismProgramItems).where(eq(baptismProgramItems.serviceId, service.id)),
      db.select({ type: baptismAssignments.type, assigneeUserId: baptismAssignments.assigneeUserId, assigneeName: baptismAssignments.assigneeName }).from(baptismAssignments).where(eq(baptismAssignments.serviceId, service.id)),
      db
        .select({ id: missionContactMilestones.id })
        .from(missionContactMilestones)
        .innerJoin(missionTemplateItems, eq(missionTemplateItems.id, missionContactMilestones.templateItemId))
        .where(and(eq(missionContactMilestones.contactId, service.candidateContactId), eq(missionContactMilestones.status, "done"), eq(missionTemplateItems.itemType, "milestone"), milestoneKeyFilter("interview_scheduled")))
        .limit(1),
    ]);

    res.json(computeMinimumReady({ programItems, assignments, hasInterviewScheduledMilestone: Boolean(interviewScheduled) }));
  });

  app.get("/api/baptisms/services/:id/public-link-state", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });

    const [service] = await db.select().from(baptismServices).where(and(eq(baptismServices.id, req.params.id), eq(baptismServices.unitId, user.organizationId))).limit(1);
    if (!service) return res.status(404).json({ error: "Service not found" });

    const [latest] = await db.select().from(baptismPublicLinks).where(eq(baptismPublicLinks.serviceId, service.id)).orderBy(desc(baptismPublicLinks.createdAt)).limit(1);
    if (!latest) {
      return res.json({ active: false, stableUrl: null, activePublicUrl: null, expiresAt: null });
    }

    const now = new Date();
    const isActive = isPublicWindowActive(latest.expiresAt, latest.revokedAt, now);
    return res.json({
      active: isActive,
      stableUrl: `/bautismo/${latest.slug}`,
      activePublicUrl: isActive ? `/b/${latest.slug}?c=${latest.code}` : null,
      expiresAt: latest.expiresAt,
    });
  });

  app.post("/api/baptisms/services/:id/publish-link", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user)) return res.status(403).json({ error: "Forbidden" });
    const now = new Date();
    const [service] = await db.select().from(baptismServices).where(and(eq(baptismServices.id, req.params.id), eq(baptismServices.unitId, user.organizationId))).limit(1);
    if (!service) return res.status(404).json({ error: "Service not found" });

    const [latest] = await db.select().from(baptismPublicLinks).where(eq(baptismPublicLinks.serviceId, service.id)).orderBy(desc(baptismPublicLinks.createdAt)).limit(1);

    await db.update(baptismPublicLinks).set({ revokedAt: now, revokedBy: user.id }).where(and(eq(baptismPublicLinks.serviceId, service.id), isNull(baptismPublicLinks.revokedAt), gt(baptismPublicLinks.expiresAt, now)));

    const next = nextSessionPayload({
      serviceId: service.id,
      now,
      randomCode: randomBytes(3).toString("hex"),
      previousSlug: latest?.slug ?? null,
      randomSlugHex: randomBytes(3).toString("hex"),
    });

    const [session] = await db.insert(baptismPublicLinks).values({ serviceId: service.id, slug: next.slug, code: next.code, publishedAt: next.publishedAt, expiresAt: next.expiresAt, createdBy: user.id }).returning();

    res.json({ stableUrl: `/bautismo/${session.slug}`, publicUrl: `/b/${session.slug}?c=${session.code}`, expiresAt: session.expiresAt });
  });

  app.get("/api/baptisms/moderation/posts", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user)) return res.status(403).json({ error: "Forbidden" });
    const status = String(req.query.status || "pending");
    const rows = await db
      .select({
        id: baptismPublicPosts.id,
        publicLinkId: baptismPublicPosts.publicLinkId,
        displayName: baptismPublicPosts.displayName,
        message: baptismPublicPosts.message,
        photoUrl: baptismPublicPosts.photoUrl,
        status: baptismPublicPosts.status,
        clientRequestId: baptismPublicPosts.clientRequestId,
        createdAt: baptismPublicPosts.createdAt,
        moderatedBy: baptismPublicPosts.moderatedBy,
        moderatedAt: baptismPublicPosts.moderatedAt,
      })
      .from(baptismPublicPosts)
      .innerJoin(baptismPublicLinks, eq(baptismPublicLinks.id, baptismPublicPosts.publicLinkId))
      .innerJoin(baptismServices, eq(baptismServices.id, baptismPublicLinks.serviceId))
      .where(and(eq(baptismPublicPosts.status, status as any), eq(baptismServices.unitId, user.organizationId)))
      .orderBy(desc(baptismPublicPosts.createdAt));
    res.json(rows);
  });

  app.patch("/api/baptisms/moderation/posts/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user)) return res.status(403).json({ error: "Forbidden" });
    const payload = z.object({ status: z.enum(["approved", "rejected"]) }).parse(req.body);
    const [target] = await db
      .select({ id: baptismPublicPosts.id })
      .from(baptismPublicPosts)
      .innerJoin(baptismPublicLinks, eq(baptismPublicLinks.id, baptismPublicPosts.publicLinkId))
      .innerJoin(baptismServices, eq(baptismServices.id, baptismPublicLinks.serviceId))
      .where(and(eq(baptismPublicPosts.id, req.params.id), eq(baptismServices.unitId, user.organizationId)))
      .limit(1);
    if (!target) return res.status(404).json({ error: "Post not found" });
    const [row] = await db.update(baptismPublicPosts).set({ status: payload.status, moderatedBy: user.id, moderatedAt: new Date() }).where(eq(baptismPublicPosts.id, req.params.id)).returning();
    res.json(row);
  });

  app.get("/bautismo/:slug", async (req, res) => {
    const active = await getActivePublicLink(req.params.slug);
    if (!active || active === "invalid_code") return res.status(410).json({ message: "Enlace caducado" });
    res.redirect(302, `/b/${active.slug}?c=${active.code}`);
  });

  app.get("/b/:slug", async (req, res) => {
    const code = String(req.query.c || "");
    const active = await getActivePublicLink(req.params.slug, code);
    if (active === "invalid_code") return res.status(403).json({ error: "Invalid code" });
    if (!active) return res.status(410).json({ message: "Enlace caducado" });

    const items = await db
      .select({
        id: baptismProgramItems.id,
        type: baptismProgramItems.type,
        title: baptismProgramItems.title,
        order: baptismProgramItems.order,
        publicVisibility: baptismProgramItems.publicVisibility,
        hymnId: baptismProgramItems.hymnId,
        hymnNumber: hymns.number,
        hymnTitle: hymns.title,
        hymnExternalUrl: hymns.externalUrl,
      })
      .from(baptismProgramItems)
      .leftJoin(hymns, eq(hymns.id, baptismProgramItems.hymnId))
      .where(eq(baptismProgramItems.serviceId, active.serviceId));

    const approvedPosts = await db.select().from(baptismPublicPosts).where(and(eq(baptismPublicPosts.publicLinkId, active.id), eq(baptismPublicPosts.status, "approved"))).orderBy(desc(baptismPublicPosts.createdAt));
    res.json(toPublicServiceDTO({ items, approvedPosts, expiresAt: active.expiresAt }));
  });

  app.post("/b/:slug/posts", async (req, res) => {
    const parsed = publicPostSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payload" });
    if (parsed.data.company && parsed.data.company.trim()) return res.status(400).json({ error: "Bot detected" });

    const active = await getActivePublicLink(req.params.slug, parsed.data.code);
    if (active === "invalid_code") return res.status(403).json({ error: "Invalid code" });
    if (!active) return res.status(403).json({ error: "ventana terminada" });

    const hash = ipHash(req);
    const now = new Date();
    const tenMinutes = new Date(now.getTime() - 10 * 60 * 1000);
    const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recent10 = await db.select().from(baptismPublicPosts).where(and(eq(baptismPublicPosts.ipHash, hash), gt(baptismPublicPosts.createdAt, tenMinutes)));
    const recent24 = await db.select().from(baptismPublicPosts).where(and(eq(baptismPublicPosts.ipHash, hash), gt(baptismPublicPosts.createdAt, oneDay)));
    const limit = isRateLimited(recent10.length, recent24.length);
    if (limit.blocked) return res.status(429).json({ error: "Rate limit" });

    const existing = await db.select().from(baptismPublicPosts).where(and(eq(baptismPublicPosts.publicLinkId, active.id), eq(baptismPublicPosts.clientRequestId, parsed.data.clientRequestId))).limit(1);
    if (existing[0]) return res.status(200).json(existing[0]);

    const [row] = await db.insert(baptismPublicPosts).values({
      publicLinkId: active.id,
      displayName: normalizeDisplayName(parsed.data.displayName),
      message: parsed.data.message,
      clientRequestId: parsed.data.clientRequestId,
      ipHash: hash,
      status: "pending",
    }).returning();

    res.status(201).json(row);
  });

  app.post("/api/baptisms/jobs/t14-check", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user)) return res.status(403).json({ error: "Forbidden" });
    const count = await runBaptismReadinessCheck();
    res.json({ ok: true, notificationsSent: count });
  });
}

export async function runBaptismReadinessCheck(): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const services = await db
    .select()
    .from(baptismServices)
    .where(and(gt(baptismServices.serviceAt, now), lte(baptismServices.serviceAt, horizon)));

  let sent = 0;

  for (const service of services) {
    const daysUntilService = computeDaysUntilService(service.serviceAt, now);
    const rule = resolveReminderRule(daysUntilService);
    if (!rule) continue;

    const [programItems, assignments, interviewScheduled] = await Promise.all([
      db.select({ type: baptismProgramItems.type }).from(baptismProgramItems).where(eq(baptismProgramItems.serviceId, service.id)),
      db.select({ type: baptismAssignments.type, assigneeUserId: baptismAssignments.assigneeUserId, assigneeName: baptismAssignments.assigneeName }).from(baptismAssignments).where(eq(baptismAssignments.serviceId, service.id)),
      db
        .select({ id: missionContactMilestones.id })
        .from(missionContactMilestones)
        .innerJoin(missionTemplateItems, eq(missionTemplateItems.id, missionContactMilestones.templateItemId))
        .where(and(eq(missionContactMilestones.contactId, service.candidateContactId), eq(missionContactMilestones.status, "done"), eq(missionTemplateItems.itemType, "milestone"), milestoneKeyFilter("interview_scheduled")))
        .limit(1),
    ]);

    const readiness = computeMinimumReady({ programItems, assignments, hasInterviewScheduledMilestone: Boolean(interviewScheduled) });
    if (readiness.ready) continue;

    const dedupeKey = buildReminderDedupeKey(service.id, rule);
    const delivered = await db.select().from(baptismNotificationDeliveries).where(eq(baptismNotificationDeliveries.dedupeKey, dedupeKey)).limit(1);
    if (delivered[0]) continue;

    const title = `Bautismo no listo — ${rule.toUpperCase()}`;
    const message = `El servicio en ${service.locationName} aún no cumple el mínimo requerido.`;
    await db.insert(baptismNotificationDeliveries).values({ serviceId: service.id, rule, dedupeKey });
    await db.insert(notifications).values({ userId: service.createdBy, title, message, type: "reminder" });
    if (isPushConfigured()) {
      await sendPushNotification(service.createdBy, { title, body: message, url: "/mission-work" }).catch(() => {});
    }
    sent++;
  }

  return sent;
}
