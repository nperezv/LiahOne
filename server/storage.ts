// Reference: javascript_database blueprint
import { db } from "./db";
import { eq, desc, and, gte, lte, sql, asc, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  users,
  organizations,
  hymns,
  sacramentalMeetings,
  wardCouncils,
  presidencyMeetings,
  presidencyResources,
  budgetRequests,
  interviews,
  organizationInterviews,
  goals,
  birthdays,
  members,
  memberCallings,
  activities,
  assignments,
  pdfTemplates,
  wardBudgets,
  organizationBudgets,
  organizationWeeklyAttendance,
  notifications,
  pushSubscriptions,
  userDevices,
  refreshTokens,
  loginEvents,
  emailOtps,
  accessRequests,
  userDeletionRequests,
  type User,
  type InsertUser,
  type Organization,
  type InsertOrganization,
  type Hymn,
  type SacramentalMeeting,
  type InsertSacramentalMeeting,
  type WardCouncil,
  type InsertWardCouncil,
  type PresidencyMeeting,
  type InsertPresidencyMeeting,
  type PresidencyResource,
  type InsertPresidencyResource,
  type BudgetRequest,
  type InsertBudgetRequest,
  type Interview,
  type InsertInterview,
  type OrganizationInterview,
  type InsertOrganizationInterview,
  type Goal,
  type InsertGoal,
  type Birthday,
  type InsertBirthday,
  type Member,
  type InsertMember,
  type MemberCalling,
  type InsertMemberCalling,
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
  type OrganizationWeeklyAttendance,
  type InsertOrganizationWeeklyAttendance,
  type Notification,
  type InsertNotification,
  type PushSubscription,
  type InsertPushSubscription,
  type UserDevice,
  type RefreshToken,
  type LoginEvent,
  type EmailOtp,
  type AccessRequest,
  type InsertAccessRequest,
  type UserDeletionRequest,
  type InsertUserDeletionRequest,
} from "@shared/schema";

export type DirectoryMember = Member & {
  organizationName: string | null;
  organizationType: Organization["type"] | null;
};

export type DirectoryMemberCalling = MemberCalling & {
  organizationName: string | null;
};

export type DirectoryMemberCallingWithMember = DirectoryMemberCalling & {
  memberName: string | null;
};

export interface UserDeletionSummary {
  activitiesCreated: number;
  assignmentsAssignedTo: number;
  assignmentsAssignedBy: number;
  budgetRequestsRequested: number;
  budgetRequestsApproved: number;
  emailOtps: number;
  goalsCreated: number;
  interviewsAssigned: number;
  interviewsInterviewer: number;
  interviewsAssignedTo: number;
  loginEvents: number;
  notifications: number;
  organizationInterviewsCreated: number;
  organizationInterviewsInterviewer: number;
  presidencyMeetingsCreated: number;
  pushSubscriptions: number;
  refreshTokens: number;
  sacramentalMeetingsCreated: number;
  userDevices: number;
  wardCouncilsCreated: number;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByNormalizedUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  getUserDeletionSummary(id: string): Promise<UserDeletionSummary>;
  deleteUserWithCleanup(id: string): Promise<void>;
  createUserDeletionRequest(data: InsertUserDeletionRequest): Promise<UserDeletionRequest>;
  getUserDeletionRequest(id: string): Promise<UserDeletionRequest | undefined>;
  getPendingUserDeletionRequests(): Promise<UserDeletionRequest[]>;
  updateUserDeletionRequest(
    id: string,
    data: Partial<InsertUserDeletionRequest>
  ): Promise<UserDeletionRequest | undefined>;

  // Organizations
  getAllOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;

  // Hymns
  getAllHymns(): Promise<Hymn[]>;

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

  // Presidency Resources (global library)
  getPresidencyResources(filters?: { organizationId?: string; category?: "manuales" | "plantillas" | "capacitacion" }): Promise<PresidencyResource[]>;
  getPresidencyResource(id: string): Promise<PresidencyResource | undefined>;
  createPresidencyResource(resource: InsertPresidencyResource): Promise<PresidencyResource>;
  deletePresidencyResource(id: string): Promise<void>;

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

