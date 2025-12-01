// Reference: javascript_database blueprint
import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  users,
  organizations,
  sacramentalMeetings,
  wardCouncils,
  presidencyMeetings,
  budgetRequests,
  interviews,
  goals,
  birthdays,
  activities,
  assignments,
  pdfTemplates,
  wardBudgets,
  organizationBudgets,
  notifications,
  pushSubscriptions,
  type User,
  type InsertUser,
  type Organization,
  type InsertOrganization,
  type SacramentalMeeting,
  type InsertSacramentalMeeting,
  type WardCouncil,
  type InsertWardCouncil,
  type PresidencyMeeting,
  type InsertPresidencyMeeting,
  type BudgetRequest,
  type InsertBudgetRequest,
  type Interview,
  type InsertInterview,
  type Goal,
  type InsertGoal,
  type Birthday,
  type InsertBirthday,
  type Activity,
  type InsertActivity,
  type Assignment,
  type InsertAssignment,
  type PdfTemplate,
  type InsertPdfTemplate,
  type WardBudget,
  type InsertWardBudget,
  type OrganizationBudget,
  type InsertOrganizationBudget,
  type Notification,
  type InsertNotification,
  type PushSubscription,
  type InsertPushSubscription,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

  // Organizations
  getAllOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;

  // Sacramental Meetings
  getAllSacramentalMeetings(): Promise<SacramentalMeeting[]>;
  getSacramentalMeeting(id: string): Promise<SacramentalMeeting | undefined>;
  createSacramentalMeeting(meeting: InsertSacramentalMeeting): Promise<SacramentalMeeting>;
  updateSacramentalMeeting(id: string, data: Partial<InsertSacramentalMeeting>): Promise<SacramentalMeeting | undefined>;
  deleteSacramentalMeeting(id: string): Promise<void>;

  // Ward Councils
  getAllWardCouncils(): Promise<WardCouncil[]>;
  getWardCouncil(id: string): Promise<WardCouncil | undefined>;
  createWardCouncil(council: InsertWardCouncil): Promise<WardCouncil>;
  updateWardCouncil(id: string, data: Partial<InsertWardCouncil>): Promise<WardCouncil | undefined>;
  deleteWardCouncil(id: string): Promise<void>;

  // Presidency Meetings
  getPresidencyMeetingsByOrganization(organizationId: string): Promise<PresidencyMeeting[]>;
  getPresidencyMeeting(id: string): Promise<PresidencyMeeting | undefined>;
  createPresidencyMeeting(meeting: InsertPresidencyMeeting): Promise<PresidencyMeeting>;
  updatePresidencyMeeting(id: string, data: Partial<InsertPresidencyMeeting>): Promise<PresidencyMeeting | undefined>;
  deletePresidencyMeeting(id: string): Promise<void>;

  // Budget Requests
  getAllBudgetRequests(): Promise<BudgetRequest[]>;
  getBudgetRequest(id: string): Promise<BudgetRequest | undefined>;
  createBudgetRequest(request: InsertBudgetRequest): Promise<BudgetRequest>;
  updateBudgetRequest(id: string, data: Partial<InsertBudgetRequest>): Promise<BudgetRequest | undefined>;
  approveBudgetRequest(id: string, approvedBy: string): Promise<BudgetRequest | undefined>;
  deleteBudgetRequest(id: string): Promise<void>;

  // Interviews
  getAllInterviews(): Promise<Interview[]>;
  getInterview(id: string): Promise<Interview | undefined>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterview(id: string, data: Partial<InsertInterview>): Promise<Interview | undefined>;
  deleteInterview(id: string): Promise<void>;

  // Goals
  getAllGoals(): Promise<Goal[]>;
  getGoal(id: string): Promise<Goal | undefined>;
  createGoal(goal: InsertGoal): Promise<Goal>;
  updateGoal(id: string, data: Partial<InsertGoal>): Promise<Goal | undefined>;
  deleteGoal(id: string): Promise<void>;

  // Birthdays
  getAllBirthdays(): Promise<Birthday[]>;
  getTodayBirthdays(): Promise<Birthday[]>;
  getBirthday(id: string): Promise<Birthday | undefined>;
  createBirthday(birthday: InsertBirthday): Promise<Birthday>;
  updateBirthday(id: string, data: Partial<InsertBirthday>): Promise<Birthday | undefined>;
  deleteBirthday(id: string): Promise<void>;

  // Activities
  getAllActivities(): Promise<Activity[]>;
  getActivity(id: string): Promise<Activity | undefined>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: string, data: Partial<InsertActivity>): Promise<Activity | undefined>;
  deleteActivity(id: string): Promise<void>;

  // Assignments
  getAllAssignments(): Promise<Assignment[]>;
  getAssignmentsByUser(userId: string): Promise<Assignment[]>;
  getAssignment(id: string): Promise<Assignment | undefined>;
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  updateAssignment(id: string, data: Partial<InsertAssignment>): Promise<Assignment | undefined>;
  deleteAssignment(id: string): Promise<void>;

  // PDF Templates
  getPdfTemplate(): Promise<PdfTemplate | undefined>;
  updatePdfTemplate(data: Partial<InsertPdfTemplate>): Promise<PdfTemplate>;

  // Ward Budgets (Global)
  getWardBudget(): Promise<WardBudget | undefined>;
  updateWardBudget(data: Partial<InsertWardBudget>): Promise<WardBudget>;

  // Organization Budgets
  getOrganizationBudgets(organizationId: string): Promise<OrganizationBudget[]>;
  getOrganizationBudgetByQuarter(organizationId: string, year: number, quarter: number): Promise<OrganizationBudget | undefined>;
  createOrganizationBudget(budget: InsertOrganizationBudget): Promise<OrganizationBudget>;
  updateOrganizationBudget(id: string, data: Partial<InsertOrganizationBudget>): Promise<OrganizationBudget | undefined>;

  // Notifications
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getNotification(id: string): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  deleteNotification(id: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Push Subscriptions
  getPushSubscriptionsByUser(userId: string): Promise<PushSubscription[]>;
  getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | undefined>;
  createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(id: string): Promise<void>;
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
}

