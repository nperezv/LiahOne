import type { Express, Request, Response, RequestHandler } from "express";
import { randomBytes, createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  not,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { sendPushNotification, isPushConfigured } from "./push-service";
import { computeMinimumReady } from "./mission-baptism-readiness";
import {
  buildReminderDedupeKey,
  computeDaysUntilService,
  resolveReminderRule,
} from "./mission-baptism-reminder-policy";
import {
  containsBlockedUrl,
  isPublicWindowActive,
  isRateLimited,
  normalizeDisplayName,
} from "./mission-baptism-public-rules";
import { toPublicServiceDTO } from "./mission-baptism-public-dto";
import {
  approvedSessionPayload,
  isActiveSession,
  nextSessionPayload,
} from "./mission-baptism-link-session";
import {
  activities,
  activityChecklistItems,
  baptismAssignments,
  baptismNotificationDeliveries,
  baptismProgramItems,
  baptismPublicLinks,
  baptismPublicPosts,
  baptismServices,
  hymns,
  missionChurchAttendance,
  missionContactAssignees,
  missionContactCommitments,
  missionContactLessons,
  missionContactMilestones,
  missionContactNotes,
  missionContacts,
  missionCoordinationTasks,
  missionCovenantPathProgress,
  missionFriendSectionData,
  missionPersonas,
  missionTemplateItems,
  missionTrackTemplates,
  notifications,
  serviceTasks,
  users,
  organizations,
} from "@shared/schema";

const MISSION_ROLES = new Set([
  "mission_leader",
  "ward_missionary",
  "full_time_missionary",
  "obispo",
  "consejero_obispo",
]);
const ORG_MISSION_ROLES = new Set([
  "presidente_organizacion",
  "consejero_organizacion",
  "secretario_organizacion",
]);
const LEADER_ONLY = new Set(["mission_leader"]);

const serviceSchema = z.object({
  candidateContactId: z.string().min(1),
  serviceAt: z.coerce.date(),
  locationName: z.string().min(1),
  locationAddress: z.string().optional(),
  mapsUrl: z.string().url().optional(),
  isPublic: z.boolean().optional().default(false),
});

const contactUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  personType: z.enum(["friend", "recent_convert", "less_active"]).optional(),
  stage: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  fellowshipUserId: z.string().nullable().optional(),
  fellowshipName: z.string().nullable().optional(),
  confirmedAt: z.coerce.date().nullable().optional(),
});

// ── System-defined covenant path items (recent_convert + less_active) ─────────
const COVENANT_PATH_ITEMS = [
  {
    key: "friendship_members",
    title: "Entablar amistad con miembros de su barrio",
    order: 0,
  },
  { key: "gospel_study", title: "Mejorar el estudio del Evangelio", order: 1 },
  {
    key: "aaronic_priesthood_ymen",
    title:
      "Aprender acerca del Sacerdocio Aarónico y el programa de los Hombres Jóvenes",
    order: 2,
  },
  {
    key: "young_women",
    title: "Aprender acerca del programa de las Mujeres Jóvenes",
    order: 3,
  },
  {
    key: "relief_society",
    title: "Aprender acerca de la Sociedad de Socorro",
    order: 4,
  },
  {
    key: "primary",
    title: "Aprender acerca de la Primaria — Servir a los niños",
    order: 5,
  },
  {
    key: "temple_recommend_proxy",
    title:
      "Recibir una recomendación para el templo para efectuar bautismos y confirmaciones por representante",
    order: 6,
  },
  {
    key: "family_history",
    title: "Ayudar a sus antepasados a recibir las ordenanzas sagradas",
    order: 7,
  },
  {
    key: "patriarchal_blessing",
    title: "Recibir la bendición patriarcal",
    order: 8,
  },
  {
    key: "overcome_discouragement",
    title: "Superar el desánimo y los contratiempos",
    order: 9,
  },
  { key: "sabbath_day", title: "Santificar el día de reposo", order: 10 },
  { key: "service", title: "Prestar servicio a otras personas", order: 11 },
  { key: "share_gospel", title: "Compartir el Evangelio", order: 12 },
  {
    key: "family_home_evening",
    title: "Participar en una noche de hogar",
    order: 13,
  },
  { key: "follow_prophet", title: "Seguir al profeta", order: 14 },
  { key: "obey_commandments", title: "Obedecer los mandamientos", order: 15 },
  { key: "self_reliance", title: "Ser autosuficiente", order: 16 },
  {
    key: "melchizedek_priesthood",
    title: "Aprender acerca del Sacerdocio de Melquisedec",
    order: 17,
  },
  { key: "endowment", title: "Recibir la investidura", order: 18 },
  { key: "sealing", title: "Ser sellado a su familia", order: 19 },
] as const;

// ── Friend section keys and default JSONB shapes ───────────────────────────────
const FRIEND_SECTION_DEFAULTS: Record<string, object> = {
  s1_friendship: {
    referredBy: "",
    firstContactDate: "",
    knowsMember: false,
    hasChurchFriend: false,
    conversedOutsideLessons: false,
    invitedToActivity: false,
    attendedActivity: false,
    knowsBishop: false,
    knowsMissionLeader: false,
    knowsFamily: false,
    comfortableAtChapel: false,
    socialObservations: "",
    friendMember1: "",
    friendMember2: "",
    supportFamily: "",
    assignedLeader: "",
    ministeringRef: "",
  },
  s2_attendance: {
    firstSacramentalDate: "",
    nextSundayCommitted: "",
    reasonIfAbsent: "",
  },
  s3_prayer: {
    knowsHowToPray: false,
    praysPersonally: false,
    praysMorning: false,
    praysEvening: false,
    prayedWithMissionaries: false,
    prayedWithMembers: false,
    sharedPrayerExperiences: false,
    hasBoM: false,
    bomFormat: "",
    startedReading: false,
    readingStartDate: "",
    lastChapterRead: "",
    lastReadingDate: "",
    readsAlone: true,
    understandsReading: false,
    asksQuestions: false,
    weeklyTracking: {
      monday: { prayed: false, read: false },
      tuesday: { prayed: false, read: false },
      wednesday: { prayed: false, read: false },
      thursday: { prayed: false, read: false },
      friday: { prayed: false, read: false },
      saturday: { prayed: false, read: false },
      sunday: { prayed: false, read: false },
    },
    favoritePasage: "",
    doubts: "",
  },
  s4_lessons: {
    lessons: {
      restoration: {
        received: false,
        date: "",
        whoPresent: "",
        membersPresent: "",
        understanding: "",
        acceptedCommitments: false,
        doubts: "",
        nextLesson: "",
      },
      plan_salvation: {
        received: false,
        date: "",
        whoPresent: "",
        membersPresent: "",
        understanding: "",
        acceptedCommitments: false,
        doubts: "",
        nextLesson: "",
      },
      gospel_of_jesus: {
        received: false,
        date: "",
        whoPresent: "",
        membersPresent: "",
        understanding: "",
        acceptedCommitments: false,
        doubts: "",
        nextLesson: "",
      },
      commandments: {
        received: false,
        date: "",
        whoPresent: "",
        membersPresent: "",
        understanding: "",
        acceptedCommitments: false,
        doubts: "",
        nextLesson: "",
      },
      laws_ordinances: {
        received: false,
        date: "",
        whoPresent: "",
        membersPresent: "",
        understanding: "",
        acceptedCommitments: false,
        doubts: "",
        nextLesson: "",
      },
      pre_baptism_review: {
        received: false,
        date: "",
        whoPresent: "",
        membersPresent: "",
        understanding: "",
        acceptedCommitments: false,
        doubts: "",
        nextLesson: "",
      },
    },
    commitments: {
      prayAboutMessage: false,
      readAssignedChapter: false,
      attendChurch: false,
      keepCommitment: false,
      shareExperience: false,
    },
  },
  s5_commitments: {
    basicCommitments: {
      praysPersonally: false,
      readsBoM: false,
      attendsChurch: false,
      keepsSabbath: false,
      willingToRepent: false,
      desiresFollowChrist: false,
    },
    wordOfWisdom: { explained: false, understood: false, living: false },
    lawOfChastity: { explained: false, understood: false, living: false },
    tithing: { explained: false, understood: false, willingToLive: false },
    sabbathDay: { explained: false, understood: false, living: false },
    repentance: { understood: false, applying: false },
    spiritualStrengths: "",
    currentDifficulties: "",
    needsSpecialSupport: false,
    nextCommitment: "",
  },
  s6_support: {
    bishopKnowsFriend: false,
    missionLeaderAssigned: false,
    memberCompanionAssigned: false,
    supportFamilyAssigned: false,
    quorumSRInformed: false,
    participatesInCoordination: false,
    bishop: "",
    assignedCounselor: "",
    wardMissionLeader: "",
    mainFriendMember: "",
    hostFamily: "",
    fullTimeMissionaries: "",
    lastLeaderContact: "",
    lastMemberVisit: "",
    nextVisit: "",
    temporalNeeds: "",
    coordinationComments: "",
  },
  s7_interview: {
    receivedMainLessons: false,
    attendsChurch: false,
    praysReadsRegularly: false,
    livesBasicCommandments: false,
    showedRepentance: false,
    desiresHonestBaptism: false,
    understandsBaptismalCovenant: false,
    tentativeInterviewDate: "",
    interviewer: "",
    pendingDoubts: "",
    obstaclesDetected: "",
    needsMoreTime: false,
    rescheduledDate: "",
    status: "not_ready",
  },
  s8_baptism: {
    hasBaptismDate: false,
    proposedDate: "",
    confirmedDate: "",
    location: "",
    baptizedBy: "",
    witnesses: "",
    programPrepared: false,
    invitationsSent: false,
    confirmationDate: "",
    sacramentalMeetingAssigned: "",
    leadersInformed: false,
    recordPrepared: false,
    clothingReady: false,
    goalStatus: "initial_interest",
  },
  s9_post_baptism: {
    receivedConfirmation: false,
    hasFriends: false,
    attendsEveryWeek: false,
    studiesGospel: false,
    receivedCallingOrService: false,
    participatesInActivities: false,
    hasLeaderSupport: false,
    proxyBaptismRecommend: false,
    familyHistoryStarted: false,
    ancestorNamesReady: false,
    participatedInTemple: false,
    preparingPatriarchalBlessing: false,
    preparingQuorumIntegration: false,
    monthlyTracking: {
      month1: false,
      month2: false,
      month3: false,
      month4: false,
      month5: false,
      month6: false,
    },
  },
};

async function seedCovenantPath(contactId: string) {
  const values = COVENANT_PATH_ITEMS.map((item) => ({
    contactId,
    itemKey: item.key,
  }));
  await db
    .insert(missionCovenantPathProgress)
    .values(values)
    .onConflictDoNothing();
}

async function seedFriendSections(contactId: string) {
  const values = Object.entries(FRIEND_SECTION_DEFAULTS).map(([key, data]) => ({
    contactId,
    sectionKey: key,
    data,
  }));
  await db
    .insert(missionFriendSectionData)
    .values(values)
    .onConflictDoNothing();
}

