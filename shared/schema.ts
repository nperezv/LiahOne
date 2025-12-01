import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, pgEnum, boolean, jsonb } from "drizzle-orm/pg-core";
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

// ========================================
// ENUMS
// ========================================

export const roleEnum = pgEnum("role", [
  "obispo",
  "consejero_obispo",
  "secretario",
  "presidente_organizacion",
  "consejero_organizacion",
  "secretario_organizacion",
]);

export const organizationTypeEnum = pgEnum("organization_type", [
  "obispado",
  "hombres_jovenes",
  "mujeres_jovenes",
  "sociedad_socorro",
  "primaria",
  "escuela_dominical",
  "jas",
  "cuorum_elderes",
  "barrio",
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

export const budgetStatusEnum = pgEnum("budget_status", [
  "solicitado",
  "aprobado",
  "en_proceso",
  "completado",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
  "programada",
  "completada",
  "cancelada",
]);

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "pendiente",
  "en_proceso",
  "completada",
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
  role: roleEnum("role").notNull(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Organizations (5 types)
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: organizationTypeEnum("type").notNull(),
  presidentId: varchar("president_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sacramental Meetings
export const sacramentalMeetings = pgTable("sacramental_meetings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
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
  agenda: text("agenda"),
  attendance: jsonb("attendance").$type<string[]>().default([]),
  agreements: jsonb("agreements").$type<{description: string, responsible: string}[]>().default([]),
  notes: text("notes"),
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

// Budget Requests
export const budgetRequests = pgTable("budget_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id),
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  status: budgetStatusEnum("status").notNull().default("solicitado"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  receipts: jsonb("receipts").$type<{filename: string, url: string}[]>().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Interviews
export const interviews = pgTable("interviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  personName: text("person_name").notNull(),
  interviewerId: varchar("interviewer_id").notNull().references(() => users.id),
  assignedToId: varchar("assigned_to_id").references(() => users.id),
  type: text("type").notNull(), // Regular, Temple Recommend, etc.
  status: interviewStatusEnum("status").notNull().default("programada"),
  urgent: boolean("urgent").default(false).notNull(),
  notes: text("notes"),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Goals (Ward goals)
export const goals = pgTable("goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull(),
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

// Assignments
export const assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  assignedTo: varchar("assigned_to").notNull().references(() => users.id),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  dueDate: timestamp("due_date"),
  status: assignmentStatusEnum("status").notNull().default("pendiente"),
  relatedTo: text("related_to"), // Reference to council or meeting
  notes: text("notes"),
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

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  relatedId: varchar("related_id"), // ID of related entity (interview, assignment, etc)
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
  createdSacramentalMeetings: many(sacramentalMeetings),
  createdWardCouncils: many(wardCouncils),
  createdPresidencyMeetings: many(presidencyMeetings),
  budgetRequests: many(budgetRequests),
  interviews: many(interviews),
  createdGoals: many(goals),
  assignmentsReceived: many(assignments, { relationName: "assignedTo" }),
  assignmentsGiven: many(assignments, { relationName: "assignedBy" }),
  createdActivities: many(activities),
  notifications: many(notifications),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  president: one(users, {
    fields: [organizations.presidentId],
    references: [users.id],
  }),
  members: many(users),
  presidencyMeetings: many(presidencyMeetings),
  budgetRequests: many(budgetRequests),
  goals: many(goals),
  activities: many(activities),
  birthdays: many(birthdays),
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

export const interviewsRelations = relations(interviews, ({ one }) => ({
  interviewer: one(users, {
    fields: [interviews.interviewerId],
    references: [users.id],
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
});

export const selectSacramentalMeetingSchema = createSelectSchema(sacramentalMeetings);

// Ward Councils
export const insertWardCouncilSchema = createInsertSchema(wardCouncils, {
  date: dateSchema,
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

// Budget Requests
export const insertBudgetRequestSchema = createInsertSchema(budgetRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedBy: true,
  approvedAt: true,
});

export const selectBudgetRequestSchema = createSelectSchema(budgetRequests);

// Interviews
export const insertInterviewSchema = createInsertSchema(interviews, {
  date: dateSchema,
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectInterviewSchema = createSelectSchema(interviews);

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

// PDF Templates
export const pdfTemplates = pgTable("pdf_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  wardName: text("ward_name").notNull().default("Barrio"),
  stakeName: text("stake_name").default("Estaca"),
  country: text("country").default("País"),
  headerColor: text("header_color").notNull().default("1F2937"),
  accentColor: text("accent_color").notNull().default("3B82F6"),
  logoUrl: text("logo_url"),
  footerText: text("footer_text").default("© Barrio - Todos los derechos reservados"),
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
  amount: integer("amount").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Organization Budgets (Assigned per quarter)
export const organizationBudgets = pgTable("organization_budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id),
  amount: integer("amount").notNull(),
  year: integer("year").notNull(),
  quarter: integer("quarter").notNull(), // 1-4
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

export type WardBudget = typeof wardBudgets.$inferSelect;
export type InsertWardBudget = z.infer<typeof insertWardBudgetSchema>;

export type OrganizationBudget = typeof organizationBudgets.$inferSelect;
export type InsertOrganizationBudget = z.infer<typeof insertOrganizationBudgetSchema>;

// ========================================
// TYPESCRIPT TYPES
// ========================================

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type SacramentalMeeting = typeof sacramentalMeetings.$inferSelect;
export type InsertSacramentalMeeting = z.infer<typeof insertSacramentalMeetingSchema>;

export type WardCouncil = typeof wardCouncils.$inferSelect;
export type InsertWardCouncil = z.infer<typeof insertWardCouncilSchema>;

export type PresidencyMeeting = typeof presidencyMeetings.$inferSelect;
export type InsertPresidencyMeeting = z.infer<typeof insertPresidencyMeetingSchema>;

export type BudgetRequest = typeof budgetRequests.$inferSelect;
export type InsertBudgetRequest = z.infer<typeof insertBudgetRequestSchema>;

export type Interview = typeof interviews.$inferSelect;
export type InsertInterview = z.infer<typeof insertInterviewSchema>;

export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;

export type Birthday = typeof birthdays.$inferSelect;
export type InsertBirthday = z.infer<typeof insertBirthdaySchema>;

export type Assignment = typeof assignments.$inferSelect;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;

export type PdfTemplate = typeof pdfTemplates.$inferSelect;
export type InsertPdfTemplate = z.infer<typeof insertPdfTemplateSchema>;

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
