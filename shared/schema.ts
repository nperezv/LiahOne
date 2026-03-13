import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, timestamp, integer, pgEnum, boolean, jsonb, numeric, date, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Helper to parse dates from various formats
const parseDateString = (dateStr: string | Date): Date => {
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr !== "string") throw new Error("Invalid date");
  
  // Try parsing as ISO first
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) return isoDate;
  
  // Try DD/MM/YYYY format
  const ddmmyyyy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return new Date(`${year}-${month}-${day}`);
  }
  
  // Try MM/DD/YYYY format (for US dates)
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  }
  
  throw new Error("Invalid date format");
};

const dateSchema = z.union([
  z.date(),
  z.string().transform((str) => parseDateString(str)),
]);

const parseInterviewDateString = (value: string | Date): Date => {
  if (value instanceof Date) return value;
  if (typeof value !== "string") throw new Error("Invalid date");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Invalid date");
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  const dateTimeMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (dateTimeMatch) {
    const [, year, month, day, hours, minutes, seconds] = dateTimeMatch;
    return new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hours),
        Number(minutes),
        Number(seconds || "0")
      )
    );
  }
  const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  throw new Error("Invalid date format");
};

const interviewDateSchema = z.union([
  z.date(),
  z.string().transform((str) => parseInterviewDateString(str)),
]);

// ========================================
// ENUMS
// ========================================

export const roleEnum = pgEnum("role", [
  "obispo",
  "consejero_obispo",
  "secretario",
  "secretario_ejecutivo",
  "secretario_financiero",
  "presidente_organizacion",
  "consejero_organizacion",
  "secretario_organizacion",
  "bibliotecario",
  "lider_actividades",
  "mission_leader",
  "ward_missionary",
  "full_time_missionary",
]);

export const missionPersonTypeEnum = pgEnum("mission_person_type", ["friend", "recent_convert", "less_active"]);
export const missionAssigneeRoleEnum = pgEnum("mission_assignee_role", ["missionary", "member_friend", "leader"]);
export const missionItemTypeEnum = pgEnum("mission_item_type", ["lesson", "commitment", "checkpoint", "habit", "milestone"]);
export const missionLessonStatusEnum = pgEnum("mission_lesson_status", ["not_started", "taught", "completed", "repeated"]);
export const missionCommitmentResultEnum = pgEnum("mission_commitment_result", ["pending", "done", "not_done", "partial"]);
export const missionMilestoneStatusEnum = pgEnum("mission_milestone_status", ["pending", "done", "waived"]);
export const baptismServiceStatusEnum = pgEnum("baptism_service_status", ["scheduled", "live", "completed", "archived"]);
export const baptismProgramItemTypeEnum = pgEnum("baptism_program_item_type", ["opening_prayer", "hymn", "talk", "special_music", "ordinance_baptism", "closing_prayer"]);
export const baptismAssignmentTypeEnum = pgEnum("baptism_assignment_type", ["refreshments", "cleaning", "baptism_clothing", "wet_clothes_pickup", "reception", "music"]);
export const baptismAssignmentStatusEnum = pgEnum("baptism_assignment_status", ["pending", "done"]);
export const baptismPublicPostStatusEnum = pgEnum("baptism_public_post_status", ["pending", "approved", "rejected"]);

export const organizationTypeEnum = pgEnum("organization_type", [
  "obispado",
  "hombres_jovenes",
  "mujeres_jovenes",
  "sociedad_socorro",
  "primaria",
  "escuela_dominical",
  "jas",
  "as",
  "cuorum_elderes",
  "barrio",
]);

export const memberOrganizationMembershipTypeEnum = pgEnum("member_organization_membership_type", [
  "primary",
  "derived_rule",
  "manual",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "upcoming_interview",
  "birthday_today",
  "budget_approved",
  "budget_rejected",
  "assignment_created",
  "upcoming_meeting",
  "reminder",
]);

export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "pendiente",
  "aprobada",
  "rechazada",
]);

export const budgetStatusEnum = pgEnum("budget_status", [
  "solicitado",
  "aprobado_financiero",
  "pendiente_firma_obispo",
  "aprobado",
  "en_proceso",
  "completado",
  "rechazada",
]);

export const budgetCategoryEnum = pgEnum("budget_category", [
  "actividades",
  "materiales",
  "otros",
]);

export const userDeletionRequestStatusEnum = pgEnum("user_deletion_request_status", [
  "pendiente",
  "aprobada",
  "rechazada",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
  "programada",
  "completada",
  "archivada",
  "cancelada",
]);

export const organizationInterviewStatusEnum = pgEnum("organization_interview_status", [
  "programada",
  "completada",
  "cancelada",
  "archivada"
]);

export const organizationInterviewTypeEnum = pgEnum("organization_interview_type", [
  "inicial",
  "seguimiento",
  "autosuficiencia",
  "otra",
  "ministracion",
  "consuelo",
  "otro",
]);

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "pendiente",
  "en_proceso",
  "completada",
  "cancelada",
  "archivada",
]);

export const agendaEventSourceEnum = pgEnum("agenda_event_source", ["manual", "activity", "interview"]);

export const agendaTaskPriorityEnum = pgEnum("agenda_task_priority", ["P1", "P2", "P3", "P4"]);

export const agendaTaskStatusEnum = pgEnum("agenda_task_status", ["open", "done", "canceled"]);

export const agendaReminderChannelEnum = pgEnum("agenda_reminder_channel", ["push", "email"]);

export const agendaReminderStatusEnum = pgEnum("agenda_reminder_status", ["pending", "sent", "failed"]);

export const taskPlanStatusEnum = pgEnum("task_plan_status", ["planned", "done", "bumped", "canceled"]);

export const taskPlanGeneratedByEnum = pgEnum("task_plan_generated_by", ["planner", "manual"]);


export const archiveResolutionEnum = pgEnum("archive_resolution", [
  "completada",
  "cancelada",
]);

export const presidencyResourceCategoryEnum = pgEnum("presidency_resource_category", [
  "manuales",
  "plantillas",
  "capacitacion",
]);

export const presidencyResourceTypeEnum = pgEnum("presidency_resource_type", [
  "documento",
  "video",
  "plantilla",
]);

// ========================================
// TABLES
// ========================================