const coordinationTaskSchema = z.object({
  contactId: z.string().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  status: z.enum(["open", "done", "canceled"]).optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

const DEFAULT_TEMPLATES: Record<
  string,
  {
    name: string;
    items: Array<{
      order: number;
      title: string;
      itemType: string;
      required: boolean;
      metadata: Record<string, unknown>;
    }>;
  }
> = {
  friend: {
    name: "Amigo — Estándar",
    items: [
      {
        order: 0,
        title: "Lección 1: El Plan de Dios",
        itemType: "lesson",
        required: true,
        metadata: {},
      },
      {
        order: 1,
        title: "Lección 2: El Evangelio de Jesucristo",
        itemType: "lesson",
        required: true,
        metadata: {},
      },
      {
        order: 2,
        title: "Lección 3: La Restauración",
        itemType: "lesson",
        required: true,
        metadata: {},
      },
      {
        order: 3,
        title: "Orar diariamente",
        itemType: "commitment",
        required: false,
        metadata: {},
      },
      {
        order: 4,
        title: "Leer el Libro de Mormón",
        itemType: "commitment",
        required: false,
        metadata: {},
      },
      {
        order: 5,
        title: "Asistir a la iglesia",
        itemType: "commitment",
        required: false,
        metadata: {},
      },
      {
        order: 6,
        title: "Fecha bautismal definida",
        itemType: "milestone",
        required: true,
        metadata: { milestoneKey: "baptism_date_set" },
      },
      {
        order: 7,
        title: "Entrevista bautismal PROGRAMADA",
        itemType: "milestone",
        required: true,
        metadata: { milestoneKey: "interview_scheduled" },
      },
      {
        order: 8,
        title: "Entrevista bautismal APROBADA",
        itemType: "milestone",
        required: true,
        metadata: { milestoneKey: "interview_approved" },
      },
    ],
  },
  recent_convert: {
    name: "Converso reciente — Retención",
    items: [
      {
        order: 0,
        title: "Recibir la Aaróntica",
        itemType: "milestone",
        required: false,
        metadata: {},
      },
      {
        order: 1,
        title: "Asistir a 4 sacramentos seguidos",
        itemType: "commitment",
        required: false,
        metadata: {},
      },
      {
        order: 2,
        title: "Recibir una llamada en la iglesia",
        itemType: "milestone",
        required: false,
        metadata: {},
      },
      {
        order: 3,
        title: "Completar el curso de nuevos miembros",
        itemType: "lesson",
        required: false,
        metadata: {},
      },
    ],
  },
  less_active: {
    name: "Menos activo — Reactivación",
    items: [
      {
        order: 0,
        title: "Primera visita de contacto",
        itemType: "lesson",
        required: false,
        metadata: {},
      },
      {
        order: 1,
        title: "Invitar a actividad",
        itemType: "commitment",
        required: false,
        metadata: {},
      },
      {
        order: 2,
        title: "Asistir al sacramento",
        itemType: "commitment",
        required: false,
        metadata: {},
      },
    ],
  },
};

const assigneeSchema = z.object({
  userId: z.string().optional(),
  assigneeName: z.string().optional(),
  assigneeRole: z
    .enum(["missionary", "member_friend", "leader"])
    .default("missionary"),
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
  itemType: z.enum([
    "lesson",
    "commitment",
    "checkpoint",
    "habit",
    "milestone",
  ]),
  required: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

const servicePatchSchema = z.object({
  serviceAt: z.coerce.date().optional(),
  locationName: z.string().min(1).optional(),
  locationAddress: z.string().nullable().optional(),
  mapsUrl: z.string().url().nullable().optional(),
  status: z.enum(["scheduled", "live", "completed", "archived"]).optional(),
  isPublic: z.boolean().optional(),
});

const programItemSchema = z.object({
  order: z.number().int().min(0).optional(),
  type: z.enum([
    "opening_prayer",
    "hymn",
    "talk",
    "special_music",
    "ordinance_baptism",
    "closing_prayer",
  ]),
  title: z.string().optional(),
  participantUserId: z.string().nullable().optional(),
  participantDisplayName: z.string().nullable().optional(),
  publicVisibility: z.boolean().optional(),
  hymnId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const assignmentSchema = z.object({
  type: z.enum([
    "refreshments",
    "cleaning",
    "baptism_clothing",
    "wet_clothes_pickup",
    "reception",
    "music",
  ]),
  assigneeUserId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  status: z.enum(["pending", "done"]).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const publicPostSchema = z.object({
  code: z.string().min(4),
  displayName: z.string().max(40).optional().or(z.literal("")),
  message: z
    .string()
    .min(1)
    .max(240)
    .refine(
      (value) => !containsBlockedUrl(value),
      "message must not contain urls",
    ),
  clientRequestId: z.string().min(3),
  company: z.string().optional(),
});

const noteSchema = z.object({ note: z.string().min(1).max(2000) });

const lessonStatusSchema = z.object({
  status: z.enum(["not_started", "taught", "completed", "repeated"]),
  notes: z.string().optional(),
});
const commitmentResultSchema = z.object({
  result: z.enum(["pending", "done", "not_done", "partial"]),
  note: z.string().optional(),
});
const milestoneStatusSchema = z.object({
  status: z.enum(["pending", "done", "waived"]),
  note: z.string().optional(),
});

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

function canApproveBaptism(user: any) {
  return user && (user.role === "obispo" || user.role === "consejero_obispo");
}

function ipHash(req: Request) {
  const value = String(
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
  )
    .split(",")[0]
    .trim();
  return createHash("sha256")
    .update(value || "unknown-ip")
    .digest("hex");
}

async function getActivePublicLink(slug: string, code?: string) {
  const now = new Date();
  const rows = await db
    .select()
    .from(baptismPublicLinks)
    .where(
      and(
        eq(baptismPublicLinks.slug, slug),
        isNull(baptismPublicLinks.revokedAt),
        gt(baptismPublicLinks.expiresAt, now),
      ),
    )
    .orderBy(desc(baptismPublicLinks.publishedAt))
    .limit(1);
  const active = rows[0];
  if (!active) return null;
  if (!isActiveSession(active, now, code)) {
    return code && code !== active.code ? ("invalid_code" as const) : null;
  }
  return active;
}

/**
 * Finds the activity linked to a baptism service and auto-syncs the
 * entrevista_bautismal checklist item based on whether ALL candidates
 * have fecha_entrevista_bautismal set in mission_personas.
 * Stores candidate names + dates as JSON in the notes field.
 */
import { syncBaptismInterviewChecklistItem } from "./mission-interview-sync";
export { syncBaptismInterviewChecklistItem };
import { syncBaptismVisibilityChecklistItem } from "./mission-visibility-sync";

/**
 * Returns the checklist for the activity linked to a baptism service,
 * after syncing the interview item. Returns null if no activity is linked.
 */
const LOGISTICS_CHECKLIST_KEYS = [
  "espacio_calendario",
  "arreglo_espacios",
  "equipo_tecnologia",
  "presupuesto_refrigerio",
  "limpieza",
];

async function syncLogisticsChecklistFromServiceTask(baptismServiceId: string, activityId: string): Promise<void> {
  try {
    const taskRow = await db.execute(
      sql`SELECT status FROM service_tasks WHERE baptism_service_id = ${baptismServiceId} AND assigned_role = 'lider_actividades' LIMIT 1`,
    );
    const taskStatus = (taskRow.rows[0] as any)?.status;
    if (taskStatus !== "completed") return;

    await db
      .update(activityChecklistItems)
      .set({ completed: true, completedAt: new Date() })
      .where(
        and(
          eq(activityChecklistItems.activityId, activityId),
          inArray(activityChecklistItems.itemKey, LOGISTICS_CHECKLIST_KEYS),
        ),
      );
  } catch (err) {
    console.error("[syncLogisticsChecklistFromServiceTask]", err);
  }
}

async function getBaptismActivityChecklist(
  baptismServiceId: string,
): Promise<{ items: any[]; completedCount: number; totalCount: number } | null> {
  await syncBaptismInterviewChecklistItem(baptismServiceId);
  await syncBaptismVisibilityChecklistItem(baptismServiceId);

  const [activity] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.baptismServiceId, baptismServiceId))
    .limit(1);
  if (!activity) return null;

  await syncLogisticsChecklistFromServiceTask(baptismServiceId, activity.id);

  const items = await db
    .select()
    .from(activityChecklistItems)
    .where(eq(activityChecklistItems.activityId, activity.id))
    .orderBy(asc(activityChecklistItems.sortOrder));

  const countableItems = items.filter((i) => i.itemKey !== "visibilidad_evento");
  return {
    items,
    completedCount: countableItems.filter((i) => i.completed).length,
    totalCount: countableItems.length,
  };
}

export function registerMissionBaptismRoutes(
  app: Express,
  requireAuth: RequestHandler,
) {
  app.use((req, res, next) => {
    if (req.path.startsWith("/b/") || req.path.startsWith("/bautismo/")) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  app.get(
    "/api/mission/access",
    requireAuth,
    async (req: Request, res: Response) => {
      const user = (req as any).user;
      const hasAccess = await canAccessMission(user);
      const missionLeader = isMissionLeader(user);

      res.json({
        hasAccess,
        isMissionLeader: missionLeader,
        canModeratePosts: missionLeader,
        role: user?.role ?? null,
      });
    },
  );

  app.get(
    "/api/mission/contacts",
    requireAuth,
    async (req: Request, res: Response) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const showArchived = req.query.archived === "true";
      const conditions = [eq(missionContacts.unitId, user.organizationId)];
      if (!showArchived) conditions.push(eq(missionContacts.isArchived, false));
      const contacts = await db
        .select()
        .from(missionContacts)
        .where(and(...conditions));
      res.json(contacts);
    },
  );

  app.post(
    "/api/mission/contacts",
    requireAuth,
    async (req: Request, res: Response) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = z
        .object({
          fullName: z.string().min(1),
          personType: z.enum(["friend", "recent_convert", "less_active"]),
          stage: z.string().default("new"),
          phone: z.string().optional(),
          email: z.string().optional(),
          memberUserId: z.string().optional(),
        })
        .parse(req.body);

      if (payload.memberUserId) {
        const [existing] = await db
          .select({ id: missionContacts.id })
          .from(missionContacts)
          .where(
            and(
              eq(missionContacts.unitId, user.organizationId),
              eq(missionContacts.personType, payload.personType),
              eq(missionContacts.memberUserId, payload.memberUserId),
              eq(missionContacts.isArchived, false),
            ),
          )
          .limit(1);
        if (existing) {
          return res
            .status(409)
            .json({ error: "Ese miembro ya está registrado en este segmento" });
        }
      }

      const [contact] = await db
        .insert(missionContacts)
        .values({ ...payload, unitId: user.organizationId })
        .returning();
      if (contact.personType === "friend") {
        await seedFriendSections(contact.id);
      } else {
        await seedCovenantPath(contact.id);
      }
      res.status(201).json(contact);
    },
  );

  app.get("/api/mission/contacts/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const [contact] = await db
      .select()
      .from(missionContacts)
      .where(
        and(
          eq(missionContacts.id, req.params.id),
          eq(missionContacts.unitId, user.organizationId),
        ),
      )
      .limit(1);
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.json(contact);
  });

  app.patch("/api/mission/contacts/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const payload = contactUpdateSchema.parse(req.body);
    const [contact] = await db
      .update(missionContacts)
      .set({ ...payload, updatedAt: new Date() })
      .where(
        and(
          eq(missionContacts.id, req.params.id),
          eq(missionContacts.unitId, user.organizationId),
        ),
      )
      .returning();
    if (!contact) return res.status(404).json({ error: "Contact not found" });
    res.json(contact);
  });

  app.delete("/api/mission/contacts/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const [deleted] = await db
      .delete(missionContacts)
      .where(
        and(
          eq(missionContacts.id, req.params.id),
          eq(missionContacts.unitId, user.organizationId),
        ),
      )
      .returning({ id: missionContacts.id });
    if (!deleted) return res.status(404).json({ error: "Contact not found" });
    res.status(204).send();
  });

  app.post(
    "/api/mission/contacts/:id/assignees",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = assigneeSchema.parse(req.body);
      const [contact] = await db
        .select()
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const [row] = await db
        .insert(missionContactAssignees)
        .values({
          contactId: req.params.id,
          userId: payload.userId,
          assigneeName: payload.assigneeName,
          assigneeRole: payload.assigneeRole,
          isPrimary: payload.isPrimary ?? false,
        })
        .returning();
      res.status(201).json(row);
    },
  );

  app.delete(
    "/api/mission/contacts/:id/assignees",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = z
        .object({
          userId: z.string().optional(),
          assigneeName: z.string().optional(),
          assigneeRole: z
            .enum(["missionary", "member_friend", "leader"])
            .default("missionary"),
        })
        .parse(req.body ?? {});
      await db
        .delete(missionContactAssignees)
        .where(
          and(
            eq(missionContactAssignees.contactId, req.params.id),
            eq(missionContactAssignees.assigneeRole, payload.assigneeRole),
            payload.userId
              ? eq(missionContactAssignees.userId, payload.userId)
              : eq(
                  missionContactAssignees.assigneeName,
                  payload.assigneeName ?? "",
                ),
          ),
        );
      res.status(204).send();
    },
  );

  app.get("/api/mission/templates", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user))
      return res.status(403).json({ error: "Forbidden" });
    const rows = await db
      .select()
      .from(missionTrackTemplates)
      .where(eq(missionTrackTemplates.unitId, user.organizationId));
    res.json(rows);
  });

  app.post("/api/mission/templates", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user))
      return res.status(403).json({ error: "Forbidden" });
    const payload = templateSchema.parse(req.body);
    const [row] = await db
      .insert(missionTrackTemplates)
      .values({
        ...payload,
        unitId: user.organizationId,
        isDefault: payload.isDefault ?? false,
      })
      .returning();
    res.status(201).json(row);
  });

  app.get("/api/mission/templates/:id/items", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const items = await db
      .select()
      .from(missionTemplateItems)
      .where(eq(missionTemplateItems.templateId, req.params.id));
    res.json(items);
  });

  app.post(
    "/api/mission/templates/:id/items",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!isMissionLeader(user))
        return res.status(403).json({ error: "Forbidden" });
      const payload = templateItemSchema.parse(req.body);
      const [row] = await db
        .insert(missionTemplateItems)
        .values({
          templateId: req.params.id,
          order: payload.order ?? 0,
          title: payload.title,
          itemType: payload.itemType,
          required: payload.required ?? false,
          metadata: payload.metadata ?? {},
        })
        .returning();
      res.status(201).json(row);
    },
  );

  app.get(
    "/api/mission/contacts/:id/template-items",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [contact] = await db
        .select()
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const [template] = await db
        .select()
        .from(missionTrackTemplates)
        .where(
          and(
            eq(missionTrackTemplates.unitId, user.organizationId),
            eq(missionTrackTemplates.personType, contact.personType),
            eq(missionTrackTemplates.isDefault, true),
          ),
        )
        .limit(1);
      if (!template) return res.json([]);
      const items = await db
        .select()
        .from(missionTemplateItems)
        .where(eq(missionTemplateItems.templateId, template.id))
        .orderBy(missionTemplateItems.order);
      res.json(items);
    },
  );

  app.get(
    "/api/mission/contacts/:id/assignees",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [contact] = await db
        .select({ id: missionContacts.id })
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
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
    },
  );

  app.post(
    "/api/mission/contacts/:id/notes",
    requireAuth,
    async (req: Request, res: Response) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = noteSchema.parse(req.body);
      const [note] = await db
        .insert(missionContactNotes)
        .values({
          contactId: req.params.id,
          authorUserId: user.id,
          note: payload.note,
        })
        .returning();
      res.status(201).json(note);
    },
  );

  app.post(
    "/api/mission/contacts/:id/lessons/:lessonItemId/status",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = lessonStatusSchema.parse(req.body);
      const now = new Date();
      const [row] = await db
        .insert(missionContactLessons)
        .values({
          contactId: req.params.id,
          templateItemId: req.params.lessonItemId,
          status: payload.status,
          notes: payload.notes,
          taughtAt: payload.status === "taught" ? now : null,
          completedAt: payload.status === "completed" ? now : null,
        })
        .onConflictDoUpdate({
          target: [
            missionContactLessons.contactId,
            missionContactLessons.templateItemId,
          ],
          set: {
            status: payload.status,
            notes: payload.notes,
            taughtAt: payload.status === "taught" ? now : null,
            completedAt: payload.status === "completed" ? now : null,
          },
        })
        .returning();
      res.json(row);
    },
  );

  app.post(
    "/api/mission/contacts/:id/commitments/:commitmentItemId/result",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = commitmentResultSchema.parse(req.body);
      const [row] = await db
        .insert(missionContactCommitments)
        .values({
          contactId: req.params.id,
          templateItemId: req.params.commitmentItemId,
          result: payload.result,
          note: payload.note,
          completedAt: payload.result === "done" ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [
            missionContactCommitments.contactId,
            missionContactCommitments.templateItemId,
          ],
          set: {
            result: payload.result,
            note: payload.note,
            completedAt: payload.result === "done" ? new Date() : null,
          },
        })
        .returning();
      res.json(row);
    },
  );

  app.post(
    "/api/mission/contacts/:id/milestones/:milestoneItemId/status",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = milestoneStatusSchema.parse(req.body);

      if (payload.status === "done") {
        const [item] = await db
          .select()
          .from(missionTemplateItems)
          .where(eq(missionTemplateItems.id, req.params.milestoneItemId))
          .limit(1);
        if (
          item?.metadata &&
          (item.metadata as any).milestoneKey === "interview_approved"
        ) {
          const requiredLessons = await db
            .select({ id: missionTemplateItems.id })
            .from(missionTemplateItems)
            .where(
              and(
                eq(missionTemplateItems.templateId, item.templateId),
                eq(missionTemplateItems.itemType, "lesson"),
                eq(missionTemplateItems.required, true),
              ),
            );
          if (requiredLessons.length > 0) {
            const complete = await db
              .select({ templateItemId: missionContactLessons.templateItemId })
              .from(missionContactLessons)
              .where(
                and(
                  eq(missionContactLessons.contactId, req.params.id),
                  eq(missionContactLessons.status, "completed"),
                  inArray(
                    missionContactLessons.templateItemId,
                    requiredLessons.map((x) => x.id),
                  ),
                ),
              );
            if (complete.length !== requiredLessons.length) {
              return res
                .status(400)
                .json({
                  error:
                    "Complete required lessons before interview approval milestone",
                });
            }
          }
        }
      }

      const [row] = await db
        .insert(missionContactMilestones)
        .values({
          contactId: req.params.id,
          templateItemId: req.params.milestoneItemId,
          status: payload.status,
          note: payload.note,
          doneAt: payload.status === "done" ? new Date() : null,
          doneBy: payload.status === "done" ? user.id : null,
        })
        .onConflictDoUpdate({
          target: [
            missionContactMilestones.contactId,
            missionContactMilestones.templateItemId,
          ],
          set: {
            status: payload.status,
            note: payload.note,
            doneAt: payload.status === "done" ? new Date() : null,
            doneBy: payload.status === "done" ? user.id : null,
          },
        })
        .returning();
      res.json(row);
    },
  );

  app.get("/api/mission/contacts/:id/notes", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
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

  app.get(
    "/api/mission/contacts/:id/progress",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [lessons, commitments, milestones] = await Promise.all([
        db
          .select({
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
          .leftJoin(
            missionTemplateItems,
            eq(missionTemplateItems.id, missionContactLessons.templateItemId),
          )
          .where(eq(missionContactLessons.contactId, req.params.id))
          .orderBy(missionTemplateItems.order),
        db
          .select({
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
          .leftJoin(
            missionTemplateItems,
            eq(
              missionTemplateItems.id,
              missionContactCommitments.templateItemId,
            ),
          )
          .where(eq(missionContactCommitments.contactId, req.params.id))
          .orderBy(missionTemplateItems.order),
        db
          .select({
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
          .leftJoin(
            missionTemplateItems,
            eq(
              missionTemplateItems.id,
              missionContactMilestones.templateItemId,
            ),
          )
          .where(eq(missionContactMilestones.contactId, req.params.id))
          .orderBy(missionTemplateItems.order),
      ]);
      res.json({ lessons, commitments, milestones });
    },
  );

  app.get("/api/baptisms/eligible-contacts", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });

    // Contacts with baptism_date_set milestone done
    const eligible = await db
      .selectDistinct({
        id: missionContacts.id,
        fullName: missionContacts.fullName,
      })
      .from(missionContacts)
      .innerJoin(
        missionContactMilestones,
        eq(missionContactMilestones.contactId, missionContacts.id),
      )
      .innerJoin(
        missionTemplateItems,
        eq(missionTemplateItems.id, missionContactMilestones.templateItemId),
      )
      .where(
        and(
          eq(missionContacts.unitId, user.organizationId),
          eq(missionContactMilestones.status, "done"),
          milestoneKeyFilter("baptism_date_set"),
        ),
      );

    // Exclude those who already have a scheduled/live service
    const existing = await db
      .select({ candidateContactId: baptismServices.candidateContactId })
      .from(baptismServices)
      .where(
        and(
          eq(baptismServices.unitId, user.organizationId),
          inArray(baptismServices.status, ["scheduled", "live"]),
        ),
      );

    const taken = new Set(existing.map((r) => r.candidateContactId));
    res.json(eligible.filter((c) => !taken.has(c.id)));
  });

  app.get("/api/baptisms/services", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const services = await db
      .select()
      .from(baptismServices)
      .where(eq(baptismServices.unitId, user.organizationId));
    res.json(services);
  });

  app.post("/api/baptisms/services", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const payload = serviceSchema.parse(req.body);
    const [dateSetMilestone] = await db
      .select({ id: missionContactMilestones.id })
      .from(missionContactMilestones)
      .innerJoin(
        missionTemplateItems,
        eq(missionTemplateItems.id, missionContactMilestones.templateItemId),
      )
      .where(
        and(
          eq(missionContactMilestones.contactId, payload.candidateContactId),
          eq(missionContactMilestones.status, "done"),
          eq(missionTemplateItems.itemType, "milestone"),
          milestoneKeyFilter("baptism_date_set"),
        ),
      )
      .limit(1);
    if (!dateSetMilestone)
      return res
        .status(400)
        .json({ error: "El hito de fecha bautismal no está completado" });

    const prepDeadline = new Date(payload.serviceAt);
    prepDeadline.setUTCDate(prepDeadline.getUTCDate() - 14);
    const [service] = await db
      .insert(baptismServices)
      .values({
        ...payload,
        unitId: user.organizationId,
        createdBy: user.id,
        prepDeadlineAt: prepDeadline,
      })
      .returning();
    res.status(201).json(service);
  });

  app.get("/api/baptisms/services/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const [service] = await db
      .select()
      .from(baptismServices)
      .where(
        and(
          eq(baptismServices.id, req.params.id),
          eq(baptismServices.unitId, user.organizationId),
        ),
      )
      .limit(1);
    if (!service) return res.status(404).json({ error: "Service not found" });
    const [program, assignments] = await Promise.all([
      db
        .select()
        .from(baptismProgramItems)
        .where(eq(baptismProgramItems.serviceId, service.id)),
      db
        .select()
        .from(baptismAssignments)
        .where(eq(baptismAssignments.serviceId, service.id)),
    ]);
    res.json({ ...service, programItems: program, assignments });
  });

  app.patch("/api/baptisms/services/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const payload = servicePatchSchema.parse(req.body);
    const prepDeadlineAt = payload.serviceAt
      ? new Date(payload.serviceAt.getTime() - 14 * 24 * 60 * 60 * 1000)
      : undefined;
    const [service] = await db
      .update(baptismServices)
      .set({
        ...payload,
        ...(prepDeadlineAt ? { prepDeadlineAt } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(baptismServices.id, req.params.id),
          eq(baptismServices.unitId, user.organizationId),
        ),
      )
      .returning();
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  });

  app.delete("/api/baptisms/services/:id", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const [deleted] = await db
      .delete(baptismServices)
      .where(
        and(
          eq(baptismServices.id, req.params.id),
          eq(baptismServices.unitId, user.organizationId),
        ),
      )
      .returning({ id: baptismServices.id });
    if (!deleted) return res.status(404).json({ error: "Service not found" });
    res.status(204).send();
  });

  // ── Approval flow ────────────────────────────────────────────────────────────

  app.get(
    "/api/baptisms/services/:id/activity-checklist",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });

      const checklist = await getBaptismActivityChecklist(req.params.id);
      if (!checklist) return res.status(404).json({ error: "No hay actividad vinculada a este servicio" });

      res.json(checklist);
    },
  );

  app.post(
    "/api/baptisms/services/:id/submit-for-approval",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [service] = await db
        .select()
        .from(baptismServices)
        .where(
          and(
            eq(baptismServices.id, req.params.id),
            eq(baptismServices.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!service) return res.status(404).json({ error: "Service not found" });
      if (!["draft", "needs_revision"].includes(service.approvalStatus)) {
        return res
          .status(400)
          .json({
            error:
              "Solo se puede enviar a aprobación desde estado borrador o necesita revisión",
          });
      }

      // Sync interview checklist item before submitting
      await syncBaptismInterviewChecklistItem(service.id);

      const [updated] = await db
        .update(baptismServices)
        .set({
          approvalStatus: "pending_approval",
          approvalComment: null,
          updatedAt: new Date(),
        })
        .where(eq(baptismServices.id, service.id))
        .returning();

      // Get checklist status to include in response (bishop will see it)
      const checklist = await getBaptismActivityChecklist(service.id);

      // Notify bishops in the unit — include checklist summary in message
      const checklistSummary = checklist
        ? ` (Checklist: ${checklist.completedCount}/${checklist.totalCount} ítems completados)`
        : "";

      const bishops = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.organizationId, user.organizationId),
            eq(users.role, "obispo" as any),
          ),
        );
      for (const bishop of bishops) {
        const [notif] = await db
          .insert(notifications)
          .values({
            userId: bishop.id,
            title: "Agenda bautismal pendiente de aprobación",
            message: `El servicio en ${service.locationName} necesita tu aprobación.${checklistSummary}`,
            type: "reminder",
            relatedId: service.id,
          })
          .returning();
        if (isPushConfigured()) {
          await sendPushNotification(bishop.id, {
            title: "Agenda bautismal pendiente de aprobación",
            body: `El servicio en ${service.locationName} necesita tu aprobación.`,
            url: `/mission-work?section=servicios_bautismales&highlight=${service.id}`,
            notificationId: notif?.id,
          });
        }
      }
      res.json({ ...updated, checklist });
    },
  );

  app.post(
    "/api/baptisms/services/:id/approve",
    requireAuth,
    async (req, res) => {
      try {
        const user = (req as any).user;
        if (!canApproveBaptism(user))
          return res.status(403).json({ error: "Forbidden" });

        const svcResult = await db.execute(sql`
          SELECT id, unit_id, approval_status, created_by, location_name, candidate_contact_id, service_at
          FROM baptism_services WHERE id = ${req.params.id}
        `);
        const service = svcResult.rows[0] as any;
        if (!service) return res.status(404).json({ error: "Service not found" });
        if (service.approval_status !== "pending_approval") {
          return res.status(400).json({ error: "El servicio no está pendiente de aprobación" });
        }

        const now = new Date();

        // Approve
        await db.execute(sql`
          UPDATE baptism_services
          SET approval_status = 'approved', approved_by = ${user.id}, approved_at = ${now},
              approval_comment = NULL, updated_at = ${now}
          WHERE id = ${service.id}
        `);

        // Revoke active public links
        await db.execute(sql`
          UPDATE baptism_public_links
          SET revoked_at = ${now}, revoked_by = ${user.id}
          WHERE service_id = ${service.id} AND revoked_at IS NULL AND expires_at > ${now}
        `);

        // Get latest slug for continuity
        const latestSlugResult = await db.execute(sql`
          SELECT slug FROM baptism_public_links
          WHERE service_id = ${service.id}
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

        // Notify mission leader
        if (service.created_by) {
          const [notifApproved] = await db.insert(notifications).values({
            userId: service.created_by,
            title: "Agenda bautismal aprobada",
            message: `El Obispo aprobó el servicio en ${service.location_name}. El enlace se activará el día del bautismo.`,
            type: "reminder",
            relatedId: service.id,
          }).returning();
          if (isPushConfigured()) {
            await sendPushNotification(service.created_by, {
              title: "Agenda bautismal aprobada",
              body: `El Obispo aprobó el servicio en ${service.location_name}.`,
              url: `/mission-work?section=servicios_bautismales&highlight=${service.id}`,
              notificationId: notifApproved?.id,
            });
          }
        }

        // Create service_task for lider_actividades
        try {
          let candidateName = service.location_name;
          if (service.candidate_contact_id) {
            const contactResult = await db.execute(sql`
              SELECT full_name FROM mission_contacts WHERE id = ${service.candidate_contact_id}
            `);
            const contact = contactResult.rows[0] as any;
            if (contact) candidateName = contact.full_name;
          }

          const svcDate = new Date(service.service_at);
          const dd = String(svcDate.getUTCDate()).padStart(2, "0");
          const mm = String(svcDate.getUTCMonth() + 1).padStart(2, "0");
          const yyyy = svcDate.getUTCFullYear();
          const serviceDateStr = `${dd}/${mm}/${yyyy}`;

          const [liderActividades] = await db
            .select({ id: users.id, organizationId: users.organizationId })
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
          } else {
            console.warn("[approve] No lider_actividades found in barrio org; skipping service_task creation");
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

        return res.json({ success: true });
      } catch (err) {
        console.error("[baptisms/services/:id/approve POST]", err);
        return res.status(500).json({ error: "Error interno al aprobar el servicio" });
      }
    },
  );

  app.post(
    "/api/baptisms/services/:id/reject",
    requireAuth,
    async (req, res) => {
      try {
        const user = (req as any).user;
        if (!canApproveBaptism(user))
          return res.status(403).json({ error: "Forbidden" });
        const { comment } = z
          .object({ comment: z.string().min(1).max(500) })
          .parse(req.body);

        const svcResult = await db.execute(sql`
          SELECT id, approval_status, created_by, location_name
          FROM baptism_services WHERE id = ${req.params.id}
        `);
        const service = svcResult.rows[0] as any;
        if (!service) return res.status(404).json({ error: "Service not found" });
        if (service.approval_status !== "pending_approval") {
          return res.status(400).json({ error: "El servicio no está pendiente de aprobación" });
        }

        await db.execute(sql`
          UPDATE baptism_services
          SET approval_status = 'needs_revision', approval_comment = ${comment}, updated_at = NOW()
          WHERE id = ${service.id}
        `);

        if (service.created_by) {
          const [notifReject] = await db.insert(notifications).values({
            userId: service.created_by,
            title: "Agenda requiere revisión",
            message: `El Obispo solicitó cambios en el servicio de ${service.location_name}: ${comment}`,
            type: "reminder",
            relatedId: service.id,
          }).returning();
          if (isPushConfigured()) {
            await sendPushNotification(service.created_by, {
              title: "Agenda requiere revisión",
              body: `El Obispo solicitó cambios en el servicio de ${service.location_name}.`,
              url: `/mission-work?section=servicios_bautismales&highlight=${service.id}`,
              notificationId: notifReject?.id,
            });
          }
        }

        return res.json({ success: true });
      } catch (err) {
        console.error("[baptisms/services/:id/reject POST]", err);
        return res.status(500).json({ error: "Error interno al rechazar el servicio" });
      }
    },
  );

  app.get("/api/baptisms/pending-approvals", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!canApproveBaptism(user))
      return res.status(403).json({ error: "Forbidden" });
    const rows = await db
      .select({
        id: baptismServices.id,
        locationName: baptismServices.locationName,
        serviceAt: baptismServices.serviceAt,
        approvalStatus: baptismServices.approvalStatus,
        candidateName: missionContacts.fullName,
        createdBy: baptismServices.createdBy,
        leaderName: users.name,
      })
      .from(baptismServices)
      .leftJoin(
        missionContacts,
        eq(missionContacts.id, baptismServices.candidateContactId),
      )
      .leftJoin(users, eq(users.id, baptismServices.createdBy))
      .where(
        and(
          eq(baptismServices.unitId, user.organizationId),
          eq(baptismServices.approvalStatus, "pending_approval"),
        ),
      )
      .orderBy(baptismServices.serviceAt);

    // Enrich each service with checklist summary (syncs interview item as side-effect)
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const checklist = await getBaptismActivityChecklist(row.id);
        return {
          ...row,
          checklist: checklist
            ? {
                completedCount: checklist.completedCount,
                totalCount: checklist.totalCount,
                allDone: checklist.completedCount === checklist.totalCount,
                incompleteItems: checklist.items
                  .filter((i) => !i.completed)
                  .map((i) => ({ key: i.itemKey, label: i.label })),
              }
            : null,
        };
      }),
    );

    res.json(enriched);
  });

  // Bulk upsert all program items at once
  app.put(
    "/api/baptisms/services/:id/program",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user))) return res.status(403).json({ error: "Forbidden" });

      const items: Array<{ type: string; participantDisplayName?: string | null }> = req.body.items ?? [];
      if (!Array.isArray(items)) return res.status(400).json({ error: "items must be an array" });

      const [service] = await db
        .select({ id: baptismServices.id })
        .from(baptismServices)
        .where(and(eq(baptismServices.id, req.params.id), eq(baptismServices.unitId, user.organizationId)))
        .limit(1);
      if (!service) return res.status(404).json({ error: "Service not found" });

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

      const updated = await db
        .select()
        .from(baptismProgramItems)
        .where(eq(baptismProgramItems.serviceId, req.params.id))
        .orderBy(baptismProgramItems.order);

      // Auto-mark "programa" checklist item when all program items are filled
      const allFilled = items.length > 0 && items.every((it) => it.participantDisplayName?.trim());
      try {
        const [activity] = await db
          .select({ id: activities.id })
          .from(activities)
          .where(eq(activities.baptismServiceId, req.params.id))
          .limit(1);
        if (activity) {
          await db
            .update(activityChecklistItems)
            .set({ completed: allFilled, completedAt: allFilled ? new Date() : null })
            .where(
              and(
                eq(activityChecklistItems.activityId, activity.id),
                eq(activityChecklistItems.itemKey, "programa"),
              ),
            );
        }
      } catch (err) {
        console.error("[program PUT] sync programa checklist item error:", err);
      }

      res.json(updated);
    },
  );

  app.post(
    "/api/baptisms/services/:id/program-items",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = programItemSchema.parse(req.body);
      const [service] = await db
        .select({ id: baptismServices.id })
        .from(baptismServices)
        .where(
          and(
            eq(baptismServices.id, req.params.id),
            eq(baptismServices.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!service) return res.status(404).json({ error: "Service not found" });
      const [row] = await db
        .insert(baptismProgramItems)
        .values({
          serviceId: req.params.id,
          ...payload,
          order: payload.order ?? 0,
          updatedBy: user.id,
          updatedAt: new Date(),
        })
        .returning();
      res.status(201).json(row);
    },
  );

  app.patch(
    "/api/baptisms/program-items/:itemId",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = programItemSchema.partial({ type: true }).parse(req.body);
      const [target] = await db
        .select({ id: baptismProgramItems.id })
        .from(baptismProgramItems)
        .innerJoin(
          baptismServices,
          eq(baptismServices.id, baptismProgramItems.serviceId),
        )
        .where(
          and(
            eq(baptismProgramItems.id, req.params.itemId),
            eq(baptismServices.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!target)
        return res.status(404).json({ error: "Program item not found" });
      const [row] = await db
        .update(baptismProgramItems)
        .set({ ...payload, updatedBy: user.id, updatedAt: new Date() })
        .where(eq(baptismProgramItems.id, req.params.itemId))
        .returning();
      res.json(row);
    },
  );

  app.post(
    "/api/baptisms/services/:id/assignments",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = assignmentSchema.parse(req.body);
      const [service] = await db
        .select({ id: baptismServices.id })
        .from(baptismServices)
        .where(
          and(
            eq(baptismServices.id, req.params.id),
            eq(baptismServices.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!service) return res.status(404).json({ error: "Service not found" });
      const [row] = await db
        .insert(baptismAssignments)
        .values({
          serviceId: req.params.id,
          ...payload,
          status: payload.status ?? "pending",
        })
        .returning();
      res.status(201).json(row);
    },
  );

  app.patch(
    "/api/baptisms/assignments/:assignmentId",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = assignmentSchema.partial({ type: true }).parse(req.body);
      const [target] = await db
        .select({ id: baptismAssignments.id })
        .from(baptismAssignments)
        .innerJoin(
          baptismServices,
          eq(baptismServices.id, baptismAssignments.serviceId),
        )
        .where(
          and(
            eq(baptismAssignments.id, req.params.assignmentId),
            eq(baptismServices.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!target)
        return res.status(404).json({ error: "Assignment not found" });
      const [row] = await db
        .update(baptismAssignments)
        .set(payload)
        .where(eq(baptismAssignments.id, req.params.assignmentId))
        .returning();
      res.json(row);
    },
  );

  app.get(
    "/api/baptisms/services/:id/minimum-ready",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });

      const [service] = await db
        .select()
        .from(baptismServices)
        .where(
          and(
            eq(baptismServices.id, req.params.id),
            eq(baptismServices.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!service) return res.status(404).json({ error: "Service not found" });

      const [programItems, assignments, interviewScheduled] = await Promise.all(
        [
          db
            .select({ type: baptismProgramItems.type })
            .from(baptismProgramItems)
            .where(eq(baptismProgramItems.serviceId, service.id)),
          db
            .select({
              type: baptismAssignments.type,
              assigneeUserId: baptismAssignments.assigneeUserId,
              assigneeName: baptismAssignments.assigneeName,
            })
            .from(baptismAssignments)
            .where(eq(baptismAssignments.serviceId, service.id)),
          db
            .select({ id: missionContactMilestones.id })
            .from(missionContactMilestones)
            .innerJoin(
              missionTemplateItems,
              eq(
                missionTemplateItems.id,
                missionContactMilestones.templateItemId,
              ),
            )
            .where(
              and(
                eq(
                  missionContactMilestones.contactId,
                  service.candidateContactId,
                ),
                eq(missionContactMilestones.status, "done"),
                eq(missionTemplateItems.itemType, "milestone"),
                milestoneKeyFilter("interview_scheduled"),
              ),
            )
            .limit(1),
        ],
      );

      res.json(
        computeMinimumReady({
          programItems,
          assignments,
          hasInterviewScheduledMilestone: Boolean(interviewScheduled),
        }),
      );
    },
  );

  app.get(
    "/api/baptisms/services/:id/public-link-state",
    requireAuth,
    async (req, res) => {
      try {
        const user = (req as any).user;
        if (!(await canAccessMission(user)))
          return res.status(403).json({ error: "Forbidden" });

        const svcResult = await db.execute(sql`
          SELECT id, approval_status, service_at
          FROM baptism_services
          WHERE id = ${req.params.id} AND unit_id = ${user.organizationId}
          LIMIT 1
        `);
        if (!svcResult.rows.length)
          return res.status(404).json({ error: "Service not found" });
        const svc = svcResult.rows[0] as any;

        let latestResult = await db.execute(sql`
          SELECT slug, code, expires_at, revoked_at
          FROM baptism_public_links
          WHERE service_id = ${req.params.id}
          ORDER BY created_at DESC
          LIMIT 1
        `);

        // Lazy-create the public link if the service is approved but no link exists yet
        if (!latestResult.rows.length && svc.approval_status === "approved") {
          const session = approvedSessionPayload({
            serviceId: svc.id,
            serviceAt: new Date(svc.service_at),
            randomCode: randomBytes(3).toString("hex"),
            randomSlugHex: randomBytes(3).toString("hex"),
          });
          await db.execute(sql`
            INSERT INTO baptism_public_links (service_id, slug, code, published_at, expires_at, created_by)
            VALUES (${svc.id}, ${session.slug}, ${session.code}, ${session.publishedAt}, ${session.expiresAt}, ${user.id})
          `);
          latestResult = await db.execute(sql`
            SELECT slug, code, expires_at, revoked_at
            FROM baptism_public_links
            WHERE service_id = ${req.params.id}
            ORDER BY created_at DESC
            LIMIT 1
          `);
        }

        if (!latestResult.rows.length) {
          return res.json({ active: false, stableUrl: null, activePublicUrl: null, expiresAt: null });
        }

        const latest = latestResult.rows[0] as any;
        const now = new Date();
        const isActive = isPublicWindowActive(
          latest.expires_at ? new Date(latest.expires_at) : null,
          latest.revoked_at ? new Date(latest.revoked_at) : null,
          now,
        );
        return res.json({
          active: isActive,
          stableUrl: `/bautismo/${latest.slug}`,
          activePublicUrl: isActive ? `/b/${latest.slug}?c=${latest.code}` : null,
          expiresAt: latest.expires_at,
        });
      } catch (err) {
        console.error("[GET /public-link-state]", err);
        return res.status(500).json({ error: "Error interno" });
      }
    },
  );

  app.post(
    "/api/baptisms/services/:id/publish-link",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!isMissionLeader(user))
        return res.status(403).json({ error: "Forbidden" });
      const now = new Date();
      const [service] = await db
        .select()
        .from(baptismServices)
        .where(
          and(
            eq(baptismServices.id, req.params.id),
            eq(baptismServices.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!service) return res.status(404).json({ error: "Service not found" });

      const [latest] = await db
        .select()
        .from(baptismPublicLinks)
        .where(eq(baptismPublicLinks.serviceId, service.id))
        .orderBy(desc(baptismPublicLinks.createdAt))
        .limit(1);

      await db
        .update(baptismPublicLinks)
        .set({ revokedAt: now, revokedBy: user.id })
        .where(
          and(
            eq(baptismPublicLinks.serviceId, service.id),
            isNull(baptismPublicLinks.revokedAt),
            gt(baptismPublicLinks.expiresAt, now),
          ),
        );

      const next = nextSessionPayload({
        serviceId: service.id,
        now,
        randomCode: randomBytes(3).toString("hex"),
        previousSlug: latest?.slug ?? null,
        randomSlugHex: randomBytes(3).toString("hex"),
      });

      const [session] = await db
        .insert(baptismPublicLinks)
        .values({
          serviceId: service.id,
          slug: next.slug,
          code: next.code,
          publishedAt: next.publishedAt,
          expiresAt: next.expiresAt,
          createdBy: user.id,
        })
        .returning();

      res.json({
        stableUrl: `/bautismo/${session.slug}`,
        publicUrl: `/b/${session.slug}?c=${session.code}`,
        expiresAt: session.expiresAt,
      });
    },
  );

  app.get("/api/baptisms/moderation/posts", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user))
      return res.status(403).json({ error: "Forbidden" });
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
      .innerJoin(
        baptismPublicLinks,
        eq(baptismPublicLinks.id, baptismPublicPosts.publicLinkId),
      )
      .innerJoin(
        baptismServices,
        eq(baptismServices.id, baptismPublicLinks.serviceId),
      )
      .where(
        and(
          eq(baptismPublicPosts.status, status as any),
          eq(baptismServices.unitId, user.organizationId),
        ),
      )
      .orderBy(desc(baptismPublicPosts.createdAt));
    res.json(rows);
  });

  app.patch(
    "/api/baptisms/moderation/posts/:id",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!isMissionLeader(user))
        return res.status(403).json({ error: "Forbidden" });
      const payload = z
        .object({ status: z.enum(["approved", "rejected"]) })
        .parse(req.body);
      const [target] = await db
        .select({ id: baptismPublicPosts.id })
        .from(baptismPublicPosts)
        .innerJoin(
          baptismPublicLinks,
          eq(baptismPublicLinks.id, baptismPublicPosts.publicLinkId),
        )
        .innerJoin(
          baptismServices,
          eq(baptismServices.id, baptismPublicLinks.serviceId),
        )
        .where(
          and(
            eq(baptismPublicPosts.id, req.params.id),
            eq(baptismServices.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!target) return res.status(404).json({ error: "Post not found" });
      const [row] = await db
        .update(baptismPublicPosts)
        .set({
          status: payload.status,
          moderatedBy: user.id,
          moderatedAt: new Date(),
        })
        .where(eq(baptismPublicPosts.id, req.params.id))
        .returning();
      res.json(row);
    },
  );

  app.get("/bautismo/:slug", async (req, res) => {
    // Catalog URL — no code required, available during 24h window on service day
    // Requires: approval_status = 'approved' + logistics complete + within time window
    const linkRows = await db
      .select()
      .from(baptismPublicLinks)
      .where(
        and(
          eq(baptismPublicLinks.slug, req.params.slug),
          isNull(baptismPublicLinks.revokedAt),
        ),
      )
      .orderBy(desc(baptismPublicLinks.publishedAt))
      .limit(1);
    const link = linkRows[0];
    if (!link) return res.status(404).json({ message: "Enlace no encontrado" });

    const svcRow = await db.execute(sql`
      SELECT approval_status, service_at, candidate_contact_id FROM baptism_services WHERE id = ${link.serviceId}
    `);
    const svc = svcRow.rows[0] as any;

    if (svc?.approval_status !== "approved")
      return res.json({ unavailable: "not_approved" });

    // 24h window: from serviceAt to serviceAt + 24h
    const serviceAt = svc?.service_at ? new Date(svc.service_at) : null;
    if (serviceAt) {
      const now = new Date();
      const windowEnd = new Date(serviceAt.getTime() + 24 * 60 * 60 * 1000);
      if (now < serviceAt || now >= windowEnd)
        return res.json({ unavailable: "outside_window" });
    }

    // Logistics check — all required assignments must have assignees
    const [programItems, assignments] = await Promise.all([
      db.select({ type: baptismProgramItems.type })
        .from(baptismProgramItems)
        .where(eq(baptismProgramItems.serviceId, link.serviceId)),
      db.select({ type: baptismAssignments.type, assigneeUserId: baptismAssignments.assigneeUserId, assigneeName: baptismAssignments.assigneeName })
        .from(baptismAssignments)
        .where(eq(baptismAssignments.serviceId, link.serviceId)),
    ]);
    const readiness = computeMinimumReady({
      programItems,
      assignments,
      hasInterviewScheduledMilestone: true, // bishop already approved — interview condition met
    });
    if (!readiness.ready)
      return res.json({ unavailable: "pending_logistics" });

    const [items, approvedPosts, candidatesResult, svcResult, tplResult] = await Promise.all([
      db.select({
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
        .where(eq(baptismProgramItems.serviceId, link.serviceId)),
      db.select()
        .from(baptismPublicPosts)
        .where(and(
          eq(baptismPublicPosts.publicLinkId, link.id),
          eq(baptismPublicPosts.status, "approved"),
        ))
        .orderBy(desc(baptismPublicPosts.createdAt)),
      db.execute(sql`
        SELECT mp.nombre, mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
        FROM baptism_service_candidates bsc
        JOIN mission_personas mp ON mp.id = bsc.persona_id
        WHERE bsc.service_id = ${link.serviceId}
        ORDER BY mp.nombre
      `),
      db.execute(sql`SELECT service_at FROM baptism_services WHERE id = ${link.serviceId}`),
      db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
    ]);

    const candidates = (candidatesResult.rows as any[]).map((r) => ({
      nombre: r.nombre as string,
      sexo: r.sexo as string | null,
      fechaNacimiento: r.fechaNacimiento as string | null,
    }));
    const serviceAt = (svcResult.rows[0] as any)?.service_at
      ? new Date((svcResult.rows[0] as any).service_at)
      : null;
    const wardName = (tplResult.rows[0] as any)?.ward_name ?? null;

    res.json(
      toPublicServiceDTO({ items, approvedPosts, expiresAt: link.expiresAt, candidates, serviceAt, wardName }),
    );
  });

  app.get("/b/:slug", async (req, res) => {
    const code = String(req.query.c || "");
    const active = await getActivePublicLink(req.params.slug, code);
    if (active === "invalid_code")
      return res.status(403).json({ error: "Invalid code" });
    if (!active) return res.status(410).json({ message: "Enlace caducado" });

    const [items, approvedPosts, candidatesResult, svcResult, tplResult] = await Promise.all([
      db.select({
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
        .where(eq(baptismProgramItems.serviceId, active.serviceId)),
      db.select()
        .from(baptismPublicPosts)
        .where(and(
          eq(baptismPublicPosts.publicLinkId, active.id),
          eq(baptismPublicPosts.status, "approved"),
        ))
        .orderBy(desc(baptismPublicPosts.createdAt)),
      db.execute(sql`
        SELECT mp.nombre, mp.sexo, mp.fecha_nacimiento AS "fechaNacimiento"
        FROM baptism_service_candidates bsc
        JOIN mission_personas mp ON mp.id = bsc.persona_id
        WHERE bsc.service_id = ${active.serviceId}
        ORDER BY mp.nombre
      `),
      db.execute(sql`SELECT service_at FROM baptism_services WHERE id = ${active.serviceId}`),
      db.execute(sql`SELECT ward_name FROM pdf_templates LIMIT 1`),
    ]);

    const candidates = (candidatesResult.rows as any[]).map((r) => ({
      nombre: r.nombre as string,
      sexo: r.sexo as string | null,
      fechaNacimiento: r.fechaNacimiento as string | null,
    }));
    const serviceAt = (svcResult.rows[0] as any)?.service_at
      ? new Date((svcResult.rows[0] as any).service_at)
      : null;
    const wardName = (tplResult.rows[0] as any)?.ward_name ?? null;

    res.json(
      toPublicServiceDTO({ items, approvedPosts, expiresAt: active.expiresAt, candidates, serviceAt, wardName }),
    );
  });

  app.post("/b/:slug/posts", async (req, res) => {
    const parsed = publicPostSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message || "Invalid payload" });
    if (parsed.data.company && parsed.data.company.trim())
      return res.status(400).json({ error: "Bot detected" });

    const active = await getActivePublicLink(req.params.slug, parsed.data.code);
    if (active === "invalid_code")
      return res.status(403).json({ error: "Invalid code" });
    if (!active) return res.status(403).json({ error: "ventana terminada" });

    const hash = ipHash(req);
    const now = new Date();
    const tenMinutes = new Date(now.getTime() - 10 * 60 * 1000);
    const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recent10 = await db
      .select()
      .from(baptismPublicPosts)
      .where(
        and(
          eq(baptismPublicPosts.ipHash, hash),
          gt(baptismPublicPosts.createdAt, tenMinutes),
        ),
      );
    const recent24 = await db
      .select()
      .from(baptismPublicPosts)
      .where(
        and(
          eq(baptismPublicPosts.ipHash, hash),
          gt(baptismPublicPosts.createdAt, oneDay),
        ),
      );
    const limit = isRateLimited(recent10.length, recent24.length);
    if (limit.blocked) return res.status(429).json({ error: "Rate limit" });

    const existing = await db
      .select()
      .from(baptismPublicPosts)
      .where(
        and(
          eq(baptismPublicPosts.publicLinkId, active.id),
          eq(baptismPublicPosts.clientRequestId, parsed.data.clientRequestId),
        ),
      )
      .limit(1);
    if (existing[0]) return res.status(200).json(existing[0]);

    const [row] = await db
      .insert(baptismPublicPosts)
      .values({
        publicLinkId: active.id,
        displayName: normalizeDisplayName(parsed.data.displayName),
        message: parsed.data.message,
        clientRequestId: parsed.data.clientRequestId,
        ipHash: hash,
        status: "pending",
      })
      .returning();

    res.status(201).json(row);
  });

  app.post("/bautismo/:slug/posts", async (req, res) => {
    const parsed = publicPostSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payload" });
    if (parsed.data.company && parsed.data.company.trim())
      return res.status(400).json({ error: "Bot detected" });

    const linkRows = await db
      .select()
      .from(baptismPublicLinks)
      .where(
        and(
          eq(baptismPublicLinks.slug, req.params.slug),
          isNull(baptismPublicLinks.revokedAt),
        ),
      )
      .orderBy(desc(baptismPublicLinks.publishedAt))
      .limit(1);
    const link = linkRows[0];
    if (!link) return res.status(404).json({ error: "Enlace no encontrado" });

    const svcResult = await db.execute(sql`
      SELECT approval_status, service_at FROM baptism_services WHERE id = ${link.serviceId}
    `);
    const svcPost = svcResult.rows[0] as any;
    if (svcPost?.approval_status !== "approved")
      return res.status(403).json({ error: "El programa no está disponible" });

    const serviceAtPost = svcPost?.service_at ? new Date(svcPost.service_at) : null;
    if (serviceAtPost) {
      const now = new Date();
      const windowEnd = new Date(serviceAtPost.getTime() + 24 * 60 * 60 * 1000);
      if (now < serviceAtPost || now >= windowEnd)
        return res.status(403).json({ error: "El programa no está disponible" });
    }

    const hash = ipHash(req);
    const now = new Date();
    const tenMinutes = new Date(now.getTime() - 10 * 60 * 1000);
    const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recent10 = await db.select().from(baptismPublicPosts).where(
      and(eq(baptismPublicPosts.ipHash, hash), gt(baptismPublicPosts.createdAt, tenMinutes)),
    );
    const recent24 = await db.select().from(baptismPublicPosts).where(
      and(eq(baptismPublicPosts.ipHash, hash), gt(baptismPublicPosts.createdAt, oneDay)),
    );
    if (isRateLimited(recent10.length, recent24.length).blocked)
      return res.status(429).json({ error: "Rate limit" });

    const existing = await db.select().from(baptismPublicPosts).where(
      and(
        eq(baptismPublicPosts.publicLinkId, link.id),
        eq(baptismPublicPosts.clientRequestId, parsed.data.clientRequestId),
      ),
    ).limit(1);
    if (existing[0]) return res.status(200).json(existing[0]);

    const [row] = await db
      .insert(baptismPublicPosts)
      .values({
        publicLinkId: link.id,
        displayName: normalizeDisplayName(parsed.data.displayName),
        message: parsed.data.message,
        clientRequestId: parsed.data.clientRequestId,
        ipHash: hash,
        status: "pending",
      })
      .returning();

    res.status(201).json(row);
  });

  // ── Confirm friend→recent_convert ──────────────────────────────────────────
  app.post(
    "/api/mission/contacts/:id/confirm",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [contact] = await db
        .select()
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      if (contact.personType !== "friend")
        return res
          .status(400)
          .json({ error: "Solo se puede confirmar un amigo" });
      const now = new Date();
      const { confirmedAt } = z
        .object({ confirmedAt: z.coerce.date().optional() })
        .parse(req.body);
      const confirmDate = confirmedAt ?? now;
      const [updated] = await db
        .update(missionContacts)
        .set({
          personType: "recent_convert",
          stage: "active",
          confirmedAt: confirmDate,
          updatedAt: now,
        })
        .where(eq(missionContacts.id, contact.id))
        .returning();
      await db
        .insert(missionContactNotes)
        .values({
          contactId: contact.id,
          authorUserId: user.id,
          note: `✅ Confirmado: ${contact.fullName} fue bautizado y actualizado a converso reciente.`,
        });
      res.json(updated);
    },
  );

  // ── Seed default templates ──────────────────────────────────────────────────
  app.post(
    "/api/mission/templates/seed-defaults",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!isMissionLeader(user))
        return res.status(403).json({ error: "Forbidden" });
      const unitId = user.organizationId;
      let created = 0;
      for (const [personType, tpl] of Object.entries(DEFAULT_TEMPLATES) as [
        string,
        (typeof DEFAULT_TEMPLATES)[string],
      ][]) {
        const existing = await db
          .select({ id: missionTrackTemplates.id })
          .from(missionTrackTemplates)
          .where(
            and(
              eq(missionTrackTemplates.unitId, unitId),
              eq(missionTrackTemplates.personType, personType as any),
              eq(missionTrackTemplates.isDefault, true),
            ),
          )
          .limit(1);
        if (existing[0]) continue;
        const [template] = await db
          .insert(missionTrackTemplates)
          .values({
            unitId,
            personType: personType as any,
            name: tpl.name,
            isDefault: true,
          })
          .returning();
        for (const item of tpl.items) {
          await db
            .insert(missionTemplateItems)
            .values({
              templateId: template.id,
              order: item.order,
              title: item.title,
              itemType: item.itemType as any,
              required: item.required,
              metadata: item.metadata,
            });
        }
        created++;
      }
      res.json({ ok: true, created });
    },
  );

  // ── Church attendance ───────────────────────────────────────────────────────
  app.get(
    "/api/mission/contacts/:id/attendance",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [contact] = await db
        .select({ id: missionContacts.id })
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const rows = await db
        .select({
          id: missionChurchAttendance.id,
          attendedAt: missionChurchAttendance.attendedAt,
          createdAt: missionChurchAttendance.createdAt,
        })
        .from(missionChurchAttendance)
        .where(eq(missionChurchAttendance.contactId, req.params.id))
        .orderBy(desc(missionChurchAttendance.attendedAt));
      res.json(rows);
    },
  );

  app.post(
    "/api/mission/contacts/:id/attendance",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const { attendedAt } = z
        .object({
          attendedAt: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        })
        .parse(req.body);
      const [contact] = await db
        .select({ id: missionContacts.id })
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const [row] = await db
        .insert(missionChurchAttendance)
        .values({ contactId: req.params.id, attendedAt, notedBy: user.id })
        .onConflictDoNothing()
        .returning();
      res
        .status(row ? 201 : 200)
        .json(row ?? { contactId: req.params.id, attendedAt });
    },
  );

  app.delete(
    "/api/mission/contacts/:id/attendance/:date",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      await db
        .delete(missionChurchAttendance)
        .where(
          and(
            eq(missionChurchAttendance.contactId, req.params.id),
            eq(missionChurchAttendance.attendedAt, req.params.date),
          ),
        );
      res.status(204).send();
    },
  );

  // ── Coordination tasks ──────────────────────────────────────────────────────
  app.get("/api/mission/coordination-tasks", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const statusFilter = req.query.status ? String(req.query.status) : null;
    const contactFilter = req.query.contactId
      ? String(req.query.contactId)
      : null;
    const conditions = [
      eq(missionCoordinationTasks.unitId, user.organizationId),
    ];
    if (statusFilter)
      conditions.push(eq(missionCoordinationTasks.status, statusFilter as any));
    if (contactFilter)
      conditions.push(eq(missionCoordinationTasks.contactId, contactFilter));
    const rows = await db
      .select()
      .from(missionCoordinationTasks)
      .where(and(...conditions))
      .orderBy(
        missionCoordinationTasks.dueAt,
        missionCoordinationTasks.createdAt,
      );
    res.json(rows);
  });

  app.get("/api/mission/my-tasks", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const rows = await db
      .select()
      .from(missionCoordinationTasks)
      .where(
        and(
          eq(missionCoordinationTasks.ownerUserId, user.id),
          eq(missionCoordinationTasks.status, "open"),
        ),
      )
      .orderBy(missionCoordinationTasks.dueAt);
    res.json(rows);
  });

  app.post("/api/mission/coordination-tasks", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const payload = coordinationTaskSchema.parse(req.body);
    const [row] = await db
      .insert(missionCoordinationTasks)
      .values({
        ...payload,
        unitId: user.organizationId,
        createdBy: user.id,
        priority: payload.priority ?? "medium",
        status: payload.status ?? "open",
      })
      .returning();
    res.status(201).json(row);
  });

  app.patch(
    "/api/mission/coordination-tasks/:id",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const payload = coordinationTaskSchema
        .partial({ title: true })
        .parse(req.body);
      const completedAt =
        payload.status === "done"
          ? new Date()
          : payload.status === "open" || payload.status === "canceled"
            ? null
            : undefined;
      const [row] = await db
        .update(missionCoordinationTasks)
        .set({
          ...payload,
          ...(completedAt !== undefined ? { completedAt } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(missionCoordinationTasks.id, req.params.id),
            eq(missionCoordinationTasks.unitId, user.organizationId),
          ),
        )
        .returning();
      if (!row) return res.status(404).json({ error: "Task not found" });
      res.json(row);
    },
  );

  app.delete(
    "/api/mission/coordination-tasks/:id",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [deleted] = await db
        .delete(missionCoordinationTasks)
        .where(
          and(
            eq(missionCoordinationTasks.id, req.params.id),
            eq(missionCoordinationTasks.unitId, user.organizationId),
          ),
        )
        .returning({ id: missionCoordinationTasks.id });
      if (!deleted) return res.status(404).json({ error: "Task not found" });
      res.status(204).send();
    },
  );

  // ── Coordination dashboard ──────────────────────────────────────────────────
  app.get(
    "/api/mission/coordination-dashboard",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const unitId = user.organizationId;

      const [contacts, tasks, attendance] = await Promise.all([
        db
          .select()
          .from(missionContacts)
          .where(eq(missionContacts.unitId, unitId)),
        db
          .select()
          .from(missionCoordinationTasks)
          .where(eq(missionCoordinationTasks.unitId, unitId)),
        db
          .select({
            contactId: missionChurchAttendance.contactId,
            attendedAt: missionChurchAttendance.attendedAt,
          })
          .from(missionChurchAttendance)
          .innerJoin(
            missionContacts,
            eq(missionContacts.id, missionChurchAttendance.contactId),
          )
          .where(eq(missionContacts.unitId, unitId))
          .orderBy(desc(missionChurchAttendance.attendedAt)),
      ]);

      const attendanceByContact = new Map<string, string[]>();
      for (const row of attendance) {
        const arr = attendanceByContact.get(row.contactId) ?? [];
        arr.push(row.attendedAt);
        attendanceByContact.set(row.contactId, arr);
      }

      const tasksByContact = new Map<string, typeof tasks>();
      for (const task of tasks) {
        if (task.contactId) {
          const arr = tasksByContact.get(task.contactId) ?? [];
          arr.push(task);
          tasksByContact.set(task.contactId, arr);
        }
      }

      const summary = contacts.map((c) => {
        const att = attendanceByContact.get(c.id) ?? [];
        const ctasks = tasksByContact.get(c.id) ?? [];
        return {
          contactId: c.id,
          fullName: c.fullName,
          personType: c.personType,
          stage: c.stage,
          fellowshipUserId: c.fellowshipUserId,
          fellowshipName: c.fellowshipName,
          attendanceCount: att.length,
          lastAttendedAt: att[0] ?? null,
          openTasks: ctasks.filter((t) => t.status === "open").length,
          overdueTasks: ctasks.filter(
            (t) => t.status === "open" && t.dueAt && t.dueAt < new Date(),
          ).length,
        };
      });

      res.json({
        contacts: summary,
        unlinkedTasks: tasks.filter((t) => !t.contactId),
      });
    },
  );

  // ── Baptism candidate status ────────────────────────────────────────────────
  app.get("/api/baptisms/candidate-status", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });

    const contacts = await db
      .select()
      .from(missionContacts)
      .where(
        and(
          eq(missionContacts.unitId, user.organizationId),
          eq(missionContacts.personType, "friend"),
        ),
      );

    const milestones = await db
      .select({
        contactId: missionContactMilestones.contactId,
        milestoneKey: sql<string>`${missionTemplateItems.metadata}->>'milestoneKey'`,
        status: missionContactMilestones.status,
      })
      .from(missionContactMilestones)
      .innerJoin(
        missionTemplateItems,
        eq(missionTemplateItems.id, missionContactMilestones.templateItemId),
      )
      .where(
        inArray(
          missionContactMilestones.contactId,
          contacts.map((c) => c.id),
        ),
      );

    const existingServices = await db
      .select({ candidateContactId: baptismServices.candidateContactId })
      .from(baptismServices)
      .where(
        and(
          eq(baptismServices.unitId, user.organizationId),
          inArray(baptismServices.status, ["scheduled", "live"]),
        ),
      );
    const scheduled = new Set(
      existingServices.map((s) => s.candidateContactId),
    );

    const milestoneMap = new Map<string, Map<string, string>>();
    for (const m of milestones) {
      if (!milestoneMap.has(m.contactId))
        milestoneMap.set(m.contactId, new Map());
      if (m.milestoneKey)
        milestoneMap.get(m.contactId)!.set(m.milestoneKey, m.status);
    }

    const eligible: typeof contacts = [];
    const almostReady: Array<{
      contact: (typeof contacts)[0];
      missingKeys: string[];
    }> = [];
    const notEligible: Array<{
      contact: (typeof contacts)[0];
      missingKeys: string[];
    }> = [];

    for (const c of contacts) {
      if (scheduled.has(c.id)) continue;
      const keys = milestoneMap.get(c.id) ?? new Map();
      const dateSet = keys.get("baptism_date_set") === "done";
      const interviewScheduled = keys.get("interview_scheduled") === "done";
      const interviewApproved = keys.get("interview_approved") === "done";
      const missing: string[] = [];
      if (!dateSet) missing.push("baptism_date_set");
      if (!interviewScheduled) missing.push("interview_scheduled");
      if (!interviewApproved) missing.push("interview_approved");

      if (missing.length === 0) eligible.push(c);
      else if (missing.length <= 1)
        almostReady.push({ contact: c, missingKeys: missing });
      else notEligible.push({ contact: c, missingKeys: missing });
    }

    res.json({ eligible, almostReady, notEligible });
  });

  // ── Friend progress sections (9-section JSONB form) ─────────────────────────
  app.get(
    "/api/mission/contacts/:id/friend-progress",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [contact] = await db
        .select({ id: missionContacts.id })
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const rows = await db
        .select()
        .from(missionFriendSectionData)
        .where(eq(missionFriendSectionData.contactId, req.params.id))
        .orderBy(missionFriendSectionData.sectionKey);
      res.json(rows);
    },
  );

  app.put(
    "/api/mission/contacts/:id/friend-progress/:sectionKey",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [contact] = await db
        .select({ id: missionContacts.id })
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const data = z.record(z.any()).parse(req.body);
      const now = new Date();
      const [row] = await db
        .insert(missionFriendSectionData)
        .values({
          contactId: req.params.id,
          sectionKey: req.params.sectionKey,
          data,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            missionFriendSectionData.contactId,
            missionFriendSectionData.sectionKey,
          ],
          set: { data, updatedAt: now },
        })
        .returning();
      res.json(row);
    },
  );

  // ── Covenant path progress (20 items × 3 stages) ────────────────────────────
  app.get(
    "/api/mission/contacts/:id/covenant-path",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [contact] = await db
        .select({ id: missionContacts.id })
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const rows = await db
        .select()
        .from(missionCovenantPathProgress)
        .where(eq(missionCovenantPathProgress.contactId, req.params.id));
      const progressMap = new Map(rows.map((r) => [r.itemKey, r]));
      const merged = COVENANT_PATH_ITEMS.map((item) => {
        const saved = progressMap.get(item.key);
        return {
          key: item.key,
          title: item.title,
          order: item.order,
          lessonStatus: saved?.lessonStatus ?? "not_started",
          commitmentStatus: saved?.commitmentStatus ?? "pending",
          milestoneStatus: saved?.milestoneStatus ?? "pending",
          notes: saved?.notes ?? null,
          updatedAt: saved?.updatedAt ?? null,
        };
      });
      res.json(merged);
    },
  );

  app.put(
    "/api/mission/contacts/:id/covenant-path/:itemKey",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!(await canAccessMission(user)))
        return res.status(403).json({ error: "Forbidden" });
      const [contact] = await db
        .select({ id: missionContacts.id })
        .from(missionContacts)
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .limit(1);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const payload = z
        .object({
          lessonStatus: z
            .enum(["not_started", "taught", "completed"])
            .optional(),
          commitmentStatus: z
            .enum(["pending", "committed", "not_committed"])
            .optional(),
          milestoneStatus: z.enum(["pending", "done", "waived"]).optional(),
          notes: z.string().nullable().optional(),
        })
        .parse(req.body);
      const now = new Date();
      const [row] = await db
        .insert(missionCovenantPathProgress)
        .values({
          contactId: req.params.id,
          itemKey: req.params.itemKey,
          ...payload,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            missionCovenantPathProgress.contactId,
            missionCovenantPathProgress.itemKey,
          ],
          set: { ...payload, updatedAt: now },
        })
        .returning();
      res.json(row);
    },
  );

  // ── Directory members search (for contact creation by personType) ─────────────
  app.get("/api/mission/directory-members", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!(await canAccessMission(user)))
      return res.status(403).json({ error: "Forbidden" });
    const q = String(req.query.q || "").trim();
    const personType = z
      .enum(["friend", "recent_convert", "less_active"])
      .catch("less_active")
      .parse(req.query.personType);
    const canBrowseAllDirectory = [
      "obispo",
      "consejero_obispo",
      "mission_leader",
    ].includes(user?.role ?? "");
    const conditions: any[] = [eq(users.isActive, true)];
    if (!canBrowseAllDirectory) {
      conditions.push(eq(users.organizationId, user.organizationId));
    }
    if (q)
      conditions.push(
        sql`lower(${users.name}) like ${"%" + q.toLowerCase() + "%"}`,
      );
    const members = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(...conditions))
      .orderBy(users.name)
      .limit(50);
    const tracked = new Set(
      (
        await db
          .select({ memberUserId: missionContacts.memberUserId })
          .from(missionContacts)
          .where(
            and(
              eq(missionContacts.unitId, user.organizationId),
              eq(missionContacts.personType, personType),
              eq(missionContacts.isArchived, false),
            ),
          )
      )
        .map((r) => r.memberUserId)
        .filter(Boolean),
    );
    res.json(members.filter((m) => !tracked.has(m.id)));
  });

  // ── Archive contact (manual) ─────────────────────────────────────────────────
  app.post(
    "/api/mission/contacts/:id/archive",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!isMissionLeader(user))
        return res.status(403).json({ error: "Forbidden" });
      const now = new Date();
      const [updated] = await db
        .update(missionContacts)
        .set({ isArchived: true, archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .returning();
      if (!updated) return res.status(404).json({ error: "Contact not found" });
      res.json(updated);
    },
  );

  app.post(
    "/api/mission/contacts/:id/unarchive",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!isMissionLeader(user))
        return res.status(403).json({ error: "Forbidden" });
      const now = new Date();
      const [updated] = await db
        .update(missionContacts)
        .set({ isArchived: false, archivedAt: null, updatedAt: now })
        .where(
          and(
            eq(missionContacts.id, req.params.id),
            eq(missionContacts.unitId, user.organizationId),
          ),
        )
        .returning();
      if (!updated) return res.status(404).json({ error: "Contact not found" });
      res.json(updated);
    },
  );

  // ── Mission progress transitions job ────────────────────────────────────────
  app.post(
    "/api/baptisms/jobs/mission-transitions",
    requireAuth,
    async (req, res) => {
      const user = (req as any).user;
      if (!isMissionLeader(user))
        return res.status(403).json({ error: "Forbidden" });
      const result = await runMissionProgressTransitions();
      res.json({ ok: true, ...result });
    },
  );

  app.post("/api/baptisms/jobs/t14-check", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!isMissionLeader(user))
      return res.status(403).json({ error: "Forbidden" });
    const count = await runBaptismReadinessCheck();
    res.json({ ok: true, notificationsSent: count });
  });

  // One-time backfill: create missing activities for existing baptism services
  app.post("/api/baptisms/jobs/backfill-activities", requireAuth, async (req, res) => {
    const user = (req as any).user;
    if (!canApproveBaptism(user)) return res.status(403).json({ error: "Forbidden" });

    const services = await db.execute(sql`
      SELECT bs.id, bs.service_at, bs.unit_id, bs.created_by,
             mp.nombre AS persona_nombre
      FROM baptism_services bs
      LEFT JOIN mission_personas mp ON mp.id = bs.candidate_persona_id
      WHERE bs.status NOT IN ('archived')
    `);

    let created = 0;
    for (const row of services.rows as any[]) {
      // Skip if activity already linked
      const existing = await db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.baptismServiceId, row.id))
        .limit(1);
      if (existing.length > 0) continue;

      const title = row.persona_nombre
        ? `Servicio bautismal de ${row.persona_nombre}`
        : "Servicio bautismal";

      await storage.createActivity({
        title,
        date: new Date(row.service_at),
        type: "servicio_bautismal",
        status: "borrador",
        baptismServiceId: row.id,
        organizationId: row.unit_id,
        createdBy: row.created_by,
      });
      created++;
    }

    res.json({ ok: true, created, total: services.rows.length });
  });

  // GET /api/service-tasks — list service tasks visible to the authenticated user
  app.get("/api/service-tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["lider_actividades", "mission_leader", "obispo", "consejero_obispo", "technology_specialist"];
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      let rows;
      if (user.role === "lider_actividades") {
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
  app.patch("/api/service-tasks/:id/status", requireAuth, async (req: Request, res: Response) => {
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

      const task = result.rows[0] as any;

      // When the lider_actividades logistics task is completed, auto-mark all logistics checklist items
      if (status === "completed" && task.baptism_service_id && task.assigned_role === "lider_actividades") {
        const LOGISTICS_KEYS = [
          "espacio_calendario",
          "arreglo_espacios",
          "equipo_tecnologia",
          "presupuesto_refrigerio",
          "limpieza",
        ];
        try {
          const [activity] = await db
            .select({ id: activities.id })
            .from(activities)
            .where(eq(activities.baptismServiceId, task.baptism_service_id))
            .limit(1);
          if (activity) {
            await db
              .update(activityChecklistItems)
              .set({ completed: true, completedAt: new Date(), completedBy: user.id })
              .where(
                and(
                  eq(activityChecklistItems.activityId, activity.id),
                  inArray(activityChecklistItems.itemKey, LOGISTICS_KEYS),
                ),
              );
          }
        } catch (syncErr) {
          console.error("[PATCH /api/service-tasks/:id/status] logistics checklist sync error:", syncErr);
        }
      }

      return res.json(task);
    } catch (err) {
      console.error("[PATCH /api/service-tasks/:id/status]", err);
      return res.status(500).json({ error: "Error interno" });
    }
  });

  // DELETE /api/service-tasks/:id — only obispo can delete a service task
  app.delete("/api/service-tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== "obispo") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { id } = req.params;
      const result = await db.execute(sql`
        DELETE FROM service_tasks WHERE id = ${id} RETURNING id
      `);

      if (!result.rows.length) {
        return res.status(404).json({ error: "Tarea no encontrada" });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[DELETE /api/service-tasks/:id]", err);
      return res.status(500).json({ error: "Error interno" });
    }
  });
}

export async function runMissionProgressTransitions(): Promise<{
  transitioned: number;
  archived: number;
}> {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Seed covenant path for recent converts confirmed 6+ months ago (idempotent)
  const toTransition = await db
    .select({ id: missionContacts.id })
    .from(missionContacts)
    .where(
      and(
        eq(missionContacts.personType, "recent_convert"),
        eq(missionContacts.isArchived, false),
        not(isNull(missionContacts.confirmedAt)),
        lte(missionContacts.confirmedAt, sixMonthsAgo),
      ),
    );

  for (const contact of toTransition) {
    await seedCovenantPath(contact.id);
  }

  // Archive recent converts confirmed 12+ months ago
  const toArchive = await db
    .select({ id: missionContacts.id })
    .from(missionContacts)
    .where(
      and(
        eq(missionContacts.personType, "recent_convert"),
        eq(missionContacts.isArchived, false),
        not(isNull(missionContacts.confirmedAt)),
        lte(missionContacts.confirmedAt, twelveMonthsAgo),
      ),
    );

  if (toArchive.length > 0) {
    await db
      .update(missionContacts)
      .set({ isArchived: true, archivedAt: now, updatedAt: now })
      .where(
        inArray(
          missionContacts.id,
          toArchive.map((c) => c.id),
        ),
      );
  }

  return { transitioned: toTransition.length, archived: toArchive.length };
}

export async function runBaptismReadinessCheck(): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const services = await db
    .select()
    .from(baptismServices)
    .where(
      and(
        gt(baptismServices.serviceAt, now),
        lte(baptismServices.serviceAt, horizon),
      ),
    );

  let sent = 0;

  for (const service of services) {
    const daysUntilService = computeDaysUntilService(service.serviceAt, now);
    const rule = resolveReminderRule(daysUntilService);
    if (!rule) continue;

    const [programItems, assignments, interviewScheduled] = await Promise.all([
      db
        .select({ type: baptismProgramItems.type })
        .from(baptismProgramItems)
        .where(eq(baptismProgramItems.serviceId, service.id)),
      db
        .select({
          type: baptismAssignments.type,
          assigneeUserId: baptismAssignments.assigneeUserId,
          assigneeName: baptismAssignments.assigneeName,
        })
        .from(baptismAssignments)
        .where(eq(baptismAssignments.serviceId, service.id)),
      db
        .select({ id: missionContactMilestones.id })
        .from(missionContactMilestones)
        .innerJoin(
          missionTemplateItems,
          eq(missionTemplateItems.id, missionContactMilestones.templateItemId),
        )
        .where(
          and(
            eq(missionContactMilestones.contactId, service.candidateContactId),
            eq(missionContactMilestones.status, "done"),
            eq(missionTemplateItems.itemType, "milestone"),
            milestoneKeyFilter("interview_scheduled"),
          ),
        )
        .limit(1),
    ]);

    const readiness = computeMinimumReady({
      programItems,
      assignments,
      hasInterviewScheduledMilestone: Boolean(interviewScheduled),
    });
    if (readiness.ready) continue;

    const dedupeKey = buildReminderDedupeKey(service.id, rule);
    const delivered = await db
      .select()
      .from(baptismNotificationDeliveries)
      .where(eq(baptismNotificationDeliveries.dedupeKey, dedupeKey))
      .limit(1);
    if (delivered[0]) continue;

    const title = `Bautismo no listo — ${rule.toUpperCase()}`;
    const message = `El servicio en ${service.locationName} aún no cumple el mínimo requerido.`;
    await db
      .insert(baptismNotificationDeliveries)
      .values({ serviceId: service.id, rule, dedupeKey });
    const [notifReminder] = await db
      .insert(notifications)
      .values({ userId: service.createdBy, title, message, type: "reminder", relatedId: service.id })
      .returning();
    if (isPushConfigured()) {
      await sendPushNotification(service.createdBy, {
        title,
        body: message,
        url: `/mission-work?section=servicios_bautismales&highlight=${service.id}`,
        notificationId: notifReminder?.id,
      }).catch(() => {});
    }
    sent++;
  }

  return sent;
}