  // Organization Interviews
  getOrganizationInterviewsByOrganization(organizationId: string): Promise<OrganizationInterview[]>;
  getOrganizationInterview(id: string): Promise<OrganizationInterview | undefined>;
  createOrganizationInterview(interview: InsertOrganizationInterview): Promise<OrganizationInterview>;
  updateOrganizationInterview(
    id: string,
    data: Partial<InsertOrganizationInterview>
  ): Promise<OrganizationInterview | undefined>;
  deleteOrganizationInterview(id: string): Promise<void>;

  // Organization Members
  getOrganizationMembers(organizationId: string): Promise<User[]>;

  // Directory Members
  getAllMembers(): Promise<DirectoryMember[]>;
  getMemberById(id: string): Promise<Member | undefined>;
  createMember(member: InsertMember): Promise<Member>;
  updateMember(id: string, data: Partial<InsertMember>): Promise<Member | undefined>;
  deleteMember(id: string): Promise<void>;

  // Member Callings
  getMemberCallings(memberId: string): Promise<DirectoryMemberCalling[]>;
  getActiveMemberCallings(): Promise<DirectoryMemberCallingWithMember[]>;
  getMemberCallingById(id: string): Promise<MemberCalling | undefined>;
  createMemberCalling(data: InsertMemberCalling): Promise<MemberCalling>;
  updateMemberCalling(id: string, data: Partial<InsertMemberCalling>): Promise<MemberCalling | undefined>;
  deleteMemberCalling(id: string): Promise<void>;

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

  // Organization Weekly Attendance
  getAllOrganizationWeeklyAttendance(): Promise<OrganizationWeeklyAttendance[]>;
  getOrganizationWeeklyAttendance(organizationId: string): Promise<OrganizationWeeklyAttendance[]>;
  upsertOrganizationWeeklyAttendance(data: InsertOrganizationWeeklyAttendance): Promise<OrganizationWeeklyAttendance>;