// Users table with role-based access
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  requireEmailOtp: boolean("require_email_otp").notNull().default(false),
  requirePasswordChange: boolean("require_password_change").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  role: roleEnum("role").notNull(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  memberId: varchar("member_id").references(() => members.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userDevices = pgTable("user_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  deviceHash: text("device_hash").notNull(),
  label: text("label"),
  trusted: boolean("trusted").notNull().default(false),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  deviceHash: text("device_hash"),
  tokenHash: text("token_hash").notNull(),
  ipAddress: text("ip_address"),
  country: text("country"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  replacedByTokenId: varchar("replaced_by_token_id"),
});

export const loginEvents = pgTable("login_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  deviceHash: text("device_hash"),
  ipAddress: text("ip_address"),
  country: text("country"),
  userAgent: text("user_agent"),
  success: boolean("success").notNull().default(false),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailOtps = pgTable("email_otps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  codeHash: text("code_hash").notNull(),
  deviceHash: text("device_hash"),
  ipAddress: text("ip_address"),
  country: text("country"),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userDeletionRequests = pgTable("user_deletion_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  reason: text("reason"),
  status: userDeletionRequestStatusEnum("status").notNull().default("pendiente"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accessRequests = pgTable("access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  calling: text("calling"),
  phone: text("phone"),
  contactConsent: boolean("contact_consent").notNull().default(false),
  status: accessRequestStatusEnum("status").notNull().default("pendiente"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Organizations (5 types)
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: organizationTypeEnum("type").notNull(),
  presidentId: varchar("president_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameSurename: text("name_surename").notNull(),
  sex: text("sex").notNull(),
  birthday: timestamp("birthday").notNull(),
  phone: text("phone"),
  email: text("email"),
  organizationId: varchar("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memberCallings = pgTable("member_callings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => members.id),
  organizationId: varchar("organization_id").references(() => organizations.id),
  callingName: text("calling_name").notNull(),
  callingType: text("calling_type"),
  callingOrder: integer("calling_order"),
  isActive: boolean("is_active").notNull().default(true),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memberOrganizations = pgTable("member_organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => members.id),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  membershipType: memberOrganizationMembershipTypeEnum("membership_type").notNull().default("manual"),
  sourceRule: text("source_rule"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});



export const missionContacts = pgTable("mission_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull().references(() => organizations.id),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  personType: missionPersonTypeEnum("person_type").notNull(),
  stage: text("stage").notNull().default("new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const missionContactAssignees = pgTable("mission_contact_assignees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => missionContacts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id),
  assigneeName: text("assignee_name"),
  assigneeRole: missionAssigneeRoleEnum("assignee_role").notNull().default("missionary"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const missionContactNotes = pgTable("mission_contact_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => missionContacts.id, { onDelete: "cascade" }),
  authorUserId: varchar("author_user_id").notNull().references(() => users.id),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const missionTrackTemplates = pgTable("mission_track_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull().references(() => organizations.id),
  personType: missionPersonTypeEnum("person_type").notNull(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const missionTemplateItems = pgTable("mission_template_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => missionTrackTemplates.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  title: text("title").notNull(),
  itemType: missionItemTypeEnum("item_type").notNull(),
  required: boolean("required").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
});

export const missionContactLessons = pgTable("mission_contact_lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => missionContacts.id, { onDelete: "cascade" }),
  templateItemId: varchar("template_item_id").notNull().references(() => missionTemplateItems.id),
  status: missionLessonStatusEnum("status").notNull().default("not_started"),
  taughtAt: timestamp("taught_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  teacherUserIds: jsonb("teacher_user_ids").$type<string[]>().notNull().default([]),
  notes: text("notes"),
}, (t) => ({
  uniqueProgress: uniqueIndex("mission_contact_lessons_contact_template_idx").on(t.contactId, t.templateItemId),
}));

export const missionContactCommitments = pgTable("mission_contact_commitments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => missionContacts.id, { onDelete: "cascade" }),
  templateItemId: varchar("template_item_id").notNull().references(() => missionTemplateItems.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  result: missionCommitmentResultEnum("result").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  note: text("note"),
}, (t) => ({
  uniqueProgress: uniqueIndex("mission_contact_commitments_contact_template_idx").on(t.contactId, t.templateItemId),
}));

export const missionContactMilestones = pgTable("mission_contact_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => missionContacts.id, { onDelete: "cascade" }),
  templateItemId: varchar("template_item_id").notNull().references(() => missionTemplateItems.id),
  status: missionMilestoneStatusEnum("status").notNull().default("pending"),
  doneAt: timestamp("done_at", { withTimezone: true }),
  doneBy: varchar("done_by").references(() => users.id),
  note: text("note"),
});

export const baptismServices = pgTable("baptism_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull().references(() => organizations.id),
  candidateContactId: varchar("candidate_contact_id").notNull().references(() => missionContacts.id),
  serviceAt: timestamp("service_at", { withTimezone: true }).notNull(),
  locationName: text("location_name").notNull(),
  locationAddress: text("location_address"),
  mapsUrl: text("maps_url"),
  status: baptismServiceStatusEnum("status").notNull().default("scheduled"),
  prepDeadlineAt: timestamp("prep_deadline_at", { withTimezone: true }).notNull(),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const baptismProgramItems = pgTable("baptism_program_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => baptismServices.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  type: baptismProgramItemTypeEnum("type").notNull(),
  title: text("title"),
  participantUserId: varchar("participant_user_id").references(() => users.id),
  participantDisplayName: text("participant_display_name"),
  publicVisibility: boolean("public_visibility").notNull().default(true),
  hymnId: uuid("hymn_id").references(() => hymns.id),
  notes: text("notes"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const baptismAssignments = pgTable("baptism_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => baptismServices.id, { onDelete: "cascade" }),
  type: baptismAssignmentTypeEnum("type").notNull(),
  assigneeUserId: varchar("assignee_user_id").references(() => users.id),
  assigneeName: text("assignee_name"),
  status: baptismAssignmentStatusEnum("status").notNull().default("pending"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  notes: text("notes"),
});

export const baptismPublicLinks = pgTable("baptism_public_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => baptismServices.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  code: text("code").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  revokedBy: varchar("revoked_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const baptismPublicPosts = pgTable("baptism_public_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publicLinkId: varchar("public_link_id").notNull().references(() => baptismPublicLinks.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  message: text("message").notNull(),
  photoUrl: text("photo_url"),
  status: baptismPublicPostStatusEnum("status").notNull().default("pending"),
  clientRequestId: text("client_request_id").notNull(),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
});

export const baptismNotificationDeliveries = pgTable("baptism_notification_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => baptismServices.id, { onDelete: "cascade" }),
  rule: text("rule").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).defaultNow().notNull(),
});

export const hymns = pgTable("hymns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hymnbook: text("hymnbook").notNull().default("default"),
  lang: text("lang").notNull().default("es"),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  externalUrl: text("external_url"),
});

// Sacramental Meetings
export const sacramentalMeetings = pgTable("sacramental_meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  musicDirector: varchar("music_director"),
  pianist: varchar("pianist"),
  // Section 2-3: Prelude and welcome with authorities
  presider: text("presider"),
  director: text("director"),
  visitingAuthority: text("visiting_authority"),
  // Section 4: Announcements
  announcements: text("announcements"),
  // Section 5-6: First hymn and opening prayer
  openingHymn: text("opening_hymn"),
  openingPrayer: text("opening_prayer"),
  // Section 7: Ward and stake business
  releases: jsonb("releases").$type<{name: string, oldCalling: string, organizationId?: string}[]>().default([]),
  sustainments: jsonb("sustainments").$type<{name: string, calling: string, organizationId?: string}[]>().default([]),
  newMembers: jsonb("new_members").$type<string[]>().default([]),
  aaronicOrderings: jsonb("aaronic_orderings").$type<string[]>().default([]),
  childBlessings: jsonb("child_blessings").$type<string[]>().default([]),
  confirmations: jsonb("confirmations").$type<string[]>().default([]),
  stakeBusiness: text("stake_business"),
  // Section 8: Intermediate hymn and sacrament hymn
  intermediateHymn: text("intermediate_hymn"),
  intermediateHymnType: text("intermediate_hymn_type"), // 'congregation' or 'choir'
  sacramentHymn: text("sacrament_hymn"),
  // Section 9: Discourses and music
  discourses: jsonb("discourses").$type<{speaker: string, topic: string}[]>().default([]),
  assignments: jsonb("assignments").$type<{name: string, assignment: string}[]>().default([]),
  // Section 10-11: Closing hymn and prayer
  closingHymn: text("closing_hymn"),
  closingPrayer: text("closing_prayer"),
  // Meeting type
  isTestimonyMeeting: boolean("is_testimony_meeting").default(false),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Ward Councils
export const wardCouncils = pgTable("ward_councils", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  location: text("location"),
  status: text("status").default("programado"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  agenda: text("agenda"),
  presider: text("presider"),
  director: text("director"),
  openingPrayer: text("opening_prayer"),
  openingHymn: text("opening_hymn"),
  spiritualThought: text("spiritual_thought"),
  spiritualThoughtBy: text("spiritual_thought_by"),
  spiritualThoughtTopic: text("spiritual_thought_topic"),
  previousAssignments: jsonb("previous_assignments")
    .$type<
      {
        assignment: string;
        responsible: string;
        status: "completada" | "en_proceso" | "pendiente";
        notes?: string;
      }[]
    >()
    .default([]),
  newAssignments: jsonb("new_assignments")
    .$type<
      {
        title: string;
        assignedTo?: string;
        assignedToName?: string;
        dueDate?: Date | string;
        notes?: string;
      }[]
    >()
    .default([]),
  assignmentIds: jsonb("assignment_ids").$type<string[]>().default([]),
  adjustmentsNotes: text("adjustments_notes"),
  attendance: jsonb("attendance").$type<string[]>().default([]),
  agreements: jsonb("agreements").$type<{description: string, responsible: string}[]>().default([]),
  notes: text("notes"),
  // §29.2.5 — 4 áreas del Manual General
  livingGospelNotes: text("living_gospel_notes"),
  careForOthersNotes: text("care_for_others_notes"),
  missionaryNotes: text("missionary_notes"),
  familyHistoryNotes: text("family_history_notes"),
  // §29.2.5 — personas discutidas por área (reemplaza los campos de notas de texto)
  livingGospelPersons: jsonb("living_gospel_persons")
    .$type<{ name: string; situation: string; responsibleId: string; responsibleName: string; dueDate?: string }[]>()
    .default([]),
  careForOthersPersons: jsonb("care_for_others_persons")
    .$type<{ name: string; situation: string; responsibleId: string; responsibleName: string; dueDate?: string }[]>()
    .default([]),
  missionaryPersons: jsonb("missionary_persons")
    .$type<{ name: string; situation: string; responsibleId: string; responsibleName: string; dueDate?: string }[]>()
    .default([]),
  familyHistoryPersons: jsonb("family_history_persons")
    .$type<{ name: string; situation: string; responsibleId: string; responsibleName: string; dueDate?: string }[]>()
    .default([]),
  additionalNotes: text("additional_notes"),
  // Campos heredados (conservados para datos históricos, no se usan en UI)
  ministryNotes: text("ministry_notes"),
  salvationWorkNotes: text("salvation_work_notes"),
  wardActivitiesNotes: text("ward_activities_notes"),
  newAssignmentsNotes: text("new_assignments_notes"),
  finalSummaryNotes: text("final_summary_notes"),
  closingPrayer: text("closing_prayer"),
  closingPrayerBy: text("closing_prayer_by"),
  bishopNotes: text("bishop_notes"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Presidency Meetings (for each organization)
export const presidencyMeetings = pgTable("presidency_meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  date: timestamp("date").notNull(),
  agenda: text("agenda"),
  agreements: jsonb("agreements").$type<{description: string, responsible: string}[]>().default([]),
  notes: text("notes"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Presidency Resources (global library)
export const presidencyResources = pgTable("presidency_resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  placeholderName: text("placeholder_name").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  category: presidencyResourceCategoryEnum("category").notNull(),
  resourceType: presidencyResourceTypeEnum("resource_type").notNull(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Budget Requests
export const budgetRequests = pgTable("budget_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id),
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  category: budgetCategoryEnum("category").notNull().default("otros"),
  status: budgetStatusEnum("status").notNull().default("solicitado"),
  activityDate: timestamp("activity_date"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  financialApprovedBy: varchar("financial_approved_by").references(() => users.id),
  financialApprovedAt: timestamp("financial_approved_at"),
  bishopApprovedBy: varchar("bishop_approved_by").references(() => users.id),
  bishopApprovedAt: timestamp("bishop_approved_at"),
  bishopSignatureDataUrl: text("bishop_signature_data_url"),
  bishopSignatureIp: text("bishop_signature_ip"),
  bishopSignatureUserAgent: text("bishop_signature_user_agent"),
  bishopSignedPlanFilename: text("bishop_signed_plan_filename"),
  bishopSignedPlanUrl: text("bishop_signed_plan_url"),
  receipts: jsonb("receipts").$type<{filename: string, url: string, category: string}[]>().default([]),
  notes: text("notes"),
  pagarA: text("pagar_a"),
  applicantSignatureDataUrl: text("applicant_signature_data_url"),
  requestType: text("request_type").default("pago_adelantado"),
  budgetCategoriesJson: jsonb("budget_categories_json")
    .$type<{ category: string; amount: string; detail?: string }[]>()
    .default([]),
  bankData: jsonb("bank_data")
    .$type<{ bankInSystem: boolean; swift?: string; iban?: string }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const budgetUnlockExceptions = pgTable("budget_unlock_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  grantedBy: varchar("granted_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const welfareStatusEnum = pgEnum("welfare_status", [
  "solicitado",
  "aprobado",
  "rechazada",
]);

// Welfare Requests (Fast Offerings)
export const welfareRequests = pgTable("welfare_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id),
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: welfareStatusEnum("status").notNull().default("solicitado"),
  requestType: text("request_type").default("pago_adelantado"),
  activityDate: timestamp("activity_date"),
  bishopApprovedBy: varchar("bishop_approved_by").references(() => users.id),
  bishopApprovedAt: timestamp("bishop_approved_at"),
  bishopSignatureDataUrl: text("bishop_signature_data_url"),
  bishopSignatureIp: text("bishop_signature_ip"),
  bishopSignatureUserAgent: text("bishop_signature_user_agent"),
  bishopSignedPlanFilename: text("bishop_signed_plan_filename"),
  bishopSignedPlanUrl: text("bishop_signed_plan_url"),
  receipts: jsonb("receipts").$type<{filename: string, url: string, category: string}[]>().default([]),
  notes: text("notes"),
  pagarA: text("pagar_a"),
  applicantSignatureDataUrl: text("applicant_signature_data_url"),
  welfareCategoriesJson: jsonb("welfare_categories_json")
    .$type<{ category: string; amount: string; detail?: string }[]>()
    .default([]),
  bankData: jsonb("bank_data")
    .$type<{ bankInSystem: boolean; swift?: string; iban?: string }>(),
  favorDe: text("favor_de"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWelfareRequestSchema = createInsertSchema(welfareRequests);
export type WelfareRequest = typeof welfareRequests.$inferSelect;
export type InsertWelfareRequest = typeof welfareRequests.$inferInsert;

export const welfareRequestsRelations = relations(welfareRequests, ({ one }) => ({
  organization: one(organizations, {
    fields: [welfareRequests.organizationId],
    references: [organizations.id],
  }),
  requestedByUser: one(users, {
    fields: [welfareRequests.requestedBy],
    references: [users.id],
  }),
}));

// Interviews
export const interviews = pgTable("interviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date", { withTimezone: true }).notNull(),
  personName: text("person_name").notNull(),
  memberId: varchar("member_id").references(() => members.id),
  interviewerId: varchar("interviewer_id").notNull().references(() => users.id),
  assignedToId: varchar("assigned_to_id").references(() => users.id),
  type: text("type").notNull(), // Regular, Temple Recommend, etc.
  status: interviewStatusEnum("status").default("programada").notNull(),
  resolution: archiveResolutionEnum("resolution"),
  urgent: boolean("urgent").default(false).notNull(),
  notes: text("notes"),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationInterviews = pgTable("organization_interviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  date: timestamp("date", { withTimezone: true }).notNull(),
  personName: text("person_name").notNull(),
  interviewerId: varchar("interviewer_id").notNull().references(() => users.id),
  type: organizationInterviewTypeEnum("type").notNull(),
  status: organizationInterviewStatusEnum("status").notNull().default("programada"),
  resolution: archiveResolutionEnum("resolution"),
  urgent: boolean("urgent").default(false).notNull(),
  confidential: boolean("confidential").default(false).notNull(),
  notes: text("notes"),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Goals (Ward goals)
export const goals = pgTable("goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull().default(sql`extract(year from now())`),
  title: text("title").notNull(),
  description: text("description"),
  targetValue: integer("target_value").notNull(),
  currentValue: integer("current_value").default(0).notNull(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Birthdays
export const birthdays = pgTable("birthdays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  birthDate: timestamp("birth_date").notNull(),
  email: text("email"),
  phone: text("phone"),
  organizationId: varchar("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const birthdayEmailSends = pgTable("birthday_email_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  birthdayId: varchar("birthday_id").notNull().references(() => birthdays.id, { onDelete: "cascade" }),
  dayKey: text("day_key").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// Assignments
export const assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  assignedTo: varchar("assigned_to").notNull().references(() => users.id),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  dueDate: timestamp("due_date"),
  status: assignmentStatusEnum("status").notNull().default("pendiente"),
  resolution: archiveResolutionEnum("resolution"),
  relatedTo: text("related_to"), // Reference to council or meeting
  area: text("area"), // §29.2.5 area: 'livingGospel' | 'careForOthers' | 'missionary' | 'familyHistory'
  notes: text("notes"),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Activities
export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  location: text("location"),
  organizationId: varchar("organization_id").references(() => organizations.id),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agendaEvents = pgTable("agenda_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  date: date("date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  location: text("location"),
  sourceType: agendaEventSourceEnum("source_type").notNull().default("manual"),
  sourceId: varchar("source_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agendaTasks = pgTable("agenda_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  dueAt: timestamp("due_at"),
  earliestStartAt: timestamp("earliest_start_at"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  priority: agendaTaskPriorityEnum("priority").notNull().default("P3"),
  status: agendaTaskStatusEnum("status").notNull().default("open"),
  eventId: varchar("event_id").references(() => agendaEvents.id),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agendaReminders = pgTable("agenda_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  eventId: varchar("event_id").references(() => agendaEvents.id),
  taskId: varchar("task_id").references(() => agendaTasks.id),
  remindAt: timestamp("remind_at").notNull(),
  channel: agendaReminderChannelEnum("channel").notNull().default("push"),
  status: agendaReminderStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agendaTaskPlans = pgTable("agenda_task_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  taskId: varchar("task_id").notNull().references(() => agendaTasks.id),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  status: taskPlanStatusEnum("status").notNull().default("planned"),
  generatedBy: taskPlanGeneratedByEnum("generated_by").notNull().default("planner"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userAvailability = pgTable("user_availability", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  timezone: text("timezone").notNull().default("UTC"),
  workDays: integer("work_days").array().notNull().default([1, 2, 3, 4, 5]),
  workStartTime: text("work_start_time").notNull().default("09:00"),
  workEndTime: text("work_end_time").notNull().default("18:00"),
  bufferMinutes: integer("buffer_minutes").notNull().default(10),
  minBlockMinutes: integer("min_block_minutes").notNull().default(15),
  doNotDisturbWindows: jsonb("do_not_disturb_windows").$type<Array<{ start: string; end: string }>>(),
  reminderChannels: text("reminder_channels").array().notNull().default(["push"]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


export const agendaIdempotencyKeys = pgTable("agenda_idempotency_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  key: text("key").notNull(),
  endpoint: text("endpoint").notNull(),
  responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
  statusCode: integer("status_code"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agendaCommandLogs = pgTable("agenda_command_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(),
  requestText: text("request_text"),
  intent: text("intent"),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  resultRecordType: text("result_record_type"),
  resultRecordId: varchar("result_record_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  relatedId: varchar("related_id"), // ID of related entity (interview, assignment, etc)
  eventDate: timestamp("event_date"),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Push Subscriptions for web push notifications
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ========================================
// RELATIONS
// ========================================

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  member: one(members, {
    fields: [users.memberId],
    references: [members.id],
  }),
  deletionRequestsReceived: many(userDeletionRequests, { relationName: "deletionTarget" }),
  deletionRequestsSent: many(userDeletionRequests, { relationName: "deletionRequester" }),
  deletionRequestsReviewed: many(userDeletionRequests, { relationName: "deletionReviewer" }),
  createdSacramentalMeetings: many(sacramentalMeetings),
  createdWardCouncils: many(wardCouncils),
  createdPresidencyMeetings: many(presidencyMeetings),
  budgetRequests: many(budgetRequests),
  welfareRequests: many(welfareRequests),
  interviews: many(interviews),
  createdGoals: many(goals),
  assignmentsReceived: many(assignments, { relationName: "assignedTo" }),
  assignmentsGiven: many(assignments, { relationName: "assignedBy" }),
  createdActivities: many(activities),
  agendaEvents: many(agendaEvents),
  agendaTasks: many(agendaTasks),
  agendaReminders: many(agendaReminders),
  agendaTaskPlans: many(agendaTaskPlans),
  agendaIdempotencyKeys: many(agendaIdempotencyKeys),
  agendaCommandLogs: many(agendaCommandLogs),
  availability: one(userAvailability, {
    fields: [users.id],
    references: [userAvailability.userId],
  }),
  notifications: many(notifications),
  budgetUnlockExceptions: many(budgetUnlockExceptions, { relationName: "budgetUnlockUser" }),
  budgetUnlockGrants: many(budgetUnlockExceptions, { relationName: "budgetUnlockGrantor" }),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  president: one(users, {
    fields: [organizations.presidentId],
    references: [users.id],
  }),
  members: many(users),
  directoryMembers: many(members),
  memberOrganizations: many(memberOrganizations),
  memberCallings: many(memberCallings),
  presidencyMeetings: many(presidencyMeetings),
  budgetRequests: many(budgetRequests),
  welfareRequests: many(welfareRequests),
  goals: many(goals),
  activities: many(activities),
  birthdays: many(birthdays),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [members.id],
    references: [users.memberId],
  }),
  memberships: many(memberOrganizations),
  callings: many(memberCallings),
}));

export const memberOrganizationsRelations = relations(memberOrganizations, ({ one }) => ({
  member: one(members, {
    fields: [memberOrganizations.memberId],
    references: [members.id],
  }),
  organization: one(organizations, {
    fields: [memberOrganizations.organizationId],
    references: [organizations.id],
  }),
}));

export const memberCallingsRelations = relations(memberCallings, ({ one }) => ({
  member: one(members, {
    fields: [memberCallings.memberId],
    references: [members.id],
  }),
  organization: one(organizations, {
    fields: [memberCallings.organizationId],
    references: [organizations.id],
  }),
}));

export const userDeletionRequestsRelations = relations(userDeletionRequests, ({ one }) => ({
  user: one(users, {
    fields: [userDeletionRequests.userId],
    references: [users.id],
    relationName: "deletionTarget",
  }),
  requester: one(users, {
    fields: [userDeletionRequests.requestedBy],
    references: [users.id],
    relationName: "deletionRequester",
  }),
  reviewer: one(users, {
    fields: [userDeletionRequests.reviewedBy],
    references: [users.id],
    relationName: "deletionReviewer",
  }),
}));

export const sacramentalMeetingsRelations = relations(sacramentalMeetings, ({ one }) => ({
  creator: one(users, {
    fields: [sacramentalMeetings.createdBy],
    references: [users.id],
  }),
}));

export const wardCouncilsRelations = relations(wardCouncils, ({ one }) => ({
  creator: one(users, {
    fields: [wardCouncils.createdBy],
    references: [users.id],
  }),
}));

export const presidencyMeetingsRelations = relations(presidencyMeetings, ({ one }) => ({
  organization: one(organizations, {
    fields: [presidencyMeetings.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [presidencyMeetings.createdBy],
    references: [users.id],
  }),
}));

export const presidencyResourcesRelations = relations(presidencyResources, ({ one }) => ({
  organization: one(organizations, {
    fields: [presidencyResources.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [presidencyResources.createdBy],
    references: [users.id],
  }),
}));

export const budgetRequestsRelations = relations(budgetRequests, ({ one }) => ({
  organization: one(organizations, {
    fields: [budgetRequests.organizationId],
    references: [organizations.id],
  }),
  requester: one(users, {
    fields: [budgetRequests.requestedBy],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [budgetRequests.approvedBy],
    references: [users.id],
  }),
}));

export const budgetUnlockExceptionsRelations = relations(budgetUnlockExceptions, ({ one }) => ({
  user: one(users, {
    relationName: "budgetUnlockUser",
    fields: [budgetUnlockExceptions.userId],
    references: [users.id],
  }),
  grantedByUser: one(users, {
    relationName: "budgetUnlockGrantor",
    fields: [budgetUnlockExceptions.grantedBy],
    references: [users.id],
  }),
}));

export const interviewsRelations = relations(interviews, ({ one }) => ({
  interviewer: one(users, {
    fields: [interviews.interviewerId],
    references: [users.id],
  }),
  member: one(members, {
    fields: [interviews.memberId],
    references: [members.id],
  }),
  assigner: one(users, {
    fields: [interviews.assignedBy],
    references: [users.id],
  }),
  assignee: one(users, {
    fields: [interviews.assignedToId],
    references: [users.id],
  }),
}));

export const organizationInterviewsRelations = relations(
  organizationInterviews,
  ({ one }) => ({
    interviewer: one(users, {
      fields: [organizationInterviews.interviewerId],
      references: [users.id],
    }),

    creator: one(users, {
      fields: [organizationInterviews.createdBy],
      references: [users.id],
    }),

    organization: one(organizations, {
      fields: [organizationInterviews.organizationId],
      references: [organizations.id],
    }),
  })
);

export const goalsRelations = relations(goals, ({ one }) => ({
  organization: one(organizations, {
    fields: [goals.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [goals.createdBy],
    references: [users.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  assignee: one(users, {
    fields: [assignments.assignedTo],
    references: [users.id],
    relationName: "assignedTo",
  }),
  assigner: one(users, {
    fields: [assignments.assignedBy],
    references: [users.id],
    relationName: "assignedBy",
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  organization: one(organizations, {
    fields: [activities.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [activities.createdBy],
    references: [users.id],
  }),
}));

export const agendaEventsRelations = relations(agendaEvents, ({ one, many }) => ({
  user: one(users, {
    fields: [agendaEvents.userId],
    references: [users.id],
  }),
  tasks: many(agendaTasks),
  reminders: many(agendaReminders),
}));

export const agendaTasksRelations = relations(agendaTasks, ({ one, many }) => ({
  user: one(users, {
    fields: [agendaTasks.userId],
    references: [users.id],
  }),
  event: one(agendaEvents, {
    fields: [agendaTasks.eventId],
    references: [agendaEvents.id],
  }),
  reminders: many(agendaReminders),
  taskPlans: many(agendaTaskPlans),
}));

export const agendaRemindersRelations = relations(agendaReminders, ({ one }) => ({
  user: one(users, {
    fields: [agendaReminders.userId],
    references: [users.id],
  }),
  event: one(agendaEvents, {
    fields: [agendaReminders.eventId],
    references: [agendaEvents.id],
  }),
  task: one(agendaTasks, {
    fields: [agendaReminders.taskId],
    references: [agendaTasks.id],
  }),
}));

export const agendaTaskPlansRelations = relations(agendaTaskPlans, ({ one }) => ({
  user: one(users, {
    fields: [agendaTaskPlans.userId],
    references: [users.id],
  }),
  task: one(agendaTasks, {
    fields: [agendaTaskPlans.taskId],
    references: [agendaTasks.id],
  }),
}));


export const agendaIdempotencyKeysRelations = relations(agendaIdempotencyKeys, ({ one }) => ({
  user: one(users, {
    fields: [agendaIdempotencyKeys.userId],
    references: [users.id],
  }),
}));

export const agendaCommandLogsRelations = relations(agendaCommandLogs, ({ one }) => ({
  user: one(users, {
    fields: [agendaCommandLogs.userId],
    references: [users.id],
  }),
}));

export const userAvailabilityRelations = relations(userAvailability, ({ one }) => ({
  user: one(users, {
    fields: [userAvailability.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const birthdaysRelations = relations(birthdays, ({ one }) => ({
  organization: one(organizations, {
    fields: [birthdays.organizationId],
    references: [organizations.id],
  }),
}));

// ========================================
// ZOD SCHEMAS
// ========================================

// Users
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  avatarUrl: z.string().optional().or(z.literal("")),
  requireEmailOtp: z.boolean().optional(),
  requirePasswordChange: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).omit({ id: true, createdAt: true });

export const selectUserSchema = createSelectSchema(users);

// Organizations
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ 
  id: true, 
  createdAt: true 
});

export const selectOrganizationSchema = createSelectSchema(organizations);

// Sacramental Meetings
export const insertSacramentalMeetingSchema = createInsertSchema(sacramentalMeetings, {
  date: dateSchema,
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  releases: z.array(z.object({
    name: z.string(),
    oldCalling: z.string(),
    organizationId: z.string().optional(),
  })).optional(),
  sustainments: z.array(z.object({
    name: z.string(),
    calling: z.string(),
    organizationId: z.string().optional(),
  })).optional(),
  newMembers: z.array(z.string()).optional(),
  aaronicOrderings: z.array(z.string()).optional(),
  childBlessings: z.array(z.string()).optional(),
  confirmations: z.array(z.string()).optional(),
  discourses: z.array(z.object({
    speaker: z.string(),
    topic: z.string(),
  })).optional(),
  assignments: z.array(z.object({
    name: z.string(),
    assignment: z.string(),
  })).optional(),
});

export const selectSacramentalMeetingSchema = createSelectSchema(sacramentalMeetings);

// Ward Councils
export const insertWardCouncilSchema = createInsertSchema(wardCouncils, {
  date: dateSchema,
  startedAt: dateSchema.optional(),
  endedAt: dateSchema.optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectWardCouncilSchema = createSelectSchema(wardCouncils);

// Presidency Meetings
export const insertPresidencyMeetingSchema = createInsertSchema(presidencyMeetings, {
  date: dateSchema,
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectPresidencyMeetingSchema = createSelectSchema(presidencyMeetings);

export const insertPresidencyResourceSchema = createInsertSchema(presidencyResources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectPresidencyResourceSchema = createSelectSchema(presidencyResources);

// Budget Requests
export const insertBudgetRequestSchema = createInsertSchema(budgetRequests, {
  activityDate: dateSchema.nullable().optional(),
  amount: z.union([z.number(), z.string()]).transform((v) => String(v)),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedBy: true,
  approvedAt: true,
  financialApprovedBy: true,
  financialApprovedAt: true,
  bishopApprovedBy: true,
  bishopApprovedAt: true,
  bishopSignatureDataUrl: true,
  bishopSignatureIp: true,
  bishopSignatureUserAgent: true,
  bishopSignedPlanFilename: true,
  bishopSignedPlanUrl: true,
});

export const selectBudgetRequestSchema = createSelectSchema(budgetRequests);
export const insertBudgetUnlockExceptionSchema = createInsertSchema(budgetUnlockExceptions).omit({
  id: true,
  createdAt: true,
});
export const selectBudgetUnlockExceptionSchema = createSelectSchema(budgetUnlockExceptions);

// Interviews
export const insertInterviewSchema = createInsertSchema(interviews, {
  date: interviewDateSchema,
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectInterviewSchema = createSelectSchema(interviews);

// Organization Interviews
export const insertOrganizationInterviewSchema = createInsertSchema(
  organizationInterviews,
  {
    date: interviewDateSchema,
  }
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectOrganizationInterviewSchema = createSelectSchema(organizationInterviews);

// Access Requests
export const insertAccessRequestSchema = createInsertSchema(accessRequests).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const selectAccessRequestSchema = createSelectSchema(accessRequests);


// Goals
export const insertGoalSchema = createInsertSchema(goals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectGoalSchema = createSelectSchema(goals);

// Birthdays
export const insertBirthdaySchema = createInsertSchema(birthdays, {
  birthDate: dateSchema,
}).omit({
  id: true,
  createdAt: true,
});

export const selectBirthdaySchema = createSelectSchema(birthdays);
export type Birthday = typeof birthdays.$inferSelect;

export const insertBirthdayEmailSendSchema = createInsertSchema(birthdayEmailSends).omit({
  id: true,
  sentAt: true,
});
export const selectBirthdayEmailSendSchema = createSelectSchema(birthdayEmailSends);
export type BirthdayEmailSend = typeof birthdayEmailSends.$inferSelect;
export type InsertBirthdayEmailSend = z.infer<typeof insertBirthdayEmailSendSchema>;

export const insertMemberSchema = createInsertSchema(members, {
  birthday: dateSchema,
});
export const selectMemberSchema = createSelectSchema(members);
export type Member = typeof members.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;
export const insertMemberCallingSchema = createInsertSchema(memberCallings, {
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
}).omit({
  id: true,
  createdAt: true,
});
export const selectMemberCallingSchema = createSelectSchema(memberCallings);
export type MemberCalling = typeof memberCallings.$inferSelect;
export type InsertMemberCalling = z.infer<typeof insertMemberCallingSchema>;

export const insertMemberOrganizationSchema = createInsertSchema(memberOrganizations).omit({
  id: true,
  createdAt: true,
});
export const selectMemberOrganizationSchema = createSelectSchema(memberOrganizations);
export type MemberOrganization = typeof memberOrganizations.$inferSelect;
export type InsertMemberOrganization = z.infer<typeof insertMemberOrganizationSchema>;
export type InsertBirthdayType = z.infer<typeof insertBirthdaySchema>;
export type InsertBirthday = z.infer<typeof insertBirthdaySchema>;

// Assignments
export const insertAssignmentSchema = createInsertSchema(assignments, {
  dueDate: dateSchema,
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectAssignmentSchema = createSelectSchema(assignments);

// Activities
export const insertActivitySchema = createInsertSchema(activities, {
  date: dateSchema,
}).omit({
  id: true,
  createdAt: true,
});

export const selectActivitySchema = createSelectSchema(activities);

export const insertAgendaEventSchema = createInsertSchema(agendaEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectAgendaEventSchema = createSelectSchema(agendaEvents);

export const insertAgendaTaskSchema = createInsertSchema(agendaTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectAgendaTaskSchema = createSelectSchema(agendaTasks);

export const insertAgendaReminderSchema = createInsertSchema(agendaReminders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectAgendaReminderSchema = createSelectSchema(agendaReminders);

export const insertAgendaTaskPlanSchema = createInsertSchema(agendaTaskPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectAgendaTaskPlanSchema = createSelectSchema(agendaTaskPlans);

export const insertUserAvailabilitySchema = createInsertSchema(userAvailability).omit({
  createdAt: true,
  updatedAt: true,
});

export const selectUserAvailabilitySchema = createSelectSchema(userAvailability);

export const insertAgendaIdempotencyKeySchema = createInsertSchema(agendaIdempotencyKeys).omit({
  id: true,
  createdAt: true,
});

export const selectAgendaIdempotencyKeySchema = createSelectSchema(agendaIdempotencyKeys);

export const insertAgendaCommandLogSchema = createInsertSchema(agendaCommandLogs).omit({
  id: true,
  createdAt: true,
});

export const selectAgendaCommandLogSchema = createSelectSchema(agendaCommandLogs);

// PDF Templates
export const pdfTemplates = pgTable("pdf_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wardName: text("ward_name").notNull().default("Barrio"),
  stakeName: text("stake_name").default("Estaca"),
  country: text("country").default("País"),
  sacramentMeetingTime: text("sacrament_meeting_time").default("10:00"),
  headerColor: text("header_color").notNull().default("1F2937"),
  accentColor: text("accent_color").notNull().default("3B82F6"),
  logoUrl: text("logo_url"),
  footerText: text("footer_text").default("© Barrio - Todos los derechos reservados"),
  bizumPhone: text("bizum_phone").default(""),
  bizumDeepLink: text("bizum_deep_link").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPdfTemplateSchema = createInsertSchema(pdfTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectPdfTemplateSchema = createSelectSchema(pdfTemplates);

// Ward Budget (Global)
export const wardBudgets = pgTable("ward_budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  annualAmount: numeric("annual_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  year: integer("year").notNull().default(sql`extract(year from now())`),
  q1Amount: numeric("q1_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  q2Amount: numeric("q2_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  q3Amount: numeric("q3_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  q4Amount: numeric("q4_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Organization Budgets (Assigned per quarter)
export const organizationBudgets = pgTable("organization_budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  year: integer("year").notNull(),
  quarter: integer("quarter").notNull(), // 1-4
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationWeeklyAttendance = pgTable("organization_weekly_attendance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  weekStartDate: timestamp("week_start_date").notNull(),
  weekKey: date("week_key").notNull(),
  attendeesCount: integer("attendees_count").notNull().default(0),
  attendeeMemberIds: jsonb("attendee_member_ids").$type<string[]>().notNull().default([]),
  totalMembers: integer("total_members").notNull().default(0),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationAttendanceMonthlySnapshots = pgTable("organization_attendance_monthly_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  weeksInMonth: integer("weeks_in_month").notNull().default(0),
  weeksReported: integer("weeks_reported").notNull().default(0),
  presentTotal: integer("present_total").notNull().default(0),
  capacityTotal: integer("capacity_total").notNull().default(0),
  attendancePercent: numeric("attendance_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  closedAt: timestamp("closed_at").defaultNow().notNull(),
  closedBy: varchar("closed_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const wardBudgetsRelations = relations(wardBudgets, () => ({}));

export const organizationBudgetsRelations = relations(organizationBudgets, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationBudgets.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationWeeklyAttendanceRelations = relations(organizationWeeklyAttendance, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationWeeklyAttendance.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [organizationWeeklyAttendance.createdBy],
    references: [users.id],
  }),
}));

export const organizationAttendanceMonthlySnapshotsRelations = relations(organizationAttendanceMonthlySnapshots, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationAttendanceMonthlySnapshots.organizationId],
    references: [organizations.id],
  }),
  closer: one(users, {
    fields: [organizationAttendanceMonthlySnapshots.closedBy],
    references: [users.id],
  }),
}));

export const insertWardBudgetSchema = createInsertSchema(wardBudgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectWardBudgetSchema = createSelectSchema(wardBudgets);

export const insertOrganizationBudgetSchema = createInsertSchema(organizationBudgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectOrganizationBudgetSchema = createSelectSchema(organizationBudgets);

export const insertOrganizationWeeklyAttendanceSchema = createInsertSchema(organizationWeeklyAttendance).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectOrganizationWeeklyAttendanceSchema = createSelectSchema(organizationWeeklyAttendance);

export const insertOrganizationAttendanceMonthlySnapshotSchema = createInsertSchema(organizationAttendanceMonthlySnapshots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectOrganizationAttendanceMonthlySnapshotSchema = createSelectSchema(organizationAttendanceMonthlySnapshots);

export const inventoryItemStatusEnum = pgEnum("inventory_item_status", [
  "available",
  "loaned",
  "maintenance",
]);

export const inventoryLoanStatusEnum = pgEnum("inventory_loan_status", [
  "active",
  "returned",
  "overdue",
]);

export const inventoryNfcTargetTypeEnum = pgEnum("inventory_nfc_target_type", ["item", "location"]);

export const inventoryCategories = pgTable("inventory_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  prefix: varchar("prefix", { length: 20 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryCategoryCounters = pgTable("inventory_category_counters", {
  categoryId: varchar("category_id").primaryKey().references(() => inventoryCategories.id, { onDelete: "cascade" }),
  nextSeq: integer("next_seq").notNull().default(1),
});

export const inventoryLocations = pgTable("inventory_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  parentId: varchar("parent_id").references(() => inventoryLocations.id),
  code: varchar("code", { length: 40 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetCode: varchar("asset_code", { length: 40 }).notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: varchar("category_id").notNull().references(() => inventoryCategories.id),
  locationId: varchar("location_id").references(() => inventoryLocations.id),
  status: inventoryItemStatusEnum("status").notNull().default("available"),
  photoUrl: text("photo_url"),
  qrUrl: text("qr_url").notNull(),
  trackerId: varchar("tracker_id", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastVerifiedAt: timestamp("last_verified_at"),
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => inventoryItems.id),
  fromLocation: varchar("from_location").references(() => inventoryLocations.id),
  toLocation: varchar("to_location").references(() => inventoryLocations.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryLoans = pgTable("inventory_loans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => inventoryItems.id),
  borrowerName: text("borrower_name").notNull(),
  borrowerFirstName: text("borrower_first_name"),
  borrowerLastName: text("borrower_last_name"),
  borrowerContact: text("borrower_contact"),
  borrowerPhone: text("borrower_phone"),
  borrowerEmail: text("borrower_email"),
  dateOut: date("date_out").notNull(),
  expectedReturnDate: date("expected_return_date"),
  dateReturn: date("date_return"),
  signatureDataUrl: text("signature_data_url"),
  requestPdfUrl: text("request_pdf_url"),
  requestPdfFilename: text("request_pdf_filename"),
  returnedBy: varchar("returned_by").references(() => users.id),
  returnedAt: timestamp("returned_at"),
  returnHasIncident: boolean("return_has_incident").notNull().default(false),
  returnIncidentNotes: text("return_incident_notes"),
  status: inventoryLoanStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryAudits = pgTable("inventory_audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryAuditItems = pgTable("inventory_audit_items", {
  auditId: varchar("audit_id").notNull().references(() => inventoryAudits.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  verified: boolean("verified").notNull().default(false),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.auditId, t.itemId] }),
}));

export const inventoryNfcLinks = pgTable("inventory_nfc_links", {
  uid: varchar("uid", { length: 100 }).primaryKey(),
  targetType: inventoryNfcTargetTypeEnum("target_type").notNull(),
  targetId: varchar("target_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryCategoriesRelations = relations(inventoryCategories, ({ many, one }) => ({
  items: many(inventoryItems),
  counter: one(inventoryCategoryCounters, {
    fields: [inventoryCategories.id],
    references: [inventoryCategoryCounters.categoryId],
  }),
}));

export const inventoryCategoryCountersRelations = relations(inventoryCategoryCounters, ({ one }) => ({
  category: one(inventoryCategories, {
    fields: [inventoryCategoryCounters.categoryId],
    references: [inventoryCategories.id],
  }),
}));

export const inventoryLocationsRelations = relations(inventoryLocations, ({ many, one }) => ({
  items: many(inventoryItems),
  parent: one(inventoryLocations, {
    fields: [inventoryLocations.parentId],
    references: [inventoryLocations.id],
  }),
  children: many(inventoryLocations),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  category: one(inventoryCategories, {
    fields: [inventoryItems.categoryId],
    references: [inventoryCategories.id],
  }),
  location: one(inventoryLocations, {
    fields: [inventoryItems.locationId],
    references: [inventoryLocations.id],
  }),
  movements: many(inventoryMovements),
  loans: many(inventoryLoans),
  auditItems: many(inventoryAuditItems),
}));

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  item: one(inventoryItems, {
    fields: [inventoryMovements.itemId],
    references: [inventoryItems.id],
  }),
  user: one(users, {
    fields: [inventoryMovements.userId],
    references: [users.id],
  }),
}));

export const inventoryLoansRelations = relations(inventoryLoans, ({ one }) => ({
  item: one(inventoryItems, {
    fields: [inventoryLoans.itemId],
    references: [inventoryItems.id],
  }),
}));

export const inventoryAuditsRelations = relations(inventoryAudits, ({ many }) => ({
  auditItems: many(inventoryAuditItems),
}));

export const inventoryAuditItemsRelations = relations(inventoryAuditItems, ({ one }) => ({
  audit: one(inventoryAudits, {
    fields: [inventoryAuditItems.auditId],
    references: [inventoryAudits.id],
  }),
  item: one(inventoryItems, {
    fields: [inventoryAuditItems.itemId],
    references: [inventoryItems.id],
  }),
  verifier: one(users, {
    fields: [inventoryAuditItems.verifiedBy],
    references: [users.id],
  }),
}));

export const insertInventoryCategorySchema = createInsertSchema(inventoryCategories).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryCategoryCounterSchema = createInsertSchema(inventoryCategoryCounters);

export const insertInventoryLocationSchema = createInsertSchema(inventoryLocations).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  assetCode: true,
  qrUrl: true,
  createdAt: true,
  updatedAt: true,
  lastVerifiedAt: true,
});

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovements).omit({
  id: true,
  createdAt: true,
  userId: true,
  fromLocation: true,
});

export const insertInventoryLoanSchema = createInsertSchema(inventoryLoans).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryAuditSchema = createInsertSchema(inventoryAudits).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryAuditItemSchema = createInsertSchema(inventoryAuditItems);

export const insertInventoryNfcLinkSchema = createInsertSchema(inventoryNfcLinks).omit({
  createdAt: true,
});


export type OrganizationWeeklyAttendance = typeof organizationWeeklyAttendance.$inferSelect;
export type InsertOrganizationWeeklyAttendance = z.infer<typeof insertOrganizationWeeklyAttendanceSchema>;
export type OrganizationAttendanceMonthlySnapshot = typeof organizationAttendanceMonthlySnapshots.$inferSelect;
export type InsertOrganizationAttendanceMonthlySnapshot = z.infer<typeof insertOrganizationAttendanceMonthlySnapshotSchema>;
export type InventoryCategory = typeof inventoryCategories.$inferSelect;
export type InventoryCategoryCounter = typeof inventoryCategoryCounters.$inferSelect;
export type InsertInventoryCategoryCounter = z.infer<typeof insertInventoryCategoryCounterSchema>;
export type InsertInventoryCategory = z.infer<typeof insertInventoryCategorySchema>;
export type InventoryLocation = typeof inventoryLocations.$inferSelect;
export type InsertInventoryLocation = z.infer<typeof insertInventoryLocationSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryLoan = typeof inventoryLoans.$inferSelect;
export type InsertInventoryLoan = z.infer<typeof insertInventoryLoanSchema>;
export type InventoryAudit = typeof inventoryAudits.$inferSelect;
export type InsertInventoryAudit = z.infer<typeof insertInventoryAuditSchema>;
export type InventoryAuditItem = typeof inventoryAuditItems.$inferSelect;
export type InsertInventoryAuditItem = z.infer<typeof insertInventoryAuditItemSchema>;
export type InventoryNfcLink = typeof inventoryNfcLinks.$inferSelect;
export type InsertInventoryNfcLink = z.infer<typeof insertInventoryNfcLinkSchema>;

export type WardBudget = typeof wardBudgets.$inferSelect;
export type InsertWardBudget = z.infer<typeof insertWardBudgetSchema>;

export type OrganizationBudget = typeof organizationBudgets.$inferSelect;
export type InsertOrganizationBudget = z.infer<typeof insertOrganizationBudgetSchema>;

// ========================================
// TYPESCRIPT TYPES
// ========================================

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserDevice = typeof userDevices.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type LoginEvent = typeof loginEvents.$inferSelect;
export type EmailOtp = typeof emailOtps.$inferSelect;
export type AccessRequest = typeof accessRequests.$inferSelect;
export type UserDeletionRequest = typeof userDeletionRequests.$inferSelect;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type Hymn = typeof hymns.$inferSelect;

export type SacramentalMeeting = typeof sacramentalMeetings.$inferSelect;
export type InsertSacramentalMeeting = z.infer<typeof insertSacramentalMeetingSchema>;

export type WardCouncil = typeof wardCouncils.$inferSelect;
export type InsertWardCouncil = z.infer<typeof insertWardCouncilSchema>;

export type PresidencyMeeting = typeof presidencyMeetings.$inferSelect;
export type InsertPresidencyMeeting = z.infer<typeof insertPresidencyMeetingSchema>;

export type PresidencyResource = typeof presidencyResources.$inferSelect;
export type InsertPresidencyResource = z.infer<typeof insertPresidencyResourceSchema>;

export type BudgetRequest = typeof budgetRequests.$inferSelect;
export type InsertBudgetRequest = z.infer<typeof insertBudgetRequestSchema>;
export type BudgetUnlockException = typeof budgetUnlockExceptions.$inferSelect;
export type InsertBudgetUnlockException = z.infer<typeof insertBudgetUnlockExceptionSchema>;

export type Interview = typeof interviews.$inferSelect;
export type InsertInterview = z.infer<typeof insertInterviewSchema>;

export type OrganizationInterview = typeof organizationInterviews.$inferSelect;
export type InsertOrganizationInterview = z.infer<typeof insertOrganizationInterviewSchema>;

export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;

export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;

export type AgendaEvent = typeof agendaEvents.$inferSelect;
export type InsertAgendaEvent = z.infer<typeof insertAgendaEventSchema>;

export type AgendaTask = typeof agendaTasks.$inferSelect;
export type InsertAgendaTask = z.infer<typeof insertAgendaTaskSchema>;

export type AgendaReminder = typeof agendaReminders.$inferSelect;
export type InsertAgendaReminder = z.infer<typeof insertAgendaReminderSchema>;

export type AgendaTaskPlan = typeof agendaTaskPlans.$inferSelect;
export type InsertAgendaTaskPlan = z.infer<typeof insertAgendaTaskPlanSchema>;

export type UserAvailability = typeof userAvailability.$inferSelect;
export type InsertUserAvailability = z.infer<typeof insertUserAvailabilitySchema>;

export type AgendaIdempotencyKey = typeof agendaIdempotencyKeys.$inferSelect;
export type InsertAgendaIdempotencyKey = z.infer<typeof insertAgendaIdempotencyKeySchema>;

export type AgendaCommandLog = typeof agendaCommandLogs.$inferSelect;
export type InsertAgendaCommandLog = z.infer<typeof insertAgendaCommandLogSchema>;

export type PdfTemplate = typeof pdfTemplates.$inferSelect;
export type InsertPdfTemplate = z.infer<typeof insertPdfTemplateSchema>;
export type InsertAccessRequest = z.infer<typeof insertAccessRequestSchema>;
export type InsertUserDeletionRequest = typeof userDeletionRequests.$inferInsert;

// Notification Schemas
export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const selectNotificationSchema = createSelectSchema(notifications);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Push Subscriptions Schemas
export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export const selectPushSubscriptionSchema = createSelectSchema(pushSubscriptions);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