export class DatabaseStorage implements IStorage {
  // ========================================
  // USERS
  // ========================================

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, createdAt: sql`${users.createdAt}` })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // ========================================
  // ORGANIZATIONS
  // ========================================

  async getAllOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations);
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org || undefined;
  }

  async createOrganization(insertOrg: InsertOrganization): Promise<Organization> {
    const [org] = await db.insert(organizations).values(insertOrg).returning();
    return org;
  }

  // ========================================
  // SACRAMENTAL MEETINGS
  // ========================================

  async getAllSacramentalMeetings(): Promise<SacramentalMeeting[]> {
    return await db.select().from(sacramentalMeetings).orderBy(desc(sacramentalMeetings.date));
  }

  async getSacramentalMeeting(id: string): Promise<SacramentalMeeting | undefined> {
    const [meeting] = await db.select().from(sacramentalMeetings).where(eq(sacramentalMeetings.id, id));
    return meeting || undefined;
  }

  async createSacramentalMeeting(insertMeeting: InsertSacramentalMeeting): Promise<SacramentalMeeting> {
    const [meeting] = await db.insert(sacramentalMeetings).values(insertMeeting).returning();
    return meeting;
  }

  async updateSacramentalMeeting(id: string, data: Partial<InsertSacramentalMeeting>): Promise<SacramentalMeeting | undefined> {
    const [meeting] = await db
      .update(sacramentalMeetings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sacramentalMeetings.id, id))
      .returning();
    return meeting || undefined;
  }

  async deleteSacramentalMeeting(id: string): Promise<void> {
    await db.delete(sacramentalMeetings).where(eq(sacramentalMeetings.id, id));
  }

  // ========================================
  // WARD COUNCILS
  // ========================================

  async getAllWardCouncils(): Promise<WardCouncil[]> {
    return await db.select().from(wardCouncils).orderBy(desc(wardCouncils.date));
  }

  async getWardCouncil(id: string): Promise<WardCouncil | undefined> {
    const [council] = await db.select().from(wardCouncils).where(eq(wardCouncils.id, id));
    return council || undefined;
  }

  async createWardCouncil(insertCouncil: InsertWardCouncil): Promise<WardCouncil> {
    const [council] = await db.insert(wardCouncils).values(insertCouncil).returning();
    return council;
  }

  async updateWardCouncil(id: string, data: Partial<InsertWardCouncil>): Promise<WardCouncil | undefined> {
    const [council] = await db
      .update(wardCouncils)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(wardCouncils.id, id))
      .returning();
    return council || undefined;
  }

  async deleteWardCouncil(id: string): Promise<void> {
    await db.delete(wardCouncils).where(eq(wardCouncils.id, id));
  }

  // ========================================
  // PRESIDENCY MEETINGS
  // ========================================

  async getPresidencyMeetingsByOrganization(organizationId: string): Promise<PresidencyMeeting[]> {
    return await db
      .select()
      .from(presidencyMeetings)
      .where(eq(presidencyMeetings.organizationId, organizationId))
      .orderBy(desc(presidencyMeetings.date));
  }

  async getPresidencyMeeting(id: string): Promise<PresidencyMeeting | undefined> {
    const [meeting] = await db.select().from(presidencyMeetings).where(eq(presidencyMeetings.id, id));
    return meeting || undefined;
  }

  async createPresidencyMeeting(insertMeeting: InsertPresidencyMeeting): Promise<PresidencyMeeting> {
    const [meeting] = await db.insert(presidencyMeetings).values(insertMeeting).returning();
    return meeting;
  }

  async updatePresidencyMeeting(id: string, data: Partial<InsertPresidencyMeeting>): Promise<PresidencyMeeting | undefined> {
    const [meeting] = await db
      .update(presidencyMeetings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(presidencyMeetings.id, id))
      .returning();
    return meeting || undefined;
  }

  async deletePresidencyMeeting(id: string): Promise<void> {
    await db.delete(presidencyMeetings).where(eq(presidencyMeetings.id, id));
  }

  // ========================================
  // BUDGET REQUESTS
  // ========================================

  async getAllBudgetRequests(): Promise<BudgetRequest[]> {
    return await db.select().from(budgetRequests).orderBy(desc(budgetRequests.createdAt));
  }

  async getBudgetRequest(id: string): Promise<BudgetRequest | undefined> {
    const [request] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, id));
    return request || undefined;
  }

  async createBudgetRequest(insertRequest: InsertBudgetRequest): Promise<BudgetRequest> {
    const [request] = await db.insert(budgetRequests).values(insertRequest).returning();
    return request;
  }

  async updateBudgetRequest(id: string, data: Partial<InsertBudgetRequest>): Promise<BudgetRequest | undefined> {
    const [request] = await db
      .update(budgetRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(budgetRequests.id, id))
      .returning();
    return request || undefined;
  }

  async approveBudgetRequest(id: string, approvedBy: string): Promise<BudgetRequest | undefined> {
    const [request] = await db
      .update(budgetRequests)
      .set({
        status: "aprobado",
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(budgetRequests.id, id))
      .returning();
    return request || undefined;
  }

  async deleteBudgetRequest(id: string): Promise<void> {
    await db.delete(budgetRequests).where(eq(budgetRequests.id, id));
  }

  // ========================================
  // INTERVIEWS
  // ========================================

  async getAllInterviews(): Promise<Interview[]> {
    return await db.select().from(interviews).orderBy(desc(interviews.date));
  }

  async getInterview(id: string): Promise<Interview | undefined> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    return interview || undefined;
  }

  async createInterview(insertInterview: InsertInterview): Promise<Interview> {
    const [interview] = await db.insert(interviews).values(insertInterview).returning();
    return interview;
  }

  async updateInterview(id: string, data: Partial<InsertInterview>): Promise<Interview | undefined> {
    const [interview] = await db
      .update(interviews)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(interviews.id, id))
      .returning();
    return interview || undefined;
  }

  async deleteInterview(id: string): Promise<void> {
    await db.delete(interviews).where(eq(interviews.id, id));
  }

  // ========================================
  // GOALS
  // ========================================

  async getAllGoals(): Promise<Goal[]> {
    return await db.select().from(goals).orderBy(desc(goals.year));
  }

  async getGoal(id: string): Promise<Goal | undefined> {
    const [goal] = await db.select().from(goals).where(eq(goals.id, id));
    return goal || undefined;
  }

  async createGoal(insertGoal: InsertGoal): Promise<Goal> {
    const [goal] = await db.insert(goals).values(insertGoal).returning();
    return goal;
  }

  async updateGoal(id: string, data: Partial<InsertGoal>): Promise<Goal | undefined> {
    const [goal] = await db
      .update(goals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(goals.id, id))
      .returning();
    return goal || undefined;
  }

  async deleteGoal(id: string): Promise<void> {
    await db.delete(goals).where(eq(goals.id, id));
  }

  // ========================================
  // BIRTHDAYS
  // ========================================

  async getAllBirthdays(): Promise<Birthday[]> {
    return await db.select().from(birthdays);
  }

  async getTodayBirthdays(): Promise<Birthday[]> {
    const allBirthdays = await db.select().from(birthdays);
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();
    
    return allBirthdays.filter(birthday => {
      const birthDate = new Date(birthday.birthDate);
      return birthDate.getMonth() === todayMonth && birthDate.getDate() === todayDay;
    });
  }

  async getBirthday(id: string): Promise<Birthday | undefined> {
    const [birthday] = await db.select().from(birthdays).where(eq(birthdays.id, id));
    return birthday || undefined;
  }

  async createBirthday(insertBirthday: InsertBirthday): Promise<Birthday> {
    const [birthday] = await db.insert(birthdays).values(insertBirthday).returning();
    return birthday;
  }

  async updateBirthday(id: string, data: Partial<InsertBirthday>): Promise<Birthday | undefined> {
    const [birthday] = await db
      .update(birthdays)
      .set(data)
      .where(eq(birthdays.id, id))
      .returning();
    return birthday || undefined;
  }

  async deleteBirthday(id: string): Promise<void> {
    await db.delete(birthdays).where(eq(birthdays.id, id));
  }

  // ========================================
  // ACTIVITIES
  // ========================================

  async getAllActivities(): Promise<Activity[]> {
    return await db.select().from(activities).orderBy(desc(activities.date));
  }

  async getActivity(id: string): Promise<Activity | undefined> {
    const [activity] = await db.select().from(activities).where(eq(activities.id, id));
    return activity || undefined;
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const [activity] = await db.insert(activities).values(insertActivity).returning();
    return activity;
  }

  async updateActivity(id: string, data: Partial<InsertActivity>): Promise<Activity | undefined> {
    const [activity] = await db
      .update(activities)
      .set(data)
      .where(eq(activities.id, id))
      .returning();
    return activity || undefined;
  }

  async deleteActivity(id: string): Promise<void> {
    await db.delete(activities).where(eq(activities.id, id));
  }

  // ========================================
  // ASSIGNMENTS
  // ========================================

  async getAllAssignments(): Promise<any[]> {
    const assignedToUser = alias(users, "assignedToUser");
    const assignedByUser = alias(users, "assignedByUser");
    
    return await db
      .select({
        id: assignments.id,
        title: assignments.title,
        description: assignments.description,
        assignedTo: assignments.assignedTo,
        assignedBy: assignments.assignedBy,
        dueDate: assignments.dueDate,
        status: assignments.status,
        relatedTo: assignments.relatedTo,
        notes: assignments.notes,
        createdAt: assignments.createdAt,
        updatedAt: assignments.updatedAt,
        personName: assignedToUser.name,
        assignerName: assignedByUser.name,
      })
      .from(assignments)
      .leftJoin(assignedToUser, eq(assignments.assignedTo, assignedToUser.id))
      .leftJoin(assignedByUser, eq(assignments.assignedBy, assignedByUser.id))
      .orderBy(desc(assignments.createdAt));
  }

  async getAssignmentsByUser(userId: string): Promise<Assignment[]> {
    return await db
      .select()
      .from(assignments)
      .where(eq(assignments.assignedTo, userId))
      .orderBy(desc(assignments.createdAt));
  }

  async getAssignment(id: string): Promise<Assignment | undefined> {
    const [assignment] = await db.select().from(assignments).where(eq(assignments.id, id));
    return assignment || undefined;
  }

  async createAssignment(insertAssignment: InsertAssignment): Promise<Assignment> {
    const [assignment] = await db.insert(assignments).values(insertAssignment).returning();
    return assignment;
  }

  async updateAssignment(id: string, data: Partial<InsertAssignment>): Promise<Assignment | undefined> {
    const [assignment] = await db
      .update(assignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(assignments.id, id))
      .returning();
    return assignment || undefined;
  }

  async deleteAssignment(id: string): Promise<void> {
    await db.delete(assignments).where(eq(assignments.id, id));
  }

  // ========================================
  // PDF TEMPLATES
  // ========================================

  async getPdfTemplate(): Promise<PdfTemplate | undefined> {
    const [template] = await db.select().from(pdfTemplates).limit(1);
    return template || undefined;
  }

  async updatePdfTemplate(data: Partial<InsertPdfTemplate>): Promise<PdfTemplate> {
    const existing = await this.getPdfTemplate();
    if (existing) {
      const [updated] = await db
        .update(pdfTemplates)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(pdfTemplates.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(pdfTemplates).values(data).returning();
      return created;
    }
  }

  // ========================================
  // WARD BUDGETS
  // ========================================

  async getWardBudget(): Promise<WardBudget | undefined> {
    const [budget] = await db.select().from(wardBudgets).limit(1);
    return budget || undefined;
  }

  async updateWardBudget(data: Partial<InsertWardBudget>): Promise<WardBudget> {
    const existing = await this.getWardBudget();
    if (existing) {
      const [updated] = await db
        .update(wardBudgets)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(wardBudgets.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(wardBudgets).values(data as any).returning();
      return created;
    }
  }

  // ========================================
  // ORGANIZATION BUDGETS
  // ========================================

  async getOrganizationBudgets(organizationId: string): Promise<OrganizationBudget[]> {
    return await db
      .select()
      .from(organizationBudgets)
      .where(eq(organizationBudgets.organizationId, organizationId))
      .orderBy(desc(organizationBudgets.year), desc(organizationBudgets.quarter));
  }

  async getOrganizationBudgetByQuarter(organizationId: string, year: number, quarter: number): Promise<OrganizationBudget | undefined> {
    const [budget] = await db
      .select()
      .from(organizationBudgets)
      .where(
        and(
          eq(organizationBudgets.organizationId, organizationId),
          eq(organizationBudgets.year, year),
          eq(organizationBudgets.quarter, quarter)
        )
      );
    return budget || undefined;
  }

  async createOrganizationBudget(insertBudget: InsertOrganizationBudget): Promise<OrganizationBudget> {
    const [budget] = await db.insert(organizationBudgets).values(insertBudget).returning();
    return budget;
  }

  async updateOrganizationBudget(id: string, data: Partial<InsertOrganizationBudget>): Promise<OrganizationBudget | undefined> {
    const [budget] = await db
      .update(organizationBudgets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizationBudgets.id, id))
      .returning();
    return budget || undefined;
  }

  // ========================================
  // NOTIFICATIONS
  // ========================================

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notification || undefined;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(insertNotification).returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification || undefined;
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(result[0]?.count) || 0;
  }

  // ========================================
  // PUSH SUBSCRIPTIONS
  // ========================================

  async getPushSubscriptionsByUser(userId: string): Promise<PushSubscription[]> {
    return await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  async getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | undefined> {
    const [subscription] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    return subscription || undefined;
  }

  async createPushSubscription(insertSubscription: InsertPushSubscription): Promise<PushSubscription> {
    const [subscription] = await db
      .insert(pushSubscriptions)
      .values(insertSubscription)
      .returning();
    return subscription;
  }

  async deletePushSubscription(id: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
  }

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptions);
  }
}

export const storage = new DatabaseStorage();