  // Notifications
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getNotification(id: string): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  deleteNotification(id: string): Promise<void>;
  deleteNotificationsByRelatedId(relatedId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Push Subscriptions
  getPushSubscriptionsByUser(userId: string): Promise<PushSubscription[]>;
  getPushSubscriptionByEndpoint(endpoint: string): Promise<PushSubscription | undefined>;
  createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(id: string): Promise<void>;
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;

  // Devices
  getUserDeviceByHash(userId: string, deviceHash: string): Promise<UserDevice | undefined>;
  upsertUserDevice(data: { userId: string; deviceHash: string; trusted?: boolean; label?: string }): Promise<UserDevice>;
  updateUserDeviceLastUsed(id: string): Promise<void>;

  // Refresh Tokens
  createRefreshToken(data: {
    userId: string;
    deviceHash?: string | null;
    tokenHash: string;
    ipAddress?: string | null;
    country?: string | null;
    userAgent?: string | null;
    expiresAt: Date;
  }): Promise<RefreshToken>;
  getRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | undefined>;
  revokeRefreshToken(id: string, replacedByTokenId?: string | null): Promise<void>;
  revokeRefreshTokensByUser(userId: string): Promise<void>;
  getActiveRefreshTokens(): Promise<RefreshToken[]>;

  // Login Events
  createLoginEvent(data: {
    userId?: string | null;
    deviceHash?: string | null;
    ipAddress?: string | null;
    country?: string | null;
    userAgent?: string | null;
    success: boolean;
    reason?: string | null;
  }): Promise<LoginEvent>;
  getRecentLoginEvents(limit?: number): Promise<LoginEvent[]>;
  getLastLoginEventForUser(userId: string): Promise<LoginEvent | undefined>;

  // Email OTPs
  createEmailOtp(data: {
    userId: string;
    codeHash: string;
    deviceHash?: string | null;
    ipAddress?: string | null;
    country?: string | null;
    expiresAt: Date;
  }): Promise<EmailOtp>;
  getEmailOtpById(id: string): Promise<EmailOtp | undefined>;
  consumeEmailOtp(id: string): Promise<void>;

  // Access Requests
  createAccessRequest(data: InsertAccessRequest): Promise<AccessRequest>;
  getAccessRequest(id: string): Promise<AccessRequest | undefined>;
  updateAccessRequest(id: string, data: Partial<InsertAccessRequest & { status?: AccessRequest["status"] }>): Promise<AccessRequest | undefined>;
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

  async getUserByNormalizedUsername(username: string): Promise<User | undefined> {
    const normalized = username.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(sql`lower(trim(${users.username}))`, normalized));
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

  async getUserDeletionSummary(id: string): Promise<UserDeletionSummary> {
    const [activitiesCreated] = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(eq(activities.createdBy, id));
    const [assignmentsAssignedTo] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignments)
      .where(eq(assignments.assignedTo, id));
    const [assignmentsAssignedBy] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignments)
      .where(eq(assignments.assignedBy, id));
    const [budgetRequestsRequested] = await db
      .select({ count: sql<number>`count(*)` })
      .from(budgetRequests)
      .where(eq(budgetRequests.requestedBy, id));
    const [budgetRequestsApproved] = await db
      .select({ count: sql<number>`count(*)` })
      .from(budgetRequests)
      .where(eq(budgetRequests.approvedBy, id));
    const [emailOtpsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailOtps)
      .where(eq(emailOtps.userId, id));
    const [goalsCreated] = await db
      .select({ count: sql<number>`count(*)` })
      .from(goals)
      .where(eq(goals.createdBy, id));
    const [interviewsAssigned] = await db
      .select({ count: sql<number>`count(*)` })
      .from(interviews)
      .where(eq(interviews.assignedBy, id));
    const [interviewsInterviewer] = await db
      .select({ count: sql<number>`count(*)` })
      .from(interviews)
      .where(eq(interviews.interviewerId, id));
    const [interviewsAssignedTo] = await db
      .select({ count: sql<number>`count(*)` })
      .from(interviews)
      .where(eq(interviews.assignedToId, id));
    const [loginEventsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(loginEvents)
      .where(eq(loginEvents.userId, id));
    const [notificationsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.userId, id));
    const [organizationInterviewsCreated] = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizationInterviews)
      .where(eq(organizationInterviews.createdBy, id));
    const [organizationInterviewsInterviewer] = await db
      .select({ count: sql<number>`count(*)` })
      .from(organizationInterviews)
      .where(eq(organizationInterviews.interviewerId, id));
    const [presidencyMeetingsCreated] = await db
      .select({ count: sql<number>`count(*)` })
      .from(presidencyMeetings)
      .where(eq(presidencyMeetings.createdBy, id));
    const [pushSubscriptionsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, id));
    const [refreshTokensCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, id));
    const [sacramentalMeetingsCreated] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sacramentalMeetings)
      .where(eq(sacramentalMeetings.createdBy, id));
    const [userDevicesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userDevices)
      .where(eq(userDevices.userId, id));
    const [wardCouncilsCreated] = await db
      .select({ count: sql<number>`count(*)` })
      .from(wardCouncils)
      .where(eq(wardCouncils.createdBy, id));

    return {
      activitiesCreated: Number(activitiesCreated.count),
      assignmentsAssignedTo: Number(assignmentsAssignedTo.count),
      assignmentsAssignedBy: Number(assignmentsAssignedBy.count),
      budgetRequestsRequested: Number(budgetRequestsRequested.count),
      budgetRequestsApproved: Number(budgetRequestsApproved.count),
      emailOtps: Number(emailOtpsCount.count),
      goalsCreated: Number(goalsCreated.count),
      interviewsAssigned: Number(interviewsAssigned.count),
      interviewsInterviewer: Number(interviewsInterviewer.count),
      interviewsAssignedTo: Number(interviewsAssignedTo.count),
      loginEvents: Number(loginEventsCount.count),
      notifications: Number(notificationsCount.count),
      organizationInterviewsCreated: Number(organizationInterviewsCreated.count),
      organizationInterviewsInterviewer: Number(organizationInterviewsInterviewer.count),
      presidencyMeetingsCreated: Number(presidencyMeetingsCreated.count),
      pushSubscriptions: Number(pushSubscriptionsCount.count),
      refreshTokens: Number(refreshTokensCount.count),
      sacramentalMeetingsCreated: Number(sacramentalMeetingsCreated.count),
      userDevices: Number(userDevicesCount.count),
      wardCouncilsCreated: Number(wardCouncilsCreated.count),
    };
  }

  async deleteUserWithCleanup(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(notifications).where(eq(notifications.userId, id));
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, id));
      await tx.delete(userDevices).where(eq(userDevices.userId, id));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, id));
      await tx.delete(emailOtps).where(eq(emailOtps.userId, id));
      await tx.delete(userDeletionRequests).where(eq(userDeletionRequests.userId, id));
      await tx.delete(userDeletionRequests).where(eq(userDeletionRequests.requestedBy, id));
      await tx.update(userDeletionRequests).set({ reviewedBy: null }).where(eq(userDeletionRequests.reviewedBy, id));

      await tx.delete(assignments).where(eq(assignments.assignedTo, id));
      await tx.delete(assignments).where(eq(assignments.assignedBy, id));
      await tx.delete(interviews).where(eq(interviews.assignedBy, id));
      await tx.delete(interviews).where(eq(interviews.interviewerId, id));
      await tx.update(interviews).set({ assignedToId: null }).where(eq(interviews.assignedToId, id));

      await tx.delete(activities).where(eq(activities.createdBy, id));
      await tx.delete(goals).where(eq(goals.createdBy, id));
      await tx.delete(wardCouncils).where(eq(wardCouncils.createdBy, id));
      await tx.delete(presidencyMeetings).where(eq(presidencyMeetings.createdBy, id));
      await tx.delete(sacramentalMeetings).where(eq(sacramentalMeetings.createdBy, id));
      await tx.delete(organizationInterviews).where(eq(organizationInterviews.createdBy, id));
      await tx.delete(organizationInterviews).where(eq(organizationInterviews.interviewerId, id));

      await tx.delete(budgetRequests).where(eq(budgetRequests.requestedBy, id));
      await tx.update(budgetRequests).set({ approvedBy: null }).where(eq(budgetRequests.approvedBy, id));

      await tx.update(loginEvents).set({ userId: null }).where(eq(loginEvents.userId, id));

      await tx.delete(users).where(eq(users.id, id));
    });
  }

  async createUserDeletionRequest(data: InsertUserDeletionRequest): Promise<UserDeletionRequest> {
    const [request] = await db.insert(userDeletionRequests).values(data).returning();
    return request;
  }

  async getUserDeletionRequest(id: string): Promise<UserDeletionRequest | undefined> {
    const [request] = await db.select().from(userDeletionRequests).where(eq(userDeletionRequests.id, id));
    return request || undefined;
  }

  async getPendingUserDeletionRequests(): Promise<UserDeletionRequest[]> {
    return await db
      .select()
      .from(userDeletionRequests)
      .where(eq(userDeletionRequests.status, "pendiente"))
      .orderBy(desc(userDeletionRequests.createdAt));
  }

  async updateUserDeletionRequest(
    id: string,
    data: Partial<InsertUserDeletionRequest>
  ): Promise<UserDeletionRequest | undefined> {
    const [request] = await db
      .update(userDeletionRequests)
      .set({ ...data })
      .where(eq(userDeletionRequests.id, id))
      .returning();
    return request || undefined;
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
  // HYMNS
  // ========================================

  async getAllHymns(): Promise<Hymn[]> {
    return await db.select().from(hymns).orderBy(asc(hymns.number));
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
    const councilData: typeof wardCouncils.$inferInsert =
      insertCouncil as typeof wardCouncils.$inferInsert;
    const [council] = await db.insert(wardCouncils).values(councilData).returning();
    return council;
  }

  async updateWardCouncil(id: string, data: Partial<InsertWardCouncil>): Promise<WardCouncil | undefined> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    } as Partial<typeof wardCouncils.$inferInsert>;
    const [council] = await db
      .update(wardCouncils)
      .set(updateData)
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
    const meetingData: typeof presidencyMeetings.$inferInsert =
      insertMeeting as typeof presidencyMeetings.$inferInsert;
    const [meeting] = await db.insert(presidencyMeetings).values(meetingData).returning();
    return meeting;
  }

  async updatePresidencyMeeting(id: string, data: Partial<InsertPresidencyMeeting>): Promise<PresidencyMeeting | undefined> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    } as Partial<typeof presidencyMeetings.$inferInsert>;
    const [meeting] = await db
      .update(presidencyMeetings)
      .set(updateData)
      .where(eq(presidencyMeetings.id, id))
      .returning();
    return meeting || undefined;
  }

  async deletePresidencyMeeting(id: string): Promise<void> {
    await db.delete(presidencyMeetings).where(eq(presidencyMeetings.id, id));
  }


  async getPresidencyResources(filters?: { organizationId?: string; category?: "manuales" | "plantillas" | "capacitacion" }): Promise<PresidencyResource[]> {
    const orgId = filters?.organizationId;
    const category = filters?.category;

    const whereConditions: SQLWrapper[] = [];

    if (orgId) {
      whereConditions.push(sql`${presidencyResources.organizationId} is null OR ${presidencyResources.organizationId} = ${orgId}`);
    }

    if (category) {
      whereConditions.push(eq(presidencyResources.category, category));
    }

    const baseQuery = db
      .select()
      .from(presidencyResources)
      .orderBy(desc(presidencyResources.createdAt));

    if (whereConditions.length === 0) {
      return await baseQuery;
    }

    return await baseQuery.where(and(...whereConditions));
  }

  async getPresidencyResource(id: string): Promise<PresidencyResource | undefined> {
    const [resource] = await db.select().from(presidencyResources).where(eq(presidencyResources.id, id));
    return resource || undefined;
  }

  async createPresidencyResource(insertResource: InsertPresidencyResource): Promise<PresidencyResource> {
    const resourceData: typeof presidencyResources.$inferInsert =
      insertResource as typeof presidencyResources.$inferInsert;
    const [resource] = await db.insert(presidencyResources).values(resourceData).returning();
    return resource;
  }

  async deletePresidencyResource(id: string): Promise<void> {
    await db.delete(presidencyResources).where(eq(presidencyResources.id, id));
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
    const requestData: typeof budgetRequests.$inferInsert = insertRequest as typeof budgetRequests.$inferInsert;
    const [request] = await db.insert(budgetRequests).values(requestData).returning();
    return request;
  }

  async updateBudgetRequest(id: string, data: Partial<InsertBudgetRequest>): Promise<BudgetRequest | undefined> {
    const updateData = {
      ...data,
      updatedAt: new Date(),
    } as Partial<typeof budgetRequests.$inferInsert>;
    const [request] = await db
      .update(budgetRequests)
      .set(updateData)
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
    await this.deleteNotificationsByRelatedId(id);
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
    await this.deleteNotificationsByRelatedId(id);
    await db.delete(interviews).where(eq(interviews.id, id));
  }

  // ========================================
  // ORGANIZATION INTERVIEWS
  // ========================================

  async getOrganizationInterviewsByOrganization(
    organizationId: string
  ): Promise<OrganizationInterview[]> {
    return await db
      .select()
      .from(organizationInterviews)
      .where(eq(organizationInterviews.organizationId, organizationId))
      .orderBy(desc(organizationInterviews.date));
  }

  async getOrganizationInterview(
    id: string
  ): Promise<OrganizationInterview | undefined> {
    const [interview] = await db
      .select()
      .from(organizationInterviews)
      .where(eq(organizationInterviews.id, id));

    return interview || undefined;
  }

  async createOrganizationInterview(
    insertInterview: InsertOrganizationInterview
  ): Promise<OrganizationInterview> {
    const [interview] = await db
      .insert(organizationInterviews)
      .values(insertInterview)
      .returning();

    return interview;
  }

  async updateOrganizationInterview(
    id: string,
    data: Partial<InsertOrganizationInterview>
  ): Promise<OrganizationInterview | undefined> {
    const [interview] = await db
      .update(organizationInterviews)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(organizationInterviews.id, id))
      .returning();

    return interview || undefined;
  }

  async deleteOrganizationInterview(id: string): Promise<void> {
    await this.deleteNotificationsByRelatedId(id);
    await db.delete(organizationInterviews).where(eq(organizationInterviews.id, id));
  }

  // ========================================
  // ORGANIZATION MEMBERS
  // ========================================

  async getOrganizationMembers(organizationId: string): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.organizationId, organizationId));
  }

  // ========================================
  // DIRECTORY MEMBERS
  // ========================================

  async getAllMembers(): Promise<DirectoryMember[]> {
    return await db
      .select({
        id: members.id,
        nameSurename: members.nameSurename,
        sex: members.sex,
        birthday: members.birthday,
        phone: members.phone,
        email: members.email,
        organizationId: members.organizationId,
        createdAt: members.createdAt,
        organizationName: organizations.name,
        organizationType: organizations.type,
      })
      .from(members)
      .leftJoin(organizations, eq(members.organizationId, organizations.id))
      .orderBy(asc(members.nameSurename));
  }

  async getMemberById(id: string): Promise<Member | undefined> {
    const [member] = await db.select().from(members).where(eq(members.id, id));
    return member || undefined;
  }

  async getActiveMemberCallings(): Promise<DirectoryMemberCallingWithMember[]> {
    return await db
      .select({
        id: memberCallings.id,
        memberId: memberCallings.memberId,
        memberName: members.nameSurename,
        organizationId: memberCallings.organizationId,
        callingName: memberCallings.callingName,
        callingType: memberCallings.callingType,
        callingOrder: memberCallings.callingOrder,
        isActive: memberCallings.isActive,
        startDate: memberCallings.startDate,
        endDate: memberCallings.endDate,
        createdAt: memberCallings.createdAt,
        organizationName: organizations.name,
      })
      .from(memberCallings)
      .leftJoin(members, eq(memberCallings.memberId, members.id))
      .leftJoin(organizations, eq(memberCallings.organizationId, organizations.id))
      .orderBy(asc(members.nameSurename), asc(memberCallings.callingName));
  }

  async createMember(insertMember: InsertMember): Promise<Member> {
    const [member] = await db.insert(members).values(insertMember).returning();
    return member;
  }

  async updateMember(id: string, data: Partial<InsertMember>): Promise<Member | undefined> {
    const [member] = await db
      .update(members)
      .set(data)
      .where(eq(members.id, id))
      .returning();
    return member || undefined;
  }

  async deleteMember(id: string): Promise<void> {
    await db.delete(members).where(eq(members.id, id));
  }

  // ========================================
  // MEMBER CALLINGS
  // ========================================

  async getMemberCallings(memberId: string): Promise<DirectoryMemberCalling[]> {
    return await db
      .select({
        id: memberCallings.id,
        memberId: memberCallings.memberId,
        organizationId: memberCallings.organizationId,
        callingName: memberCallings.callingName,
        callingType: memberCallings.callingType,
        callingOrder: memberCallings.callingOrder,
        isActive: memberCallings.isActive,
        startDate: memberCallings.startDate,
        endDate: memberCallings.endDate,
        createdAt: memberCallings.createdAt,
        organizationName: organizations.name,
      })
      .from(memberCallings)
      .leftJoin(organizations, eq(memberCallings.organizationId, organizations.id))
      .where(eq(memberCallings.memberId, memberId))
      .orderBy(
        asc(sql`coalesce(${memberCallings.callingOrder}, 9999)`),
        asc(memberCallings.callingName)
      );
  }

  async getMemberCallingById(id: string): Promise<MemberCalling | undefined> {
    const [calling] = await db.select().from(memberCallings).where(eq(memberCallings.id, id));
    return calling || undefined;
  }

  async createMemberCalling(data: InsertMemberCalling): Promise<MemberCalling> {
    const [calling] = await db.insert(memberCallings).values(data).returning();
    return calling;
  }

  async updateMemberCalling(
    id: string,
    data: Partial<InsertMemberCalling>
  ): Promise<MemberCalling | undefined> {
    const [calling] = await db
      .update(memberCallings)
      .set(data)
      .where(eq(memberCallings.id, id))
      .returning();
    return calling || undefined;
  }

  async deleteMemberCalling(id: string): Promise<void> {
    await db.delete(memberCallings).where(eq(memberCallings.id, id));
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
    await this.deleteNotificationsByRelatedId(id);
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
    await this.deleteNotificationsByRelatedId(id);
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
  // ORGANIZATION WEEKLY ATTENDANCE
  // ========================================

  async getAllOrganizationWeeklyAttendance(): Promise<OrganizationWeeklyAttendance[]> {
    return await db.select().from(organizationWeeklyAttendance).orderBy(desc(organizationWeeklyAttendance.weekStartDate));
  }

  async getOrganizationWeeklyAttendance(organizationId: string): Promise<OrganizationWeeklyAttendance[]> {
    return await db
      .select()
      .from(organizationWeeklyAttendance)
      .where(eq(organizationWeeklyAttendance.organizationId, organizationId))
      .orderBy(desc(organizationWeeklyAttendance.weekStartDate));
  }

  async upsertOrganizationWeeklyAttendance(data: InsertOrganizationWeeklyAttendance): Promise<OrganizationWeeklyAttendance> {
    const [existing] = await db
      .select()
      .from(organizationWeeklyAttendance)
      .where(
        and(
          eq(organizationWeeklyAttendance.organizationId, data.organizationId),
          eq(organizationWeeklyAttendance.weekStartDate, data.weekStartDate as any)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(organizationWeeklyAttendance)
        .set({
          attendeesCount: data.attendeesCount,
          attendeeMemberIds: (data.attendeeMemberIds as string[] | undefined) ?? [],
          totalMembers: data.totalMembers ?? 0,
          createdBy: data.createdBy,
          updatedAt: new Date(),
        })
        .where(eq(organizationWeeklyAttendance.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(organizationWeeklyAttendance).values({
      ...data,
      attendeeMemberIds: (data.attendeeMemberIds as string[] | undefined) ?? [],
      totalMembers: data.totalMembers ?? 0,
    }).returning();
    return created;
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

  async deleteNotificationsByRelatedId(relatedId: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.relatedId, relatedId));
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

  // ========================================
  // DEVICES
  // ========================================

  async getUserDeviceByHash(userId: string, deviceHash: string): Promise<UserDevice | undefined> {
    const [device] = await db
      .select()
      .from(userDevices)
      .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceHash, deviceHash)));
    return device || undefined;
  }

  async upsertUserDevice(data: {
    userId: string;
    deviceHash: string;
    trusted?: boolean;
    label?: string;
  }): Promise<UserDevice> {
    const existing = await this.getUserDeviceByHash(data.userId, data.deviceHash);
    if (existing) {
      const [updated] = await db
        .update(userDevices)
        .set({
          trusted: data.trusted ?? existing.trusted,
          label: data.label ?? existing.label,
          lastUsedAt: new Date(),
        })
        .where(eq(userDevices.id, existing.id))
        .returning();
      return updated;
    }

    const [device] = await db
      .insert(userDevices)
      .values({
        userId: data.userId,
        deviceHash: data.deviceHash,
        trusted: data.trusted ?? false,
        label: data.label ?? null,
        lastUsedAt: new Date(),
      })
      .returning();
    return device;
  }

  async updateUserDeviceLastUsed(id: string): Promise<void> {
    await db
      .update(userDevices)
      .set({ lastUsedAt: new Date() })
      .where(eq(userDevices.id, id));
  }

  // ========================================
  // REFRESH TOKENS
  // ========================================

  async createRefreshToken(data: {
    userId: string;
    deviceHash?: string | null;
    tokenHash: string;
    ipAddress?: string | null;
    country?: string | null;
    userAgent?: string | null;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    const [token] = await db
      .insert(refreshTokens)
      .values({
        userId: data.userId,
        deviceHash: data.deviceHash ?? null,
        tokenHash: data.tokenHash,
        ipAddress: data.ipAddress ?? null,
        country: data.country ?? null,
        userAgent: data.userAgent ?? null,
        expiresAt: data.expiresAt,
      })
      .returning();
    return token;
  }

  async getRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | undefined> {
    const [token] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    return token || undefined;
  }

  async revokeRefreshToken(id: string, replacedByTokenId?: string | null): Promise<void> {
    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        replacedByTokenId: replacedByTokenId ?? null,
      })
      .where(eq(refreshTokens.id, id));
  }

  async revokeRefreshTokensByUser(userId: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), sql`${refreshTokens.revokedAt} IS NULL`));
  }

  async getActiveRefreshTokens(): Promise<RefreshToken[]> {
    return await db
      .select()
      .from(refreshTokens)
      .where(and(sql`${refreshTokens.revokedAt} IS NULL`, gte(refreshTokens.expiresAt, new Date())));
  }

  // ========================================
  // LOGIN EVENTS
  // ========================================

  async createLoginEvent(data: {
    userId?: string | null;
    deviceHash?: string | null;
    ipAddress?: string | null;
    country?: string | null;
    userAgent?: string | null;
    success: boolean;
    reason?: string | null;
  }): Promise<LoginEvent> {
    const [event] = await db
      .insert(loginEvents)
      .values({
        userId: data.userId ?? null,
        deviceHash: data.deviceHash ?? null,
        ipAddress: data.ipAddress ?? null,
        country: data.country ?? null,
        userAgent: data.userAgent ?? null,
        success: data.success,
        reason: data.reason ?? null,
      })
      .returning();
    return event;
  }

  async getRecentLoginEvents(limit = 50): Promise<LoginEvent[]> {
    return await db.select().from(loginEvents).orderBy(desc(loginEvents.createdAt)).limit(limit);
  }

  async getLastLoginEventForUser(userId: string): Promise<LoginEvent | undefined> {
    const [event] = await db
      .select()
      .from(loginEvents)
      .where(and(eq(loginEvents.userId, userId), eq(loginEvents.success, true)))
      .orderBy(desc(loginEvents.createdAt))
      .limit(1);
    return event || undefined;
  }

  // ========================================
  // EMAIL OTPS
  // ========================================

  async createEmailOtp(data: {
    userId: string;
    codeHash: string;
    deviceHash?: string | null;
    ipAddress?: string | null;
    country?: string | null;
    expiresAt: Date;
  }): Promise<EmailOtp> {
    const [otp] = await db
      .insert(emailOtps)
      .values({
        userId: data.userId,
        codeHash: data.codeHash,
        deviceHash: data.deviceHash ?? null,
        ipAddress: data.ipAddress ?? null,
        country: data.country ?? null,
        expiresAt: data.expiresAt,
      })
      .returning();
    return otp;
  }

  async getEmailOtpById(id: string): Promise<EmailOtp | undefined> {
    const [otp] = await db.select().from(emailOtps).where(eq(emailOtps.id, id));
    return otp || undefined;
  }

  async consumeEmailOtp(id: string): Promise<void> {
    await db.update(emailOtps).set({ consumedAt: new Date() }).where(eq(emailOtps.id, id));
  }

  // ========================================
  // ACCESS REQUESTS
  // ========================================

  async createAccessRequest(data: InsertAccessRequest): Promise<AccessRequest> {
    const [request] = await db.insert(accessRequests).values(data).returning();
    return request;
  }

  async getAccessRequest(id: string): Promise<AccessRequest | undefined> {
    const [request] = await db.select().from(accessRequests).where(eq(accessRequests.id, id));
    return request || undefined;
  }

  async updateAccessRequest(
    id: string,
    data: Partial<InsertAccessRequest & { status?: AccessRequest["status"] }>
  ): Promise<AccessRequest | undefined> {
    const [request] = await db
      .update(accessRequests)
      .set({ ...data })
      .where(eq(accessRequests.id, id))
      .returning();
    return request || undefined;
  }
}

export const storage = new DatabaseStorage();
