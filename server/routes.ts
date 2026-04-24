import type { Express, Request, Response, NextFunction } from "express";
import { applyHymnStartupMigrations } from "./startup-hymn-migrations";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { generateBudgetRequestPdf } from "./pdf/budget-pdf";
import { generateWelfareRequestPdf } from "./pdf/welfare-pdf";
import { storage, getDefaultChecklistItems } from "./storage";
import { db, pool } from "./db";
import { and, eq, ne, sql } from "drizzle-orm";
import {
  insertUserSchema,
  insertSacramentalMeetingSchema,
  insertWardCouncilSchema,
  insertPresidencyMeetingSchema,
  insertPresidencyResourceSchema,
  insertBudgetRequestSchema,
  insertWelfareRequestSchema,
  insertInterviewSchema,
  insertOrganizationInterviewSchema,
  insertGoalSchema,
  insertBirthdaySchema,
  insertMemberSchema,
  insertMemberCallingSchema,
  insertActivitySchema,
  updateActivityChecklistItemSchema,
  insertAssignmentSchema,
  insertPdfTemplateSchema,
  insertWardBudgetSchema,
  insertOrganizationBudgetSchema,
  insertAccessRequestSchema,
  insertNotificationSchema,
  insertPushSubscriptionSchema,
  insertAgendaEventSchema,
  insertAgendaTaskSchema,
  insertAgendaTaskPlanSchema,
  insertUserAvailabilitySchema,
  notifications,
  interviews,
  organizationInterviews,
  parseDateString,
  memberCallings,
  sacramentalMeetings as sacramentalMeetingsTable,
  agendaEvents,
  bajaRequests,
} from "@shared/schema";
import { z } from "zod";
import { formatBirthdayMonthDay, getDaysUntilBirthday } from "@shared/birthday-utils";
import bcrypt from "bcrypt";
import { sendPushNotification, getVapidPublicKey, isPushConfigured } from "./push-service";
import { registerInventoryRoutes } from "./inventory-routes";
import Anthropic from "@anthropic-ai/sdk";
import { createActivityTasksAndAssignments, autoCompleteAssignmentsForSection } from "./activity-task-helpers";
import { registerMissionRoutes } from "./mission-routes";
import { registerBaptismPublicRoutes } from "./baptism-public-routes";
import { registerQuarterlyPlanRoutes } from "./quarterly-plan-routes";
import { registerActivityPublicRoutes } from "./activity-public-routes";
import { registerMemberRegistrationPublicRoutes } from "./member-registration-public-routes";
import { deriveDisplayName, deriveNameSurename, shortNameFromString } from "@shared/name-utils";
import {
  registerRecurringSeriesRoutes,
  getOccurrencesInRange, getMonthlyOccurrencesInRange, getQuarterlyOccurrencesInRange,
  countOccurrencesBetween, countMonthlyOccurrencesBetween, countQuarterlyOccurrencesBetween,
  getWeekdayOccurrenceInMonthUTC,
} from "./recurring-series-routes";
import { computePlan, findOverlappingPlanIds, toRangeFromEvent } from "./agenda/planner";
import { parseAgendaCommand } from "./agenda/command-parser";
import { getPreferredReminderChannels } from "./agenda/reminder-utils";
import { processAgendaReminder } from "./agenda/reminder-worker";
import { readIdempotencyKey, toReplayResponse } from "./agenda/idempotency-utils";
import {
  createAccessToken,
  generateRefreshToken,
  generateOtpCode,
  generateTemporaryPassword,
  getClientIp,
  getCountryFromIp,
  getDeviceHash,
  getOtpExpiry,
  getRefreshExpiry,
  hashToken,
  sendAccessRequestEmail,
  sendAccessRequestConfirmationEmail,
  sendNewUserCredentialsEmail,
  sendLoginOtpEmail,
  sendAccountRecoveryEmail,
  sendInterviewScheduledEmail,
  sendInterviewUpdatedEmail,
  sendInterviewCancelledEmail,
  sendInterviewReminder24hEmail,
  sendOrganizationInterviewScheduledEmail,
  sendOrganizationInterviewCancelledEmail,
  sendAssignmentDueReminderEmail,
  sendWardCouncilAssignmentEmail,
  sendSacramentalAssignmentEmail,
  sendBirthdayGreetingEmail,
  sendAgendaReminderEmail,
  sendBaptismReminderEmail,
  sendBudgetDisbursementRequestEmail,
  sendBudgetDisbursementCompletedEmail,
  verifyAccessToken,
} from "./auth";

// Extend Express Session type
declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function getUserIdFromRequest(req: Request): string | null {
  const sessionData = req.session as (typeof req.session & { userId?: string }) | undefined;

  if (sessionData?.userId) {
    return sessionData.userId;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const payload = verifyAccessToken(token);
  if (!payload) {
    return null;
  }

  if (sessionData) {
    sessionData.userId = payload.userId;
  }

  return payload.userId;
}

function normalizeBudgetRequestActivityDate(rawActivityDate: unknown): Date | null | undefined {
  if (rawActivityDate === null || rawActivityDate === undefined || rawActivityDate === "") {
    return null;
  }

  if (rawActivityDate instanceof Date) {
    return Number.isNaN(rawActivityDate.getTime()) ? undefined : rawActivityDate;
  }

  if (typeof rawActivityDate === "string") {
    const normalizedValue = rawActivityDate.includes("T")
      ? rawActivityDate
      : `${rawActivityDate}T00:00:00`;
    const parsedDate = new Date(normalizedValue);
    return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
  }

  return undefined;
}

// Auth middleware
  async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.isActive) {
        return res.status(403).json({ error: "Account inactive" });
      }
      (req as any).user = user;
      next();
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

// Role-based auth middleware
function getTrimmedCancellationReason(payload: any): string {
  const candidates = [
    payload?.cancellationReason,
    payload?.reason,
    payload?.cancelReason,
    payload?.cancellation_reason,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }

  return "";
}

function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.isActive || !roles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}

const CALLING_ROLE_LABELS: Record<string, { neutral: string; male?: string; female?: string }> = {
  obispo: { neutral: "Obispo" },
  consejero_obispo: { neutral: "Consejero" },
  secretario_ejecutivo: { neutral: "Secretario ejecutivo" },
  secretario: { neutral: "Secretario" },
  secretario_financiero: { neutral: "Secretario financiero" },
  presidente_organizacion: { neutral: "Presidente/Presidenta", male: "Presidente", female: "Presidenta" },
  consejero_organizacion: { neutral: "Consejero/Consejera", male: "Consejero", female: "Consejera" },
  secretario_organizacion: { neutral: "Secretario/Secretaria", male: "Secretario", female: "Secretaria" },
  bibliotecario: { neutral: "Bibliotecario/Bibliotecaria", male: "Bibliotecario", female: "Bibliotecaria" },
};

const OBISPADO_ROLES = new Set([
  "obispo",
  "consejero_obispo",
  "secretario",
  "secretario_ejecutivo",
  "secretario_financiero",
  "bibliotecario",
]);

const RESOURCES_LIBRARY_ADMIN_ROLES = new Set([
  "obispo",
  "consejero_obispo",
  "secretario",
  "secretario_ejecutivo",
]);

const BUDGET_REQUESTER_ROLES = new Set([
  "obispo",
  "consejero_obispo",
  "secretario_financiero",
  "presidente_organizacion",
  "consejero_organizacion",
  "secretario_organizacion",
]);

const BUDGET_APPROVER_ROLES = new Set([
  "obispo",
  "consejero_obispo",
  "secretario_financiero",
]);

const normalizeSexValue = (value?: string | null) => {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "M") return "M";
  if (normalized === "F") return "F";
  return undefined;
};

const getCallingLabel = (role: string, sex?: string | null) => {
  const labels = CALLING_ROLE_LABELS[role];
  if (!labels) return null;
  const normalized = normalizeSexValue(sex);
  if (normalized === "M" && labels.male) return labels.male;
  if (normalized === "F" && labels.female) return labels.female;
  return labels.neutral;
};

const getObispadoOrganizationId = async () => {
  const organizations = await storage.getAllOrganizations();
  return organizations.find((org) => org.type === "obispado")?.id ?? null;
};

const removeAutoCallingForUser = async (user: any) => {
  if (!user?.memberId) return;
  const member = await storage.getMemberById(user.memberId);
  if (!member) return;
  const callingName = getCallingLabel(user.role, member.sex);
  if (!callingName) return;
  const obispadoOrganizationId = await getObispadoOrganizationId();
  const callingOrganizationId = OBISPADO_ROLES.has(user.role)
    ? obispadoOrganizationId ?? user.organizationId ?? null
    : user.organizationId ?? null;
  const callings = await storage.getMemberCallings(user.memberId);
  const match = callings.find(
    (calling) =>
      calling.callingName === callingName &&
      (calling.organizationId ?? null) === (callingOrganizationId ?? null)
  );
  if (match) {
    await storage.deleteMemberCalling(match.id);
  }
};

const interviewCollisionRoles = new Map<string, string>([
  ["obispo", "Obispo"],
  ["consejero_obispo", "Consejero del obispado"],
  ["presidente_organizacion", "Presidente de organización"],
]);

const INTERVIEW_ANNUAL_GOAL_TITLE = "Entrevistas anuales por miembros";
const INTERVIEW_ANNUAL_GOAL_FACTOR = 1;
const INTERVIEW_GOAL_ALLOWED_ORG_TYPES = new Set(["sociedad_socorro", "cuorum_elderes"]);

const SURNAME_PARTICLES = new Set([
  "da",
  "de",
  "del",
  "dos",
  "das",
  "do",
  "la",
  "las",
  "los",
  "y",
  "san",
  "santa",
  "santo",
  "van",
  "von",
]);

const isSurnameParticle = (token: string) => SURNAME_PARTICLES.has(token.toLowerCase());
const isLowercaseToken = (token: string) =>
  token === token.toLowerCase() && token !== token.toUpperCase();

const scoreSplit = (surnames: string[], names: string[]) => {
  if (surnames.length === 0 || names.length === 0) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (isSurnameParticle(surnames[surnames.length - 1])) score -= 2;
  if (isSurnameParticle(names[0])) score -= 2;

  surnames.forEach((token) => {
    if (isSurnameParticle(token) || isLowercaseToken(token)) score += 1;
  });
  names.forEach((token) => {
    if (isSurnameParticle(token) || isLowercaseToken(token)) score -= 1;
  });

  if (names.length === 1) score += 1;
  if (names.length === 2) score += 0.5;
  if (names.length > 2) score -= 1;

  if (surnames.length >= 1 && surnames.length <= 3) score += 0.5;

  return score;
};

const normalizeMemberName = (value?: string | null) => {
  if (!value) return "";
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  if (cleaned.includes(",")) {
    const [surnamePart, namePart] = cleaned.split(",").map((part) => part.trim());
    if (namePart && surnamePart) {
      return `${namePart} ${surnamePart}`.trim();
    }
  }

  const parts = cleaned.split(" ");
  if (parts.length < 2) return cleaned;
  if (parts.length === 2) return cleaned;

  const lowerTokens = parts.map((part) => part.toLowerCase());
  const hasParticles = lowerTokens.some((token) => isSurnameParticle(token));
  const hasLowercaseTokens = parts.some((part) => isLowercaseToken(part));

  if (parts.length === 4 && !hasParticles && !hasLowercaseTokens) {
    const surnames = parts.slice(0, 2);
    const names = parts.slice(2);
    return [...names, ...surnames].join(" ");
  }

  const candidateGivenCounts = [1, 2].filter((count) => parts.length - count >= 1);
  let bestSplit = { surnames: parts.slice(0, 1), names: parts.slice(1) };
  let bestScore = Number.NEGATIVE_INFINITY;

  candidateGivenCounts.forEach((givenCount) => {
    const surnames = parts.slice(0, parts.length - givenCount);
    const names = parts.slice(parts.length - givenCount);
    const score = scoreSplit(surnames, names);
    if (score > bestScore) {
      bestScore = score;
      bestSplit = { surnames, names };
    }
  });

  if (bestSplit.names.length === 0) return cleaned;

  return [...bestSplit.names, ...bestSplit.surnames].join(" ");
};

const shortName = (entity: {
  displayName?: string | null;
  nombre?: string | null;
  apellidos?: string | null;
  name?: string | null;
  nameSurename?: string | null;
} | null | undefined): string => {
  if (!entity) return "";
  if (entity.displayName?.trim()) return entity.displayName.trim();
  if (entity.nombre || entity.apellidos) return deriveDisplayName(entity.nombre, entity.apellidos);
  return shortNameFromString(entity.nameSurename || entity.name);
};

const formatInterviewerTitle = (role?: string | null) => {
  if (!role) return "";
  const map: Record<string, string> = {
    obispo: "Obispo",
    consejero_obispo: "Consejero del obispado",
    secretario_ejecutivo: "Secretario Ejecutivo",
  };
  return map[role] ?? "";
};


const syncOrganizationInterviewAnnualGoalProgress = async (params: {
  organizationId: string;
  organizationType?: string | null;
  interviewDate: string | Date;
  previousStatus: string;
  nextStatus: string;
  actorUserId: string;
}) => {
  if (!INTERVIEW_GOAL_ALLOWED_ORG_TYPES.has(params.organizationType || "")) {
    return;
  }

  const wasCompleted = params.previousStatus === "completada";
  const isCompleted = params.nextStatus === "completada";
  if (wasCompleted === isCompleted) {
    return;
  }

  const interviewDate = new Date(params.interviewDate);
  if (Number.isNaN(interviewDate.getTime())) {
    return;
  }
  const year = interviewDate.getUTCFullYear();

  const allGoals = await storage.getAllGoals();
  let annualGoal = allGoals.find(
    (goal) =>
      goal.organizationId === params.organizationId &&
      goal.year === year &&
      goal.title === INTERVIEW_ANNUAL_GOAL_TITLE
  );

  if (!annualGoal) {
    const members = await storage.getAllMembers();
    const organizationMemberCount = members.filter(
      (member: any) => member.organizationId === params.organizationId
    ).length;

    annualGoal = await storage.createGoal({
      year,
      title: INTERVIEW_ANNUAL_GOAL_TITLE,
      description: "Meta automática basada en entrevistas completadas para la organización durante el año.",
      targetValue: Math.max(Math.round(organizationMemberCount * INTERVIEW_ANNUAL_GOAL_FACTOR), 0),
      currentValue: 0,
      organizationId: params.organizationId,
      createdBy: params.actorUserId,
    });
  }

  const delta = isCompleted ? 1 : -1;
  const nextCurrentValue = Math.max((annualGoal.currentValue ?? 0) + delta, 0);

  await storage.updateGoal(annualGoal.id, {
    currentValue: nextCurrentValue,
  });
};

const formatDateTimeLabels = (value: string | Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { dateLabel: String(value), timeLabel: "" };
  }

  const dateLabel = date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeLabel = date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { dateLabel, timeLabel };
};

const parseMeetingDateParts = (value: string | Date) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const parseTimeParts = (value?: string | null) => {
  const trimmed = value?.trim() || "";
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
};

const formatMeetingLabels = (
  dateValue: string | Date,
  configuredTime?: string | null
) => {
  const parsedDate = parseMeetingDateParts(dateValue);
  if (!parsedDate) {
    return formatDateTimeLabels(dateValue);
  }

  const calendarDate = new Date(
    Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day)
  );
  const dateLabel = calendarDate.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const configured = parseTimeParts(configuredTime);
  if (configured) {
    return {
      dateLabel,
      timeLabel: `${String(configured.hours).padStart(2, "0")}:${String(
        configured.minutes
      ).padStart(2, "0")}`,
    };
  }

  if (typeof dateValue === "string") {
    const dateTimeMatch = dateValue.trim().match(/T(\d{2}):(\d{2})/);
    if (dateTimeMatch) {
      return { dateLabel, timeLabel: `${dateTimeMatch[1]}:${dateTimeMatch[2]}` };
    }
  }

  return { dateLabel, timeLabel: "" };
};

const extractParticipantName = (value?: string | null) => {
  const raw = value?.trim() || "";
  if (!raw) return "";

  const nameOnly = raw.includes("|") ? raw.split("|")[0]?.trim() || "" : raw;
  if (!nameOnly) return "";

  return normalizeMemberName(nameOnly);
};

const normalizeComparableName = (value?: string | null) =>
  normalizeMemberName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const tokenizeComparableName = (value?: string | null) =>
  normalizeComparableName(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const buildTokenSignature = (value?: string | null) =>
  tokenizeComparableName(value)
    .sort()
    .join(" ");

const scoreNameSimilarity = (targetTokens: string[], candidateTokens: string[]) => {
  if (targetTokens.length === 0 || candidateTokens.length === 0) return Number.NEGATIVE_INFINITY;

  const targetSet = new Set(targetTokens);
  const candidateSet = new Set(candidateTokens);
  const overlap = targetTokens.filter((token) => candidateSet.has(token)).length;

  if (overlap === 0) return Number.NEGATIVE_INFINITY;

  const targetInCandidate = targetTokens.every((token) => candidateSet.has(token));
  const candidateInTarget = candidateTokens.every((token) => targetSet.has(token));

  if (targetInCandidate && candidateInTarget) return 1000;
  if ((targetInCandidate || candidateInTarget) && overlap >= 2) {
    return 200 + overlap * 10 - Math.abs(targetTokens.length - candidateTokens.length);
  }

  if (overlap >= 3) {
    return 100 + overlap * 5 - Math.abs(targetTokens.length - candidateTokens.length) * 2;
  }

  return Number.NEGATIVE_INFINITY;
};

function findBestNameMatch<T>(
  targetName: string,
  candidates: T[],
  getName: (candidate: T) => string | null | undefined
): T | undefined {
  const targetTokens = tokenizeComparableName(targetName);
  if (targetTokens.length === 0) return undefined;

  let bestMatch: T | undefined = undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateName = getName(candidate);
    const candidateTokens = tokenizeComparableName(candidateName);
    const score = scoreNameSimilarity(targetTokens, candidateTokens);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestScore > Number.NEGATIVE_INFINITY ? bestMatch : undefined;
}

const getDiscourseMinutesPerSpeaker = (discourseCount: number) => {
  if (discourseCount <= 0) return null;
  if (discourseCount === 1) return 20;
  if (discourseCount === 2) return 10;
  if (discourseCount === 3) return 7;
  return 5;
};

type SacramentalRoleEntry = {
  kind: "discourse" | "opening_prayer" | "closing_prayer" | "other_assignment";
  line: string;
  topic?: string;
  assignmentLabel?: string;
  suggestedMinutes?: number | null;
};

const buildSacramentalRoleEntries = (meeting: any, totalDiscourseCount?: number) => {
  const map = new Map<string, SacramentalRoleEntry[]>();
  const pushEntry = (name: string | undefined | null, entry: SacramentalRoleEntry) => {
    const normalized = normalizeComparableName(name);
    if (!normalized) return;
    if (!map.has(normalized)) map.set(normalized, []);
    map.get(normalized)!.push(entry);
  };

  pushEntry(extractParticipantName(meeting.openingPrayer || meeting.firstPrayer), {
    kind: "opening_prayer",
    line: "Oración de apertura",
  });

  pushEntry(extractParticipantName(meeting.closingPrayer || meeting.lastPrayer), {
    kind: "closing_prayer",
    line: "Oración de clausura",
  });

  const rawDiscourses = [
    ...(Array.isArray(meeting.discourses) ? meeting.discourses : []),
    ...(Array.isArray(meeting.messages) ? meeting.messages : []),
  ];
  const discourses = rawDiscourses
    .map((item: any) => {
      const speaker = extractParticipantName(item?.speaker);
      const topic = typeof item?.topic === "string"
        ? item.topic.trim()
        : typeof item?.message === "string"
          ? item.message.trim()
          : "";
      return { speaker, topic };
    })
    .filter((item) => Boolean(item.speaker));

  const discourseMinutes = getDiscourseMinutesPerSpeaker(totalDiscourseCount ?? discourses.length);

  discourses.forEach((item) => {
    const lineBase = item.topic ? `Discurso: ${item.topic}` : "Discurso";
    const line = discourseMinutes
      ? `${lineBase}. Dispondrá de ${discourseMinutes} minutos para compartir su mensaje.`
      : lineBase;
    pushEntry(item.speaker, {
      kind: "discourse",
      line,
      topic: item.topic,
      suggestedMinutes: discourseMinutes,
    });
  });

  const assignments = [
    ...(Array.isArray(meeting.assignments) ? meeting.assignments : []),
    ...(Array.isArray(meeting.additionalAssignments) ? meeting.additionalAssignments : []),
  ];
  assignments.forEach((item: any) => {
    const name = extractParticipantName(item?.name || item?.assignedTo || item?.responsible);
    const assignment = typeof item?.assignment === "string"
      ? item.assignment.trim()
      : typeof item?.title === "string"
        ? item.title.trim()
        : typeof item?.responsibility === "string"
          ? item.responsibility.trim()
          : "";
    if (!assignment) return;
    pushEntry(name, {
      kind: "other_assignment",
      line: `Asignación: ${assignment}`,
      assignmentLabel: assignment,
    });
  });

  return map;
};

/**
 * Returns a synthetic meeting containing only participants that are NEW
 * compared to oldMeeting (different name or not present before).
 * Used to avoid re-notifying people who were already assigned.
 */
const diffSacramentalParticipants = (oldMeeting: any, newMeeting: any): any => {
  const normName = (v?: string | null) =>
    normalizeComparableName(extractParticipantName(v));

  const diffMeeting: any = { ...newMeeting };

  // openingPrayer — only if the person changed
  const oldOpener = normName(oldMeeting.openingPrayer);
  const newOpener = normName(newMeeting.openingPrayer);
  if (!newOpener || newOpener === oldOpener) diffMeeting.openingPrayer = null;

  // closingPrayer — only if the person changed
  const oldCloser = normName(oldMeeting.closingPrayer);
  const newCloser = normName(newMeeting.closingPrayer);
  if (!newCloser || newCloser === oldCloser) diffMeeting.closingPrayer = null;

  // discourses — only new speakers (not present in old meeting)
  const oldSpeakers = new Set(
    (oldMeeting.discourses || [])
      .map((d: any) => normName(d?.speaker))
      .filter(Boolean)
  );
  diffMeeting.discourses = (newMeeting.discourses || []).filter((d: any) => {
    const name = normName(d?.speaker);
    return name && !oldSpeakers.has(name);
  });

  // assignments — only new names (not present in old meeting)
  const oldAssignees = new Set(
    (oldMeeting.assignments || [])
      .map((a: any) => normName(a?.name))
      .filter(Boolean)
  );
  diffMeeting.assignments = (newMeeting.assignments || []).filter((a: any) => {
    const name = normName(a?.name);
    return name && !oldAssignees.has(name);
  });

  return diffMeeting;
};

async function hasInterviewCollision({
  interviewerId,
  date,
  excludeInterviewId,
  excludeOrganizationInterviewId,
}: {
  interviewerId: string;
  date: Date;
  excludeInterviewId?: string;
  excludeOrganizationInterviewId?: string;
}): Promise<boolean> {
  const interviewFilters = [
    eq(interviews.interviewerId, interviewerId),
    eq(interviews.date, date),
    eq(interviews.status, "programada"),
  ];
  if (excludeInterviewId) {
    interviewFilters.push(ne(interviews.id, excludeInterviewId));
  }

  const [interview] = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(and(...interviewFilters))
    .limit(1);

  if (interview) {
    return true;
  }

  const organizationInterviewFilters = [
    eq(organizationInterviews.interviewerId, interviewerId),
    eq(organizationInterviews.date, date),
    eq(organizationInterviews.status, "programada"),
  ];
  if (excludeOrganizationInterviewId) {
    organizationInterviewFilters.push(
      ne(organizationInterviews.id, excludeOrganizationInterviewId)
    );
  }

  const [organizationInterview] = await db
    .select({ id: organizationInterviews.id })
    .from(organizationInterviews)
    .where(and(...organizationInterviewFilters))
    .limit(1);

  return Boolean(organizationInterview);
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerInventoryRoutes(app, requireAuth, getUserIdFromRequest);
  registerMissionRoutes(app, requireAuth);
  registerBaptismPublicRoutes(app);
  registerQuarterlyPlanRoutes(app, requireAuth);
  registerActivityPublicRoutes(app);
  registerMemberRegistrationPublicRoutes(app);
  registerRecurringSeriesRoutes(app, requireAuth);

  // One-time fix: update baptism_services with 'Por confirmar' location
  // to use the configured meeting center name.
  (async () => {
    const tpl = await storage.getPdfTemplate();
    const meetingCenter = tpl?.meetingCenterName?.trim();
    if (meetingCenter) {
      await db.execute(sql`
        UPDATE baptism_services
        SET location_name = ${meetingCenter}
        WHERE location_name = 'Por confirmar'
      `);
    }
  })().catch((err: unknown) => {
    console.error("[startup] Failed to fix baptism_services location_name:", err);
  });

  // One-time fix: update service_task titles to use the correct format
  // "Servicio Bautismal <Nombre(s)> — Coordinación logística"
  // Catches tasks with old format or "Por confirmar" placeholder.
  (async () => {
    function joinNamesEs(names: string[]): string {
      if (names.length === 0) return "Servicio bautismal";
      if (names.length === 1) return names[0];
      if (names.length === 2) return `${names[0]} y ${names[1]}`;
      return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
    }
    const stale = await db.execute(sql`
      SELECT st.id, st.assigned_role,
             array_agg(mp.nombre ORDER BY mp.nombre) AS nombres
      FROM service_tasks st
      JOIN baptism_service_candidates bsc ON bsc.service_id = st.baptism_service_id
      JOIN mission_personas mp ON mp.id = bsc.persona_id
      WHERE st.assigned_role IN ('lider_actividades', 'mission_leader_logistics')
        AND st.baptism_service_id IS NOT NULL
        AND (
          st.title LIKE '%Por confirmar%'
          OR st.title NOT LIKE 'Servicio Bautismal % — Coordinación logística'
        )
      GROUP BY st.id, st.assigned_role
    `);
    for (const row of stale.rows as any[]) {
      const joined = joinNamesEs(row.nombres as string[]);
      const newTitle = row.assigned_role === "lider_actividades"
        ? `Servicio Bautismal ${joined} — Coordinación logística`
        : `Coordinar logística con el lider de actividades: ${joined}`;
      await db.execute(sql`UPDATE service_tasks SET title = ${newTitle} WHERE id = ${row.id}`);
    }
  })().catch((err: unknown) => {
    console.error("[startup] Failed to fix stale service_task titles:", err);
  });
  // Setup session middleware
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  if (!process.env.ACCESS_TOKEN_SECRET) {
    throw new Error("ACCESS_TOKEN_SECRET environment variable is required");
  }
  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new Error("REFRESH_TOKEN_SECRET environment variable is required");
  }

  const PgSession = connectPgSimple(session);

  const authColumnResult = await db.execute(
    sql`select 1 from information_schema.columns where table_name = 'users' and column_name = 'require_email_otp'`
  );
  const authColumnRows = "rows" in authColumnResult ? authColumnResult.rows : authColumnResult;
  const authColumn = Array.isArray(authColumnRows) ? authColumnRows[0] : undefined;
  if (!authColumn) {
    throw new Error(
      "Database schema is missing auth columns. Apply migrations/0003_auth_security.sql or run npm run db:push.",
    );
  }

  // Auto-migration: displayName on users
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text`);
  // Backfill displayName for users already linked to a member with nombre/apellidos
  await db.execute(sql`
    UPDATE users u
    SET display_name = concat_ws(' ',
      split_part(trim(m.nombre), ' ', 1),
      split_part(trim(m.apellidos), ' ', 1)
    )
    FROM members m
    WHERE u.member_id = m.id
      AND m.nombre IS NOT NULL
      AND m.apellidos IS NOT NULL
      AND (u.display_name IS NULL OR u.display_name = '')
  `);

  // Auto-migration: consent + nombre/apellidos/status fields on members
  await db.execute(sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS email_consent_granted boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS email_consent_date timestamp`);
  await db.execute(sql`ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS contact_consent_at timestamp`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS baja_requests (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre text NOT NULL,
      apellidos text NOT NULL,
      email text NOT NULL,
      motivo text,
      status text NOT NULL DEFAULT 'pendiente',
      processed_at timestamp,
      processed_by varchar REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS nombre text`);
  await db.execute(sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS apellidos text`);
  await db.execute(sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status') THEN CREATE TYPE member_status AS ENUM ('active','pending'); END IF; END $$`);
  await db.execute(sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS member_status member_status NOT NULL DEFAULT 'active'`);
  // Best-effort split existing comma-formatted names
  await db.execute(sql`
    UPDATE members SET
      apellidos = trim(split_part(name_surename, ',', 1)),
      nombre    = trim(split_part(name_surename, ',', 2))
    WHERE name_surename LIKE '%,%' AND nombre IS NULL
  `);

  // Auto-migration: add is_public to activities if missing
  await db.execute(sql`
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false
  `);

  // Auto-migration: add meeting center fields to pdf_templates if missing
  await db.execute(sql`
    ALTER TABLE pdf_templates ADD COLUMN IF NOT EXISTS meeting_center_name text NOT NULL DEFAULT ''
  `);
  await db.execute(sql`
    ALTER TABLE pdf_templates ADD COLUMN IF NOT EXISTS meeting_center_address text NOT NULL DEFAULT ''
  `);
  // Auto-migration: add requires_registration to activities if missing
  await db.execute(sql`
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS requires_registration boolean NOT NULL DEFAULT false
  `);

  // Auto-migration: convert activities.date to TIMESTAMPTZ — runs ONLY when column is still TIMESTAMP WITHOUT TIME ZONE
  await db.execute(sql`
    DO $$
    BEGIN
      IF (
        SELECT data_type FROM information_schema.columns
        WHERE table_name = 'activities' AND column_name = 'date'
      ) = 'timestamp without time zone' THEN
        ALTER TABLE activities
          ALTER COLUMN date TYPE TIMESTAMPTZ USING date AT TIME ZONE 'UTC';
      END IF;
    END $$
  `);

  // Auto-migration: remove sports-specific checklist items from deportiva activities (no longer in template)
  await db.execute(sql`
    DELETE FROM activity_checklist_items
    WHERE item_key IN ('coord_equipos', 'coord_arbitros', 'coord_material')
      AND activity_id IN (SELECT id FROM activities WHERE type = 'deportiva')
  `);

  // Auto-migration: ensure hymns table has all required columns, missing entries, and external URLs
  await applyHymnStartupMigrations();

  // Auto-migration: quarterly_plans and quarterly_plan_items tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quarterly_plans (
      id               varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      organization_id  varchar REFERENCES organizations(id) ON DELETE CASCADE,
      quarter          integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),
      year             integer NOT NULL,
      status           text NOT NULL DEFAULT 'draft',
      submitted_at     timestamp with time zone,
      submitted_by     varchar REFERENCES users(id),
      reviewed_at      timestamp with time zone,
      reviewed_by      varchar REFERENCES users(id),
      review_comment   text,
      created_at       timestamp with time zone NOT NULL DEFAULT now(),
      updated_at       timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS quarterly_plans_org_quarter_year_idx
      ON quarterly_plans (organization_id, quarter, year)
      WHERE organization_id IS NOT NULL
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS quarterly_plans_barrio_quarter_year_idx
      ON quarterly_plans (quarter, year)
      WHERE organization_id IS NULL
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quarterly_plan_items (
      id                  varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      quarterly_plan_id   varchar NOT NULL REFERENCES quarterly_plans(id) ON DELETE CASCADE,
      title               text NOT NULL,
      description         text,
      activity_date       date NOT NULL,
      location            text,
      estimated_attendance integer,
      budget              numeric(10,2),
      notes               text,
      "order"             integer NOT NULL DEFAULT 0,
      activity_id         varchar REFERENCES activities(id),
      created_at          timestamp with time zone NOT NULL DEFAULT now(),
      updated_at          timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    ALTER TABLE service_tasks
      ADD COLUMN IF NOT EXISTS quarterly_plan_item_id varchar REFERENCES quarterly_plan_items(id) ON DELETE SET NULL
  `);
  // Add technology_specialist to role enum if missing
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'role' AND e.enumlabel = 'technology_specialist'
      ) THEN
        ALTER TYPE role ADD VALUE 'technology_specialist';
      END IF;
    END$$
  `);

  // Add actividad_org to activity_type enum if missing
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'activity_type' AND e.enumlabel = 'actividad_org'
      ) THEN
        ALTER TYPE activity_type ADD VALUE 'actividad_org';
      END IF;
    END$$
  `);

  // Auto-migration: slug, flyer_url, quarterly_plan_item_id on activities
  await db.execute(sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS slug varchar UNIQUE`);
  await db.execute(sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS flyer_url text`);
  await db.execute(sql`
    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS quarterly_plan_item_id varchar
        REFERENCES quarterly_plan_items(id) ON DELETE SET NULL
  `);

  // Auto-migration: recurring_series table + activity columns
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS recurring_series (
      id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      title               text NOT NULL,
      description         text,
      location            text,
      day_of_week         smallint NOT NULL DEFAULT 5,
      time_of_day         varchar(5) NOT NULL DEFAULT '20:00',
      rotation_org_ids    jsonb NOT NULL DEFAULT '[]',
      rotation_start_date date NOT NULL,
      notify_days_before  int NOT NULL DEFAULT 14,
      active              boolean NOT NULL DEFAULT true,
      created_at          timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS recurring_series_id varchar
        REFERENCES recurring_series(id) ON DELETE SET NULL
  `);
  await db.execute(sql`
    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS notified_rotation boolean NOT NULL DEFAULT false
  `);
  await db.execute(sql`
    ALTER TABLE recurring_series
      ADD COLUMN IF NOT EXISTS end_date date
  `);
  await db.execute(sql`
    ALTER TABLE recurring_series
      ADD COLUMN IF NOT EXISTS frequency varchar(20) NOT NULL DEFAULT 'weekly'
  `);
  await db.execute(sql`
    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS section_data jsonb NOT NULL DEFAULT '{}'
  `);
  await db.execute(sql`
    ALTER TABLE recurring_series
      ADD COLUMN IF NOT EXISTS activity_type varchar(50) NOT NULL DEFAULT 'actividad_org'
  `);
  await db.execute(sql`
    ALTER TABLE recurring_series
      ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false
  `);
  await db.execute(sql`
    ALTER TABLE quarterly_plan_items
      ADD COLUMN IF NOT EXISTS activity_type varchar(50) NOT NULL DEFAULT 'actividad_org'
  `);
  await db.execute(sql`
    ALTER TABLE quarterly_plan_items
      ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false
  `);

  // Auto-migration: update renamed checklist item labels
  await db.execute(sql`UPDATE activity_checklist_items SET label = 'Último himno'   WHERE item_key = 'prog_himno_cierre'   AND label = 'Himno de cierre'`);
  await db.execute(sql`UPDATE activity_checklist_items SET label = 'Última oración' WHERE item_key = 'prog_oracion_cierre' AND label = 'Oración de cierre'`);

  // Auto-migration: regenerate checklist items for non-baptism activities that still
  // have old-format items (prog_agenda, coord_invitaciones, log_espacio, etc.)
  try {
    const stale = await db.execute(sql`
      SELECT DISTINCT a.id, a.type
      FROM activities a
      JOIN activity_checklist_items ci ON ci.activity_id = a.id
      WHERE (ci.item_key = 'prog_agenda' OR ci.item_key = 'coord_invitaciones' OR ci.item_key = 'log_espacio')
        AND a.type != 'servicio_bautismal'
    `);
    for (const row of stale.rows as Array<{ id: string; type: string }>) {
      await db.execute(sql`DELETE FROM activity_checklist_items WHERE activity_id = ${row.id}`);
      const items = getDefaultChecklistItems(row.type);
      for (const item of items) {
        await db.execute(sql`
          INSERT INTO activity_checklist_items (id, activity_id, item_key, label, completed, sort_order)
          VALUES (${crypto.randomUUID()}, ${row.id}, ${item.key}, ${item.label}, false, ${item.sort})
        `);
      }
    }
    if (stale.rows.length > 0) {
      console.log(`[Migration] Regenerated checklist items for ${stale.rows.length} activities`);
    }
  } catch (e) {
    console.error("[Migration] checklist regeneration error:", e);
  }

  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: new PgSession({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    })
  );

  const uploadsPath = path.resolve(process.cwd(), "uploads");
  fs.mkdirSync(uploadsPath, { recursive: true });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });


  const getCookie = (req: Request, name: string) => {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
    for (const cookie of cookies) {
      const [cookieName, ...rest] = cookie.split("=");
      if (cookieName === name) {
        return decodeURIComponent(rest.join("="));
      }
    }
    return null;
  };

  // ========================================
  // AUTHENTICATION
  // ========================================

  const issueTokens = async (req: Request, res: Response, userId: string, deviceHash?: string | null) => {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const ipAddress = getClientIp(req);
    const country = getCountryFromIp(ipAddress);
    const userAgent = req.headers["user-agent"] ?? null;
    const refreshExpiry = getRefreshExpiry();
    const refreshRecord = await storage.createRefreshToken({
      userId,
      deviceHash,
      tokenHash: refreshTokenHash,
      ipAddress,
      country,
      userAgent,
      expiresAt: refreshExpiry,
    });

    const accessToken = createAccessToken(userId, refreshRecord.id);

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: refreshExpiry.getTime() - Date.now(),
      path: "/api",
    });

    return { accessToken, refreshTokenId: refreshRecord.id };
  };

  const isBcryptHash = (value: string) => value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");

  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const includeDebug = process.env.NODE_ENV !== "production";
      const { username, password, rememberDevice, deviceId } = req.body;
      const trimmedUsername = typeof username === "string" ? username.trim() : "";
      const trimmedPassword = typeof password === "string" ? password.trim() : "";
      const deviceHash = getDeviceHash(deviceId);
      const ipAddress = getClientIp(req);
      const country = getCountryFromIp(ipAddress);
      const userAgent = req.headers["user-agent"] ?? null;

      const user =
        (trimmedUsername
          ? await storage.getUserByUsername(trimmedUsername)
          : undefined) ??
        (trimmedUsername
          ? await storage.getUserByNormalizedUsername(trimmedUsername)
          : undefined);
      if (!user) {
        await storage.createLoginEvent({
          userId: null,
          deviceHash,
          ipAddress,
          country,
          userAgent,
          success: false,
          reason: "invalid_credentials",
        });
        return res.status(401).json({
          error: "Invalid credentials",
          ...(includeDebug ? { detail: "user_not_found" } : {}),
        });
      }
      if (!user.isActive) {
        await storage.createLoginEvent({
          userId: user.id,
          deviceHash,
          ipAddress,
          country,
          userAgent,
          success: false,
          reason: "inactive_account",
        });
        return res.status(403).json({ error: "Account inactive" });
      }

      const isLegacyPassword = !isBcryptHash(user.password);
      const isValidPassword = isLegacyPassword
        ? trimmedPassword === user.password.trim()
        : typeof password === "string" && await bcrypt.compare(trimmedPassword, user.password);
      if (!isValidPassword) {
        await storage.createLoginEvent({
          userId: user.id,
          deviceHash,
          ipAddress,
          country,
          userAgent,
          success: false,
          reason: "invalid_credentials",
        });
        return res.status(401).json({
          error: "Invalid credentials",
          ...(includeDebug
            ? { detail: isLegacyPassword ? "legacy_password_mismatch" : "password_mismatch" }
            : {}),
        });
      }

      if (isLegacyPassword) {
        const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
        await storage.updateUser(user.id, { password: hashedPassword });
      }

      const existingDevice = deviceHash
        ? await storage.getUserDeviceByHash(user.id, deviceHash)
        : undefined;
      const lastLogin = await storage.getLastLoginEventForUser(user.id);
      const unusualCountry = lastLogin?.country && country && lastLogin.country !== country;

      const requiresOtp =
        !user.requirePasswordChange && (
          user.requireEmailOtp ||
          !deviceHash ||
          !existingDevice?.trusted ||
          unusualCountry
        );

      const canSendOtp = Boolean(user.email);
      if (requiresOtp && canSendOtp) {
        const template = await storage.getPdfTemplate();
        const wardName = template?.wardName;
        const otpCode = generateOtpCode();
        const otpHash = hashToken(otpCode);
        const otp = await storage.createEmailOtp({
          userId: user.id,
          codeHash: otpHash,
          deviceHash,
          ipAddress,
          country,
          expiresAt: getOtpExpiry(),
        });

        await sendLoginOtpEmail(user.email, otpCode, wardName);

        await storage.createLoginEvent({
          userId: user.id,
          deviceHash,
          ipAddress,
          country,
          userAgent,
          success: false,
          reason: "otp_required",
        });

        return res.status(202).json({
          requiresEmailCode: true,
          otpId: otp.id,
          email: user.email,
        });
      }

      if (deviceHash) {
        await storage.upsertUserDevice({
          userId: user.id,
          deviceHash,
          trusted: !!rememberDevice,
        });
      }

      const { accessToken } = await issueTokens(req, res, user.id, deviceHash);
      req.session.userId = user.id;

      await storage.createLoginEvent({
        userId: user.id,
        deviceHash,
        ipAddress,
        country,
        userAgent,
        success: true,
        reason: "login_success",
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, accessToken });
    } catch (error) {
      console.error("Login failed:", error);
      const includeDebug = process.env.NODE_ENV !== "production";
      res.status(500).json({
        error: "Internal server error",
        ...(includeDebug && error instanceof Error ? { detail: error.message } : {}),
      });
    }
  });

  app.post("/api/login/recover", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const trimmedEmail = typeof email === "string" ? email.trim() : "";
      if (!trimmedEmail) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await storage.getUserByEmail(trimmedEmail);
      if (!user || !user.isActive || !user.email) {
        return res.json({ message: "If that email exists, recovery instructions were sent" });
      }

      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;
      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const loginUrl = `${baseUrl}/login`;

      const temporaryPassword = generateTemporaryPassword();
      const hashedTemporaryPassword = await bcrypt.hash(temporaryPassword, 10);
      await storage.updateUser(user.id, {
        password: hashedTemporaryPassword,
        requirePasswordChange: true,
      });
      await storage.revokeRefreshTokensByUser(user.id);

      await sendAccountRecoveryEmail({
        toEmail: user.email,
        name: shortName(user),
        username: user.username,
        temporaryPassword,
        wardName,
        loginUrl,
      });

      return res.json({ message: "If that email exists, recovery instructions were sent" });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/login/verify", async (req: Request, res: Response) => {
    try {
      const { otpId, code, rememberDevice, deviceId } = req.body;
      if (!otpId || !code) {
        return res.status(400).json({ error: "Code is required" });
      }
      const normalizedCode = String(code).trim();
      const deviceHash = getDeviceHash(deviceId);
      const ipAddress = getClientIp(req);
      const country = getCountryFromIp(ipAddress);
      const userAgent = req.headers["user-agent"] ?? null;
      const otp = await storage.getEmailOtpById(otpId);
      if (!otp || otp.consumedAt || otp.expiresAt < new Date()) {
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      const codeHash = hashToken(normalizedCode);
      let otpToConsume = otp;
      if (codeHash !== otp.codeHash) {
        const matchingOtp = await storage.getActiveEmailOtpByUserAndCodeHash(otp.userId, codeHash);
        if (!matchingOtp) {
          return res.status(400).json({ error: "Invalid or expired code" });
        }
        otpToConsume = matchingOtp;
      }

      await storage.consumeEmailOtp(otpToConsume.id);
      const user = await storage.getUser(otpToConsume.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.isActive) {
        return res.status(403).json({ error: "Account inactive" });
      }

      if (deviceHash) {
        await storage.upsertUserDevice({
          userId: user.id,
          deviceHash,
          trusted: !!rememberDevice,
        });
      }

      const { accessToken } = await issueTokens(req, res, user.id, deviceHash);
      req.session.userId = user.id;

      await storage.createLoginEvent({
        userId: user.id,
        deviceHash,
        ipAddress,
        country,
        userAgent,
        success: true,
        reason: "otp_success",
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, accessToken });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const refreshToken = getCookie(req, "refresh_token");
      if (!refreshToken) {
        return res.status(401).json({ error: "Missing refresh token" });
      }

      const refreshTokenHash = hashToken(refreshToken);
      const storedToken = await storage.getRefreshTokenByHash(refreshTokenHash);
      if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      const user = await storage.getUser(storedToken.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.isActive) {
        return res.status(403).json({ error: "Account inactive" });
      }

      const { accessToken: newAccessToken, refreshTokenId } = await issueTokens(
        req,
        res,
        user.id,
        storedToken.deviceHash
      );
      await storage.revokeRefreshToken(storedToken.id, refreshTokenId);

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh token" });
    }
  });

  app.post("/api/logout", async (req: Request, res: Response) => {
    try {
      const refreshToken = getCookie(req, "refresh_token");
      if (refreshToken) {
        const refreshTokenHash = hashToken(refreshToken);
        const storedToken = await storage.getRefreshTokenByHash(refreshTokenHash);
        if (storedToken) {
          await storage.revokeRefreshToken(storedToken.id);
        }
      }

      res.clearCookie("refresh_token", { path: "/api" });
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to logout" });
        }
        res.json({ message: "Logged out successfully" });
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  app.get("/api/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;

      let organizationType: string | null = null;
      if (user.organizationId) {
        const org = await storage.getOrganization(user.organizationId);
        organizationType = org?.type ?? null;
      }

      // Fall back to linked member name if user.name is empty
      let resolvedName = userWithoutPassword.name;
      if (!resolvedName?.trim() && user.memberId) {
        const member = await storage.getMemberById(user.memberId);
        if (member?.nameSurename) resolvedName = member.nameSurename;
      }

      res.json({ ...userWithoutPassword, name: resolvedName, organizationType });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // UPLOADS
  // ========================================

  app.post("/api/uploads", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    try {
      const uploadedFile = (req as any).file as { originalname: string; buffer: Buffer } | undefined;
      if (!uploadedFile) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const extension = path.extname(uploadedFile.originalname || "");
      const storedFilename = `${randomUUID()}${extension}`;
      const storedPath = path.join(uploadsPath, storedFilename);
      await fs.promises.writeFile(storedPath, uploadedFile.buffer);

      res.status(201).json({
        filename: uploadedFile.originalname,
        url: `/uploads/${storedFilename}`,
      });
    } catch (error: any) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large" });
      }
      res.status(400).json({ error: "Invalid upload data" });
    }
  });

  app.get("/api/uploads/:storedFilename/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const storedFilename = path.basename(String(req.params.storedFilename ?? "")).trim();
      if (!storedFilename) {
        return res.status(400).json({ error: "Invalid file" });
      }

      const absolutePath = path.join(uploadsPath, storedFilename);
      console.log("[download] uploadsPath:", uploadsPath, "| storedFilename:", storedFilename, "| absolutePath:", absolutePath);
      await fs.promises.access(absolutePath, fs.constants.F_OK);

      const requestedName = typeof req.query.filename === "string" ? req.query.filename.trim() : "";
      const fallbackName = storedFilename;
      const safeDownloadName = (requestedName || fallbackName)
        .replace(/[\r\n]/g, "")
        .replace(/[\\/]/g, "-");
      const mode = req.query.mode === "inline" ? "inline" : "download";

      if (mode === "inline") {
        res.setHeader("Content-Disposition", `inline; filename="${safeDownloadName}"`);
        return res.sendFile(absolutePath);
      }

      res.download(absolutePath, safeDownloadName);
    } catch (err: any) {
      console.error("[download] File not found or error:", err?.message);
      res.status(404).json({ error: "File not found" });
    }
  });

  // ========================================
  // ACCESS REQUESTS
  // ========================================

  app.post("/api/access-requests", async (req: Request, res: Response) => {
    try {
      const parsed = insertAccessRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid access request data" });
      }

      const normalizedEmail = parsed.data.email.trim().toLowerCase();
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({
          error: "Ya existe una cuenta con ese correo.",
          code: "ACCOUNT_ALREADY_EXISTS",
          recoveryPath: "/login",
        });
      }

      const accessRequest = await storage.createAccessRequest({
        ...parsed.data,
        email: normalizedEmail,
        contactConsentAt: parsed.data.contactConsent ? new Date() : undefined,
      });

      const [users, template] = await Promise.all([
        storage.getAllUsers(),
        storage.getPdfTemplate(),
      ]);
      const wardName = template?.wardName;
      const notificationRoles = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"];
      const roleRecipients = users
        .filter((user) => notificationRoles.includes(user.role) && user.email)
        .map((user) => user.email!)
        .filter((email, index, arr) => arr.indexOf(email) === index);
      const fallbackRecipient = process.env.BISHOP_EMAIL;
      const recipients = roleRecipients.length > 0
        ? roleRecipients
        : fallbackRecipient
          ? [fallbackRecipient]
          : [];

      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const reviewUrl = `${baseUrl}/admin/users?requestId=${accessRequest.id}`;

      const emailJobs: Promise<void>[] = [];

      if (recipients.length > 0) {
        emailJobs.push(
          ...recipients.map((recipient) =>
            sendAccessRequestEmail({
              toEmail: recipient,
              requesterName: accessRequest.name,
              requesterEmail: accessRequest.email,
              calling: accessRequest.calling,
              phone: accessRequest.phone,
              reviewUrl,
              wardName,
            })
          )
        );
      } else {
        console.warn("No access request email recipients configured.", accessRequest);
      }

      emailJobs.push(
        sendAccessRequestConfirmationEmail({
          toEmail: accessRequest.email,
          name: accessRequest.name,
          consentAt: accessRequest.contactConsentAt ?? new Date(),
          wardName,
          bajaUrl: `${baseUrl}/baja`,
        })
      );

      await Promise.all(emailJobs);

      res.status(201).json(accessRequest);
    } catch (error) {
      res.status(500).json({ error: "Failed to create access request" });
    }
  });

  app.get(
    "/api/access-requests/:id",
    requireAuth,
    requireRole("obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
      try {
        const accessRequest = await storage.getAccessRequest(req.params.id);
        if (!accessRequest) {
          return res.status(404).json({ error: "Access request not found" });
        }
        res.json(accessRequest);
      } catch (error) {
        res.status(500).json({ error: "Failed to load access request" });
      }
    }
  );

  // ========================================
  // BAJA REQUESTS (public directory)
  // ========================================

  app.get(
    "/api/baja-requests",
    requireAuth,
    requireRole("obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"),
    async (_req: Request, res: Response) => {
      try {
        const rows = await db
          .select()
          .from(bajaRequests)
          .orderBy(bajaRequests.createdAt);
        res.json(rows);
      } catch {
        res.status(500).json({ error: "Failed to load baja requests" });
      }
    }
  );

  app.patch(
    "/api/baja-requests/:id",
    requireAuth,
    requireRole("obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
      try {
        const [updated] = await db
          .update(bajaRequests)
          .set({ status: "procesada", processedAt: new Date(), processedBy: (req as any).user.id })
          .where(eq(bajaRequests.id, req.params.id))
          .returning();
        if (!updated) return res.status(404).json({ error: "Not found" });
        res.json(updated);
      } catch {
        res.status(500).json({ error: "Failed to update baja request" });
      }
    }
  );

  // ========================================
  // USERS
  // ========================================

  app.get("/api/users", requireAuth, async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsersWithCallingOrder();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // One-time: copy email and phone from users to their linked members (user is source of truth)
  app.post("/api/users/sync-contacts", requireRole("obispo", "secretario"), async (_req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      let synced = 0;
      for (const u of allUsers) {
        if (!u.memberId) continue;
        const payload: Record<string, unknown> = {};
        if (u.email) payload.email = u.email;
        if (u.phone) payload.phone = u.phone;
        if (Object.keys(payload).length > 0) {
          await storage.updateMember(u.memberId, payload as any);
          synced++;
        }
      }
      res.json({ ok: true, synced });
    } catch (error) {
      console.error("Error syncing contacts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reconcile displayName for all users linked to a member
  app.post("/api/users/sync-display-names", requireRole("obispo", "secretario"), async (_req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      let synced = 0;
      for (const u of allUsers) {
        if (!u.memberId) continue;
        const member = await storage.getMemberById(u.memberId);
        if (!member?.nombre || !member?.apellidos) continue;
        const newDisplayName = deriveDisplayName(member.nombre, member.apellidos);
        const newName = deriveNameSurename(member.nombre, member.apellidos, member.nameSurename);
        if (newDisplayName !== u.displayName || newName !== u.name) {
          await storage.updateUser(u.id, { displayName: newDisplayName || null, name: newName });
          synced++;
        }
      }
      res.json({ ok: true, synced });
    } catch (error) {
      console.error("Error syncing display names:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post(
    "/api/users",
    requireAuth,
    requireRole("obispo", "secretario", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
    try {
      const {
        name,
        email,
        role,
        organizationId,
        accessRequestId,
        phone,
        memberId,
        isActive,
        callingName: callingNameOverride,
      } = req.body;

      if (!name || !role) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (!email) {
        return res.status(400).json({ error: "Email is required to send credentials" });
      }

      const derivedUsername = typeof email === "string" ? email.split("@")[0].trim() : "";
      if (!derivedUsername) {
        return res.status(400).json({ error: "Invalid email for username generation" });
      }
      const normalizedName = normalizeMemberName(name);
      if (!normalizedName) {
        return res.status(400).json({ error: "Invalid name" });
      }

      // Check if the username already exists
      const existingUsers = await storage.getAllUsers();
      const usernameExists = existingUsers.some(
        (u) => u.username.toLowerCase() === derivedUsername.toLowerCase()
      );
      if (usernameExists) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Roles that require an organizationId
      const rolesRequireOrg = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"];
      if (rolesRequireOrg.includes(role) && !organizationId) {
        return res.status(400).json({ error: "organizationId is required for this role" });
      }

      if (!memberId) {
        return res.status(400).json({ error: "memberId is required to create a user" });
      }

      let memberForCalling: any = null;
      const member = await storage.getMemberById(memberId);
      if (!member) {
        return res.status(400).json({ error: "Member not found" });
      }
      const memberAlreadyLinked = existingUsers.some((user) => user.memberId === memberId);
      if (memberAlreadyLinked) {
        return res.status(400).json({ error: "Member is already linked to another user" });
      }
      memberForCalling = member;

      // Bishop-level roles automatically get the Obispado organizationId
      const bishopRoles = ["consejero_obispo", "secretario", "bibliotecario"];
      const obispadoId = "0fc67882-5b4e-43d5-9384-83b1f8afe1e3"; // replace with the real Obispado ID
      const finalOrganizationId = bishopRoles.includes(role) ? obispadoId : organizationId || null;

      const temporaryPassword = generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

      // Derive display name and formal name from the linked member
      const formalName = member
        ? deriveNameSurename(member.nombre, member.apellidos, member.nameSurename)
        : normalizedName;
      const shortDisplayName = member
        ? deriveDisplayName(member.nombre, member.apellidos)
        : normalizedName;

      const user = await storage.createUser({
        username: derivedUsername,
        password: hashedPassword,
        name: formalName,
        displayName: shortDisplayName || null,
        email,
        phone: phone || null,
        requirePasswordChange: true,
        isActive: typeof isActive === "boolean" ? isActive : true,
        role,
        organizationId: finalOrganizationId,
        memberId: memberId || null,
      });

      if (memberId && memberForCalling) {
        const trimmedCallingOverride =
          typeof callingNameOverride === "string" ? callingNameOverride.trim() : "";
        const callingName = trimmedCallingOverride || getCallingLabel(role, memberForCalling.sex);
        if (callingName) {
          const obispadoOrganizationId = await getObispadoOrganizationId();
          const callingOrganizationId = OBISPADO_ROLES.has(role)
            ? obispadoOrganizationId ?? finalOrganizationId
            : finalOrganizationId;
          const existingCallings = await storage.getMemberCallings(memberId);
          const alreadyExists = existingCallings.some(
            (calling) =>
              calling.callingName === callingName &&
              (calling.organizationId ?? null) === (callingOrganizationId ?? null)
          );
          if (!alreadyExists) {
            const callingPayload = insertMemberCallingSchema.parse({
              memberId,
              organizationId: callingOrganizationId,
              callingName,
            });
            await storage.createMemberCalling(callingPayload);
          }
        }
      }

      if (accessRequestId) {
        await storage.updateAccessRequest(accessRequestId, { status: "aprobada" });
      }

      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;
      const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
      const loginUrl = `${baseUrl}/login`;

      await sendNewUserCredentialsEmail({
        toEmail: email,
        name: shortDisplayName || normalizedName,
        username: derivedUsername,
        temporaryPassword,
        recipientSex: memberForCalling?.sex,
        wardName,
        loginUrl,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);

    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.code === '23505') {
        return res.status(400).json({ error: "Username already exists" });
      }
      res.status(500).json({ error: "Failed to create user: " + (error.message || "Unknown error") });
    }
  });

  app.patch(
    "/api/users/:id",
    requireAuth,
    requireRole(
      "obispo",
      "consejero_obispo",
      "secretario",
      "secretario_ejecutivo",
      "secretario_financiero"
    ),
    async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { username, nombre, apellidos, name, email, role, organizationId, phone, memberId, isActive } = req.body;

      if (role) {
        const rolesRequireOrg = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"];
        if (rolesRequireOrg.includes(role) && !organizationId) {
          return res.status(400).json({ error: "organizationId is required for this role" });
        }
      }

      if (username) {
        const existingUsers = await storage.getAllUsers();
        const usernameExists = existingUsers.some(
          (u) => u.username.toLowerCase() === username.toLowerCase() && u.id !== id
        );
        if (usernameExists) {
          return res.status(400).json({ error: "Username already exists" });
        }
      }

      const hasMemberId = Object.prototype.hasOwnProperty.call(req.body ?? {}, "memberId");
      const normalizedMemberId =
        memberId === "" || memberId === null ? null : (memberId as string | undefined);

      if (hasMemberId && !normalizedMemberId) {
        return res.status(400).json({ error: "memberId is required" });
      }

      if (hasMemberId && normalizedMemberId) {
        const member = await storage.getMemberById(normalizedMemberId);
        if (!member) {
          return res.status(400).json({ error: "Member not found" });
        }
        const existingUsers = await storage.getAllUsers();
        const memberAlreadyLinked = existingUsers.some(
          (user) => user.memberId === normalizedMemberId && user.id !== id
        );
        if (memberAlreadyLinked) {
          return res.status(400).json({ error: "Member is already linked to another user" });
        }
      }

      // Derive formal name and displayName when nombre/apellidos provided
      const hasNameParts = nombre !== undefined || apellidos !== undefined;
      const resolvedName = hasNameParts ? (deriveNameSurename(nombre, apellidos) || name || undefined) : (name || undefined);
      const resolvedDisplayName = hasNameParts ? (deriveDisplayName(nombre, apellidos) || null) : undefined;

      const updatedUser = await storage.updateUser(id, {
        username: username || undefined,
        name: resolvedName,
        displayName: resolvedDisplayName !== undefined ? resolvedDisplayName : undefined,
        email: email || undefined,
        role: role || undefined,
        organizationId: organizationId ?? undefined,
        phone: phone || undefined,
        memberId: hasMemberId ? normalizedMemberId : undefined,
        isActive: typeof isActive === "boolean" ? isActive : undefined,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Sync nombre/apellidos back to linked member (bidireccional)
      if (hasNameParts && updatedUser.memberId) {
        await storage.updateMember(updatedUser.memberId, {
          nombre: nombre ?? null,
          apellidos: apellidos ?? null,
          nameSurename: resolvedName ?? "",
        } as any);
      }

      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.patch("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const { nombre, apellidos, phone, email, username, requireEmailOtp, avatarUrl } = req.body;
      const hasAvatarUpdate = Object.prototype.hasOwnProperty.call(req.body ?? {}, "avatarUrl");

      const derivedName = deriveNameSurename(nombre, apellidos);
      const derivedDisplayName = deriveDisplayName(nombre, apellidos);

      const user = await storage.updateUser(req.session.userId!, {
        name: derivedName || undefined,
        displayName: derivedDisplayName || null,
        email: email || undefined,
        phone: phone || undefined,
        username: username || undefined,
        requireEmailOtp: typeof requireEmailOtp === "boolean" ? requireEmailOtp : undefined,
        avatarUrl: hasAvatarUpdate ? avatarUrl : undefined,
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Sync to linked member: user is source of truth for email
      if (user.memberId) {
        const memberPayload: Record<string, unknown> = {};
        if (nombre !== undefined || apellidos !== undefined) {
          memberPayload.nombre = nombre ?? null;
          memberPayload.apellidos = apellidos ?? null;
          memberPayload.nameSurename = derivedName;
        }
        if (email !== undefined) memberPayload.email = email || null;
        if (phone !== undefined) memberPayload.phone = phone || null;
        if (Object.keys(memberPayload).length > 0) {
          await storage.updateMember(user.memberId, memberPayload as any);
        }
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.post("/api/profile/change-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.session.userId!);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const updatedUser = await storage.updateUser(req.session.userId!, {
        password: hashedPassword,
        requirePasswordChange: false,
      });

      if (!updatedUser) {
        return res.status(500).json({ error: "Failed to update password" });
      }

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  app.post(
    "/api/users/:id/reset-password",
    requireAuth,
    requireRole("obispo", "consejero_obispo", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword) {
        return res.status(400).json({ error: "New password is required" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const user = await storage.updateUser(id, {
        password: hashedPassword,
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ message: "Password reset successfully", user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.get(
    "/api/admin/sessions",
    requireAuth,
    requireRole("obispo", "consejero_obispo", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
    try {
      const sessions = await storage.getActiveRefreshTokens();
      const users = await storage.getAllUsers();
      const usersById = new Map(users.map((u) => [u.id, u]));

      const response = sessions.map((session) => {
        const user = usersById.get(session.userId);
        return {
          id: session.id,
          userId: session.userId,
          username: user?.username,
          name: user?.name,
          role: user?.role,
          ipAddress: session.ipAddress,
          country: session.country,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          deviceHash: session.deviceHash,
        };
      });

      res.json(response);
    } catch (error) {
      res.status(500).json({ error: "Failed to load sessions" });
    }
  });

  app.post(
    "/api/admin/sessions/:id/revoke",
    requireAuth,
    requireRole("obispo", "consejero_obispo", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        await storage.revokeRefreshToken(id);
        res.json({ message: "Session revoked" });
      } catch (error) {
        res.status(500).json({ error: "Failed to revoke session" });
      }
    }
  );

  app.get(
    "/api/admin/access-log",
    requireAuth,
    requireRole("obispo", "consejero_obispo", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
      try {
        const events = await storage.getRecentLoginEvents();
        const users = await storage.getAllUsers();
        const usersById = new Map(users.map((u) => [u.id, u]));

        const response = events.map((event) => {
          const user = event.userId ? usersById.get(event.userId) : undefined;
          return {
            id: event.id,
            userId: event.userId,
            username: user?.username,
            name: user?.name,
            role: user?.role,
            ipAddress: event.ipAddress,
            country: event.country,
            userAgent: event.userAgent,
            success: event.success,
            reason: event.reason,
            createdAt: event.createdAt,
          };
        });

        res.json(response);
      } catch (error) {
        res.status(500).json({ error: "Failed to load access log" });
      }
    }
  );

  app.patch(
    "/api/users/:id/role",
    requireAuth,
    requireRole("obispo", "consejero_obispo", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({ error: "Role is required" });
      }

      const user = await storage.updateUser(id, { role });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  app.post(
    "/api/user-deletion-requests",
    requireAuth,
    requireRole("obispo", "secretario", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
      try {
        const { userId, reason } = req.body;
        if (!userId) {
          return res.status(400).json({ error: "userId is required" });
        }

        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const pendingRequests = await storage.getPendingUserDeletionRequests();
        const alreadyPending = pendingRequests.some((request) => request.userId === userId);
        if (alreadyPending) {
          return res.status(409).json({ error: "Deletion request already pending" });
        }

        const requesterId = req.session.userId!;
        const request = await storage.createUserDeletionRequest({
          userId,
          requestedBy: requesterId,
          reason: reason || null,
        });

        res.status(201).json(request);
      } catch (error) {
        res.status(500).json({ error: "Failed to create deletion request" });
      }
    }
  );

  app.get(
    "/api/user-deletion-requests",
    requireAuth,
    requireRole("obispo"),
    async (req: Request, res: Response) => {
      try {
        const requests = await storage.getPendingUserDeletionRequests();
        res.json(requests);
      } catch (error) {
        res.status(500).json({ error: "Failed to load deletion requests" });
      }
    }
  );

  app.post(
    "/api/user-deletion-requests/:id/approve",
    requireAuth,
    requireRole("obispo"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { cleanAll } = req.body ?? {};
        const request = await storage.getUserDeletionRequest(id);
        if (!request) {
          return res.status(404).json({ error: "Deletion request not found" });
        }
        if (request.status !== "pendiente") {
          return res.status(409).json({ error: "Deletion request already resolved" });
        }

        const summary = await storage.getUserDeletionSummary(request.userId);
        const hasDependencies = Object.values(summary).some((count) => count > 0);
        if (hasDependencies && !cleanAll) {
          return res.status(409).json({ error: "User has related records", summary });
        }

        const user = await storage.getUser(request.userId);
        if (user) {
          await removeAutoCallingForUser(user);
        }

        await storage.deleteUserWithCleanup(request.userId);

        res.status(200).json({ message: "User deleted" });
      } catch (error) {
        console.error("Error approving deletion request:", error);
        res.status(500).json({ error: "Failed to approve deletion request" });
      }
    }
  );

  app.delete(
    "/api/users/:id",
    requireAuth,
    requireRole("obispo"),
    async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const cleanAll = req.query.cleanAll === "true";
      const pendingRequests = await storage.getPendingUserDeletionRequests();
      const hasRequest = pendingRequests.some((request) => request.userId === id);
      if (!hasRequest) {
        return res.status(409).json({ error: "Deletion request required" });
      }
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const summary = await storage.getUserDeletionSummary(id);
      const hasDependencies = Object.values(summary).some((count) => count > 0);

      if (hasDependencies && !cleanAll) {
        return res.status(409).json({
          error: "User has related records",
          summary,
        });
      }

      await removeAutoCallingForUser(user);

      if (cleanAll) {
        await storage.deleteUserWithCleanup(id);
      } else {
        await storage.deleteUser(id);
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.get(
    "/api/users/:id/delete-summary",
    requireAuth,
    requireRole("obispo", "secretario", "secretario_ejecutivo"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const user = await storage.getUser(id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        const summary = await storage.getUserDeletionSummary(id);
        res.json(summary);
      } catch (error) {
        res.status(500).json({ error: "Failed to load deletion summary" });
      }
    }
  );

  // ========================================
  // SACRAMENTAL MEETINGS
  // ========================================

  app.get("/api/sacramental-meetings", requireAuth, async (req: Request, res: Response) => {
    try {
      const meetings = await storage.getAllSacramentalMeetings();
      res.json(meetings);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const notifySacramentalParticipants = async (
    meeting: any,
    options?: {
      reminderType?: "midweek" | "day_before";
      totalDiscourseCount?: number;
    }
  ) => {
    const users = await storage.getAllUsers();
    const members = await storage.getAllMembers();
    const template = await storage.getPdfTemplate();
    const wardName = template?.wardName;
    const sacramentMeetingTime = template?.sacramentMeetingTime;
    const rolesByName = buildSacramentalRoleEntries(meeting, options?.totalDiscourseCount);

    const roleEntries = Array.from(rolesByName.entries());
    let sentCount = 0;
    let skippedWithoutEmail = 0;
    let failedCount = 0;

    for (const [normalizedName, entries] of roleEntries) {
      const normalizedNameSignature = buildTokenSignature(normalizedName);

      const matchedUser = users.find((u) => normalizeComparableName(u.name) === normalizedName)
        || users.find((u) => buildTokenSignature(u.name) === normalizedNameSignature)
        || findBestNameMatch(normalizedName, users, (u) => u.name);

      const memberByName = members.find((m) => normalizeComparableName(m.nameSurename) === normalizedName)
        || members.find((m) => buildTokenSignature(m.nameSurename) === normalizedNameSignature)
        || findBestNameMatch(normalizedName, members, (m) => m.nameSurename);

      const matchedUserEmail = matchedUser?.email?.toLowerCase();
      const memberByUserEmail = matchedUserEmail
        ? members.find((m) => (m.email || "").toLowerCase() === matchedUserEmail)
        : undefined;
      const member = memberByName || memberByUserEmail;

      const toEmail = member?.email || matchedUser?.email;
      const recipientName = shortName(member) || shortName(matchedUser) || shortNameFromString(normalizedName);

      if (!toEmail) {
        skippedWithoutEmail += entries.length;
        console.warn("[Sacramental Emails] Skipping participant without email", {
          participant: recipientName || normalizedName,
          entries: entries.map((entry) => entry.kind),
          meetingId: meeting?.id,
          meetingDate: String(meeting?.date || ""),
        });
        continue;
      }

      const organizationType = member?.organizationId
        ? (await storage.getOrganization(member.organizationId))?.type
        : undefined;
      const { dateLabel, timeLabel } = formatMeetingLabels(meeting.date, sacramentMeetingTime);

      for (const entry of entries) {
        try {
          await sendSacramentalAssignmentEmail({
            toEmail,
            recipientName,
            meetingDate: dateLabel,
            meetingTime: timeLabel,
            wardName,
            recipientSex: member?.sex,
            recipientOrganizationType: organizationType,
            assignmentKind: entry.kind,
            topic: entry.topic,
            assignmentLabel: entry.assignmentLabel,
            suggestedMinutes: entry.suggestedMinutes,
            reminderType: options?.reminderType,
          });
          sentCount += 1;
        } catch (error) {
          failedCount += 1;
          console.error("[Sacramental Emails] Failed to send email", {
            participant: recipientName || normalizedName,
            toEmail,
            kind: entry.kind,
            meetingId: meeting?.id,
            meetingDate: String(meeting?.date || ""),
            error,
          });
        }
      }
    }

    console.log("[Sacramental Emails] Dispatch result", {
      sentCount,
      skippedWithoutEmail,
      failedCount,
      reminderType: options?.reminderType || "initial",
      meetingId: meeting?.id,
      meetingDate: String(meeting?.date || ""),
    });
  };

  app.post("/api/sacramental-meetings", requireAuth, async (req: Request, res: Response) => {
    try {
      const dataToValidate = {
        ...req.body,
        createdBy: req.session.userId,
      };

      const meetingData = insertSacramentalMeetingSchema.parse(dataToValidate);

      const meeting = await storage.createSacramentalMeeting(meetingData);

      try {
        await notifySacramentalParticipants(meeting);
      } catch (notificationError) {
        console.error("[Sacramental Emails] Failed to notify participants after meeting creation", {
          meetingId: meeting?.id,
          meetingDate: String(meeting?.date || ""),
          error: notificationError,
        });
      }

      res.status(201).json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/sacramental-meetings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentMeeting = await storage.getSacramentalMeeting(id);
      if (!currentMeeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }
      const meetingData = insertSacramentalMeetingSchema.partial().parse(req.body);

      const meeting = await storage.updateSacramentalMeeting(id, meetingData);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }

      // Notify only participants that are NEW compared to the previous version
      try {
        const diffMeeting = diffSacramentalParticipants(currentMeeting, meeting);
        const hasNewParticipants =
          diffMeeting.openingPrayer ||
          diffMeeting.closingPrayer ||
          (diffMeeting.discourses?.length ?? 0) > 0 ||
          (diffMeeting.assignments?.length ?? 0) > 0;

        if (hasNewParticipants) {
          const fullDiscourseCount = [
            ...(meeting.discourses || []),
            ...(meeting.messages || []),
          ].filter((d: any) => extractParticipantName(d?.speaker)).length;
          await notifySacramentalParticipants(diffMeeting, { totalDiscourseCount: fullDiscourseCount });
        }
      } catch (notificationError) {
        console.error("[Sacramental Emails] Failed to notify new participants after meeting update", {
          meetingId: meeting?.id,
          meetingDate: String(meeting?.date || ""),
          error: notificationError,
        });
      }

      res.json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Manual trigger: process releases and sustainments for today's meeting(s)
  app.post("/api/sacramental-meetings/process-releases", requireAuth, async (req: Request, res: Response) => {
    try {
      const todayMeetings = await db
        .select()
        .from(sacramentalMeetingsTable)
        .where(sql`DATE(${sacramentalMeetingsTable.date}) = CURRENT_DATE`);

      const released: { name: string; calling: string; found: boolean }[] = [];
      const sustained: { name: string; calling: string; memberFound: boolean; alreadyExisted: boolean }[] = [];

      for (const meeting of todayMeetings) {
        // Process releases
        const releases = (meeting.releases as { name: string; oldCalling: string; organizationId?: string }[]) ?? [];
        for (const release of releases) {
          if (!release.organizationId || !release.oldCalling) continue;
          const [found] = await db
            .select({ id: memberCallings.id })
            .from(memberCallings)
            .where(and(
              eq(memberCallings.organizationId, release.organizationId),
              sql`lower(${memberCallings.callingName}) = lower(${release.oldCalling})`,
              eq(memberCallings.isActive, true),
            ));
          if (found) {
            await db.delete(memberCallings).where(eq(memberCallings.id, found.id));
            released.push({ name: release.name, calling: release.oldCalling, found: true });
          } else {
            released.push({ name: release.name, calling: release.oldCalling, found: false });
          }
        }

        // Process sustainments
        const sustainments = (meeting.sustainments as { name: string; calling: string; organizationId?: string }[]) ?? [];
        for (const sustainment of sustainments) {
          if (!sustainment.organizationId || !sustainment.calling || !sustainment.name) continue;

          const [member] = await db
            .select({ id: members.id })
            .from(members)
            .where(and(
              eq(members.organizationId, sustainment.organizationId),
              sql`lower(${members.nameSurename}) = lower(${sustainment.name})`,
            ));
          if (!member) {
            sustained.push({ name: sustainment.name, calling: sustainment.calling, memberFound: false, alreadyExisted: false });
            continue;
          }

          const [existing] = await db
            .select({ id: memberCallings.id })
            .from(memberCallings)
            .where(and(
              eq(memberCallings.memberId, member.id),
              eq(memberCallings.organizationId, sustainment.organizationId),
              sql`lower(${memberCallings.callingName}) = lower(${sustainment.calling})`,
              eq(memberCallings.isActive, true),
            ));
          if (existing) {
            sustained.push({ name: sustainment.name, calling: sustainment.calling, memberFound: true, alreadyExisted: true });
            continue;
          }

          await db.insert(memberCallings).values({
            id: sql`gen_random_uuid()`,
            memberId: member.id,
            organizationId: sustainment.organizationId,
            callingName: sustainment.calling,
            isActive: true,
            startDate: new Date(),
          });
          sustained.push({ name: sustainment.name, calling: sustainment.calling, memberFound: true, alreadyExisted: false });
        }
      }
      res.json({ released, sustained });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/sacramental-meetings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteSacramentalMeeting(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // WARD COUNCILS
  // ========================================

  app.get("/api/ward-councils", requireAuth, async (req: Request, res: Response) => {
    try {
      const councils = await storage.getAllWardCouncils();
      res.json(councils);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/ward-councils", requireAuth, async (req: Request, res: Response) => {
    try {
      const councilData = insertWardCouncilSchema.parse({
        ...req.body,
        createdBy: req.session.userId,
      });
      const council = await storage.createWardCouncil(councilData);
      res.status(201).json(council);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/ward-councils/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const councilData = insertWardCouncilSchema.partial().parse(req.body);

      const council = await storage.updateWardCouncil(id, councilData);
      if (!council) {
        return res.status(404).json({ error: "Council not found" });
      }

      const currentUser = (req as any).user;
      const updaterName = shortName(currentUser) || "Un usuario";
      const allUsers = await storage.getAllUsers();
      const councilRoles = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
        "presidente_organizacion",
        "consejero_organizacion",
        "secretario_organizacion",
      ];
      const recipients = new Set<string>(
        allUsers.filter((user: any) => councilRoles.includes(user.role)).map((user: any) => user.id)
      );
      recipients.delete(req.session.userId!);

      const councilDate = new Date(council.date).toLocaleDateString("es-ES");

      for (const userId of recipients) {
        const notification = await storage.createNotification({
          userId,
          type: "reminder",
          title: "Consejo de barrio actualizado",
          description: `${updaterName} actualizó el consejo de barrio del ${councilDate}.`,
          relatedId: council.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(userId, {
            title: "Consejo de barrio actualizado",
            body: `${updaterName} actualizó el consejo de barrio del ${councilDate}.`,
            url: "/ward-council",
            notificationId: notification.id,
          });
        }
      }

      res.json(council);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/ward-councils/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteWardCouncil(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // PRESIDENCY MEETINGS
  // ========================================

  app.get("/api/presidency-meetings/:organizationId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      if (organizationId) {
        const meetings = await storage.getPresidencyMeetingsByOrganization(organizationId);
        return res.json(meetings);
      }
      res.status(400).json({ error: "Organization ID required" });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/presidency-meetings", requireAuth, async (req: Request, res: Response) => {
    try {
      const meetingData = insertPresidencyMeetingSchema.parse({
        ...req.body,
        createdBy: req.session.userId,
      });
      const meeting = await storage.createPresidencyMeeting(meetingData);
      res.status(201).json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/presidency-meetings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const meetingData = insertPresidencyMeetingSchema.partial().parse(req.body);

      const meeting = await storage.updatePresidencyMeeting(id, meetingData);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }

      res.json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/presidency-meetings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
      
      // Get the meeting to check organization
      const meeting = await storage.getPresidencyMeeting(id);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }
      
      // Obispado can delete any meeting
      // Organization members can only delete meetings for their organization
      if (!isObispado && (!isOrgMember || meeting.organizationId !== user.organizationId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      await storage.deletePresidencyMeeting(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });


  // ========================================
  // PRESIDENCY RESOURCES LIBRARY
  // ========================================

  app.get("/api/presidency-resources", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const requestedOrganizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
      const category = z.enum(["manuales", "plantillas", "capacitacion"]).optional().parse(
        typeof req.query.category === "string" ? req.query.category : undefined
      );
      const isOrgRole = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(user.role);

      if (isOrgRole) {
        const organizationId = user.organizationId;
        if (!organizationId) {
          return res.json([]);
        }

        const resources = await storage.getPresidencyResources({ organizationId, category });
        return res.json(resources);
      }

      if (requestedOrganizationId) {
        const resources = await storage.getPresidencyResources({ organizationId: requestedOrganizationId, category });
        return res.json(resources);
      }

      const resources = await storage.getPresidencyResources({ category });
      res.json(resources);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/presidency-resources", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!RESOURCES_LIBRARY_ADMIN_ROLES.has(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const payload = insertPresidencyResourceSchema
        .pick({
          placeholderName: true,
          description: true,
          fileName: true,
          fileUrl: true,
          category: true,
          resourceType: true,
          organizationId: true,
        })
        .extend({
          organizationId: z.string().uuid().optional().nullable(),
        })
        .parse(req.body);

      const resource = await storage.createPresidencyResource({
        ...payload,
        title: payload.placeholderName,
        organizationId: payload.organizationId ?? null,
        createdBy: req.session.userId!,
      });

      res.status(201).json(resource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/presidency-resources/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!RESOURCES_LIBRARY_ADMIN_ROLES.has(user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const resource = await storage.getPresidencyResource(req.params.id);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      await storage.deletePresidencyResource(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // BUDGET REQUESTS
  // ========================================

  app.get("/api/budget-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const requests = await storage.getAllBudgetRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/budget-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !BUDGET_REQUESTER_ROLES.has(user.role)) {
        return res.status(403).json({ error: "No tienes permisos para solicitar presupuestos" });
      }

      const overdueAssignments = await storage.getOverdueBudgetReceiptAssignments(user.id);
      if (overdueAssignments.length > 0) {
        const activeException = await storage.getActiveBudgetUnlockException(user.id);
        if (!activeException) {
          const budgetRequests = await storage.getAllBudgetRequests();
          const details = overdueAssignments.map((assignment: any) => {
            const relatedBudgetId = assignment.relatedTo?.startsWith("budget:")
              ? assignment.relatedTo.replace("budget:", "")
              : null;
            const relatedRequest = relatedBudgetId
              ? budgetRequests.find((request: any) => request.id === relatedBudgetId)
              : null;

            return {
              assignmentId: assignment.id,
              title: relatedRequest?.description || assignment.title,
              amount: relatedRequest?.amount || null,
              activityDate: relatedRequest?.activityDate || null,
              dueDate: assignment.dueDate,
            };
          });

          return res.status(409).json({
            error: "Tienes comprobantes vencidos. No puedes solicitar nuevos presupuestos hasta resolverlos.",
            code: "OVERDUE_BUDGET_RECEIPTS",
            overdueAssignments: details,
          });
        }
      }

      const normalizedActivityDate = normalizeBudgetRequestActivityDate(req.body?.activityDate);
      if (normalizedActivityDate === undefined) {
        return res.status(400).json({ error: [{ path: ["activityDate"], message: "Fecha inválida" }] });
      }

      const organizations = await storage.getAllOrganizations();
      const requestedOrganizationId = typeof req.body?.organizationId === "string"
        ? req.body.organizationId
        : undefined;

      let effectiveOrganizationId: string | null = null;
      if (OBISPADO_ROLES.has(user.role)) {
        if (!requestedOrganizationId) {
          return res.status(400).json({
            error: [{ path: ["organizationId"], message: "Debes seleccionar la organización a nombre de la cual se solicita el presupuesto." }],
          });
        }

        const organizationExists = organizations.some((org) => org.id === requestedOrganizationId && org.type !== "barrio");
        if (!organizationExists) {
          return res.status(400).json({
            error: [{ path: ["organizationId"], message: "La organización seleccionada no es válida." }],
          });
        }

        effectiveOrganizationId = requestedOrganizationId;
      } else {
        effectiveOrganizationId = user.organizationId ?? null;
      }

      const requestData = insertBudgetRequestSchema.parse({
        ...req.body,
        organizationId: effectiveOrganizationId,
        activityDate: normalizedActivityDate,
        requestedBy: user.id,
      });
      const budgetRequest = await storage.createBudgetRequest(requestData);

      // Notify obispado about new budget request
      const allUsers = await storage.getAllUsers();
      const obispadoMembers = allUsers.filter((u: any) =>
        u.role === "obispo" || u.role === "consejero_obispo" || u.role === "secretario_financiero"
      );

      for (const member of obispadoMembers) {
        if (member.id !== user.id) {
          const notification = await storage.createNotification({
            userId: member.id,
            type: "reminder",
            title: "Nueva Solicitud de Presupuesto",
            description: `${shortName(user) || "Un usuario"} solicita €${budgetRequest.amount} para "${budgetRequest.description}"`,
            relatedId: budgetRequest.id,
            isRead: false,
          });

          if (isPushConfigured()) {
            await sendPushNotification(member.id, {
              title: "Nueva Solicitud de Presupuesto",
              body: `${shortName(user) || "Un usuario"} solicita €${budgetRequest.amount} para "${budgetRequest.description}"`,
              url: `/budget?highlight=${encodeURIComponent(budgetRequest.id)}`,
              notificationId: notification.id,
            });
          }
        }
      }

      res.status(201).json(budgetRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/budget-requests/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const hasActivityDate = Object.prototype.hasOwnProperty.call(req.body ?? {}, "activityDate");
      const normalizedActivityDate = hasActivityDate
        ? normalizeBudgetRequestActivityDate(req.body?.activityDate)
        : undefined;

      if (hasActivityDate && normalizedActivityDate === undefined) {
        return res.status(400).json({ error: [{ path: ["activityDate"], message: "Fecha inválida" }] });
      }

      const requestData = insertBudgetRequestSchema.partial().parse({
        ...req.body,
        ...(hasActivityDate ? { activityDate: normalizedActivityDate } : {}),
      });

      const budgetRequest = await storage.updateBudgetRequest(id, requestData);
      if (!budgetRequest) {
        return res.status(404).json({ error: "Budget request not found" });
      }

      if (requestData.receipts && requestData.receipts.length > 0) {
        const assignments = await storage.getAllAssignments();
        const relatedAssignment = assignments.find(
          (assignment: any) =>
            assignment.relatedTo === `budget:${id}` &&
            assignment.title === "Adjuntar comprobantes de gasto" &&
            assignment.status !== "completada"
        );

        if (relatedAssignment) {
          await storage.updateAssignment(relatedAssignment.id, {
            status: "completada",
            archivedAt: new Date(),
          });

          const currentUser = (req as any).user;
          const completerName = shortName(currentUser) || "La persona asignada";
          const allUsers = await storage.getAllUsers();
          const obispadoMembers = allUsers.filter((member: any) =>
            ["obispo", "consejero_obispo", "secretario_financiero"].includes(member.role)
          );
          const recipients = new Set<string>([
            ...obispadoMembers.map((member: any) => member.id),
            relatedAssignment.assignedBy,
          ]);
          recipients.delete(relatedAssignment.assignedTo);

          for (const userId of recipients) {
            const notification = await storage.createNotification({
              userId,
              type: "reminder",
              title: "Comprobantes adjuntados",
              description: `${completerName} completó la asignación "${relatedAssignment.title}" para la solicitud "${budgetRequest.description}".`,
              relatedId: budgetRequest.id,
              isRead: false,
            });

            if (isPushConfigured()) {
              await sendPushNotification(userId, {
                title: "Comprobantes adjuntados",
                body: `${completerName} completó la asignación "${relatedAssignment.title}".`,
                url: `/budget?highlight=${encodeURIComponent(budgetRequest.id)}`,
                notificationId: notification.id,
              });
            }
          }
        }
      }

      const currentUser = (req as any).user;
      const updaterName = shortName(currentUser) || "Un usuario";
      const allUsers = await storage.getAllUsers();
      const obispadoMembers = allUsers.filter((member: any) =>
        ["obispo", "consejero_obispo", "secretario_financiero"].includes(member.role)
      );
      const recipients = new Set<string>([
        ...obispadoMembers.map((member: any) => member.id),
        budgetRequest.requestedBy,
      ]);
      recipients.delete(req.session.userId!);

      for (const userId of recipients) {
        const notification = await storage.createNotification({
          userId,
          type: "reminder",
          title: "Solicitud de presupuesto actualizada",
          description: `${updaterName} actualizó la solicitud "${budgetRequest.description}".`,
          relatedId: budgetRequest.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(userId, {
            title: "Solicitud de presupuesto actualizada",
            body: `${updaterName} actualizó la solicitud "${budgetRequest.description}".`,
            url: `/budget?highlight=${encodeURIComponent(budgetRequest.id)}`,
            notificationId: notification.id,
          });
        }
      }

      res.json(budgetRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/budget-requests/:id/approve", requireAuth, requireRole("obispo", "consejero_obispo", "secretario_financiero"), async (req: Request, res: Response) => {
    try {
      const actor = (req as any).user;
      if (!actor || !BUDGET_APPROVER_ROLES.has(actor.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { id } = req.params;
      const existingRequest = await storage.getBudgetRequest(id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Budget request not found" });
      }

      if (existingRequest.status !== "solicitado") {
        return res.status(400).json({ error: "Solo se pueden aprobar financieramente solicitudes en estado solicitado" });
      }

      const budgetRequest = await storage.approveBudgetRequestFinancial(id, req.session.userId!);
      if (!budgetRequest) {
        return res.status(404).json({ error: "Budget request not found" });
      }

      const allUsers = await storage.getAllUsers();
      const bishop = allUsers.find((member: any) => member.role === "obispo");

      if (bishop) {
        const assignment = await storage.createAssignment({
          title: "Firmar solicitud de gasto",
          description: `Firma la solicitud de gasto "${budgetRequest.description}" por €${budgetRequest.amount}.`,
          assignedTo: bishop.id,
          assignedBy: req.session.userId!,
          dueDate: budgetRequest.activityDate ? new Date(budgetRequest.activityDate) : new Date(),
          relatedTo: `budget:${budgetRequest.id}`,
        });

        const bishopNotification = await storage.createNotification({
          userId: bishop.id,
          type: "assignment_created",
          title: "Nueva Asignación",
          description: `Se te ha asignado: "${assignment.title}"`,
          relatedId: assignment.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(bishop.id, {
            title: "Nueva Asignación",
            body: `Se te ha asignado: "${assignment.title}"`,
            url: "/assignments",
            notificationId: bishopNotification.id,
          });
        }
      }

      if (budgetRequest.requestedBy) {
        const requesterNotification = await storage.createNotification({
          userId: budgetRequest.requestedBy,
          type: "budget_approved",
          title: "Aprobación financiera en proceso",
          description: `Tu solicitud "${budgetRequest.description}" está pendiente de firma del obispo.`,
          relatedId: budgetRequest.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(budgetRequest.requestedBy, {
            title: "Aprobación financiera en proceso",
            body: `Tu solicitud "${budgetRequest.description}" está pendiente de firma del obispo.`,
            url: `/budget?highlight=${encodeURIComponent(budgetRequest.id)}`,
            notificationId: requesterNotification.id,
          });
        }
      }

      res.json(budgetRequest);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/budget-requests/:id/sign", requireAuth, requireRole("obispo"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const signatureSchema = z.object({
        signatureDataUrl: z.string().min(20, "Firma requerida"),
        signerName: z.string().trim().min(3, "Nombre del obispo requerido"),
      });
      const { signatureDataUrl, signerName } = signatureSchema.parse(req.body);

      const existingRequest = await storage.getBudgetRequest(id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Budget request not found" });
      }

      if (existingRequest.status !== "pendiente_firma_obispo") {
        return res.status(400).json({ error: "La solicitud no está pendiente de firma del obispo" });
      }

      if (!existingRequest.applicantSignatureDataUrl) {
        return res.status(400).json({ error: "La solicitud no contiene la firma del solicitante" });
      }

      const requesterUser = await storage.getUser(existingRequest.requestedBy);
      const allOrganizations = await storage.getAllOrganizations();
      const orgName = allOrganizations.find((o: any) => o.id === existingRequest.organizationId)?.name ?? "";
      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;

      const budgetCategories = (existingRequest.budgetCategoriesJson as { category: string; amount: string; detail?: string }[] | null) ?? [];
      // Fallback para solicitudes antiguas sin budgetCategoriesJson
      const effectiveCategories = budgetCategories.length > 0
        ? budgetCategories
        : [{ category: existingRequest.category ?? "otros", amount: String(existingRequest.amount ?? 0) }];

      const hasReceiptAttached = (existingRequest.receipts || []).some(
        (r: any) => r?.category === "bank_justificante",
      );

      const pdfBuffer = await generateBudgetRequestPdf({
        data: {
          description: existingRequest.description,
          requestType: (existingRequest.requestType as string) ?? "pago_adelantado",
          activityDate: existingRequest.activityDate ? new Date(existingRequest.activityDate) : null,
          budgetCategories: effectiveCategories,
          pagarA: existingRequest.pagarA,
          bankData: existingRequest.bankData as { bankInSystem: boolean; swift?: string; iban?: string } | null,
          notes: existingRequest.notes,
          hasReceiptAttached,
        },
        requesterName: requesterUser?.name ?? "Solicitante",
        organizationName: orgName,
        applicantSignatureDataUrl: existingRequest.applicantSignatureDataUrl,
        bishopSignatureDataUrl: signatureDataUrl,
        signerName,
        wardName,
      });

      const signedStoredFilename = `${randomUUID()}-solicitud-firmada.pdf`;
      const signedAbsolutePath = path.join(uploadsPath, signedStoredFilename);
      console.log("[sign] Writing PDF to:", signedAbsolutePath);
      await fs.promises.writeFile(signedAbsolutePath, pdfBuffer);
      console.log("[sign] PDF written OK, size:", pdfBuffer.length);

      const signedPlanFilename = "solicitud-firmada.pdf";
      const signedPlanUrl = `/uploads/${signedStoredFilename}`;

      const budgetRequest = await storage.approveBudgetRequestBishop(id, req.session.userId!, {
        dataUrl: signatureDataUrl,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        signedPlanFilename,
        signedPlanUrl,
      });

      if (!budgetRequest) {
        return res.status(404).json({ error: "Budget request not found" });
      }

      const allAssignments = await storage.getAllAssignments();
      const signAssignments = allAssignments.filter(
        (assignment: any) =>
          assignment.relatedTo === `budget:${budgetRequest.id}` &&
          assignment.status !== "archivada" &&
          assignment.title?.toLowerCase().includes("firmar solicitud de gasto")
      );

      for (const signAssignment of signAssignments) {
        await storage.updateAssignment(signAssignment.id, {
          status: "archivada",
          resolution: "completada",
          archivedAt: new Date(),
          notes: [
            signAssignment.notes,
            `Completada automáticamente al firmar la solicitud el ${new Date().toLocaleString("es-ES")}.`,
          ]
            .filter(Boolean)
            .join("\n"),
        });
      }

      const isReimbursementRequest = (budgetRequest.receipts || []).some(
        (receipt: any) => receipt?.category === "receipt"
      );

      if (!isReimbursementRequest) {
        const dueDate = budgetRequest.activityDate ? new Date(budgetRequest.activityDate) : new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const assignment = await storage.createAssignment({
          title: "Adjuntar comprobantes de gasto",
          description: `Adjunta los comprobantes de gasto para la solicitud "${budgetRequest.description}" por €${budgetRequest.amount}.`,
          assignedTo: budgetRequest.requestedBy,
          assignedBy: req.session.userId!,
          dueDate,
          relatedTo: `budget:${budgetRequest.id}`,
        });

        const receiptNotification = await storage.createNotification({
          userId: budgetRequest.requestedBy,
          type: "assignment_created",
          title: "Nueva Asignación",
          description: `Se te ha asignado: "${assignment.title}"`,
          relatedId: budgetRequest.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(budgetRequest.requestedBy, {
            title: "Nueva Asignación",
            body: `Se te ha asignado: "${assignment.title}"`,
            url: `/budget?highlight=${encodeURIComponent(budgetRequest.id)}`,
            notificationId: receiptNotification.id,
          });
        }
      }

      const approvalNotification = await storage.createNotification({
        userId: budgetRequest.requestedBy,
        type: "budget_approved",
        title: "Aprobación financiera completada",
        description: `Se ha aprobado y firmado tu solicitud "${budgetRequest.description}".`,
        relatedId: budgetRequest.id,
        isRead: false,
      });

      if (isPushConfigured()) {
        await sendPushNotification(budgetRequest.requestedBy, {
          title: "Aprobación financiera completada",
          body: `Se ha aprobado y firmado tu solicitud "${budgetRequest.description}".`,
          url: `/budget?highlight=${encodeURIComponent(budgetRequest.id)}`,
          notificationId: approvalNotification.id,
        });
      }

      // Create disbursement assignment for secretario_financiero + notify
      const allUsers = await storage.getAllUsers();
      const financialSecretary = allUsers.find((u: any) => u.role === "secretario_financiero");
      if (financialSecretary) {
        const disbursementDue = new Date();
        disbursementDue.setDate(disbursementDue.getDate() + 1);

        const disbursementAssignment = await storage.createAssignment({
          title: "Generar desembolso en el sistema de la Iglesia",
          description: `El obispo ha firmado la solicitud "${budgetRequest.description}" por €${budgetRequest.amount}. Genera el desembolso en el sistema de la Iglesia (LCR/MLS Finance) y marca esta asignación como completada.`,
          assignedTo: financialSecretary.id,
          assignedBy: req.session.userId!,
          dueDate: disbursementDue,
          relatedTo: `budget:${budgetRequest.id}`,
        });

        const disbursementNotification = await storage.createNotification({
          userId: financialSecretary.id,
          type: "assignment_created",
          title: "Nueva Asignación",
          description: `Se te ha asignado: "${disbursementAssignment.title}"`,
          relatedId: disbursementAssignment.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(financialSecretary.id, {
            title: "Solicitud de gasto aprobada",
            body: `El obispo firmó la solicitud "${budgetRequest.description}". Genera el desembolso en el sistema de la Iglesia.`,
            url: `/assignments?highlight=${encodeURIComponent(disbursementAssignment.id)}`,
            notificationId: disbursementNotification.id,
          });
        }

        if (financialSecretary.email) {
          const template = await storage.getPdfTemplate();
          const bishop = allUsers.find((u: any) => u.id === req.session.userId!);
          const madridHour = new Date().toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false });
          await sendBudgetDisbursementRequestEmail({
            toEmail: financialSecretary.email,
            recipientName: shortName(financialSecretary),
            recipientSex: financialSecretary.sex ?? null,
            bishopName: shortName(bishop) || "el obispo",
            budgetDescription: budgetRequest.description,
            budgetAmount: budgetRequest.amount,
            wardName: template?.wardName,
            timeLabel: madridHour,
          }).catch((err) => console.error("[BudgetDisbursement email] Error:", err));
        }
      }

      res.json({ ...budgetRequest, signedPlanUrl, signedPlanFilename });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });


  app.post("/api/budget-requests/:id/review", requireAuth, requireRole("obispo"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const payloadSchema = z.object({
        action: z.enum(["rechazar", "enmendar"]),
        reason: z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres"),
      });
      const { action, reason } = payloadSchema.parse(req.body);

      const budgetRequest = await storage.getBudgetRequest(id);
      if (!budgetRequest) {
        return res.status(404).json({ error: "Budget request not found" });
      }

      if (budgetRequest.status !== "pendiente_firma_obispo") {
        return res.status(400).json({ error: "La solicitud no está pendiente de revisión del obispo" });
      }

      const nextStatus = action === "rechazar" ? "rechazada" : "solicitado";
      const updatedRequest = await storage.updateBudgetRequest(id, {
        status: nextStatus as any,
        notes: [
          budgetRequest.notes,
          `${action === "rechazar" ? "Rechazada" : "Devuelta para enmienda"} por obispo: ${reason}`,
        ]
          .filter(Boolean)
          .join("\n"),
      });

      if (!updatedRequest) {
        return res.status(404).json({ error: "Budget request not found" });
      }

      const allAssignments = await storage.getAllAssignments();
      const signAssignment = allAssignments.find(
        (assignment: any) =>
          assignment.relatedTo === `budget:${id}` &&
          assignment.title === "Firmar solicitud de gasto" &&
          ["pendiente", "en_proceso"].includes(assignment.status)
      );

      if (signAssignment) {
        await storage.updateAssignment(signAssignment.id, {
          status: "archivada",
          resolution: "cancelada",
          cancellationReason: reason,
          cancelledAt: new Date(),
          archivedAt: new Date(),
          notes: [
            signAssignment.notes,
            `Cerrada automáticamente por revisión del obispo (${action}): ${reason}`,
          ]
            .filter(Boolean)
            .join("\n"),
        });
      }

      const title = action === "rechazar" ? "Solicitud rechazada por obispo" : "Solicitud devuelta para enmienda";
      const description = action === "rechazar"
        ? `Tu solicitud "${budgetRequest.description}" fue rechazada. Motivo: ${reason}`
        : `Tu solicitud "${budgetRequest.description}" requiere enmiendas. Observación: ${reason}`;

      const notification = await storage.createNotification({
        userId: budgetRequest.requestedBy,
        type: "budget_rejected",
        title,
        description,
        relatedId: budgetRequest.id,
        isRead: false,
      });

      if (isPushConfigured()) {
        await sendPushNotification(budgetRequest.requestedBy, {
          title,
          body: description,
          url: `/budget?highlight=${encodeURIComponent(budgetRequest.id)}`,
          notificationId: notification.id,
        });
      }

      return res.json(updatedRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/budget-requests/unlock-exception", requireAuth, requireRole("obispo"), async (req: Request, res: Response) => {
    try {
      const unlockSchema = z.object({
        userId: z.string().uuid("userId inválido"),
        reason: z.string().trim().min(30, "La justificación debe tener al menos 30 caracteres"),
        expiresAt: z.string().datetime().optional(),
      });

      const payload = unlockSchema.parse(req.body);
      const exception = await storage.createBudgetUnlockException({
        userId: payload.userId,
        reason: payload.reason,
        grantedBy: req.session.userId!,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      });

      res.status(201).json(exception);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/budget-requests/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const id = req.params.id;

      // Get the budget request to verify existence
      const budgetRequest = await storage.getBudgetRequest(id);
      if (!budgetRequest) {
        return res.status(404).json({ error: "Budget request not found" });
      }

      const isPrivileged = user.role === "obispo" || user.role === "consejero_obispo";

      if (isPrivileged) {
        // can delete anything
      } else if (user.role === "presidente_organizacion") {
        if (budgetRequest.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "No tienes permisos para eliminar esta solicitud" });
        }
        if (budgetRequest.status !== "solicitado") {
          return res.status(403).json({ error: "Solo puedes eliminar solicitudes que aún no hayan sido aprobadas" });
        }
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.deleteBudgetRequest(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // WELFARE REQUESTS
  // ========================================

  const WELFARE_REQUESTER_ORGS = new Set(["sociedad_socorro", "cuorum_elderes"]);

  app.get("/api/welfare-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const requests = await storage.getAllWelfareRequests();

      if (user.role === "obispo" || user.role === "secretario_financiero") {
        return res.json(requests);
      }

      // presidente_organizacion of sociedad_socorro or cuorum_elderes
      if (user.role === "presidente_organizacion" && user.organizationId) {
        const allOrgs = await storage.getAllOrganizations();
        const userOrg = allOrgs.find((o: any) => o.id === user.organizationId);
        if (userOrg && WELFARE_REQUESTER_ORGS.has(userOrg.type)) {
          return res.json(requests.filter((r: any) => r.organizationId === user.organizationId));
        }
      }

      return res.status(403).json({ error: "No tienes acceso al módulo de bienestar" });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/welfare-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;

      let effectiveOrganizationId: string | null = null;

      if (user.role === "obispo") {
        effectiveOrganizationId = req.body?.organizationId || null;
      } else if (user.role === "presidente_organizacion" && user.organizationId) {
        const allOrgs = await storage.getAllOrganizations();
        const userOrg = allOrgs.find((o: any) => o.id === user.organizationId);
        if (!userOrg || !WELFARE_REQUESTER_ORGS.has(userOrg.type)) {
          return res.status(403).json({ error: "Solo presidentes de Sociedad de Socorro o Cuórum de Élderes pueden solicitar ayuda de bienestar" });
        }
        effectiveOrganizationId = user.organizationId;
      } else {
        return res.status(403).json({ error: "No tienes permisos para crear solicitudes de bienestar" });
      }

      const normalizedActivityDate = normalizeBudgetRequestActivityDate(req.body?.activityDate);
      if (normalizedActivityDate === undefined) {
        return res.status(400).json({ error: [{ path: ["activityDate"], message: "Fecha inválida" }] });
      }

      const requestData = insertWelfareRequestSchema.parse({
        ...req.body,
        organizationId: effectiveOrganizationId,
        activityDate: normalizedActivityDate,
        requestedBy: user.id,
      });

      const welfareRequest = await storage.createWelfareRequest(requestData);

      // Notify bishop about new welfare request
      const allUsers = await storage.getAllUsers();
      const bishop = allUsers.find((u: any) => u.role === "obispo");
      if (bishop && bishop.id !== user.id) {
        const notification = await storage.createNotification({
          userId: bishop.id,
          type: "reminder",
          title: "Nueva Solicitud de Bienestar",
          description: `${shortName(user) || "Un usuario"} solicita €${welfareRequest.amount} — "${welfareRequest.description}"`,
          relatedId: welfareRequest.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(bishop.id, {
            title: "Nueva Solicitud de Bienestar",
            body: `${shortName(user) || "Un usuario"} solicita €${welfareRequest.amount} — "${welfareRequest.description}"`,
            url: `/welfare?highlight=${encodeURIComponent(welfareRequest.id)}`,
            notificationId: notification.id,
          });
        }
      }

      res.status(201).json(welfareRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/welfare-requests/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const hasActivityDate = Object.prototype.hasOwnProperty.call(req.body ?? {}, "activityDate");
      const normalizedActivityDate = hasActivityDate
        ? normalizeBudgetRequestActivityDate(req.body?.activityDate)
        : undefined;

      if (hasActivityDate && normalizedActivityDate === undefined) {
        return res.status(400).json({ error: [{ path: ["activityDate"], message: "Fecha inválida" }] });
      }

      const requestData = insertWelfareRequestSchema.partial().parse({
        ...req.body,
        ...(hasActivityDate ? { activityDate: normalizedActivityDate } : {}),
      });

      const welfareRequest = await storage.updateWelfareRequest(id, requestData);
      if (!welfareRequest) {
        return res.status(404).json({ error: "Welfare request not found" });
      }

      res.json(welfareRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/welfare-requests/:id/sign", requireAuth, requireRole("obispo"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const signatureSchema = z.object({
        signatureDataUrl: z.string().min(20, "Firma requerida"),
        signerName: z.string().trim().min(3, "Nombre del obispo requerido"),
      });
      const { signatureDataUrl, signerName } = signatureSchema.parse(req.body);

      const existingRequest = await storage.getWelfareRequest(id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Welfare request not found" });
      }

      if (existingRequest.status !== "solicitado") {
        return res.status(400).json({ error: "La solicitud no está en estado solicitado" });
      }

      if (!existingRequest.applicantSignatureDataUrl) {
        return res.status(400).json({ error: "La solicitud no contiene la firma del solicitante" });
      }

      const requesterUser = await storage.getUser(existingRequest.requestedBy);
      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;

      const welfareCategories = (existingRequest.welfareCategoriesJson as { category: string; amount: string; detail?: string }[] | null) ?? [];

      const pdfBuffer = await generateWelfareRequestPdf({
        data: {
          description: existingRequest.description,
          requestType: (existingRequest.requestType as string) ?? "pago_adelantado",
          activityDate: existingRequest.activityDate ? new Date(existingRequest.activityDate) : null,
          welfareCategories,
          pagarA: existingRequest.pagarA,
          favorDe: (existingRequest as any).favorDe ?? null,
          bankData: existingRequest.bankData as { bankInSystem: boolean; swift?: string; iban?: string } | null,
          notes: existingRequest.notes,
          hasReceiptAttached: (existingRequest.receipts || []).some((r: any) => r?.category === "bank_justificante"),
        },
        requesterName: existingRequest.pagarA ?? requesterUser?.name ?? "Solicitante",
        applicantSignatureDataUrl: existingRequest.applicantSignatureDataUrl,
        bishopSignatureDataUrl: signatureDataUrl,
        signerName,
        wardName,
      });

      const signedStoredFilename = `${randomUUID()}-solicitud-bienestar-firmada.pdf`;
      const signedAbsolutePath = path.join(uploadsPath, signedStoredFilename);
      await fs.promises.writeFile(signedAbsolutePath, pdfBuffer);

      const signedPlanFilename = "solicitud-bienestar-firmada.pdf";
      const signedPlanUrl = `/uploads/${signedStoredFilename}`;

      const welfareRequest = await storage.approveWelfareRequestBishop(id, req.session.userId!, {
        dataUrl: signatureDataUrl,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        signedPlanFilename,
        signedPlanUrl,
      });

      if (!welfareRequest) {
        return res.status(404).json({ error: "Welfare request not found" });
      }

      // Create task to attach expense receipts (reembolso already has receipts attached)
      const isReimbursementRequest = welfareRequest.requestType === "reembolso";
      if (!isReimbursementRequest) {
        const dueDate = welfareRequest.activityDate ? new Date(welfareRequest.activityDate) : new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        // If obispo created on behalf of a president (pagarA = president name), assign task to that president
        const requestedByUser = await storage.getUser(welfareRequest.requestedBy);
        let taskAssignTo = welfareRequest.requestedBy;
        if (requestedByUser?.role === "obispo" && welfareRequest.pagarA) {
          const allUsers = await storage.getAllUsers();
          const president = allUsers.find(
            (u: any) => u.name === welfareRequest.pagarA && u.role === "presidente_organizacion"
          );
          if (president) taskAssignTo = president.id;
        }

        const assignment = await storage.createAssignment({
          title: "Adjuntar comprobantes de bienestar",
          description: `Adjunta los comprobantes de gasto para la solicitud de bienestar "${welfareRequest.description}" por €${welfareRequest.amount}.`,
          assignedTo: taskAssignTo,
          assignedBy: req.session.userId!,
          dueDate,
          relatedTo: `welfare:${welfareRequest.id}`,
        });

        const receiptNotification = await storage.createNotification({
          userId: taskAssignTo,
          type: "assignment_created",
          title: "Nueva Asignación",
          description: `Se te ha asignado: "${assignment.title}"`,
          relatedId: welfareRequest.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(taskAssignTo, {
            title: "Nueva Asignación",
            body: `Se te ha asignado: "${assignment.title}"`,
            url: `/welfare?highlight=${encodeURIComponent(welfareRequest.id)}`,
            notificationId: receiptNotification.id,
          });
        }
      }

      // Notify requester
      const approvalNotification = await storage.createNotification({
        userId: welfareRequest.requestedBy,
        type: "budget_approved",
        title: "Solicitud de bienestar aprobada",
        description: `Se ha aprobado y firmado tu solicitud "${welfareRequest.description}".`,
        relatedId: welfareRequest.id,
        isRead: false,
      });

      if (isPushConfigured()) {
        await sendPushNotification(welfareRequest.requestedBy, {
          title: "Solicitud de bienestar aprobada",
          body: `Se ha aprobado y firmado tu solicitud "${welfareRequest.description}".`,
          url: `/welfare?highlight=${encodeURIComponent(welfareRequest.id)}`,
          notificationId: approvalNotification.id,
        });
      }

      res.json({ ...welfareRequest, signedPlanUrl, signedPlanFilename });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/welfare-requests/:id/review", requireAuth, requireRole("obispo"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const payloadSchema = z.object({
        action: z.enum(["rechazar", "enmendar"]),
        reason: z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres"),
      });
      const { action, reason } = payloadSchema.parse(req.body);

      const welfareRequest = await storage.getWelfareRequest(id);
      if (!welfareRequest) {
        return res.status(404).json({ error: "Welfare request not found" });
      }

      if (welfareRequest.status !== "solicitado") {
        return res.status(400).json({ error: "La solicitud no puede revisarse en su estado actual" });
      }

      const nextStatus = action === "rechazar" ? "rechazada" : "solicitado";
      const updatedRequest = await storage.updateWelfareRequest(id, {
        status: nextStatus as any,
        notes: [
          welfareRequest.notes,
          `${action === "rechazar" ? "Rechazada" : "Devuelta para enmienda"} por obispo: ${reason}`,
        ]
          .filter(Boolean)
          .join("\n"),
      });

      if (!updatedRequest) {
        return res.status(404).json({ error: "Welfare request not found" });
      }

      // Notify requester
      const rejectionNotification = await storage.createNotification({
        userId: welfareRequest.requestedBy,
        type: "budget_rejected",
        title: action === "rechazar" ? "Solicitud de bienestar rechazada" : "Solicitud de bienestar devuelta",
        description: `Tu solicitud "${welfareRequest.description}" fue ${action === "rechazar" ? "rechazada" : "devuelta para enmienda"}. Motivo: ${reason}`,
        relatedId: welfareRequest.id,
        isRead: false,
      });

      if (isPushConfigured()) {
        await sendPushNotification(welfareRequest.requestedBy, {
          title: action === "rechazar" ? "Solicitud de bienestar rechazada" : "Solicitud de bienestar devuelta",
          body: `Tu solicitud "${welfareRequest.description}" fue ${action === "rechazar" ? "rechazada" : "devuelta para enmienda"}. Motivo: ${reason}`,
          url: `/welfare?highlight=${encodeURIComponent(welfareRequest.id)}`,
          notificationId: rejectionNotification.id,
        });
      }

      res.json(updatedRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/welfare-requests/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const welfareRequest = await storage.getWelfareRequest(id);
      if (!welfareRequest) {
        return res.status(404).json({ error: "Welfare request not found" });
      }

      if (user.role === "obispo") {
        // obispo can delete anything
      } else if (user.role === "presidente_organizacion") {
        // presidents can only delete their own org's unsigned requests
        if (welfareRequest.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "No tienes permisos para eliminar esta solicitud" });
        }
        if (welfareRequest.status !== "solicitado") {
          return res.status(403).json({ error: "Solo puedes eliminar solicitudes que aún no hayan sido firmadas por el obispo" });
        }
      } else {
        return res.status(403).json({ error: "No tienes permisos para eliminar solicitudes de bienestar" });
      }

      await storage.deleteWelfareRequest(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // INTERVIEWS
  // ========================================

  app.get("/api/interviews", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado =
        user.role === "obispo" ||
        user.role === "consejero_obispo" ||
        user.role === "secretario_ejecutivo";
      const interviews = await storage.getAllInterviews();
      const visibleInterviews = isObispado
        ? interviews
        : interviews.filter(
            (interview) => interview && interview.assignedToId === user.id
          );
      res.json(visibleInterviews);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/interviews", requireAuth, async (req: Request, res: Response) => {
    try {
      const { personName, memberId, ...rest } = req.body;

      let assignedToId: string | undefined;
      let assignedUser: any | undefined;
      let memberEmail: string | null | undefined;
      let memberName: string | undefined;
      let memberSex: string | undefined;
      let memberOrganizationType: string | undefined;
      let resolvedPersonName = personName;
      let resolvedMemberId = memberId;

      if (memberId) {
        const member = await storage.getMemberById(memberId);
        if (!member) {
          return res.status(404).json({ error: "Member not found" });
        }
        resolvedPersonName = member.nameSurename;
        memberName = shortName(member);
        memberEmail = member.email;
        memberSex = member.sex;
        if (member.organizationId) {
          const organization = await storage.getOrganization(member.organizationId);
          memberOrganizationType = organization?.type;
        }
        if (memberEmail) {
          const users = await storage.getAllUsers();
          const matchedUser = users.find(
            (u) => u.email && u.email.toLowerCase() === memberEmail.toLowerCase()
          );
          if (matchedUser) {
            assignedToId = matchedUser.id;
            assignedUser = matchedUser;
          }
        }
      } else if (personName) {
        const users = await storage.getAllUsers();
        const normalizedInput = personName.toLowerCase().trim();

        let foundUser = users.find(
          (u) => u.name.toLowerCase() === normalizedInput
        );

        if (!foundUser) {
          foundUser = users.find(
            (u) =>
              u.name.toLowerCase().includes(normalizedInput) ||
              normalizedInput.includes(u.name.toLowerCase())
          );
        }

        if (foundUser) {
          assignedToId = foundUser.id;
          assignedUser = foundUser;
        }
      } else {
        resolvedMemberId = undefined;
      }
      const requestingUser = await storage.getUser(req.session.userId!);
      
      const interviewData = insertInterviewSchema.parse({
        personName: resolvedPersonName,
        ...rest,
        ...(resolvedMemberId && { memberId: resolvedMemberId }),
        assignedBy: req.session.userId,
        ...(assignedToId && { assignedToId }),
      });

      const interviewer = await storage.getUser(interviewData.interviewerId);
      const interviewerRoleLabel = interviewer?.role
        ? interviewCollisionRoles.get(interviewer.role)
        : undefined;
      if (interviewerRoleLabel) {
        const hasCollision = await hasInterviewCollision({
          interviewerId: interviewData.interviewerId,
          date: interviewData.date,
        });
        if (hasCollision) {
          return res.status(409).json({
            error: `No se puede crear la entrevista porque el ${interviewerRoleLabel}${
              interviewer?.name ? ` ${interviewer.name}` : ""
            } ya tiene otra entrevista confirmada en esa fecha y hora.`,
          });
        }
      }
  
      const interview = await storage.createInterview(interviewData);
      const interviewDateValue = new Date(interview.date);
      const interviewDate = interviewDateValue.toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const interviewTime = interviewDateValue.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const interviewerRoleTitle = formatInterviewerTitle(interviewer?.role);
      const interviewerShortName = shortName(interviewer);
      const interviewerTitle = interviewerShortName
        ? interviewerRoleTitle
          ? `${interviewerRoleTitle} ${interviewerShortName}`
          : interviewerShortName
        : interviewerRoleTitle || "obispado";
      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;
      const allUsers = await storage.getAllUsers();
      const secretaryExecutive = allUsers.find((u) => u.role === "secretario_ejecutivo");
      const secretaryExecutiveName = secretaryExecutive ? shortName(secretaryExecutive) : null;

      const recipients: Array<{
        email: string;
        name: string;
        sex?: string;
        organizationType?: string;
      }> = [];
      if (memberEmail) {
        recipients.push({
          email: memberEmail,
          name: memberName || resolvedPersonName,
          sex: memberSex,
          organizationType: memberOrganizationType,
        });
      }
      if (assignedUser?.email) {
        recipients.push({
          email: assignedUser.email,
          name: shortName(assignedUser),
        });
      }

      for (const recipient of recipients) {
        await sendInterviewScheduledEmail({
          toEmail: recipient.email,
          recipientName: recipient.name,
          interviewerName: interviewerTitle,
          interviewerRole: interviewer?.role,
          interviewDate,
          interviewTime,
          interviewType: interview.type,
          notes: rest.notes,
          wardName,
          recipientSex: recipient.sex,
          recipientOrganizationType: recipient.organizationType,
          secretaryName: secretaryExecutiveName,
        });
      }
  
      // 🔔 Notificar entrevistador
      await storage.createNotification({
        userId: interview.interviewerId,
        type: "upcoming_interview",
        title: "Entrevista Programada",
        description: `Tienes una entrevista programada para el ${new Date(
          interview.date
        ).toLocaleDateString("es-ES")}`,
        relatedId: interview.id,
        eventDate: interview.date,
        isRead: false,
      });
  
      // 🔔 Notificar entrevistado (si existe usuario)
      if (assignedToId && assignedToId !== interview.interviewerId) {
        const notification = await storage.createNotification({
          userId: assignedToId,
          type: "upcoming_interview",
          title: "Entrevista Programada",
          description: `Tienes una entrevista programada para el ${new Date(
            interview.date
          ).toLocaleDateString("es-ES")}`,
          relatedId: interview.id,
          eventDate: interview.date,
          isRead: false,
        });
    
        if (isPushConfigured()) {
          await sendPushNotification(assignedToId, {
            title: "Entrevista Programada",
            body: `Tienes una entrevista programada`,
            url: `/interviews?highlight=${encodeURIComponent(interview.id)}`,
            notificationId: notification.id,
          });
        }
      }
 
      if (interview.interviewerId) {
        const interviewer = await storage.getUser(interview.interviewerId);
        const interviewDateValue = new Date(interview.date);
        const interviewDate = interviewDateValue.toLocaleDateString("es-ES", {
          year: "numeric",
          month: "2-digit",
          day: "numeric",
        });
        const interviewDateTitle = interviewDateValue.toLocaleDateString("es-ES", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
	const interviewTime = interviewDateValue.toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const assignmentTitle = `Entrevista programada - ${interviewDateTitle}, ${interviewTime} hrs.`;
        const descriptionParts = [
          `Entrevista con ${shortNameFromString(interview.personName)} programada para el ${interviewDate}.`,
          `Entrevistador: ${interviewerShortName || "Obispado"}.`,
        ];
        if (rest.notes) {
          descriptionParts.push(`Notas: ${rest.notes}`);
        }

        await storage.createAssignment({
          title: assignmentTitle,
          description: descriptionParts.join(" "),
          assignedTo: interview.interviewerId,
          assignedBy: req.session.userId!,
          dueDate: interview.date,
          status: "pendiente",
          relatedTo: `interview:${interview.id}`,
        });

        // Evitamos notificación duplicada para entrevistas: ya existe notificación principal de entrevista.
      }

      // 🔔 Si lo solicita una organización, avisar al obispado
      const isOrgMember = [
        "presidente_organizacion",
        "secretario_organizacion",
        "consejero_organizacion",
      ].includes(requestingUser?.role || "");
  
      if (isOrgMember) {
        const users = await storage.getAllUsers();
        const obispadoMembers = users.filter(
          (u) => u.role === "obispo" || u.role === "consejero_obispo"
        );
    
        for (const member of obispadoMembers) {
          const notification = await storage.createNotification({
            userId: member.id,
            type: "upcoming_interview",
            title: "Nueva Solicitud de Entrevista",
            description: `${
              shortName(requestingUser) || shortNameFromString(personName)
            } solicita una entrevista`,
            relatedId: interview.id,
            eventDate: interview.date,
            isRead: false,
          });
      
          if (isPushConfigured()) {
            await sendPushNotification(member.id, {
              title: "Nueva Solicitud de Entrevista",
              body: "Se ha solicitado una entrevista",
              url: `/interviews?highlight=${encodeURIComponent(interview.id)}`,
              notificationId: notification.id,
            });
          }
        }
      }
  
      res.status(201).json(interview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.put("/api/interviews/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentInterview = await storage.getInterview(id);
      if (!currentInterview) {
        return res.status(404).json({ error: "Interview not found" });
      }
      const { personName, memberId, cancellationReason, completionNote, ...rest } = req.body;

      let updateData: any = rest;

      if (memberId !== undefined) {
        if (memberId) {
          const member = await storage.getMemberById(memberId);
          if (!member) {
            return res.status(404).json({ error: "Member not found" });
          }
          updateData.memberId = memberId;
          updateData.personName = member.nameSurename;
          updateData.assignedToId = null;
        } else {
          updateData.memberId = null;
        }
      }

      if (memberId === undefined && personName) {
        updateData.personName = personName;

        const users = await storage.getAllUsers();
        const normalizedInput = personName.toLowerCase().trim();

        let foundUser = users.find(
          (u) => u.name.toLowerCase() === normalizedInput
        );

        if (!foundUser) {
          foundUser = users.find(
            (u) =>
              u.name.toLowerCase().includes(normalizedInput) ||
              normalizedInput.includes(u.name.toLowerCase())
          );
        }

        updateData.assignedToId = foundUser ? foundUser.id : null;
      }
  
      const interviewData = insertInterviewSchema
        .partial()
        .extend({
          status: z
            .enum(["programada", "completada", "cancelada", "archivada"])
            .optional(),
          resolution: z.enum(["completada", "cancelada"]).optional(),
        })
        .parse(updateData);

      if (interviewData.status === "cancelada") {
        interviewData.status = "archivada";
        interviewData.resolution = "cancelada";
      }

      if (interviewData.status === "completada") {
        interviewData.status = "archivada";
        interviewData.resolution = "completada";
      }

      if (interviewData.status === "archivada" && !interviewData.resolution && currentInterview.resolution) {
        interviewData.resolution = currentInterview.resolution;
      }

      const trimmedCancellationReason = getTrimmedCancellationReason({
        cancellationReason,
        ...req.body,
      });

      if (interviewData.resolution === "cancelada") {
        if (!trimmedCancellationReason) {
          return res.status(400).json({ error: "El motivo de cancelación es obligatorio" });
        }

        interviewData.notes = [
          currentInterview.notes,
          `Motivo de cancelación: ${trimmedCancellationReason}`,
        ]
          .filter(Boolean)
          .join("\n");
      }

      if (interviewData.resolution === "completada") {
        const trimmedCompletionNote = typeof completionNote === "string"
          ? completionNote.trim()
          : "";

        if (trimmedCompletionNote) {
          interviewData.notes = [
            currentInterview.notes,
            `Nota al completar: ${trimmedCompletionNote}`,
          ]
            .filter(Boolean)
            .join("\n");
        }
      }

      const nextInterviewerId =
        interviewData.interviewerId ?? currentInterview.interviewerId;
      const nextInterviewDate = interviewData.date ?? currentInterview.date;
      const nextStatus = interviewData.status ?? currentInterview.status;
      const shouldCheckCollision =
        nextStatus === "programada" &&
        (interviewData.date ||
          interviewData.interviewerId ||
          interviewData.status === "programada");
      if (shouldCheckCollision) {
        const interviewer = await storage.getUser(nextInterviewerId);
        const interviewerRoleLabel = interviewer?.role
          ? interviewCollisionRoles.get(interviewer.role)
          : undefined;
        if (interviewerRoleLabel) {
          const hasCollision = await hasInterviewCollision({
            interviewerId: nextInterviewerId,
            date: nextInterviewDate,
            excludeInterviewId: id,
          });
          if (hasCollision) {
            return res.status(409).json({
              error: `No se puede actualizar la entrevista porque el ${interviewerRoleLabel}${
                interviewer?.name ? ` ${interviewer.name}` : ""
              } ya tiene otra entrevista confirmada en esa fecha y hora.`,
            });
          }
        }
      }
    
      if (interviewData.resolution === "cancelada" && !trimmedCancellationReason) {
        return res.status(400).json({ error: "El motivo de cancelación es obligatorio" });
      }

      const interviewUpdateData: any = { ...interviewData };
      if (interviewData.resolution === "cancelada") {
        interviewUpdateData.cancellationReason = trimmedCancellationReason;
        interviewUpdateData.cancelledAt = new Date();
        interviewUpdateData.archivedAt = new Date();
      } else if (interviewData.resolution === "completada" || interviewData.status === "archivada") {
        interviewUpdateData.cancellationReason = null;
        interviewUpdateData.cancelledAt = null;
        interviewUpdateData.archivedAt = new Date();
      }

      const interview = await storage.updateInterview(id, interviewUpdateData);
      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }

      const { dateLabel: previousDateLabel, timeLabel: previousTimeLabel } = formatDateTimeLabels(currentInterview.date);
      const { dateLabel: currentDateLabel, timeLabel: currentTimeLabel } = formatDateTimeLabels(interview.date);
      const previousInterviewer = await storage.getUser(currentInterview.interviewerId);
      const currentInterviewer = await storage.getUser(interview.interviewerId);
      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;

      const interviewRecipients: Array<{
        email: string;
        name: string;
        sex?: string;
        organizationType?: string;
      }> = [];
      let intervieweeRecipient: {
        email: string;
        name: string;
        sex?: string;
        organizationType?: string;
      } | null = null;
      const member = interview.memberId ? await storage.getMemberById(interview.memberId) : null;
      const memberOrganization = member?.organizationId
        ? await storage.getOrganization(member.organizationId)
        : null;
      const normalizedPersonName = normalizeComparableName(interview.personName);
      const personUser = (await storage.getAllUsers()).find((u) => normalizeComparableName(u.name) === normalizedPersonName);
      if (member?.email) {
        intervieweeRecipient = {
          email: member.email,
          name: shortName(member),
          sex: member.sex,
          organizationType: memberOrganization?.type,
        };
        interviewRecipients.push(intervieweeRecipient);
      } else if (personUser?.email) {
        intervieweeRecipient = {
          email: personUser.email,
          name: shortName(personUser),
        };
        interviewRecipients.push(intervieweeRecipient);
      }

      if (currentInterviewer?.email) {
        interviewRecipients.push({
          email: currentInterviewer.email,
          name: shortName(currentInterviewer),
        });
      }

      const uniqueRecipients = interviewRecipients.filter(
        (recipient, index, arr) => arr.findIndex((item) => item.email === recipient.email) === index
      );

      const wasCancelledNow =
        (currentInterview.resolution !== "cancelada" && currentInterview.status !== "cancelada") &&
        (interview.resolution === "cancelada" || interview.status === "cancelada");
      const changeLines: string[] = [];
      if (String(currentInterview.date) !== String(interview.date)) {
        changeLines.push(`Fecha/Hora: ${previousDateLabel} ${previousTimeLabel} → ${currentDateLabel} ${currentTimeLabel}`);
      }
      if (currentInterview.interviewerId !== interview.interviewerId) {
        changeLines.push(
          `Entrevistador: ${shortName(previousInterviewer) || "Sin asignar"} → ${shortName(currentInterviewer) || "Sin asignar"}`
        );
      }

      for (const recipient of uniqueRecipients) {
        if (wasCancelledNow) {
          if (!intervieweeRecipient || recipient.email !== intervieweeRecipient.email) {
            continue;
          }
          await sendInterviewCancelledEmail({
            toEmail: recipient.email,
            recipientName: recipient.name,
            interviewDate: currentDateLabel,
            interviewTime: currentTimeLabel,
            wardName,
            recipientSex: recipient.sex,
            recipientOrganizationType: recipient.organizationType,
          });
          continue;
        }

        if (changeLines.length > 0) {
          await sendInterviewUpdatedEmail({
            toEmail: recipient.email,
            recipientName: recipient.name,
            interviewDate: currentDateLabel,
            interviewTime: currentTimeLabel,
            interviewerName: shortName(currentInterviewer),
            wardName,
            changeLines,
            recipientSex: recipient.sex,
            recipientOrganizationType: recipient.organizationType,
          });
        }
      }

      // 🔔 Si cambia la fecha → actualizar eventDate
      if (interviewData.date) {
        await db
          .update(notifications)
          .set({ eventDate: interview.date })
          .where(
            and(
              eq(notifications.relatedId, interview.id),
              eq(notifications.type, "upcoming_interview")
            )
          );
      }
  
      if (interviewData.date || interviewData.resolution === "completada" || interviewData.resolution === "cancelada") {
        const assignments = await storage.getAllAssignments();
        const relatedAssignment = assignments.find(
          (assignment: any) => assignment.relatedTo === `interview:${interview.id}`
        );

        if (relatedAssignment) {
          const updateAssignmentData: any = {};

          if (interviewData.resolution === "cancelada") {
            updateAssignmentData.status = "archivada";
            updateAssignmentData.resolution = "cancelada";
            updateAssignmentData.notes = [
              relatedAssignment.notes,
              trimmedCancellationReason
                ? `Motivo heredado (entrevista): ${trimmedCancellationReason}`
                : null,
              "Auto-cancelada por cancelación de entrevista.",
            ]
              .filter(Boolean)
              .join("\n");
          } else {
            if (interviewData.date) {
              const interviewDateValue = new Date(interview.date);
              const interviewDate = interviewDateValue.toLocaleDateString("es-ES", {
                year: "numeric",
                month: "2-digit",
                day: "numeric",
              });
              const interviewDateTitle = interviewDateValue.toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              const interviewTime = interviewDateValue.toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });

              updateAssignmentData.title = `Entrevista programada - ${interviewDateTitle}, ${interviewTime} hrs.`;
              updateAssignmentData.dueDate = interview.date;
            }

            if (interviewData.resolution === "completada") {
              const trimmedCompletionNote = typeof completionNote === "string"
                ? completionNote.trim()
                : "";
              updateAssignmentData.status = "archivada";
              updateAssignmentData.resolution = "completada";
              updateAssignmentData.notes = [
                relatedAssignment.notes,
                trimmedCompletionNote
                  ? `Motivo heredado (entrevista): ${trimmedCompletionNote}`
                  : null,
                "Auto-archivada por entrevista completada.",
              ]
                .filter(Boolean)
                .join("\n");
            }
          }

          if (Object.keys(updateAssignmentData).length > 0) {
            await storage.updateAssignment(relatedAssignment.id, updateAssignmentData);
          }
        } else if (interview.status === "programada" && interview.assignedToId) {
          const interviewDateValue = new Date(interview.date);
          const interviewDate = interviewDateValue.toLocaleDateString("es-ES", {
            year: "numeric",
            month: "2-digit",
            day: "numeric",
          });
          const interviewDateTitle = interviewDateValue.toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          const interviewTime = interviewDateValue.toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          const assignmentTitle = `Entrevista programada - ${interviewDateTitle}, ${interviewTime} hrs.`;
          const descriptionParts = [
            `Entrevista programada con ${currentInterviewer?.name || "el obispado"} el ${interviewDate}.`,
          ];
          if (interview.notes) {
            descriptionParts.push(`Notas: ${interview.notes}`);
          }

          await storage.createAssignment({
            title: assignmentTitle,
            description: descriptionParts.join(" "),
            assignedTo: interview.assignedToId,
            assignedBy: interview.assignedBy,
            dueDate: interview.date,
            status: "pendiente",
            relatedTo: `interview:${interview.id}`,
            archivedAt: null,
          });
        }
      }

      const currentUser = (req as any).user;
      const updaterName = shortName(currentUser) || "Un usuario";
      const recipients = new Set<string>(
        [interview.interviewerId, interview.assignedToId, interview.assignedBy].filter(Boolean) as string[]
      );
      recipients.delete(req.session.userId!);

      const interviewDate = new Date(interview.date).toLocaleDateString("es-ES");

      for (const userId of recipients) {
        const notification = await storage.createNotification({
          userId,
          type: "upcoming_interview",
          title: "Entrevista actualizada",
          description: `${updaterName} actualizó la entrevista con ${shortNameFromString(interview.personName)} para el ${interviewDate}.`,
          relatedId: interview.id,
          eventDate: interview.date,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(userId, {
            title: "Entrevista actualizada",
            body: `${updaterName} actualizó la entrevista con ${shortNameFromString(interview.personName)}.`,
            url: `/interviews?highlight=${encodeURIComponent(interview.id)}`,
            notificationId: notification.id,
          });
        }
      }

      res.json(interview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete(
    "/api/interviews/:id",
    requireAuth,
    requireRole("obispo"),
    async (_req: Request, res: Response) => {
      return res.status(403).json({
        error: "Eliminar entrevistas está deshabilitado. Usa el flujo de archivado.",
      });
    }
  );
  
  // ========================================
  // ORGANIZATION INTERVIEWS
  // ========================================
  
  app.get(
    "/api/organization-interviews",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const user = await storage.getUser(req.session.userId!);
        if (!user || !user.organizationId) {
          return res.status(403).json({ error: "No autorizado" });
        }

        const allowedRoles = [
          "presidente_organizacion",
          "consejero_organizacion",
          "secretario_organizacion",
        ];

        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({ error: "No autorizado" });
        }

        const organization = await storage.getOrganization(user.organizationId);
        const allowedOrganizationTypes = ["sociedad_socorro", "cuorum_elderes"];
        if (!organization || !allowedOrganizationTypes.includes(organization.type)) {
          return res.status(403).json({ error: "Solo Sociedad de Socorro y Cuórum de Élderes pueden gestionar entrevistas" });
        }

        const interviews =
          await storage.getOrganizationInterviewsByOrganization(
            user.organizationId
          );

        res.json(interviews);
      } catch (error) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  app.post("/api/organization-interviews", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.organizationId) {
        return res.status(403).json({ error: "No autorizado" });
      }
  
      const allowedRoles = [
        "presidente_organizacion",
        "consejero_organizacion",
        "secretario_organizacion",
      ];
  
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: "No autorizado" });
      }

      const organization = await storage.getOrganization(user.organizationId);
      const allowedOrganizationTypes = ["sociedad_socorro", "cuorum_elderes"];
      if (!organization || !allowedOrganizationTypes.includes(organization.type)) {
        return res.status(403).json({ error: "Solo Sociedad de Socorro y Cuórum de Élderes pueden gestionar entrevistas" });
      }
  
      const interviewData = insertOrganizationInterviewSchema.parse({
        ...req.body,
        organizationId: user.organizationId,
        createdBy: user.id,
        status: "programada",
      });

      const interviewer = await storage.getUser(interviewData.interviewerId);
      const interviewerRoleLabel = interviewer?.role
        ? interviewCollisionRoles.get(interviewer.role)
        : undefined;
      if (interviewerRoleLabel) {
        const hasCollision = await hasInterviewCollision({
          interviewerId: interviewData.interviewerId,
          date: interviewData.date,
        });
        if (hasCollision) {
          return res.status(409).json({
            error: `No se puede crear la entrevista porque el ${interviewerRoleLabel}${
              interviewer?.name ? ` ${interviewer.name}` : ""
            } ya tiene otra entrevista confirmada en esa fecha y hora.`,
          });
        }
      }
  
      const interview =
        await storage.createOrganizationInterview(interviewData);
      const interviewDateValue = new Date(interview.date);
      const interviewDate = interviewDateValue.toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const interviewTime = interviewDateValue.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const interviewDateTitle = interviewDateValue.toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const members = await storage.getOrganizationMembers(user.organizationId);
      const organizationMemberRoles = [
        "presidente_organizacion",
        "consejero_organizacion",
        "secretario_organizacion",
      ];

      const interviewNotificationRecipients = members.filter((member) =>
        organizationMemberRoles.includes(member.role)
      );

      for (const member of interviewNotificationRecipients) {
        const notification = await storage.createNotification({
          userId: member.id,
          type: "upcoming_interview",
          title: "Nueva entrevista de organización",
          description: `Entrevista con ${shortNameFromString(interview.personName)}`,
          relatedId: interview.id,
          eventDate: interview.date,
          isRead: false,
        });
    
        if (isPushConfigured()) {
          await sendPushNotification(member.id, {
            title: "Nueva entrevista de organización",
            body: `Entrevista con ${shortNameFromString(interview.personName)}`,
            url: `/organization-interviews?highlight=${encodeURIComponent(interview.id)}`,
            notificationId: notification.id,
          });
        }
      }

      if (interviewer?.email) {
        const template = await storage.getPdfTemplate();
        const wardName = template?.wardName;
        await sendOrganizationInterviewScheduledEmail({
          toEmail: interviewer.email,
          recipientName: shortName(interviewer),
          interviewDate,
          interviewTime,
          interviewType: interview.type,
          notes: interview.notes,
          organizationName: organization?.name,
          requesterName: shortName(user),
          wardName,
        });
      }

      if (interview.interviewerId) {
        const assignmentTitle = `Entrevista de organización - ${interviewDateTitle}, ${interviewTime} hrs.`;
        const descriptionParts = [
          `Entrevista con ${shortNameFromString(interview.personName)} programada para el ${interviewDate}.`,
          `Tipo: ${interview.type}.`,
          `Solicitada por: ${shortName(user)}.`,
        ];
        if (interview.notes) {
          descriptionParts.push(`Notas: ${interview.notes}`);
        }

        await storage.createAssignment({
          title: assignmentTitle,
          description: descriptionParts.join(" "),
          assignedTo: interview.interviewerId,
          assignedBy: user.id,
          dueDate: interview.date,
          status: "pendiente",
          relatedTo: `organization_interview:${interview.id}`,
          archivedAt: null,
        });

        // Evitamos notificación duplicada para entrevistas de organización.
      }
  
      res.status(201).json(interview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.put(
    "/api/organization-interviews/:id",
    requireAuth,
    async (req, res) => {
      try {
        const { id } = req.params;
        const user = await storage.getUser(req.session.userId!);
      
        if (!user || !user.organizationId) {
          return res.status(403).json({ error: "No autorizado" });
        }
    
        const interview =
          await storage.getOrganizationInterview(id);
    
        if (
          !interview ||
          interview.organizationId !== user.organizationId
        ) {
          return res.status(404).json({ error: "No encontrada" });
        }
    
        const allowedRoles = [
          "presidente_organizacion",
          "consejero_organizacion",
          "secretario_organizacion",
        ];
    
        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({ error: "No autorizado" });
        }

        const organization = await storage.getOrganization(user.organizationId);
        const allowedOrganizationTypes = ["sociedad_socorro", "cuorum_elderes"];
        if (!organization || !allowedOrganizationTypes.includes(organization.type)) {
          return res.status(403).json({ error: "Solo Sociedad de Socorro y Cuórum de Élderes pueden gestionar entrevistas" });
        }
    
        const { cancellationReason, completionNote, ...organizationInterviewBody } = req.body;
        const updateData =
          insertOrganizationInterviewSchema.partial().parse(organizationInterviewBody);

        if (updateData.status === "cancelada") {
          updateData.status = "archivada";
          updateData.resolution = "cancelada";
        }

        if (updateData.status === "completada") {
          updateData.status = "archivada";
          updateData.resolution = "completada";
        }

        if (updateData.status === "archivada" && !updateData.resolution && interview.resolution) {
          updateData.resolution = interview.resolution;
        }

        const trimmedCancellationReason = getTrimmedCancellationReason({
          cancellationReason,
          ...req.body,
        });

        if (updateData.resolution === "cancelada") {
          if (!trimmedCancellationReason) {
            return res.status(400).json({ error: "El motivo de cancelación es obligatorio" });
          }

          updateData.notes = [
            interview.notes,
            `Motivo de cancelación: ${trimmedCancellationReason}`,
          ]
            .filter(Boolean)
            .join("\n");
        }

        if (updateData.resolution === "completada") {
          const trimmedCompletionNote = typeof completionNote === "string"
            ? completionNote.trim()
            : "";

          if (trimmedCompletionNote) {
            updateData.notes = [
              interview.notes,
              `Nota al completar: ${trimmedCompletionNote}`,
            ]
              .filter(Boolean)
              .join("\n");
          }
        }

        const nextInterviewerId =
          updateData.interviewerId ?? interview.interviewerId;
        const nextInterviewDate = updateData.date ?? interview.date;
        const nextStatus = updateData.status ?? interview.status;
        const shouldCheckCollision =
          nextStatus === "programada" &&
          (updateData.date ||
            updateData.interviewerId ||
            updateData.status === "programada");
        if (shouldCheckCollision) {
          const interviewer = await storage.getUser(nextInterviewerId);
          const interviewerRoleLabel = interviewer?.role
            ? interviewCollisionRoles.get(interviewer.role)
            : undefined;
          if (interviewerRoleLabel) {
            const hasCollision = await hasInterviewCollision({
              interviewerId: nextInterviewerId,
              date: nextInterviewDate,
              excludeOrganizationInterviewId: id,
            });
            if (hasCollision) {
              return res.status(409).json({
                error: `No se puede actualizar la entrevista porque el ${interviewerRoleLabel}${
                  interviewer?.name ? ` ${interviewer.name}` : ""
                } ya tiene otra entrevista confirmada en esa fecha y hora.`,
              });
            }
          }
        }
    
        if (updateData.resolution === "cancelada" && !trimmedCancellationReason) {
          return res.status(400).json({ error: "El motivo de cancelación es obligatorio" });
        }

        const organizationInterviewUpdateData: any = { ...updateData };
        if (updateData.resolution === "cancelada") {
          organizationInterviewUpdateData.cancellationReason = trimmedCancellationReason;
          organizationInterviewUpdateData.cancelledAt = new Date();
          organizationInterviewUpdateData.archivedAt = new Date();
        } else if (updateData.resolution === "completada" || updateData.status === "archivada") {
          organizationInterviewUpdateData.cancellationReason = null;
          organizationInterviewUpdateData.cancelledAt = null;
          organizationInterviewUpdateData.archivedAt = new Date();
        }

        const updated =
          await storage.updateOrganizationInterview(id, organizationInterviewUpdateData);
    
        if (!updated) {
          return res.status(404).json({ error: "No encontrada" });
        }

        await syncOrganizationInterviewAnnualGoalProgress({
          organizationId: updated.organizationId,
          organizationType: organization?.type,
          interviewDate: updated.date,
          previousStatus: interview.status,
          nextStatus: updated.status,
          actorUserId: req.session.userId!,
        });

        if (updateData.date) {
          await db
            .update(notifications)
            .set({ eventDate: updated.date })
            .where(
              and(
                eq(notifications.relatedId, updated.id),
                eq(notifications.type, "upcoming_interview")
              )
            );
        }

        if (updateData.date || updateData.resolution === "completada" || updateData.resolution === "cancelada") {
          const assignments = await storage.getAllAssignments();
          const relatedAssignment = assignments.find(
            (assignment: any) => assignment.relatedTo === `organization_interview:${updated.id}`
          );

          if (relatedAssignment) {
            const updateAssignmentData: any = {};

            if (updateData.resolution === "cancelada") {
              updateAssignmentData.status = "archivada";
              updateAssignmentData.resolution = "cancelada";
              updateAssignmentData.notes = [
                relatedAssignment.notes,
                trimmedCancellationReason
                  ? `Motivo heredado (entrevista): ${trimmedCancellationReason}`
                  : null,
                "Auto-cancelada por cancelación de entrevista de organización.",
              ]
                .filter(Boolean)
                .join("\n");
            } else {
              if (updateData.date) {
                const updatedDateValue = new Date(updated.date);
                const updatedDateTitle = updatedDateValue.toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
                const updatedTime = updatedDateValue.toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });
                updateAssignmentData.title = `Entrevista de organización - ${updatedDateTitle}, ${updatedTime} hrs.`;
                updateAssignmentData.dueDate = updated.date;
              }

              if (updateData.resolution === "completada") {
                const trimmedCompletionNote = typeof completionNote === "string"
                  ? completionNote.trim()
                  : "";
                updateAssignmentData.status = "archivada";
                updateAssignmentData.resolution = "completada";
                updateAssignmentData.notes = [
                  relatedAssignment.notes,
                  trimmedCompletionNote
                    ? `Motivo heredado (entrevista de organización): ${trimmedCompletionNote}`
                    : null,
                  "Auto-archivada por entrevista de organización completada.",
                ]
                  .filter(Boolean)
                  .join("\n");
              }
            }

            if (Object.keys(updateAssignmentData).length > 0) {
              await storage.updateAssignment(relatedAssignment.id, updateAssignmentData);
            }
          }
        }

        if (updateData.resolution === "cancelada") {
          const interviewerUser = await storage.getUser(updated.interviewerId);
          if (interviewerUser?.email) {
            const template = await storage.getPdfTemplate();
            const wardName = template?.wardName;
            const canceledDateValue = new Date(updated.date);
            const canceledDate = canceledDateValue.toLocaleDateString("es-ES", {
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            const canceledTime = canceledDateValue.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });

            await sendOrganizationInterviewCancelledEmail({
              toEmail: interviewerUser.email,
              recipientName: shortName(interviewerUser),
              interviewDate: canceledDate,
              interviewTime: canceledTime,
              organizationName: organization?.name,
              wardName,
            });
          }
        }

        // 🔔 Notificar cambios (estado o fecha)
        if (Object.keys(updateData).length > 0) {
          const members =
            await storage.getOrganizationMembers(user.organizationId);
      
          for (const member of members) {
            if (!allowedRoles.includes(member.role)) continue;
          
            const notification = await storage.createNotification({
              userId: member.id,
              type: "upcoming_interview",
              title: "Entrevista actualizada",
              description: updateData.status
                ? `La entrevista con ${shortNameFromString(updated.personName)} ahora está ${updated.status}`
                : updateData.date
                  ? `La fecha de la entrevista con ${shortNameFromString(updated.personName)} fue modificada`
                  : `Se actualizaron los detalles de la entrevista con ${shortNameFromString(updated.personName)}`,
              relatedId: updated.id,
              eventDate: updated.date,
              isRead: false,
            });
        
            if (isPushConfigured()) {
              await sendPushNotification(member.id, {
                title: "Entrevista actualizada",
                body: `Entrevista con ${shortNameFromString(updated.personName)}`,
                url: `/organization-interviews?highlight=${encodeURIComponent(updated.id)}`,
                notificationId: notification.id,
              });
            }
          }
        }
    
        res.json(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );
  
  app.delete(
    "/api/organization-interviews/:id",
    requireAuth,
    async (_req, res) => {
      return res.status(403).json({
        error: "Eliminar entrevistas está deshabilitado. Usa el flujo de archivado.",
      });
    }
  );

  // ========================================
  // GOALS
  // ========================================

  app.get("/api/goals", requireAuth, async (req: Request, res: Response) => {
    try {
      const goals = await storage.getAllGoals();
      res.json(goals);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/goals", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
      
      // Check authorization
      if (isOrgMember && req.body.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Can only create goals for your own organization" });
      }
      
      if (!isObispado && !isOrgMember) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const goalData = insertGoalSchema.parse({
        ...req.body,
        createdBy: req.session.userId,
      });
      const goal = await storage.createGoal(goalData);

      // Notify relevant users about new goal
      const allUsers = await storage.getAllUsers();
      
      // If organization goal, notify obispado
      if (goal.organizationId && isOrgMember) {
        const obispadoMembers = allUsers.filter((u: any) => 
          (u.role === "obispo" || u.role === "consejero_obispo") && 
          u.id !== req.session.userId
        );

        for (const member of obispadoMembers) {
          const notification = await storage.createNotification({
            userId: member.id,
            type: "reminder",
            title: "Nueva Meta Registrada",
            description: `${shortName(user) || "Una organización"} ha creado la meta: "${goal.title}"`,
            relatedId: goal.id,
            isRead: false,
          });

          if (isPushConfigured()) {
            await sendPushNotification(member.id, {
              title: "Nueva Meta Registrada",
              body: `${user.name || "Una organización"} ha creado una nueva meta`,
              url: "/goals",
              notificationId: notification.id,
            });
          }
        }
      }

      // If obispado creates goal for an organization, notify org members
      if (goal.organizationId && isObispado) {
        const orgMembers = allUsers.filter((u: any) => 
          u.organizationId === goal.organizationId && 
          u.id !== req.session.userId
        );

        for (const member of orgMembers) {
          const notification = await storage.createNotification({
            userId: member.id,
            type: "reminder",
            title: "Nueva Meta para tu Organización",
            description: `Se ha establecido la meta: "${goal.title}"`,
            relatedId: goal.id,
            isRead: false,
          });

          if (isPushConfigured()) {
            await sendPushNotification(member.id, {
              title: "Nueva Meta para tu Organización",
              body: `Se ha establecido la meta: "${goal.title}"`,
              url: "/goals",
              notificationId: notification.id,
            });
          }
        }
      }

      res.status(201).json(goal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/goals/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const isObispado =
        user.role === "obispo" ||
        user.role === "consejero_obispo" ||
        user.role === "secretario_ejecutivo";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
      
      const goal = await storage.getGoal(id);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found" });
      }
      
      // Obispado and secretarios can edit any goal
      // Organization members can only edit goals for their own organization
      if (!isObispado && !isSecretary) {
        if (!isOrgMember || goal.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      
      const goalData = insertGoalSchema.partial().parse(req.body);
      const updatedGoal = await storage.updateGoal(id, goalData);
      if (!updatedGoal) {
        return res.status(404).json({ error: "Goal not found" });
      }

      // Notify about goal progress update if currentValue changed
      const oldProgress = goal.targetValue > 0 ? Math.round((goal.currentValue / goal.targetValue) * 100) : 0;
      const newProgress = updatedGoal.targetValue > 0 ? Math.round((updatedGoal.currentValue / updatedGoal.targetValue) * 100) : 0;
      const hasProgressUpdate = goalData.currentValue !== undefined && oldProgress !== newProgress;
      
      if (hasProgressUpdate) {
        const allUsers = await storage.getAllUsers();
        
        // If org member updates, notify obispado
        if (isOrgMember && updatedGoal.organizationId) {
          const obispadoMembers = allUsers.filter((u: any) => 
            (u.role === "obispo" || u.role === "consejero_obispo") && 
            u.id !== req.session.userId
          );

          for (const member of obispadoMembers) {
            const notification = await storage.createNotification({
              userId: member.id,
              type: "reminder",
              title: "Meta Actualizada",
              description: `"${updatedGoal.title}" ahora está al ${newProgress}%`,
              relatedId: updatedGoal.id,
              isRead: false,
            });

            if (isPushConfigured()) {
              await sendPushNotification(member.id, {
                title: "Meta Actualizada",
                body: `"${updatedGoal.title}" ahora está al ${newProgress}%`,
                url: "/goals",
                notificationId: notification.id,
              });
            }
          }
        }

        // If obispado updates org goal, notify org members
        if (isObispado && updatedGoal.organizationId) {
          const orgMembers = allUsers.filter((u: any) => 
            u.organizationId === updatedGoal.organizationId && 
            u.id !== req.session.userId
          );

          for (const member of orgMembers) {
            const notification = await storage.createNotification({
              userId: member.id,
              type: "reminder",
              title: "Meta de Organización Actualizada",
              description: `"${updatedGoal.title}" ahora está al ${newProgress}%`,
              relatedId: updatedGoal.id,
              isRead: false,
            });

            if (isPushConfigured()) {
              await sendPushNotification(member.id, {
                title: "Meta Actualizada",
                body: `"${updatedGoal.title}" ahora está al ${newProgress}%`,
                url: "/goals",
                notificationId: notification.id,
              });
            }
          }
        }
      }

      if (!hasProgressUpdate) {
        const allUsers = await storage.getAllUsers();
        const updaterName = user?.name || "Un usuario";

        if (updatedGoal.organizationId) {
          if (isOrgMember) {
            const obispadoMembers = allUsers.filter((member: any) =>
              ["obispo", "consejero_obispo"].includes(member.role) &&
              member.id !== req.session.userId
            );

            for (const member of obispadoMembers) {
              const notification = await storage.createNotification({
                userId: member.id,
                type: "reminder",
                title: "Meta actualizada",
                description: `${updaterName} actualizó la meta "${updatedGoal.title}".`,
                relatedId: updatedGoal.id,
                isRead: false,
              });

              if (isPushConfigured()) {
                await sendPushNotification(member.id, {
                  title: "Meta actualizada",
                  body: `${updaterName} actualizó la meta "${updatedGoal.title}".`,
                  url: "/goals",
                  notificationId: notification.id,
                });
              }
            }
          } else if (isObispado) {
            const orgMembers = allUsers.filter((member: any) =>
              member.organizationId === updatedGoal.organizationId &&
              member.id !== req.session.userId
            );

            for (const member of orgMembers) {
              const notification = await storage.createNotification({
                userId: member.id,
                type: "reminder",
                title: "Meta actualizada",
                description: `${updaterName} actualizó la meta "${updatedGoal.title}".`,
                relatedId: updatedGoal.id,
                isRead: false,
              });

              if (isPushConfigured()) {
                await sendPushNotification(member.id, {
                  title: "Meta actualizada",
                  body: `${updaterName} actualizó la meta "${updatedGoal.title}".`,
                  url: "/goals",
                  notificationId: notification.id,
                });
              }
            }
          }
        } else {
          const wardLeaders = allUsers.filter((member: any) =>
            ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero"].includes(member.role) &&
            member.id !== req.session.userId
          );

          for (const member of wardLeaders) {
            const notification = await storage.createNotification({
              userId: member.id,
              type: "reminder",
              title: "Meta de barrio actualizada",
              description: `${updaterName} actualizó la meta "${updatedGoal.title}".`,
              relatedId: updatedGoal.id,
              isRead: false,
            });

            if (isPushConfigured()) {
              await sendPushNotification(member.id, {
                title: "Meta de barrio actualizada",
                body: `${updaterName} actualizó la meta "${updatedGoal.title}".`,
                url: "/goals",
                notificationId: notification.id,
              });
            }
          }
        }
      }

      res.json(updatedGoal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/goals/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
      
      // Get the goal to check organization
      const goal = await storage.getGoal(id);
      if (!goal) {
        return res.status(404).json({ error: "Goal not found" });
      }
      
      // Obispado can delete any goal
      // Organization members can only delete goals for their organization
      if (!isObispado && (!isOrgMember || goal.organizationId !== user.organizationId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      await storage.deleteGoal(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // DIRECTORY MEMBERS
  // ========================================
  app.get("/api/member-callings", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);
      const isMissionLeader = user.role === "mission_leader";

      if (!isObispado && !isMissionLeader) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const callings = await storage.getActiveMemberCallings();
      res.json(callings);
    } catch (error) {
      console.error("Error fetching member callings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/members", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);

      const isMissionRole = [
        "mission_leader",
        "ward_missionary",
        "full_time_missionary",
      ].includes(user.role);

      const isOrgLeader = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(user.role);

      if (!isObispado && !isMissionRole && !isOrgLeader) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const members = await storage.getAllMembers();
      res.json(members);
    } catch (error) {
      console.error("Error fetching members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/organizations/:organizationId/members", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { organizationId } = req.params;

      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);

      const isOrgMember = [
        "presidente_organizacion",
        "secretario_organizacion",
        "consejero_organizacion",
      ].includes(user.role);

      if (!isObispado && !(isOrgMember && user.organizationId === organizationId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const organizationMembers = await storage.getMembersByOrganization(organizationId);
      res.json(organizationMembers);
    } catch (error) {
      console.error("Error fetching organization members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/members", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);

      if (!isObispado) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const memberData = insertMemberSchema.parse(req.body);
      const member = await storage.createMember(memberData);
      await storage.createSoloFamily(member.id);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/members/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);

      if (!isObispado) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { id } = req.params;
      const memberData = insertMemberSchema.partial().parse(req.body);
      const member = await storage.updateMember(id, memberData);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      // Sync linked user: names and phone bidireccional; email NOT synced (user is source of truth for login email)
      const linkedUser = (await storage.getAllUsers()).find((u) => u.memberId === id);
      if (linkedUser) {
        const syncPayload: Record<string, string | null> = {};
        if (memberData.nombre !== undefined || memberData.apellidos !== undefined) {
          const nombre = memberData.nombre ?? member.nombre;
          const apellidos = memberData.apellidos ?? member.apellidos;
          syncPayload.name = deriveNameSurename(nombre, apellidos, member.nameSurename);
          syncPayload.displayName = deriveDisplayName(nombre, apellidos) || null;
        }
        if (memberData.phone !== undefined) syncPayload.phone = memberData.phone ?? null;
        if (Object.keys(syncPayload).length > 0) {
          await storage.updateUser(linkedUser.id, syncPayload);
        }
      }

      res.json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/members/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);

      if (!isObispado) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { id } = req.params;
      const member = await storage.getMemberById(id);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      await storage.deleteMember(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/members/pending", requireRole("obispo", "consejero_obispo", "secretario"), async (_req: Request, res: Response) => {
    try {
      const pending = await storage.getPendingMembers();
      res.json(pending);
    } catch (error) {
      console.error("Error fetching pending members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/members/:id/approve", requireRole("obispo", "consejero_obispo", "secretario"), async (req: Request, res: Response) => {
    try {
      const member = await storage.approveMember(req.params.id);
      if (!member) return res.status(404).json({ error: "Member not found" });
      await storage.createSoloFamily(member.id);
      res.json(member);
    } catch (error) {
      console.error("Error approving member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // FAMILIES
  // ========================================

  const familyAuth = (req: Request, res: Response): boolean => {
    const user = (req as any).user;
    const allowed = [
      "obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero",
    ];
    if (!allowed.includes(user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return false;
    }
    return true;
  };

  app.get("/api/families", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = ["obispo","consejero_obispo","secretario","secretario_ejecutivo","secretario_financiero"].includes(user.role);
      const isOrgLeader = ["presidente_organizacion","consejero_organizacion","secretario_organizacion"].includes(user.role);
      if (!isObispado && !isOrgLeader) return res.status(403).json({ error: "Forbidden" });
      const all = await storage.getAllFamilies();
      res.json(all);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  app.get("/api/families/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!familyAuth(req, res)) return;
      const family = await storage.getFamilyById(req.params.id);
      if (!family) return res.status(404).json({ error: "Not found" });
      res.json(family);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  app.get("/api/members/:id/family", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = ["obispo","consejero_obispo","secretario","secretario_ejecutivo","secretario_financiero"].includes(user.role);
      const isOrgLeader = ["presidente_organizacion","consejero_organizacion","secretario_organizacion"].includes(user.role);
      if (!isObispado && !isOrgLeader) return res.status(403).json({ error: "Forbidden" });
      const family = await storage.getFamilyByMemberId(req.params.id);
      res.json(family ?? null);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/families", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!familyAuth(req, res)) return;
      const family = await storage.createFamily(req.body);
      res.status(201).json(family);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  app.put("/api/families/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!familyAuth(req, res)) return;
      const family = await storage.updateFamily(req.params.id, req.body);
      if (!family) return res.status(404).json({ error: "Not found" });
      res.json(family);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  app.delete("/api/families/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!familyAuth(req, res)) return;
      await storage.deleteFamily(req.params.id);
      res.status(204).send();
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  // Add member to family
  app.post("/api/families/:id/members", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!familyAuth(req, res)) return;
      const { memberId, role } = req.body;
      if (!memberId || !role) return res.status(400).json({ error: "memberId and role required" });
      const fm = await storage.addFamilyMember({ familyId: req.params.id, memberId, role });
      res.status(201).json(fm);
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ error: "Este miembro ya pertenece a una familia" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update member role within family
  app.patch("/api/families/:id/members/:memberId", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!familyAuth(req, res)) return;
      const { role } = req.body;
      if (!role) return res.status(400).json({ error: "role required" });
      const fm = await storage.updateFamilyMemberRole(req.params.id, req.params.memberId, role);
      if (!fm) return res.status(404).json({ error: "Not found" });
      res.json(fm);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  // Remove member from family
  app.delete("/api/families/:id/members/:memberId", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!familyAuth(req, res)) return;
      await storage.removeFamilyMember(req.params.id, req.params.memberId);
      res.status(204).send();
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  // ========================================
  // MEMBER CALLINGS
  // ========================================
  app.get("/api/members/:id/callings", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);

      if (!isObispado) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const callings = await storage.getMemberCallings(req.params.id);
      res.json(callings);
    } catch (error) {
      console.error("Error fetching member callings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/members/:id/callings", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);

      if (!isObispado) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const member = await storage.getMemberById(req.params.id);
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      const callingData = insertMemberCallingSchema.parse({
        ...req.body,
        memberId: req.params.id,
      });
      const calling = await storage.createMemberCalling(callingData);
      res.status(201).json(calling);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating member calling:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/members/:memberId/callings/:callingId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);

      if (!isObispado) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const existing = await storage.getMemberCallingById(req.params.callingId);
      if (!existing || existing.memberId !== req.params.memberId) {
        return res.status(404).json({ error: "Calling not found" });
      }

      const callingData = insertMemberCallingSchema.partial().parse(req.body);
      const updated = await storage.updateMemberCalling(req.params.callingId, callingData);
      if (!updated) {
        return res.status(404).json({ error: "Calling not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating member calling:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/members/:memberId/callings/:callingId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = [
        "obispo",
        "consejero_obispo",
        "secretario",
        "secretario_ejecutivo",
        "secretario_financiero",
      ].includes(user.role);

      if (!isObispado) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const existing = await storage.getMemberCallingById(req.params.callingId);
      if (!existing || existing.memberId !== req.params.memberId) {
        return res.status(404).json({ error: "Calling not found" });
      }

      await storage.deleteMemberCalling(req.params.callingId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting member calling:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // BIRTHDAYS
  // ========================================
  app.get("/api/birthdays", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      let birthdays = await storage.getAllBirthdays();
      
      // Filter based on user role - organization members only see their organization's birthdays
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
      if (isOrgMember) {
        birthdays = birthdays.filter((b: any) => b && b.organizationId === user.organizationId);
      }
      
      res.json(birthdays);
    } catch (error) {
      console.error("Error fetching birthdays:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get today's birthdays
  app.get("/api/birthdays/today", requireAuth, async (req: Request, res: Response) => {
    try {
      const todayBirthdays = await storage.getTodayBirthdays();
      res.json(todayBirthdays);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Send birthday notifications manually (admin only)
  app.post("/api/birthdays/send-notifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo" || user.role === "secretario";
      
      if (!isObispado) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const todayBirthdays = await storage.getTodayBirthdays();
      
      if (todayBirthdays.length === 0) {
        return res.json({ message: "No hay cumpleaños hoy", notificationsSent: 0 });
      }

      const allUsers = await storage.getAllUsers();
      let notificationsSent = 0;
      let skippedDuplicates = 0;

      for (const birthday of todayBirthdays) {
        const age = new Date().getFullYear() - new Date(birthday.birthDate).getFullYear();
        
        // Notify all users about this birthday
        for (const recipient of allUsers) {
          // Skip if the birthday person is the recipient (don't notify about your own birthday)
          if (birthday.name === recipient.name) continue;
          
          // Check if notification already sent today for this birthday
          const existingNotifications = await storage.getNotificationsByUser(recipient.id);
          const alreadyNotified = existingNotifications.some(
            n => n.type === "birthday_today" && 
                 n.relatedId === birthday.id && 
                 new Date(n.createdAt).toDateString() === new Date().toDateString()
          );
          
          if (alreadyNotified) {
            skippedDuplicates++;
            continue;
          }
          
          const notification = await storage.createNotification({
            userId: recipient.id,
            type: "birthday_today",
            title: "Cumpleaños Hoy",
            description: `Hoy es el cumpleaños de ${shortNameFromString(birthday.name)} (${age} años)`,
            relatedId: birthday.id,
            isRead: false,
          });

          if (isPushConfigured()) {
            await sendPushNotification(recipient.id, {
              title: "Cumpleaños Hoy",
              body: `Hoy es el cumpleaños de ${shortNameFromString(birthday.name)} (${age} años)`,
              url: "/birthdays",
              notificationId: notification.id,
            });
          }
          
          notificationsSent++;
        }
      }

      res.json({ 
        message: `Notificaciones enviadas para ${todayBirthdays.length} cumpleaños`,
        notificationsSent,
        skippedDuplicates,
        birthdays: todayBirthdays.map(b => b.name)
      });
    } catch (error) {
      console.error("Error sending birthday notifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // DASHBOARD STATS
  // ========================================

  app.get("/api/dashboard/stats", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispadoLeadership = ["obispo", "consejero_obispo", "secretario_ejecutivo"].includes(user.role);
      const isObispadoSecretary = ["secretario", "secretario_financiero"].includes(user.role);
      const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(user.role);

      const assignments = await storage.getAllAssignments();
      const interviews = await storage.getAllInterviews();
      const organizationInterviews = isOrgMember && user.organizationId
        ? await storage.getOrganizationInterviewsByOrganization(user.organizationId)
        : [];
      const budgetRequests = await storage.getAllBudgetRequests();
      const goals = await storage.getAllGoals();
      const birthdays = await storage.getAllBirthdays();
      const activities = await storage.getAllActivities();
      const organizations = await storage.getAllOrganizations();

      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Filter data based on role
      const filteredAssignments = (isObispadoLeadership || isObispadoSecretary)
        ? assignments
        : assignments.filter(a => a && (a.assignedTo === user.id || a.assignedBy === user.id));

      // For organization members: show only interviews assigned to them
      // For obispado/secretarios: show all interviews
      const filteredInterviews = isOrgMember
        ? interviews.filter(i => i && i.assignedToId === user.id)
        : interviews;

      const filteredBudgetRequests = isOrgMember
        ? budgetRequests.filter(b => b && b.organizationId === user.organizationId)
        : isObispadoSecretary
        ? [] // Secretarios del Obispado no ven presupuestos por organización
        : budgetRequests;

      // Ward-level goals (for all users to see in dashboard)
      const filteredGoals = goals.filter(g => g && !g.organizationId);

      // Activities filtered by organization for org members
      const filteredActivities = isOrgMember
        ? activities.filter(a => a && a.organizationId === user.organizationId)
        : activities;

      // For organization health, filter based on role
      const visibleOrganizations = isObispadoLeadership
        ? organizations.filter(o => o.type !== "obispado") // Obispo ve todas las organizaciones excepto Obispado
        : isObispadoSecretary
        ? [] // Secretarios del Obispado no ven salud de organizaciones
        : isOrgMember
        ? organizations.filter(o => o.id === user.organizationId)
        : organizations;

      // Ward-level goals (for Obispado view)
      const wardGoals = goals.filter(g => g && !g.organizationId);
      
      // For organization members, also include their organization's goals
      const orgGoalsForMember = isOrgMember
        ? goals.filter(g => g && g.organizationId === user.organizationId)
        : [];

      // For org members: show all upcoming interviews; for obispado: show only next 7 days
      const organizationType = organizations.find(o => o.id === user.organizationId)?.type;
      const obispadoAssigned = interviews.filter(i => {
        if (!i || i.status !== "programada") return false;
        return i.assignedToId === user.id;
      });

      const organizationInterviewCount = organizationInterviews.filter(i => i && i.status === "programada").length;

      const upcomingInterviews = isObispadoSecretary
        ? 0
        : isObispadoLeadership
        ? filteredInterviews.filter(i => i && i.status === "programada" && new Date(i.date) <= weekFromNow).length
        : isOrgMember
        ? (["sociedad_socorro", "cuorum_elderes"].includes(organizationType || "")
            ? organizationInterviewCount + obispadoAssigned.length
            : obispadoAssigned.length)
        : 0;

      const stats = {
        pendingAssignments: assignments.filter(a => a && a.status === "pendiente" && a.assignedTo === user.id).length,
        upcomingInterviews,
        budgetRequests: {
          pending: filteredBudgetRequests.filter(b => b && b.status === "solicitado").length,
          approved: filteredBudgetRequests.filter(b => b && b.status === "aprobado").length,
          total: filteredBudgetRequests.length,
        },
        // Ward-level goals (for Obispado and Secretarios)
        goals: {
          completed: filteredGoals.filter(g => g && g.currentValue >= g.targetValue).length,
          total: filteredGoals.length,
          percentage: filteredGoals.length > 0
            ? Math.round(filteredGoals.filter(g => g).reduce((sum, g) => sum + (g.currentValue / g.targetValue) * 100, 0) / filteredGoals.length)
            : 0,
        },
        // Organization goals (for organization members)
        organizationGoals: isOrgMember ? {
          items: orgGoalsForMember.map(g => ({
            id: g.id,
            title: g.title,
            description: g.description,
            currentValue: g.currentValue,
            targetValue: g.targetValue,
            percentage: g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0,
          })),
          completed: orgGoalsForMember.filter(g => g && g.currentValue >= g.targetValue).length,
          total: orgGoalsForMember.length,
          percentage: orgGoalsForMember.length > 0
            ? Math.round(orgGoalsForMember.filter(g => g && g.targetValue > 0).reduce((sum, g) => sum + (g.currentValue / g.targetValue) * 100, 0) / orgGoalsForMember.filter(g => g && g.targetValue > 0).length)
            : 0,
        } : undefined,
        upcomingBirthdays: birthdays
          .filter((b) => b)
          .map((b) => ({
            name: b.name,
            date: formatBirthdayMonthDay(b.birthDate, "es-ES"),
            daysUntil: getDaysUntilBirthday(b.birthDate, now),
          }))
          .sort((a, b) => a.daysUntil - b.daysUntil)
          .slice(0, 3)
          .map(({ name, date }) => ({ name, date })),
        organizationHealth: visibleOrganizations.map(org => {
          const orgGoals = goals.filter(g => g && g.organizationId === org.id);
          const orgBudgets = budgetRequests.filter(b => b && b.organizationId === org.id && b.status === "solicitado");
          
          let status: "healthy" | "warning" | "critical" = "healthy";
          
          if (orgBudgets.length > 2) {
            status = "warning";
          }
          
          if (orgGoals.length > 0) {
            const avgProgress = orgGoals.reduce((sum, g) => sum + (g.currentValue / g.targetValue) * 100, 0) / orgGoals.length;
            if (avgProgress < 30) {
              status = "critical";
            } else if (avgProgress < 50) {
              status = "warning";
            }
          }
          
          return {
            name: org.name,
            status,
          };
        }),
        upcomingActivities: filteredActivities
          .filter(a => a && new Date(a.date) >= now)
          .slice(0, 5)
          .map(a => ({
            title: a.title,
            date: new Date(a.date).toLocaleDateString("es-ES", { month: "short", day: "numeric", timeZone: "UTC" }),
            location: a.location || "",
          })),
        userRole: user.role,
        pendingServiceTasks: await (async () => {
          const allowedRoles = ["lider_actividades", "obispo", "consejero_obispo", "technology_specialist"];
          if (!allowedRoles.includes(user.role)) return 0;
          try {
            const result = user.role === "lider_actividades"
              ? await db.execute(sql`
                  SELECT COUNT(*)::int AS count FROM service_tasks
                  WHERE assigned_to = ${user.id} AND status = 'pending'
                `)
              : await db.execute(sql`
                  SELECT COUNT(*)::int AS count FROM service_tasks
                  WHERE assigned_role = 'lider_actividades' AND status = 'pending'
                `);
            return Number(result.rows[0]?.count ?? 0);
          } catch { return 0; }
        })(),
        pendingBaptismDrafts: await (async () => {
          const missionRoles = ["mission_leader", "ward_missionary", "full_time_missionary"];
          if (!missionRoles.includes(user.role)) return 0;
          try {
            const result = await db.execute(sql`
              SELECT COUNT(*)::int AS count FROM baptism_services
              WHERE created_by = ${user.id}
                AND approval_status IN ('draft', 'needs_revision')
            `);
            return Number(result.rows[0]?.count ?? 0);
          } catch { return 0; }
        })(),
      };

      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // ========================================
  // PDF TEMPLATES
  // ========================================

  app.get("/api/pdf-template", requireAuth, async (req: Request, res: Response) => {
    const template = await storage.getPdfTemplate();
    if (!template) {
      return res.json({
        wardName: "Barrio",
        stakeName: "Estaca",
        country: "País",
        sacramentMeetingTime: "10:00",
        headerColor: "1F2937",
        accentColor: "3B82F6",
        logoUrl: undefined,
        footerText: "© Barrio - Todos los derechos reservados",
        bizumPhone: "",
        bizumDeepLink: "",
      });
    }
    res.json(template);
  });

  app.get("/api/public/donation-settings", async (_req: Request, res: Response) => {
    const template = await storage.getPdfTemplate();
    res.json({
      wardName: template?.wardName || "Barrio",
      bizumPhone: template?.bizumPhone || "",
      bizumDeepLink: template?.bizumDeepLink || "",
    });
  });

  app.patch("/api/pdf-template", requireRole("obispo", "secretario"), async (req: Request, res: Response) => {
    const parsed = insertPdfTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid template data" });
    }
    const template = await storage.updatePdfTemplate(parsed.data);
    res.json(template);
  });

  // ========================================
  // WARD BUDGETS
  // ========================================

  app.get("/api/ward-budget", requireAuth, async (req: Request, res: Response) => {
    const budget = await storage.getWardBudget();
    if (budget) {
      return res.json(budget);
    }
    const now = new Date();
    res.json({
      amount: 0,
      annualAmount: 0,
      year: now.getFullYear(),
      q1Amount: 0,
      q2Amount: 0,
      q3Amount: 0,
      q4Amount: 0,
    });
  });

  app.patch("/api/ward-budget", requireRole("obispo", "consejero_obispo"), async (req: Request, res: Response) => {
    const parsed = insertWardBudgetSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid budget data" });
    }
    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    const payload = {
      ...parsed.data,
      year: parsed.data.year ?? now.getFullYear(),
    };
    const quarterAmounts = [payload.q1Amount, payload.q2Amount, payload.q3Amount, payload.q4Amount];
    const quarterAmount = quarterAmounts[currentQuarter - 1];
    if (typeof quarterAmount === "number") {
      payload.amount = quarterAmount;
    }
    const budget = await storage.updateWardBudget(payload);

    const currentUser = (req as any).user;
    const updaterName = shortName(currentUser) || "Un usuario";
    const allUsers = await storage.getAllUsers();
    const budgetRoles = [
      "obispo",
      "consejero_obispo",
      "secretario",
      "secretario_ejecutivo",
      "secretario_financiero",
      "presidente_organizacion",
      "consejero_organizacion",
      "secretario_organizacion",
    ];
    const recipients = new Set<string>(
      allUsers.filter((user: any) => budgetRoles.includes(user.role)).map((user: any) => user.id)
    );
    recipients.delete(req.session.userId!);

    for (const userId of recipients) {
      const notification = await storage.createNotification({
        userId,
        type: "reminder",
        title: "Presupuesto del barrio actualizado",
        description: `${updaterName} actualizó el presupuesto del barrio para ${payload.year}.`,
        relatedId: budget.id,
        isRead: false,
      });

      if (isPushConfigured()) {
        await sendPushNotification(userId, {
          title: "Presupuesto del barrio actualizado",
          body: `${updaterName} actualizó el presupuesto del barrio para ${payload.year}.`,
          url: `/budget?highlight=${encodeURIComponent(budget.id)}`,
          notificationId: notification.id,
        });
      }
    }

    res.json(budget);
  });

  // ========================================
  // ORGANIZATION BUDGETS
  // ========================================

  app.get("/api/organization-budgets/:organizationId", requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { organizationId } = req.params;

    // Org leaders can only see their own org's budget
    const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
    if (isOrgMember && user.organizationId !== organizationId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const budgets = await storage.getOrganizationBudgets(organizationId);
    res.json(budgets);
  });

  app.post("/api/organization-budgets", requireRole("obispo", "consejero_obispo"), async (req: Request, res: Response) => {
    const parsed = insertOrganizationBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid budget data" });
    }

    // Check if budget already exists for this quarter
    const existing = await storage.getOrganizationBudgetByQuarter(
      parsed.data.organizationId,
      parsed.data.year,
      parsed.data.quarter
    );

    if (existing) {
      return res.status(400).json({ error: "Budget already exists for this quarter" });
    }

    const budget = await storage.createOrganizationBudget(parsed.data);
    res.json(budget);
  });

  app.patch("/api/organization-budgets/:id", requireRole("obispo", "consejero_obispo"), async (req: Request, res: Response) => {
    const parsed = insertOrganizationBudgetSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid budget data" });
    }

    const budget = await storage.updateOrganizationBudget(req.params.id, parsed.data);
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    res.json(budget);
  });

  // ========================================
  // ORGANIZATION WEEKLY ATTENDANCE
  // ========================================

  const ADMIN_ATTENDANCE_ROLES = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero"] as const;
  const ORG_ATTENDANCE_ROLES = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"] as const;

  const normalizeWeekKey = (value: string): string | null => {
    const trimmed = value.trim();
    const datePart = trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
    return datePart;
  };

  const getMonthSundaysCountUTC = (year: number, month: number): number => {
    const cursor = new Date(Date.UTC(year, month - 1, 1));
    const offset = (7 - cursor.getUTCDay()) % 7;
    cursor.setUTCDate(cursor.getUTCDate() + offset);
    let count = 0;
    while (cursor.getUTCMonth() === month - 1) {
      count += 1;
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return count;
  };

  const closeAttendanceMonth = async ({
    organizationId,
    year,
    month,
    closedBy,
  }: {
    organizationId: string;
    year: number;
    month: number;
    closedBy: string;
  }) => {
    const allAttendance = await storage.getOrganizationWeeklyAttendance(organizationId);
    const monthEntries = allAttendance.filter((entry: any) => {
      const key = typeof entry.weekKey === "string" ? entry.weekKey : String(entry.weekKey ?? "");
      return key.startsWith(`${year}-${String(month).padStart(2, "0")}-`);
    });

    const presentTotal = monthEntries.reduce((sum: number, row: any) => sum + Number(row.attendeesCount ?? 0), 0);
    const capacityTotal = monthEntries.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.totalMembers ?? 0)), 0);
    const distinctWeeks = new Set(
      monthEntries
        .filter((row: any) => Number(row.attendeesCount ?? 0) > 0)
        .map((row: any) => String(row.weekKey))
    );
    const weeksReported = distinctWeeks.size;
    const weeksInMonth = getMonthSundaysCountUTC(year, month);
    const attendancePercent = capacityTotal > 0 ? Number(((presentTotal / capacityTotal) * 100).toFixed(2)) : 0;

    await storage.upsertOrganizationAttendanceMonthlySnapshot({
      organizationId,
      year,
      month,
      weeksInMonth,
      weeksReported,
      presentTotal,
      capacityTotal,
      attendancePercent: String(attendancePercent),
      closedAt: new Date(),
      closedBy,
    });
  };

  app.get("/api/organization-attendance", requireAuth, requireRole("secretario", "obispo", "consejero_obispo"), async (_req: Request, res: Response) => {
    try {
      const attendance = await storage.getAllOrganizationWeeklyAttendance();
      res.json(attendance);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/organization-attendance/:organizationId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { organizationId } = req.params;

      const isObispado = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero"].includes(user.role);
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);

      if (!isObispado && !(isOrgMember && user.organizationId === organizationId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const attendance = await storage.getOrganizationWeeklyAttendance(organizationId);
      res.json(attendance);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/organization-attendance", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const RETROACTIVE_CAPTURE_GRACE_DAYS = Number(process.env.ORG_ATTENDANCE_RETROACTIVE_DAYS ?? 10);
      const parsed = z.object({
        organizationId: z.string().min(1),
        weekStartDate: z.string().min(1),
        attendeesCount: z.number().int().min(0),
        attendeeMemberIds: z.array(z.string().min(1)).optional(),
        totalMembers: z.number().int().min(0).optional(),
      }).safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }

      const isObispado = ADMIN_ATTENDANCE_ROLES.includes(user.role);
      const isOrgMember = ORG_ATTENDANCE_ROLES.includes(user.role);
      if (!isObispado && !(isOrgMember && user.organizationId === parsed.data.organizationId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const weekKey = normalizeWeekKey(parsed.data.weekStartDate);
      if (!weekKey) {
        return res.status(400).json({ error: "Invalid weekStartDate" });
      }

      const weekStartDate = new Date(`${weekKey}T00:00:00.000Z`);
      const now = new Date();
      const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const startOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      if (weekStartDate > startOfToday) {
        return res.status(400).json({ error: "No se permite registrar asistencia de semanas futuras." });
      }

      const isRetroactiveMonth = weekStartDate < startOfCurrentMonth;
      if (isRetroactiveMonth) {
        if (!isObispado) {
          return res.status(403).json({ error: "Solo secretaría u obispado puede registrar meses anteriores." });
        }

        if (weekStartDate.getUTCFullYear() !== now.getUTCFullYear()) {
          return res.status(400).json({ error: "Solo se permite registro retroactivo dentro del año en curso." });
        }

        const monthCloseDate = new Date(Date.UTC(weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth() + 1, 0));
        const captureDeadline = new Date(monthCloseDate);
        captureDeadline.setUTCDate(captureDeadline.getUTCDate() + RETROACTIVE_CAPTURE_GRACE_DAYS);

        if (startOfToday > captureDeadline) {
          return res.status(400).json({
            error: `La ventana retroactiva de ${RETROACTIVE_CAPTURE_GRACE_DAYS} días para ese mes ya cerró.`,
          });
        }
      }

      const uniqueMemberIds = Array.from(new Set(parsed.data.attendeeMemberIds ?? []));
      const attendeesCount = uniqueMemberIds.length > 0 ? uniqueMemberIds.length : parsed.data.attendeesCount;
      const totalMembers = parsed.data.totalMembers ?? 0;

      const payload = {
        organizationId: parsed.data.organizationId,
        weekStartDate,
        weekKey,
        attendeesCount,
        attendeeMemberIds: uniqueMemberIds,
        totalMembers,
        createdBy: req.session.userId!,
      };

      const attendance = await storage.upsertOrganizationWeeklyAttendance(payload);

      // If the affected month is already closed by date, keep/update a monthly snapshot.
      const monthEnd = new Date(Date.UTC(weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth() + 1, 0));
      if (startOfToday > monthEnd) {
        await closeAttendanceMonth({
          organizationId: parsed.data.organizationId,
          year: weekStartDate.getUTCFullYear(),
          month: weekStartDate.getUTCMonth() + 1,
          closedBy: req.session.userId!,
        });
      }

      res.status(201).json(attendance);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/organization-attendance-snapshots/:organizationId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { organizationId } = req.params;
      const requestedYear = typeof req.query.year === "string" ? Number(req.query.year) : undefined;

      const isObispado = ADMIN_ATTENDANCE_ROLES.includes(user.role);
      const isOrgMember = ORG_ATTENDANCE_ROLES.includes(user.role);

      if (!isObispado && !(isOrgMember && user.organizationId === organizationId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (typeof requestedYear === "number" && Number.isNaN(requestedYear)) {
        return res.status(400).json({ error: "Invalid year" });
      }

      const snapshots = await storage.getOrganizationAttendanceMonthlySnapshots(organizationId, requestedYear);
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // REMINDERS
  // ========================================

  app.post("/api/reminders/send", requireRole("obispo", "secretario"), async (req: Request, res: Response) => {
    const interviews = await storage.getAllInterviews();
    const assignments = await storage.getAllAssignments();
    
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);
    const tomorrowEnd = new Date(todayEnd);
    tomorrowEnd.setDate(todayEnd.getDate() + 1);

    const buildFollowUpSendAt = (interviewDate: Date) => {
      const sameDayEight = new Date(interviewDate);
      sameDayEight.setHours(8, 0, 0, 0);
      const fiveHoursBefore = new Date(interviewDate.getTime() - 5 * 60 * 60 * 1000);
      return new Date(Math.max(sameDayEight.getTime(), fiveHoursBefore.getTime()));
    };

    const scheduledInterviews = interviews.filter((i: any) => i.status === "programada");
    const recordatorioInterviews = scheduledInterviews.filter((i: any) => {
      const interviewDate = new Date(i.date);
      return interviewDate >= tomorrowStart && interviewDate <= tomorrowEnd;
    });
    const seguimientoInterviews = scheduledInterviews.filter((i: any) => {
      const interviewDate = new Date(i.date);
      return interviewDate >= todayStart && interviewDate <= todayEnd;
    });

    // Get pending assignments
    const pendingAssignments = assignments.filter((a: any) => a.status === "pendiente");

    // Format reminder data
    const reminderData = {
      timestamp: new Date(),
      recordatorioInterviews: recordatorioInterviews.length,
      seguimientoInterviews: seguimientoInterviews.length,
      pendingAssignments: pendingAssignments.length,
      details: {
        recordatorioInterviews: recordatorioInterviews.map((i: any) => {
          const interviewDate = new Date(i.date);
          const sendAt = new Date(interviewDate);
          sendAt.setDate(interviewDate.getDate() - 1);
          sendAt.setHours(10, 0, 0, 0);
          return {
            personName: i.personName,
            date: i.date,
            type: i.type,
            sendAt: sendAt.toISOString(),
          };
        }),
        seguimientoInterviews: seguimientoInterviews.map((i: any) => {
          const interviewDate = new Date(i.date);
          return {
            personName: i.personName,
            date: i.date,
            type: i.type,
            sendAt: buildFollowUpSendAt(interviewDate).toISOString(),
          };
        }),
        assignments: pendingAssignments.map((a: any) => ({
          title: a.title,
          assignedTo: a.assignedTo,
          dueDate: a.dueDate,
        })),
      },
    };

    res.json({
      success: true,
      message: "Recordatorios enviados",
      data: reminderData,
    });
  });

  const wasReminderAlreadySentToday = async (userId: string, relatedId: string, title: string) => {
    const existingNotifications = await storage.getNotificationsByUser(userId);
    const todayKey = new Date().toDateString();
    return existingNotifications.some((item) =>
      item.type === "reminder" &&
      item.relatedId === relatedId &&
      item.title === title &&
      new Date(item.createdAt).toDateString() === todayKey
    );
  };

  const wasReminderAlreadySent = async (userId: string, relatedId: string, title: string) => {
    const existingNotifications = await storage.getNotificationsByUser(userId);
    return existingNotifications.some((item) =>
      item.type === "reminder" &&
      item.relatedId === relatedId &&
      item.title === title
    );
  };

  async function sendAutomaticInterviewAndAssignmentReminders() {
    try {
      const now = new Date();
      const interviews = await storage.getAllInterviews();
      const assignments = await storage.getAllAssignments();
      const allUsers = await storage.getAllUsers();
      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;
      const usersById = new Map(allUsers.map((u) => [u.id, u]));

      // Entrevistas: recordatorio 24h antes al entrevistado + push entrevistado/entrevistador
      for (const interview of interviews) {
        if (!interview || interview.status !== "programada") continue;
        const interviewDate = new Date(interview.date);
        const diffMs = interviewDate.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours < 23 || diffHours > 25) continue;

        const interviewer = usersById.get(interview.interviewerId);
        const interviewerName = interviewer ? shortName(interviewer) || undefined : undefined;
        const interviewDateLabel = interviewDate.toLocaleDateString("es-ES", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const interviewTimeLabel = interviewDate.toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        if (interview.assignedToId) {
          const intervieweeUser = usersById.get(interview.assignedToId);
          if (intervieweeUser?.email) {
            const alreadySent = await wasReminderAlreadySentToday(
              intervieweeUser.id,
              interview.id,
              "Recordatorio de entrevista (24h)"
            );
            if (!alreadySent) {
              await sendInterviewReminder24hEmail({
                toEmail: intervieweeUser.email,
                recipientName: shortName(intervieweeUser),
                interviewDate: interviewDateLabel,
                interviewTime: interviewTimeLabel,
                interviewerName,
                wardName,
              });

              const notification = await storage.createNotification({
                userId: intervieweeUser.id,
                type: "reminder",
                title: "Recordatorio de entrevista (24h)",
                description: `Tu entrevista es mañana (${interviewDateLabel} a las ${interviewTimeLabel}).`,
                relatedId: interview.id,
                eventDate: interview.date,
                isRead: false,
              });

              if (isPushConfigured()) {
                await sendPushNotification(intervieweeUser.id, {
                  title: "Recordatorio de entrevista",
                  body: "Tu entrevista es mañana.",
                  url: `/interviews?highlight=${encodeURIComponent(interview.id)}`,
                  notificationId: notification.id,
                });
              }
            }
          }
        }

        if (interview.interviewerId) {
          const alreadySentToInterviewer = await wasReminderAlreadySentToday(
            interview.interviewerId,
            interview.id,
            "Recordatorio para entrevistador (24h)"
          );
          if (!alreadySentToInterviewer) {
            const reminder = await storage.createNotification({
              userId: interview.interviewerId,
              type: "reminder",
              title: "Recordatorio para entrevistador (24h)",
              description: `Mañana tienes entrevista con ${shortNameFromString(interview.personName)}.`,
              relatedId: interview.id,
              eventDate: interview.date,
              isRead: false,
            });
            if (isPushConfigured()) {
              await sendPushNotification(interview.interviewerId, {
                title: "Recordatorio de entrevista",
                body: `Mañana: entrevista con ${shortNameFromString(interview.personName)}.`,
                url: `/interviews?highlight=${encodeURIComponent(interview.id)}`,
                notificationId: reminder.id,
              });
            }
          }
        }
      }

      // Asignaciones no relacionadas a entrevistas:
      // - push a mitad del plazo
      // - push + email a 24h
      for (const assignment of assignments) {
        if (!assignment || (assignment.status !== "pendiente" && assignment.status !== "en_proceso")) continue;
        if (!assignment.dueDate || !assignment.assignedTo) continue;
        if (assignment.relatedTo?.startsWith("interview:") || assignment.relatedTo?.startsWith("organization_interview:")) {
          continue;
        }

        const assignee = usersById.get(assignment.assignedTo);
        if (!assignee) continue;

        const createdAt = assignment.createdAt ? new Date(assignment.createdAt) : null;
        const dueDate = new Date(assignment.dueDate);
        if (!createdAt || Number.isNaN(createdAt.getTime()) || Number.isNaN(dueDate.getTime())) continue;

        const totalMs = dueDate.getTime() - createdAt.getTime();
        if (totalMs <= 0) continue;
        const elapsedMs = now.getTime() - createdAt.getTime();
        const remainingHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        const halfwayReached = elapsedMs >= totalMs / 2;
        if (halfwayReached) {
          const alreadySentHalfway = await wasReminderAlreadySent(
            assignee.id,
            assignment.id,
            "Recordatorio de asignación (mitad del plazo)"
          );
          if (!alreadySentHalfway) {
            const notification = await storage.createNotification({
              userId: assignee.id,
              type: "reminder",
              title: "Recordatorio de asignación (mitad del plazo)",
              description: `Sigue pendiente: "${assignment.title}".`,
              relatedId: assignment.id,
              eventDate: assignment.dueDate,
              isRead: false,
            });

            if (isPushConfigured()) {
              await sendPushNotification(assignee.id, {
                title: "Recordatorio de asignación",
                body: `Continúa pendiente: "${assignment.title}"`,
                url: `/assignments?highlight=${encodeURIComponent(assignment.id)}`,
                notificationId: notification.id,
              });
            }
          }
        }

        if (remainingHours >= 23 && remainingHours <= 25) {
          const alreadySent24h = await wasReminderAlreadySentToday(
            assignee.id,
            assignment.id,
            "Recordatorio de asignación (24h)"
          );
          if (!alreadySent24h) {
            const dueLabel = dueDate.toLocaleDateString("es-ES", {
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            const reminder = await storage.createNotification({
              userId: assignee.id,
              type: "reminder",
              title: "Recordatorio de asignación (24h)",
              description: `Tu asignación "${assignment.title}" vence mañana.`,
              relatedId: assignment.id,
              eventDate: assignment.dueDate,
              isRead: false,
            });

            if (isPushConfigured()) {
              await sendPushNotification(assignee.id, {
                title: "Asignación por vencer",
                body: `Mañana vence: "${assignment.title}"`,
                url: `/assignments?highlight=${encodeURIComponent(assignment.id)}`,
                notificationId: reminder.id,
              });
            }

            if (assignee.email) {
              await sendAssignmentDueReminderEmail({
                toEmail: assignee.email,
                recipientName: shortName(assignee),
                assignmentTitle: assignment.title,
                dueDate: dueLabel,
                wardName,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("[Automatic Reminders] Error:", error);
    }
  }

  // ========================================
  // SMART AGENDA
  // ========================================

  const getDefaultAvailability = async (userId: string) => {
    const existing = await storage.getAvailabilityByUser(userId);
    if (existing) return existing;
    return storage.upsertAvailability({ userId, timezone: "UTC", workDays: [1, 2, 3, 4, 5], workStartTime: "09:00", workEndTime: "18:00", bufferMinutes: 10, minBlockMinutes: 15, reminderChannels: ["push"] });
  };

  const persistAgendaAudit = async (params: {
    userId: string;
    endpoint: string;
    requestText?: string | null;
    intent?: string | null;
    confidence?: number | null;
    resultRecordType?: string | null;
    resultRecordId?: string | null;
    metadata?: Record<string, unknown>;
  }) => {
    await storage.createAgendaCommandLog({
      userId: params.userId,
      endpoint: params.endpoint,
      requestText: params.requestText ?? null,
      intent: params.intent ?? null,
      confidence: params.confidence != null ? String(params.confidence) : null,
      resultRecordType: params.resultRecordType ?? null,
      resultRecordId: params.resultRecordId ?? null,
      metadata: params.metadata ?? {},
    });
  };

  const syncSourceEventsForUser = async (user: any) => {
    const isObispado = user.role === "obispo" || user.role === "consejero_obispo" || user.role === "secretario_ejecutivo";
    const [activities, interviews] = await Promise.all([storage.getAllActivities(), storage.getAllInterviews()]);

    const visibleActivities = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role)
      ? activities.filter((a) => a && (!a.organizationId || a.organizationId === user.organizationId))
      : activities;
    const allVisibleInterviews = isObispado ? interviews : interviews.filter((i) => i && i.assignedToId === user.id);
    const activeInterviews = allVisibleInterviews.filter((i) => i && i.status === "programada");
    const inactiveInterviews = allVisibleInterviews.filter((i) => i && i.status !== "programada");

    for (const activity of visibleActivities) {
      const when = new Date(activity.date);
      await storage.upsertAgendaEvent({
        userId: user.id,
        title: activity.title,
        description: activity.description ?? null,
        date: when.toISOString().slice(0, 10),
        startTime: `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`,
        endTime: `${String((when.getHours() + 2) % 24).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`,
        location: activity.location ?? null,
        sourceType: "activity",
        sourceId: activity.id,
      });
    }

    // Only sync scheduled interviews; remove agenda events for completed/archived/cancelled ones
    for (const interview of activeInterviews) {
      const when = new Date(interview.date);
      await storage.upsertAgendaEvent({
        userId: user.id,
        title: `Entrevista con ${shortNameFromString(interview.personName)}`,
        description: interview.notes ?? null,
        date: when.toISOString().slice(0, 10),
        startTime: `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`,
        endTime: `${String((when.getHours() + 1) % 24).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`,
        location: "Oficina",
        sourceType: "interview",
        sourceId: interview.id,
      });
    }

    for (const interview of inactiveInterviews) {
      const existing = await db
        .select({ id: agendaEvents.id })
        .from(agendaEvents)
        .where(and(eq(agendaEvents.userId, user.id), eq(agendaEvents.sourceType, "interview"), eq(agendaEvents.sourceId, interview.id)))
        .limit(1);
      if (existing[0]) await storage.deleteAgendaEvent(existing[0].id);
    }
  };

  const createReminderIfMissing = async (params: {
    userId: string;
    eventId?: string | null;
    taskId?: string | null;
    remindAt: Date;
  }) => {
    const availability = await getDefaultAvailability(params.userId);
    const preferredChannels = getPreferredReminderChannels(availability);
    const existing = params.eventId
      ? await storage.getAgendaRemindersByEvent(params.eventId)
      : params.taskId
        ? await storage.getAgendaRemindersByTask(params.taskId)
        : [];

    for (const channel of preferredChannels) {
      const alreadyExists = existing.some((reminder) => {
        const sameChannel = reminder.channel === channel;
        const sameTime = new Date(reminder.remindAt).getTime() === params.remindAt.getTime();
        return sameChannel && sameTime;
      });
      if (alreadyExists) continue;

      await storage.createAgendaReminder({
        userId: params.userId,
        eventId: params.eventId ?? null,
        taskId: params.taskId ?? null,
        remindAt: params.remindAt,
        channel,
        status: "pending",
      });
    }
  };

  const scheduleDefaultEventReminders = async (userId: string, event: { id: string; date: string; startTime?: string | null }) => {
    const eventStart = new Date(`${event.date}T${event.startTime || "09:00"}:00`);
    if (Number.isNaN(eventStart.getTime())) return;

    const reminderOffsets = [24 * 60, 2 * 60, 30];
    const now = new Date();

    for (const offset of reminderOffsets) {
      const remindAt = new Date(eventStart.getTime() - offset * 60_000);
      if (remindAt <= now) continue;
      await createReminderIfMissing({ userId, eventId: event.id, remindAt });
    }
  };

  const scheduleDefaultTaskReminders = async (userId: string, task: { id: string; dueAt?: Date | string | null }, options?: { atRiskImmediate?: boolean }) => {
    const now = new Date();

    if (options?.atRiskImmediate) {
      await createReminderIfMissing({ userId, taskId: task.id, remindAt: now });
      return;
    }

    if (!task.dueAt) return;
    const dueAt = new Date(task.dueAt);
    if (Number.isNaN(dueAt.getTime())) return;

    const sameDayMorning = new Date(dueAt);
    sameDayMorning.setHours(8, 0, 0, 0);

    const reminderDates = [
      new Date(dueAt.getTime() - 3 * 24 * 60 * 60_000),
      new Date(dueAt.getTime() - 24 * 60 * 60_000),
      sameDayMorning,
    ];

    for (const remindAt of reminderDates) {
      if (remindAt <= now) continue;
      await createReminderIfMissing({ userId, taskId: task.id, remindAt });
    }
  };

  const normalizeComparableText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const cleanupManualReminderEvents = async (userId: string) => {
    const [events, tasks] = await Promise.all([
      storage.getAgendaEventsByUser(userId),
      storage.getAgendaTasksByUser(userId),
    ]);

    const taskTitles = new Set(tasks.map((task) => normalizeComparableText(task.title || "")).filter(Boolean));
    const reminderRegex = /record|recuerd|llamar|comprar|preparar|pendiente|tarea|seguimiento/;

    const junkEventIds = events
      .filter((event) => {
        if (event.sourceType !== "manual") return false;
        const normalizedTitle = normalizeComparableText(event.title || "");
        const normalizedDescription = normalizeComparableText(event.description || "");
        const combinedText = `${normalizedTitle} ${normalizedDescription}`.trim();
        const looksLikeReminder = reminderRegex.test(combinedText);
        if (looksLikeReminder) return true;
        return taskTitles.has(normalizedTitle) || taskTitles.has(normalizedDescription);
      })
      .map((event) => event.id);

    if (junkEventIds.length === 0) return;

    for (const eventId of junkEventIds) {
      await storage.deleteAgendaEvent(eventId);
    }
  };

  const runPlannerForUser = async (user: any) => {
    await syncSourceEventsForUser(user);
    const availability = await getDefaultAvailability(user.id);
    const [events, tasks, plans] = await Promise.all([
      storage.getAgendaEventsByUser(user.id),
      storage.getAgendaTasksByUser(user.id),
      storage.getAgendaTaskPlansByUser(user.id),
    ]);

    const activePlannerPlans = plans.filter((plan) => plan.status === "planned" && plan.generatedBy === "planner");
    for (const plan of activePlannerPlans) {
      await storage.updateAgendaTaskPlan(plan.id, { status: "canceled" });
    }

    const existingManualPlans = plans
      .filter((plan) => plan.status === "planned" && plan.generatedBy === "manual")
      .map((plan) => ({ start: new Date(plan.startAt), end: new Date(plan.endAt) }));

    const result = computePlan({
      now: new Date(),
      availability,
      tasks,
      events: events.map(toRangeFromEvent),
      existingPlans: existingManualPlans,
    });

    for (const plan of result.planned) {
      const parsed = insertAgendaTaskPlanSchema.parse({
        userId: user.id,
        taskId: plan.taskId,
        startAt: plan.startAt,
        endAt: plan.endAt,
        status: "planned",
        generatedBy: "planner",
      });
      await storage.createAgendaTaskPlan(parsed);
    }

    for (const task of tasks) {
      const isAtRisk = result.atRiskTaskIds.includes(task.id);
      const metadata = { ...(task.metadata ?? {}), atRisk: isAtRisk };
      await storage.updateAgendaTask(task.id, { metadata });
      if (isAtRisk) {
        await scheduleDefaultTaskReminders(user.id, task, { atRiskImmediate: true });
      } else {
        await scheduleDefaultTaskReminders(user.id, task);
      }
    }

    return result;
  };

  const handleReplanningForNewEvent = async (user: any, newEvent: { date: string; startTime?: string | null; endTime?: string | null }) => {
    const plans = await storage.getAgendaTaskPlansByUser(user.id);
    const activePlans = plans.filter((plan) => plan.status === "planned");
    if (activePlans.length === 0) return;

    const overlapIds = findOverlappingPlanIds(activePlans, [toRangeFromEvent({
      id: "tmp",
      userId: user.id,
      title: "tmp",
      description: null,
      date: newEvent.date,
      startTime: newEvent.startTime ?? null,
      endTime: newEvent.endTime ?? null,
      location: null,
      sourceType: "manual",
      sourceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })]);

    if (overlapIds.length === 0) return;

    for (const planId of overlapIds) {
      await storage.updateAgendaTaskPlan(planId, { status: "bumped" });
    }

    await runPlannerForUser(user);
  };

  const tryIdempotentResponse = async (req: Request, endpoint: string) => {
    const key = readIdempotencyKey(req.headers as Record<string, string | string[] | undefined>);
    const user = (req as any).user;
    if (!key || !user?.id) return null;
    const existing = await storage.getAgendaIdempotencyKey(user.id, endpoint, key);
    const replay = toReplayResponse(existing ? { statusCode: existing.statusCode, responseBody: existing.responseBody as any } : null);
    return replay ? { ...replay, key } : null;
  };

  const storeIdempotentResponse = async (req: Request, endpoint: string, statusCode: number, body: Record<string, unknown>) => {
    const key = readIdempotencyKey(req.headers as Record<string, string | string[] | undefined>);
    const user = (req as any).user;
    if (!key || !user?.id) return;
    await storage.upsertAgendaIdempotencyKey({
      userId: user.id,
      key,
      endpoint,
      responseBody: body,
      statusCode,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  };

  app.get("/api/agenda", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      await syncSourceEventsForUser(user);
      await cleanupManualReminderEvents(user.id);
      const [events, tasks, plans] = await Promise.all([
        storage.getAgendaEventsByUser(user.id),
        storage.getAgendaTasksByUser(user.id),
        storage.getAgendaTaskPlansByUser(user.id),
      ]);
      res.json({ events, tasks, plans });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/agenda/events", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const idempotent = await tryIdempotentResponse(req, "/api/agenda/events");
      if (idempotent) return res.status(idempotent.statusCode).json(idempotent.body);
      const parsed = insertAgendaEventSchema.parse({ ...req.body, userId: user.id, sourceType: "manual", sourceId: null });
      const event = await storage.createAgendaEvent(parsed);
      await scheduleDefaultEventReminders(user.id, event);
      await handleReplanningForNewEvent(user, event);
      await persistAgendaAudit({ userId: user.id, endpoint: "/api/agenda/events", intent: "create_event", resultRecordType: "event", resultRecordId: event.id });
      await storeIdempotentResponse(req, "/api/agenda/events", 201, event as any);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/agenda/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const idempotent = await tryIdempotentResponse(req, "/api/agenda/tasks");
      if (idempotent) return res.status(idempotent.statusCode).json(idempotent.body);
      const parsed = insertAgendaTaskSchema.parse({ ...req.body, userId: user.id });
      const task = await storage.createAgendaTask(parsed);
      await scheduleDefaultTaskReminders(user.id, task);
      await persistAgendaAudit({ userId: user.id, endpoint: "/api/agenda/tasks", intent: "create_task", resultRecordType: "task", resultRecordId: task.id });
      await storeIdempotentResponse(req, "/api/agenda/tasks", 201, task as any);
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/agenda/capture", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const idempotent = await tryIdempotentResponse(req, "/api/agenda/capture");
      if (idempotent) return res.status(idempotent.statusCode).json(idempotent.body);
      const text = String(req.body?.text ?? "").trim();
      if (!text) return res.status(400).json({ error: "text is required" });

      const parsed = parseAgendaCommand(text);

      if (parsed.intent === "plan_week") {
        const response = {
          action: "plan_week",
          parser: parsed.parser,
          confidence: parsed.confidence,
          needsConfirmation: parsed.needsConfirmation,
          parsed,
          message: "Comando reconocido. Ejecuta 'Plan my week' para planificar automáticamente.",
        };
        await persistAgendaAudit({ userId: user.id, endpoint: "/api/agenda/capture", requestText: text, intent: parsed.intent, confidence: parsed.confidence, resultRecordType: "command" });
        await storeIdempotentResponse(req, "/api/agenda/capture", 200, response as any);
        return res.status(200).json(response);
      }

      if (parsed.intent === "create_event") {
        const created = await storage.createAgendaEvent({
          userId: user.id,
          title: parsed.entities.title ?? text.slice(0, 120),
          description: parsed.entities.description ?? text,
          date: parsed.entities.date ?? new Date().toISOString().slice(0, 10),
          startTime: parsed.entities.startTime ?? null,
          endTime: parsed.entities.endTime ?? null,
          location: null,
          sourceType: "manual",
          sourceId: null,
        });
        await scheduleDefaultEventReminders(user.id, created);
        await handleReplanningForNewEvent(user, created);

        const response = {
          action: "create_event",
          parser: parsed.parser,
          confidence: parsed.confidence,
          needsConfirmation: parsed.needsConfirmation,
          parsed,
          record: created,
        };
        await persistAgendaAudit({ userId: user.id, endpoint: "/api/agenda/capture", requestText: text, intent: parsed.intent, confidence: parsed.confidence, resultRecordType: "event", resultRecordId: created.id });
        await storeIdempotentResponse(req, "/api/agenda/capture", 201, response as any);
        return res.status(201).json(response);
      }

      if (parsed.intent === "create_task") {
        const created = await storage.createAgendaTask({
          userId: user.id,
          title: parsed.entities.title ?? text.slice(0, 120),
          description: parsed.entities.description ?? text,
          dueAt: parsed.entities.dueAt ?? null,
          earliestStartAt: null,
          durationMinutes: parsed.entities.durationMinutes ?? 30,
          priority: parsed.entities.priority ?? "P3",
          status: "open",
          eventId: null,
          metadata: { capturedBy: "rules", confidence: parsed.confidence },
        });
        await scheduleDefaultTaskReminders(user.id, created);

        const response = {
          action: "create_task",
          parser: parsed.parser,
          confidence: parsed.confidence,
          needsConfirmation: parsed.needsConfirmation,
          parsed,
          record: created,
        };
        await persistAgendaAudit({ userId: user.id, endpoint: "/api/agenda/capture", requestText: text, intent: parsed.intent, confidence: parsed.confidence, resultRecordType: "task", resultRecordId: created.id });
        await storeIdempotentResponse(req, "/api/agenda/capture", 201, response as any);
        return res.status(201).json(response);
      }

      return res.status(422).json({
        error: "No se pudo interpretar el comando",
        parser: parsed.parser,
        confidence: parsed.confidence,
        needsConfirmation: true,
        parsed,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/agenda/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const availability = await getDefaultAvailability(user.id);
      res.json(availability);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/agenda/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const payload = insertUserAvailabilitySchema.parse({ ...req.body, userId: user.id });
      const availability = await storage.upsertAvailability(payload);
      res.json(availability);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/agenda/plan/run", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const idempotent = await tryIdempotentResponse(req, "/api/agenda/plan/run");
      if (idempotent) return res.status(idempotent.statusCode).json(idempotent.body);
      const result = await runPlannerForUser(user);
      await persistAgendaAudit({ userId: user.id, endpoint: "/api/agenda/plan/run", intent: "plan_week", resultRecordType: "plan", metadata: { plannedCount: result.planned.length, atRiskCount: result.atRiskTaskIds.length } });
      await storeIdempotentResponse(req, "/api/agenda/plan/run", 200, result as any);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/agenda/plan", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const [plans, tasks] = await Promise.all([
        storage.getAgendaTaskPlansByUser(user.id),
        storage.getAgendaTasksByUser(user.id),
      ]);
      const atRiskTasks = tasks.filter((task) => (task.metadata as any)?.atRisk);
      res.json({ plans, atRiskTasks });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });


  app.patch("/api/agenda/tasks/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const nextStatus = req.body?.status;
      if (!["open", "done", "canceled"].includes(nextStatus)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const task = await storage.getAgendaTask(id);
      if (!task || task.userId !== user.id) {
        return res.status(404).json({ error: "Task not found" });
      }

      const updated = await storage.updateAgendaTask(id, { status: nextStatus });
      if (!updated) {
        return res.status(404).json({ error: "Task not found" });
      }

      if (nextStatus !== "open") {
        const plans = await storage.getAgendaTaskPlansByTask(id);
        for (const plan of plans.filter((p) => p.status === "planned")) {
          await storage.updateAgendaTaskPlan(plan.id, { status: nextStatus === "done" ? "done" : "canceled" });
        }
      }

      await persistAgendaAudit({
        userId: user.id,
        endpoint: "/api/agenda/tasks/:id/status",
        intent: "update_task_status",
        resultRecordType: "task",
        resultRecordId: id,
        metadata: { status: nextStatus },
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/agenda/logs", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const limitRaw = Number(req.query.limit ?? 20);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
      const logs = await storage.getAgendaCommandLogsByUser(user.id, limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // EVENTS (Integrated Calendar)
  // ========================================

  app.get("/api/events", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado =
        user.role === "obispo" ||
        user.role === "consejero_obispo" ||
        user.role === "secretario_ejecutivo";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);

      const template = await storage.getPdfTemplate();
      const sacramentMeetingTime = template?.sacramentMeetingTime || "10:00";
      const applyMeetingTime = (dateValue: string | Date) => {
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return date;
        const [hours, minutes] = sacramentMeetingTime.split(":").map(Number);
        if (!Number.isNaN(hours)) {
          date.setHours(hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
        }
        return date;
      };
      
      const [sacramentalMeetings, wardCouncils, interviews, activities, organizations] = await Promise.all([
        storage.getAllSacramentalMeetings(),
        storage.getAllWardCouncils(),
        storage.getAllInterviews(),
        storage.getAllActivities(),
        storage.getAllOrganizations(),
      ]);

      // Filter interviews based on role
      // For obispado: show all interviews
      // For others: show only interviews assigned to them
      const filteredInterviews = isObispado
        ? interviews
        : interviews.filter(i => i && i.assignedToId === user.id);

      // Filter activities based on role
      // For organization members: show only activities for their organization OR ward-wide activities (no organizationId)
      // For obispado/secretarios: show all activities
      const filteredActivities = isOrgMember
        ? activities.filter(a => a && (!a.organizationId || a.organizationId === user.organizationId))
        : activities;

      const organizationType = organizations.find(o => o.id === user.organizationId)?.type;
      const includeOrganizationInterviews = isOrgMember && ["sociedad_socorro", "cuorum_elderes"].includes(organizationType || "");
      const organizationInterviews = includeOrganizationInterviews && user.organizationId
        ? await storage.getOrganizationInterviewsByOrganization(user.organizationId)
        : [];

      const events = [
        ...sacramentalMeetings.map(m => ({
          id: m.id,
          title: "Reunión Sacramental",
          date: applyMeetingTime(m.date),
          type: "reunion" as const,
          location: "Salón sacramental",
          organizationId: null,
        })),
        ...wardCouncils.map(c => ({
          id: c.id,
          title: "Consejo de Barrio",
          date: c.date,
          type: "consejo" as const,
          location: c.location || "Salón de consejeros",
          organizationId: null,
        })),
        ...filteredInterviews.map(i => ({
          id: i.id,
          title: `Entrevista con ${shortNameFromString(i.personName)}`,
          date: i.date,
          type: "entrevista" as const,
          location: "Oficina",
          status: i.status,
          description: i.notes ?? undefined,
          organizationId: null,
        })),
        ...organizationInterviews.map(i => ({
          id: i.id,
          title: `Entrevista con ${shortNameFromString(i.personName)}`,
          date: i.date,
          type: "entrevista" as const,
          location: "Oficina",
          status: i.status,
          description: i.notes ?? undefined,
          organizationId: i.organizationId,
        })),
        ...filteredActivities.map(a => ({
          id: a.id,
          title: a.title,
          date: a.date,
          type: "actividad" as const,
          location: a.location,
          description: a.description ?? undefined,
          organizationId: a.organizationId,
        })),
      ];

      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // CALENDAR CONFLICT CHECK
  // ========================================

  app.post("/api/events/check-conflicts", requireAuth, async (req: Request, res: Response) => {
    try {
      const { date, duration = 60, excludeId, type } = req.body;
      
      if (!date) {
        return res.status(400).json({ error: "Date is required" });
      }

      const user = (req as any).user;
      const isObispado =
        user.role === "obispo" ||
        user.role === "consejero_obispo" ||
        user.role === "secretario_ejecutivo";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(
        user.role
      );
      const template = await storage.getPdfTemplate();
      const sacramentMeetingTime = template?.sacramentMeetingTime || "10:00";
      let eventDate = new Date(date);

      const applyMeetingTime = (dateValue: string | Date) => {
        const dateValueInstance = new Date(dateValue);
        if (Number.isNaN(dateValueInstance.getTime())) return dateValueInstance;
        const [hours, minutes] = sacramentMeetingTime.split(":").map(Number);
        if (!Number.isNaN(hours)) {
          dateValueInstance.setHours(hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
        }
        return dateValueInstance;
      };

      if (type === "reunion") {
        eventDate = applyMeetingTime(eventDate);
      }

      const eventEndTime = new Date(eventDate.getTime() + duration * 60000);
      
      const [sacramentalMeetings, wardCouncils, interviews, activities, organizations] = await Promise.all([
        storage.getAllSacramentalMeetings(),
        storage.getAllWardCouncils(),
        storage.getAllInterviews(),
        storage.getAllActivities(),
        storage.getAllOrganizations(),
      ]);

      const visibleInterviews = isObispado
        ? interviews
        : interviews.filter((interview) => interview && interview.assignedToId === user.id);
      const visibleActivities = isOrgMember
        ? activities.filter(
            (activity) =>
              activity && (!activity.organizationId || activity.organizationId === user.organizationId)
          )
        : activities;
      const organizationType = organizations.find(o => o.id === user.organizationId)?.type;
      const includeOrganizationInterviews = isOrgMember && ["sociedad_socorro", "cuorum_elderes"].includes(organizationType || "");
      const organizationInterviews = includeOrganizationInterviews && user.organizationId
        ? await storage.getOrganizationInterviewsByOrganization(user.organizationId)
        : [];

      const allEvents = [
        ...sacramentalMeetings.map(m => ({ id: m.id, date: applyMeetingTime(m.date), title: "Reunión Sacramental", type: "reunion", duration: 90 })),
        ...wardCouncils.map(c => ({ id: c.id, date: new Date(c.date), title: "Consejo de Barrio", type: "consejo", duration: 120 })),
        ...visibleInterviews.map(i => ({ id: i.id, date: new Date(i.date), title: `Entrevista con ${shortNameFromString(i.personName)}`, type: "entrevista", duration: 30 })),
        ...organizationInterviews.map(i => ({ id: i.id, date: new Date(i.date), title: `Entrevista con ${shortNameFromString(i.personName)}`, type: "entrevista", duration: 30 })),
        ...visibleActivities.map(a => ({ id: a.id, date: new Date(a.date), title: a.title, type: "actividad", duration: 120 })),
      ];

      // Find conflicts (events that overlap in time on the same day)
      const conflicts = allEvents.filter(event => {
        if (excludeId && event.id === excludeId) return false;
        
        const eventEndTimeExisting = new Date(event.date.getTime() + (event.duration || 60) * 60000);
        
        // Check if same day
        const sameDay = event.date.toDateString() === eventDate.toDateString();
        if (!sameDay) return false;
        
        // Check time overlap
        const overlaps = (eventDate < eventEndTimeExisting && eventEndTime > event.date);
        return overlaps;
      });

      res.json({
        hasConflicts: conflicts.length > 0,
        conflicts: conflicts.map(c => ({
          id: c.id,
          title: c.title,
          type: c.type,
          date: c.date,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // ACTIVITIES
  // ========================================

  // Public endpoint — no auth required, only returns is_public activities
  app.get("/api/public/activities", async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT id, title, description, date, location, type
        FROM activities
        WHERE is_public = true AND date >= NOW()
        ORDER BY date ASC
        LIMIT 20
      `);
      const rows = "rows" in result ? result.rows : result;
      return res.json(rows);
    } catch (error) {
      console.error("Error fetching public activities:", error);
      return res.status(500).json({ error: "Error al cargar actividades" });
    }
  });

  app.get("/api/public/baptism-services", async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      // Show services up to 30 days in advance, and up to 24h after they started
      const windowCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const result = await db.execute(sql`
        SELECT
          bs.id,
          bs.service_at AS "serviceAt",
          bs.location_name AS "locationName",
          bs.location_address AS "locationAddress",
          bpl.slug,
          COALESCE(
            json_agg(mp.nombre ORDER BY mp.nombre) FILTER (WHERE mp.nombre IS NOT NULL),
            '[]'
          ) AS candidates
        FROM baptism_services bs
        LEFT JOIN baptism_public_links bpl
          ON bpl.service_id = bs.id
          AND bpl.revoked_at IS NULL
          AND bpl.id = (
            SELECT id FROM baptism_public_links
            WHERE service_id = bs.id AND revoked_at IS NULL
            ORDER BY published_at DESC LIMIT 1
          )
        LEFT JOIN baptism_service_candidates bsc ON bsc.service_id = bs.id
        LEFT JOIN mission_personas mp ON mp.id = bsc.persona_id
        WHERE bs.approval_status = 'approved'
          AND bs.is_public = true
          AND bs.service_at >= ${windowCutoff}
          AND bs.service_at <= NOW() + INTERVAL '30 days'
        GROUP BY bs.id, bs.service_at, bs.location_name, bs.location_address, bpl.slug
        ORDER BY bs.service_at ASC
      `);
      const rows = (result.rows as any[]).map((r) => {
        const serviceAt = r.serviceAt ? new Date(r.serviceAt) : null;
        const windowEnd = serviceAt ? new Date(serviceAt.getTime() + 24 * 60 * 60 * 1000) : null;
        const withinWindow = serviceAt && windowEnd
          ? now >= serviceAt && now < windowEnd
          : false;
        return {
          id: r.id,
          serviceAt: r.serviceAt,
          locationName: r.locationName,
          locationAddress: r.locationAddress,
          candidates: Array.isArray(r.candidates) ? r.candidates : [],
          stableUrl: r.slug ? `/bautismo/${r.slug}` : null,
          withinWindow,
        };
      });
      return res.json(rows);
    } catch (error) {
      console.error("Error fetching public baptism services:", error);
      return res.status(500).json({ error: "Error al cargar servicios bautismales" });
    }
  });

  app.get("/api/activities", requireAuth, async (req: Request, res: Response) => {
    try {
      const activities = await storage.getAllActivities();
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/activities/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const activity = await storage.getActivity(req.params.id);
      if (!activity) return res.status(404).json({ error: "Actividad no encontrada" });
      res.json(activity);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/activities", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const activityData = insertActivitySchema.parse({
        ...req.body,
        createdBy: req.session.userId,
      });
      const activity = await storage.createActivity(activityData);

      // Create tasks + assignments for lider_actividades and org presidency
      if (activity.organizationId) {
        try {
          await createActivityTasksAndAssignments({
            activityId: activity.id,
            activityTitle: activity.title,
            activityDate: new Date(activity.date),
            organizationId: activity.organizationId,
            createdBy: req.session.userId!,
          });
        } catch (taskErr) {
          console.error("[POST /api/activities] Failed to create tasks/assignments:", taskErr);
        }
      }

      // Notify relevant users about new activity
      const allUsers = await storage.getAllUsers();
      const activityDate = new Date(activity.date).toLocaleDateString("es-ES");
      
      // Notify obispado
      const obispadoMembers = allUsers.filter((u: any) => 
        (u.role === "obispo" || u.role === "consejero_obispo" || u.role === "secretario") && 
        u.id !== req.session.userId
      );

      // Notify organization members if activity is for a specific organization
      const orgMembers = activity.organizationId 
        ? allUsers.filter((u: any) => 
            u.organizationId === activity.organizationId && 
            u.id !== req.session.userId
          )
        : [];

      const usersToNotify = Array.from(new Set([...obispadoMembers, ...orgMembers].map(u => u.id)));

      for (const userId of usersToNotify) {
        const notification = await storage.createNotification({
          userId,
          type: "reminder",
          title: "Nueva Actividad Programada",
          description: `${activity.title} - ${activityDate}`,
          relatedId: activity.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(userId, {
            title: "Nueva Actividad Programada",
            body: `${activity.title} - ${activityDate}`,
            url: "/activities",
            notificationId: notification.id,
          });
        }
      }

      res.status(201).json(activity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/activities/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const activityData = insertActivitySchema.partial().parse(req.body);

      const activity = await storage.updateActivity(id, activityData);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }

      res.json(activity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/activities/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const id = req.params.id;

      // Get the activity to verify ownership/organization
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }

      // Check authorization: obispo, consejero_obispo, or organization members (their org)
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
      const canDeleteAsOrgMember = isOrgMember && activity.organizationId === user.organizationId;

      if (!isObispado && !canDeleteAsOrgMember) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.deleteActivity(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/activities/:activityId/checklist/:itemId", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { activityId, itemId } = req.params;

      const activity = await storage.getActivity(activityId);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }

      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion", "lider_actividades", "mission_leader"].includes(user.role);
      const canEdit = isObispado || isOrgMember || ["secretario", "secretario_ejecutivo"].includes(user.role);

      if (!canEdit) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const data = updateActivityChecklistItemSchema.parse(req.body);
      const updatedItem = await storage.updateChecklistItem(itemId, data, user.id);

      if (!updatedItem) {
        return res.status(404).json({ error: "Checklist item not found" });
      }

      res.json(updatedItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── PATCH /api/activities/:id/submit ──────────────────────────────────────
  app.patch("/api/activities/:id/submit", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const activity = await storage.getActivity(req.params.id);
      if (!activity) return res.status(404).json({ error: "Actividad no encontrada" });

      const isObispado = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"].includes(user.role);
      const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion", "lider_actividades"].includes(user.role);
      const canSubmit = isObispado || (isOrgMember && activity.organizationId === user.organizationId);
      if (!canSubmit) return res.status(403).json({ error: "Sin permiso" });

      if (activity.approvalStatus !== "draft" && activity.approvalStatus !== "needs_revision") {
        return res.status(409).json({ error: "Solo se pueden enviar actividades en borrador o con revisión pendiente" });
      }

      const updated = await storage.updateActivity(req.params.id, {
        approvalStatus: "submitted",
        submittedAt: new Date(),
      } as any);

      // Notify obispado
      const allUsers = await storage.getAllUsers();
      const obispadoUsers = allUsers.filter((u: any) =>
        ["obispo", "consejero_obispo", "secretario_ejecutivo"].includes(u.role)
      );
      for (const ou of obispadoUsers) {
        await storage.createNotification({
          userId: ou.id,
          type: "reminder",
          title: "Actividad enviada para aprobación",
          description: `${activity.title} — lista para tu revisión`,
          relatedId: activity.id,
          isRead: false,
        });
        if (isPushConfigured()) {
          await sendPushNotification(ou.id, {
            title: "Actividad para aprobar",
            body: `${activity.title} fue enviada para aprobación`,
            url: "/activities",
          });
        }
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Error al enviar actividad" });
    }
  });

  // ── PATCH /api/activities/:id/approve ─────────────────────────────────────
  app.patch("/api/activities/:id/approve", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!["obispo", "consejero_obispo", "secretario_ejecutivo"].includes(user.role)) {
        return res.status(403).json({ error: "Sin permiso" });
      }

      const activity = await storage.getActivity(req.params.id);
      if (!activity) return res.status(404).json({ error: "Actividad no encontrada" });
      if (activity.approvalStatus !== "submitted") {
        return res.status(409).json({ error: "Solo se pueden aprobar actividades enviadas" });
      }

      // Generate unique slug: title-slug + short id
      const baseSlug = activity.title
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      const shortId = Math.random().toString(36).slice(2, 8);
      const slug = `${baseSlug}-${shortId}`;

      const updated = await storage.updateActivity(req.params.id, {
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: user.id,
        isPublic: true,
        slug,
      } as any);

      // Notify org presidency
      if (activity.organizationId) {
        const allUsers = await storage.getAllUsers();
        const orgMembers = allUsers.filter((u: any) =>
          u.organizationId === activity.organizationId &&
          ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion", "lider_actividades"].includes(u.role)
        );
        for (const member of orgMembers) {
          await storage.createNotification({
            userId: member.id,
            type: "reminder",
            title: "Actividad aprobada",
            description: `${activity.title} fue aprobada. Slug público: /actividades/${slug}`,
            relatedId: activity.id,
            isRead: false,
          });
          if (isPushConfigured()) {
            await sendPushNotification(member.id, {
              title: "Actividad aprobada",
              body: `${activity.title} fue aprobada y ya es pública`,
              url: `/actividades/${slug}`,
            });
          }
        }
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Error al aprobar actividad" });
    }
  });

  // ── PATCH /api/activities/:id/reject ──────────────────────────────────────
  app.patch("/api/activities/:id/reject", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!["obispo", "consejero_obispo", "secretario_ejecutivo"].includes(user.role)) {
        return res.status(403).json({ error: "Sin permiso" });
      }

      const activity = await storage.getActivity(req.params.id);
      if (!activity) return res.status(404).json({ error: "Actividad no encontrada" });

      const { comment } = z.object({ comment: z.string().optional() }).parse(req.body);

      const updated = await storage.updateActivity(req.params.id, {
        approvalStatus: "needs_revision",
        approvalComment: comment ?? null,
      } as any);

      // Notify org
      if (activity.organizationId) {
        const allUsers = await storage.getAllUsers();
        const orgMembers = allUsers.filter((u: any) =>
          u.organizationId === activity.organizationId &&
          ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(u.role)
        );
        for (const member of orgMembers) {
          await storage.createNotification({
            userId: member.id,
            type: "reminder",
            title: "Actividad requiere revisión",
            description: `${activity.title}: ${comment ?? "Revisa los detalles y vuelve a enviar"}`,
            relatedId: activity.id,
            isRead: false,
          });
          if (isPushConfigured()) {
            await sendPushNotification(member.id, {
              title: "Actividad requiere revisión",
              body: `${activity.title} necesita correcciones`,
              url: "/activities",
            });
          }
        }
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Error al rechazar actividad" });
    }
  });

  // ── PATCH /api/activities/:id/basic ──────────────────────────────────────
  // Edit basic activity info (title, description, date, location, isPublic, type, requiresRegistration)
  app.patch("/api/activities/:id/basic", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const activity = await storage.getActivity(req.params.id);
      if (!activity) return res.status(404).json({ error: "Actividad no encontrada" });

      const isObispado = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"].includes(user.role);
      const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(user.role);
      const belongsToOrg = activity.organizationId === user.organizationId;
      if (!isObispado && !(isOrgMember && belongsToOrg)) {
        return res.status(403).json({ error: "Sin permiso" });
      }

      const { title, description, date, location, isPublic, type, requiresRegistration } = req.body;

      // If type changed, reset checklist items
      if (type !== undefined && type !== activity.type) {
        await db.execute(sql`DELETE FROM activity_checklist_items WHERE activity_id = ${req.params.id}`);
        const checklistDefs = getDefaultChecklistItems(type);
        if (checklistDefs.length > 0) {
          for (const item of checklistDefs) {
            await db.execute(sql`
              INSERT INTO activity_checklist_items (id, activity_id, item_key, label, sort_order, completed)
              VALUES (gen_random_uuid(), ${req.params.id}, ${item.key}, ${item.label}, ${item.sort}, false)
            `);
          }
        }
      }

      const updated = await storage.updateActivity(req.params.id, {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(date !== undefined && { date: parseDateString(date) }),
        ...(location !== undefined && { location }),
        ...(isPublic !== undefined && { isPublic }),
        ...(type !== undefined && { type }),
        ...(requiresRegistration !== undefined && { requiresRegistration }),
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Error al actualizar actividad" });
    }
  });

  // ── PATCH /api/activities/:id/section ─────────────────────────────────────
  // Update section form data and auto-mark checklist items as complete/incomplete
  app.patch("/api/activities/:id/section", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const activity = await storage.getActivity(req.params.id);
      if (!activity) return res.status(404).json({ error: "Actividad no encontrada" });

      const isObispado = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"].includes(user.role);
      const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(user.role);
      const isLiderAct = user.role === "lider_actividades";
      const belongsToOrg = activity.organizationId === user.organizationId;

      const { section, fields } = req.body as { section: string; fields: Record<string, string> };
      if (!section || !fields || typeof fields !== "object") {
        return res.status(400).json({ error: "Faltan datos de sección" });
      }

      // Permission check per section
      const canEditPrograma = isObispado || (isOrgMember && belongsToOrg);
      const canEditLogistica = isObispado || isLiderAct || (isOrgMember && belongsToOrg);
      if (section === "logistica" && !canEditLogistica) return res.status(403).json({ error: "Sin permiso" });
      if ((section === "programa" || section === "coordinacion") && !canEditPrograma) return res.status(403).json({ error: "Sin permiso" });

      // Merge new fields into existing section_data
      await db.execute(sql`
        UPDATE activities
        SET section_data = section_data || ${JSON.stringify(fields)}::jsonb
        WHERE id = ${req.params.id}
      `);

      // Auto-mark checklist items based on field values
      for (const [key, value] of Object.entries(fields)) {
        const isComplete = typeof value === "string" && value.trim().length > 0;
        await db.execute(sql`
          UPDATE activity_checklist_items
          SET completed = ${isComplete},
              completed_at = ${isComplete ? new Date().toISOString() : null},
              completed_by = ${isComplete ? user.id : null}
          WHERE activity_id = ${req.params.id} AND item_key = ${key}
        `);
      }

      // Auto-complete related assignments when section is fully done
      try {
        await autoCompleteAssignmentsForSection({ activityId: req.params.id, section });
      } catch (autoErr) {
        console.error("[PATCH /api/activities/:id/section] autoComplete error:", autoErr);
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("[Activities] PATCH section error:", err);
      res.status(500).json({ error: "Error al guardar sección" });
    }
  });

  // ── POST /api/activities/:id/flyer ────────────────────────────────────────
  // Upload flyer image for an activity
  app.post("/api/activities/:id/flyer", requireAuth, multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single("flyer"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const activity = await storage.getActivity(req.params.id);
      if (!activity) return res.status(404).json({ error: "Actividad no encontrada" });

      const isObispado = ["obispo", "consejero_obispo"].includes(user.role);
      const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion", "lider_actividades"].includes(user.role);
      if (!isObispado && !(isOrgMember && activity.organizationId === user.organizationId)) {
        return res.status(403).json({ error: "Sin permiso" });
      }

      if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });

      const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "jpg";
      const filename = `activity-flyer-${req.params.id}-${Date.now()}.${ext}`;
      const uploadDir = path.join(process.cwd(), "uploads", "flyers");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, req.file.buffer);

      const flyerUrl = `/uploads/flyers/${filename}`;
      const updated = await storage.updateActivity(req.params.id, { flyerUrl } as any);

      // Mark flyer checklist item as completed
      await db.execute(sql`
        UPDATE activity_checklist_items
        SET completed = true, completed_at = NOW(), completed_by = ${user.id}
        WHERE activity_id = ${req.params.id} AND item_key = 'prog_flyer' AND completed = false
      `);

      res.json({ flyerUrl, activity: updated });
    } catch (err) {
      res.status(500).json({ error: "Error al subir flyer" });
    }
  });

  // ── POST /api/activities/:id/generate-flyer-copy ────────────────────────────
  app.post("/api/activities/:id/generate-flyer-copy", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const activity = await storage.getActivity(req.params.id);
      if (!activity) return res.status(404).json({ error: "Actividad no encontrada" });

      const isObispado = ["obispo", "consejero_obispo"].includes(user.role);
      const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion", "lider_actividades"].includes(user.role);
      if (!isObispado && !(isOrgMember && activity.organizationId === user.organizationId)) {
        return res.status(403).json({ error: "Sin permiso" });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada" });

      // Fetch meeting center address from settings
      const template = await storage.getPdfTemplate();
      const meetingAddress = template?.meetingCenterAddress?.trim() || template?.meetingCenterName?.trim() || "";

      // Read photo manifest and select by category + round-robin anti-repetition
      const manifestPath = path.join(process.cwd(), "client", "public", "flyer-assets", "photo-manifest.json");
      type PhotoEntry = { file: string; category: string; tags: string[]; usedCount: number; lastUsed: string | null };
      let availablePhotos: PhotoEntry[] = [];
      try { availablePhotos = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch {}

      const typeToCategory: Record<string, string> = {
        servicio_bautismal: "bautismo",
        deportiva:          "deportiva",
        capacitacion:       "capacitacion",
        fiesta:             "festivo",
        hermanamiento:      "hermanamiento",
        actividad_org:      "hermanamiento",
        otro:               "general",
      };
      const targetCategory = typeToCategory[activity.type ?? "otro"] ?? "general";

      // Round-robin: least-recently-used photo in category first
      function pickRoundRobin(photos: PhotoEntry[], cat: string): PhotoEntry | null {
        const pool = photos.filter(p => p.category === cat);
        if (pool.length === 0) return null;
        return pool.sort((a, b) => {
          if (!a.lastUsed && !b.lastUsed) return (a.usedCount ?? 0) - (b.usedCount ?? 0);
          if (!a.lastUsed) return -1;
          if (!b.lastUsed) return 1;
          return new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime();
        })[0];
      }

      const selectedEntry =
        pickRoundRobin(availablePhotos, targetCategory) ??
        pickRoundRobin(availablePhotos, "general") ??
        (availablePhotos.length > 0 ? availablePhotos[Math.floor(Math.random() * availablePhotos.length)] : null);

      let selectedFondo = selectedEntry ? `photos/${selectedEntry.file}` : "fallback";

      // Update usage stats in manifest
      if (selectedEntry) {
        const idx = availablePhotos.findIndex(p => p.file === selectedEntry.file);
        if (idx !== -1) {
          availablePhotos[idx].usedCount = (availablePhotos[idx].usedCount ?? 0) + 1;
          availablePhotos[idx].lastUsed = new Date().toISOString();
          try { fs.writeFileSync(manifestPath, JSON.stringify(availablePhotos, null, 2)); } catch {}
        }
      }

      // Fetch secretary phone for registration activities
      let secretaryPhone = "";
      if ((activity as any).requiresRegistration && activity.organizationId) {
        const allUsers = await storage.getAllUsers();
        const orgSecretary = allUsers.find((u: any) =>
          u.organizationId === activity.organizationId &&
          ["secretario_organizacion"].includes(u.role) &&
          u.phone
        );
        if (orgSecretary) secretaryPhone = (orgSecretary as any).phone || "";
      }

      const activityDate = new Date(activity.date);
      const fechaPrompt = activityDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
      const horaPrompt = activityDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

      const requiresReg = !!(activity as any).requiresRegistration;

      const tipoLabels: Record<string, string> = {
        servicio_bautismal: "Servicio Bautismal",
        deportiva: "Deportiva / Juegos",
        capacitacion: "Capacitación / Devocional",
        fiesta: "Fiesta / Celebración",
        hermanamiento: "Hermanamiento / Reunión Social",
        actividad_org: "Actividad de Organización",
        otro: "Actividad General",
      };

      const ctaInstructions = requiresReg
        ? `CTA: debe invitar a inscribirse. ${secretaryPhone ? `Incluye el texto "Contacto: ${secretaryPhone}" en el CTA o descripción.` : "Indica que deben inscribirse con anticipación."}`
        : `CTA: debe invitar a asistir libremente, sin inscripción previa. Sugiere traer amigos y familiares.`;

      const prompt = `Eres un experto en neuromarketing y copywriting para comunidades religiosas LDS.
Genera el copy para un flyer de esta actividad:
- Tipo: ${tipoLabels[activity.type ?? "otro"] ?? "Actividad"}
- Nombre: ${activity.title}
- Fecha: ${fechaPrompt}
- Hora: ${horaPrompt}
- Lugar: ${meetingAddress || activity.location || "Por confirmar"}
- Descripción adicional: ${activity.description ?? "Sin descripción"}
- Requiere inscripción: ${requiresReg ? "Sí" : "No"}

${ctaInstructions}

Devuelve SOLO un objeto JSON válido con esta estructura exacta, sin texto adicional:
{
  "titulo": "título emocional máximo 5 palabras",
  "hook": "frase de impacto máximo 10 palabras, sutil toque LDS",
  "descripcion": "descripción corta máximo 20 palabras, cálida y motivadora",
  "cta": "llamada a la acción máximo 6 palabras${secretaryPhone && requiresReg ? ` (incluye el teléfono ${secretaryPhone})` : ""}"
}`;

      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      });

      const content = message.content[0];
      if (content.type !== "text") throw new Error("Respuesta inesperada");

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No se pudo parsear la respuesta");

      const copy = JSON.parse(jsonMatch[0]);
      if (!copy.titulo || !copy.hook || !copy.descripcion || !copy.cta) {
        throw new Error("Respuesta incompleta");
      }
      // Photo selected by backend (random among best match), not by Claude
      copy.fondo = selectedFondo;

      copy.lugar = template?.meetingCenterName?.trim() || meetingAddress || activity.location || "";
      copy.barrio = template?.wardName?.trim() || "";

      res.json(copy);
    } catch (err: any) {
      console.error("[generate-flyer-copy]", err);
      res.status(500).json({ error: err.message ?? "Error al generar copy" });
    }
  });

  // ── POST /api/flyer-assets/photo ─────────────────────────────────────────────
  // Upload a photo to flyer-assets/photos/ and register it in photo-manifest.json
  app.post("/api/flyer-assets/photo", requireAuth,
    multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single("photo"),
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        const isObispado = ["obispo", "consejero_obispo"].includes(user.role);
        const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion", "lider_actividades"].includes(user.role);
        if (!isObispado && !isOrgMember) return res.status(403).json({ error: "Sin permiso" });
        if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });

        const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "jpg";
        const baseName = req.file.originalname
          .replace(/\.[^.]+$/, "")
          .replace(/[^a-z0-9_-]/gi, "-")
          .toLowerCase();

        // Claude Vision: auto-categorize and tag the photo
        const validCategories = ["bautismo", "deportiva", "hermanamiento", "festivo", "capacitacion", "general"];
        let category = "general";
        let tags: string[] = [];
        const visionApiKey = process.env.ANTHROPIC_API_KEY;
        if (visionApiKey) {
          try {
            const visionClient = new Anthropic({ apiKey: visionApiKey });
            const base64 = req.file.buffer.toString("base64");
            const mimeType = ext === "png" ? "image/png" as const : ext === "webp" ? "image/webp" as const : "image/jpeg" as const;
            const visionRes = await visionClient.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 150,
              messages: [{
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
                  { type: "text", text: `Analiza esta imagen para usarla como fondo en flyers de actividades de una iglesia LDS.
Devuelve SOLO un JSON con esta estructura exacta:
{"category":"una de: bautismo, deportiva, hermanamiento, festivo, capacitacion, general","tags":["3-6 palabras clave descriptivas en español, minúsculas"]}` }
                ]
              }]
            });
            const txt = visionRes.content[0];
            if (txt.type === "text") {
              const m = txt.text.match(/\{[\s\S]*\}/);
              if (m) {
                const parsed = JSON.parse(m[0]);
                if (validCategories.includes(parsed.category)) category = parsed.category;
                if (Array.isArray(parsed.tags)) tags = parsed.tags.slice(0, 6).map(String);
              }
            }
          } catch (vErr) {
            console.error("[Vision tagging]", vErr);
          }
        }
        // Fallback tags from filename if Vision didn't run or returned empty
        if (tags.length === 0) {
          tags = baseName.replace(/\d+$/, "").split(/[-_]+/).filter(Boolean);
        }

        // Save to subcategory folder with clean naming (templo.jpg → templo1.jpg → templo2.jpg)
        const photosDir = path.join(process.cwd(), "client", "public", "flyer-assets", "photos", category);
        if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
        const existing = fs.readdirSync(photosDir).map(f => f.replace(/\.[^.]+$/, ""));
        let filename: string;
        if (!existing.includes(baseName)) {
          filename = `${baseName}.${ext}`;
        } else {
          let n = 1;
          while (existing.includes(`${baseName}${n}`)) n++;
          filename = `${baseName}${n}.${ext}`;
        }
        fs.writeFileSync(path.join(photosDir, filename), req.file.buffer);

        const fileEntry = `${category}/${filename}`;
        const mPath = path.join(process.cwd(), "client", "public", "flyer-assets", "photo-manifest.json");
        let manifest: Array<{ file: string; category: string; tags: string[]; usedCount: number; lastUsed: string | null }> = [];
        try { manifest = JSON.parse(fs.readFileSync(mPath, "utf8")); } catch {}

        // Enforce max 10 per category — remove least-used (then oldest) if over limit
        const MAX_PER_CATEGORY = 10;
        const inCategory = manifest.filter(p => p.category === category);
        if (inCategory.length >= MAX_PER_CATEGORY) {
          const toRemove = [...inCategory].sort((a, b) => {
            if ((a.usedCount ?? 0) !== (b.usedCount ?? 0)) return (a.usedCount ?? 0) - (b.usedCount ?? 0);
            if (!a.lastUsed) return -1;
            if (!b.lastUsed) return 1;
            return new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime();
          })[0];
          const removeDisk = path.join(process.cwd(), "client", "public", "flyer-assets", "photos", toRemove.file);
          try { fs.unlinkSync(removeDisk); } catch {}
          manifest = manifest.filter(p => p.file !== toRemove.file);
        }

        manifest.push({ file: fileEntry, category, tags, usedCount: 0, lastUsed: null });
        fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2));

        res.json({ url: `/flyer-assets/photos/${fileEntry}`, file: fileEntry, category, tags });
      } catch (err) {
        console.error("[POST /api/flyer-assets/photo]", err);
        res.status(500).json({ error: "Error al subir foto" });
      }
    }
  );

  // ── POST /api/flyer-assets/sync ──────────────────────────────────────────────
  // Scan category folders on disk and reconcile with photo-manifest.json.
  // ?vision=false  → skip Vision, use filename tags only (instant, free)
  // ?vision=true   → Vision tagging in parallel batches of 8 (default)
  // Respects max 10 per category: excess photos stay on disk but aren't added to manifest.
  app.post("/api/flyer-assets/sync", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!["obispo", "consejero_obispo"].includes(user.role)) {
        return res.status(403).json({ error: "Sin permiso" });
      }

      const useVision = req.query.vision !== "false";
      const MAX_PER_CATEGORY = 10;
      const BATCH_SIZE = 8;
      const validCategories = ["bautismo", "deportiva", "hermanamiento", "festivo", "capacitacion", "general"];
      const photosBase = path.join(process.cwd(), "client", "public", "flyer-assets", "photos");
      const mPath = path.join(process.cwd(), "client", "public", "flyer-assets", "photo-manifest.json");
      const apiKey = process.env.ANTHROPIC_API_KEY;

      type PhotoEntry = { file: string; category: string; tags: string[]; usedCount: number; lastUsed: string | null };
      let manifest: PhotoEntry[] = [];
      try { manifest = JSON.parse(fs.readFileSync(mPath, "utf8")); } catch {}

      // 1. Remove stale entries (file deleted from disk)
      const before = manifest.length;
      manifest = manifest.filter(p => fs.existsSync(path.join(photosBase, p.file)));
      const removed = before - manifest.length;

      // 2. Collect new files not yet in manifest, respecting per-category limit
      const manifestFiles = new Set(manifest.map(p => p.file));
      const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
      const newFiles: { entry: string; cat: string; file: string }[] = [];
      const skipped: string[] = [];

      for (const cat of validCategories) {
        const catDir = path.join(photosBase, cat);
        if (!fs.existsSync(catDir)) continue;
        const inManifest = manifest.filter(p => p.category === cat).length;
        let slots = MAX_PER_CATEGORY - inManifest;
        const diskFiles = fs.readdirSync(catDir).filter(f => imageExts.has(path.extname(f).toLowerCase()));
        for (const file of diskFiles) {
          const entry = `${cat}/${file}`;
          if (manifestFiles.has(entry)) continue;
          if (slots <= 0) { skipped.push(entry); continue; }
          newFiles.push({ entry, cat, file });
          slots--;
        }
      }

      // 3. Tag new files — parallel batches if Vision, instant if not
      async function tagFile(entry: string, cat: string, file: string): Promise<PhotoEntry> {
        let tags: string[] = [];
        if (useVision && apiKey) {
          try {
            const buf = fs.readFileSync(path.join(photosBase, cat, file));
            const ext = path.extname(file).slice(1).toLowerCase();
            const mimeType = ext === "png" ? "image/png" as const : ext === "webp" ? "image/webp" as const : "image/jpeg" as const;
            const vc = new Anthropic({ apiKey });
            const vr = await vc.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 120,
              messages: [{ role: "user", content: [
                { type: "image", source: { type: "base64", media_type: mimeType, data: buf.toString("base64") } },
                { type: "text", text: `Dame SOLO un JSON: {"tags":["3-5 palabras clave en español, minúsculas"]} para usar esta imagen como fondo en un flyer LDS de tipo "${cat}".` }
              ]}]
            });
            const t = vr.content[0];
            if (t.type === "text") {
              const m = t.text.match(/\{[\s\S]*\}/);
              if (m) { const p = JSON.parse(m[0]); if (Array.isArray(p.tags)) tags = p.tags.slice(0, 5).map(String); }
            }
          } catch {}
        }
        if (tags.length === 0) {
          tags = file.replace(/\.[^.]+$/, "").replace(/\d+$/, "").split(/[-_]+/).filter(Boolean);
        }
        return { file: entry, category: cat, tags, usedCount: 0, lastUsed: null };
      }

      // Process in batches of BATCH_SIZE to avoid rate limits
      const toAdd: PhotoEntry[] = [];
      for (let i = 0; i < newFiles.length; i += BATCH_SIZE) {
        const batch = newFiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(f => tagFile(f.entry, f.cat, f.file)));
        toAdd.push(...results);
      }

      manifest.push(...toAdd);
      fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2));

      res.json({
        added: toAdd.length,
        removed,
        skipped: skipped.length,
        total: manifest.length,
        vision: useVision,
        newFiles: toAdd.map(p => p.file),
        skippedFiles: skipped,
      });
    } catch (err) {
      console.error("[POST /api/flyer-assets/sync]", err);
      res.status(500).json({ error: "Error al sincronizar" });
    }
  });

  // ── POST /api/activities/:id/reservation-receipt ────────────────────────────
  // Upload reservation receipt image for logistics
  app.post("/api/activities/:id/reservation-receipt", requireAuth,
    multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single("receipt"),
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        const activity = await storage.getActivity(req.params.id);
        if (!activity) return res.status(404).json({ error: "Actividad no encontrada" });

        const isObispado = ["obispo", "consejero_obispo"].includes(user.role);
        const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion", "lider_actividades"].includes(user.role);
        if (!isObispado && !(isOrgMember && activity.organizationId === user.organizationId)) {
          return res.status(403).json({ error: "Sin permiso" });
        }

        if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });

        const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "jpg";
        const filename = `activity-receipt-${req.params.id}-${Date.now()}.${ext}`;
        const uploadDir = path.join(process.cwd(), "uploads", "receipts");
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);

        const receiptUrl = `/uploads/receipts/${filename}`;
        // Store the receipt URL in sectionData
        const sectionData = (activity as any).sectionData ?? {};
        sectionData.coord_espacio_comprobante = receiptUrl;
        await storage.updateActivity(req.params.id, { sectionData } as any);

        res.json({ receiptUrl });
      } catch (err) {
        res.status(500).json({ error: "Error al subir comprobante" });
      }
    }
  );

  // ========================================
  // ASSIGNMENTS
  // ========================================

  app.get("/api/assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const isObispado = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero"].includes(user.role);
      const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(user.role);

      const assignments = await storage.getAllAssignments();

      if (isObispado) {
        return res.json(assignments);
      }

      if (isOrgMember) {
        const users = await storage.getAllUsers();
        const userOrganizationById = new Map(users.map((item) => [item.id, item.organizationId ?? null]));

        const visibleAssignments = assignments.filter((assignment: any) => {
          if (!assignment) return false;

          if (assignment.assignedTo === user.id || assignment.assignedBy === user.id) {
            return true;
          }

          const assigneeOrganizationId = assignment.assignedTo
            ? userOrganizationById.get(assignment.assignedTo)
            : null;
          const assignerOrganizationId = assignment.assignedBy
            ? userOrganizationById.get(assignment.assignedBy)
            : null;

          return (
            assigneeOrganizationId === user.organizationId ||
            assignerOrganizationId === user.organizationId
          );
        });

        return res.json(visibleAssignments);
      }

      // All other roles (mission_leader, ward_missionary, lider_actividades, etc.)
      // only see their own assignments
      return res.json(
        assignments.filter((a: any) => a?.assignedTo === user.id || a?.assignedBy === user.id)
      );
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Returns all pending/in-progress assignments grouped by §29.2.5 area
  app.get("/api/assignments/pending-by-area", requireAuth, async (req: Request, res: Response) => {
    try {
      const allAssignments = await storage.getAllAssignments();
      const areas = ["livingGospel", "careForOthers", "missionary", "familyHistory"] as const;
      const result: Record<string, any[]> = {};
      for (const area of areas) {
        result[area] = allAssignments.filter(
          (a: any) =>
            a.area === area &&
            a.status !== "completada" &&
            a.status !== "cancelada" &&
            a.status !== "archivada"
        );
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const assignmentData = insertAssignmentSchema.parse({
        ...req.body,
        assignedBy: req.session.userId,
      });
      const assignment = await storage.createAssignment(assignmentData);

      // Create notification for the assigned user
      if (assignment.assignedTo) {
        const notification = await storage.createNotification({
          userId: assignment.assignedTo,
          type: "assignment_created",
          title: "Nueva Asignación",
          description: `Se te ha asignado: "${assignment.title}"`,
          relatedId: assignment.id,
          isRead: false,
        });
        
        if (isPushConfigured()) {
          await sendPushNotification(assignment.assignedTo, {
            title: "Nueva Asignación",
            body: `Se te ha asignado: "${assignment.title}"`,
            url: "/assignments",
            notificationId: notification.id,
          });
        }

        // Email for ward council assignments (those with an area)
        if (assignment.area) {
          const assignee = await storage.getUser(assignment.assignedTo);
          if (assignee?.email) {
            const template = await storage.getPdfTemplate();
            const dueLabel = assignment.dueDate
              ? new Date(assignment.dueDate).toLocaleDateString("es-ES", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : null;
            await sendWardCouncilAssignmentEmail({
              toEmail: assignee.email,
              recipientName: shortName(assignee),
              assignmentTitle: assignment.title,
              dueDate: dueLabel,
              wardName: template?.wardName,
            }).catch((err) => console.error("[WardCouncil email] Error:", err));
          }
        }
      }

      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/assignments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      
      // Get the assignment to check permissions
      const assignment = await storage.getAssignment(id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Permisos de edición:
      // - Obispo y consejero del obispado pueden editar cualquiera.
      // - Quien asigna puede editar su asignación.
      // - Quien recibe solo puede cambiar estado (no editar campos estructurales).
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
      const isAssignedTo = assignment.assignedTo === user.id;
      const isCreatedBy = assignment.assignedBy === user.id;
      const canEditAssignment = isObispado || isCreatedBy;

      if (!canEditAssignment && !isAssignedTo) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (!canEditAssignment) {
        const attemptedFields = Object.keys(req.body ?? {}).filter((key) => key !== "status");
        if (attemptedFields.length > 0) {
          return res.status(403).json({
            error: "Solo quien asigna (o el obispado) puede editar esta asignación",
          });
        }
      }

      const isAutoManagedAssignment =
        assignment.relatedTo?.startsWith("interview:") ||
        (assignment.relatedTo?.startsWith("budget:") &&
          ["Adjuntar comprobantes de gasto", "Firmar solicitud de gasto"].includes(assignment.title || ""));

      if (req.body?.status && isAutoManagedAssignment) {
        return res.status(400).json({
          error: "El estado de esta asignación se actualiza automáticamente por su flujo relacionado",
        });
      }

      if (
        req.body?.status === "completada" &&
        assignment.relatedTo?.startsWith("interview:") &&
        !isObispado
      ) {
        return res.status(403).json({
          error: "Forbidden - Only obispado can complete interview assignments",
        });
      }

      if (
        req.body?.status === "completada" &&
        assignment.relatedTo?.startsWith("budget:") &&
        assignment.title === "Adjuntar comprobantes de gasto"
      ) {
        return res.status(400).json({
          error: "Completion is automated for expense receipt assignments",
        });
      }

      const { cancellationReason, ...assignmentBody } = req.body;
      const assignmentData = insertAssignmentSchema.partial().parse(assignmentBody);

      const trimmedCancellationReason = getTrimmedCancellationReason({
        cancellationReason,
        ...req.body,
      });

      if (assignmentData.status === "cancelada") {
        if (!canEditAssignment) {
          return res.status(403).json({
            error: "Solo quien asignó la tarea o el obispado puede cancelarla",
          });
        }

        if (!trimmedCancellationReason) {
          return res.status(400).json({ error: "El motivo de cancelación es obligatorio" });
        }

        assignmentData.notes = [
          assignment.notes,
          `Motivo de cancelación: ${trimmedCancellationReason}`,
        ]
          .filter(Boolean)
          .join("\n");
        assignmentData.status = "archivada";
        assignmentData.resolution = "cancelada";
      }

      if (assignmentData.status === "completada") {
        assignmentData.status = "archivada";
        assignmentData.resolution = "completada";
      }

      if (assignmentData.status === "archivada" && !assignmentData.resolution && assignment.resolution) {
        assignmentData.resolution = assignment.resolution;
      }

      if (assignmentData.resolution === "cancelada" && !trimmedCancellationReason) {
        return res.status(400).json({ error: "El motivo de cancelación es obligatorio" });
      }

      if (assignmentData.resolution === "cancelada") {
        assignmentData.cancellationReason = trimmedCancellationReason;
        assignmentData.cancelledAt = new Date();
        assignmentData.archivedAt = new Date();
      } else if (assignmentData.resolution === "completada" || assignmentData.status === "archivada") {
        assignmentData.cancellationReason = null;
        assignmentData.cancelledAt = null;
        assignmentData.archivedAt = new Date();
      }

      const updatedAssignment = await storage.updateAssignment(id, assignmentData);
      if (!updatedAssignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const statusLabels: Record<string, string> = {
        pendiente: "pendiente",
        en_proceso: "en proceso",
        completada: "completada",
        cancelada: "cancelada",
        archivada: "archivada",
      };
      const resolvedStatusLabel =
        updatedAssignment.status === "archivada" && updatedAssignment.resolution
          ? statusLabels[updatedAssignment.resolution] || updatedAssignment.resolution
          : statusLabels[updatedAssignment.status] || updatedAssignment.status;
      const statusText = assignmentData.status
        ? ` Estado: ${resolvedStatusLabel}.`
        : "";
      const recipients = new Set<string>(
        [updatedAssignment.assignedTo, updatedAssignment.assignedBy].filter(Boolean) as string[]
      );
      recipients.delete(req.session.userId!);

      for (const userId of recipients) {
        const notification = await storage.createNotification({
          userId,
          type: "reminder",
          title: "Asignación actualizada",
          description: `La asignación "${updatedAssignment.title}" ha sido actualizada.${statusText}`,
          relatedId: updatedAssignment.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(userId, {
            title: "Asignación actualizada",
            body: `La asignación "${updatedAssignment.title}" ha sido actualizada.${statusText}`,
            url: `/assignments?highlight=${encodeURIComponent(updatedAssignment.id)}`,
            notificationId: notification.id,
          });
        }
      }

      // When secretario_financiero completes the disbursement assignment → notify bishop
      const isDisbursementCompletion =
        updatedAssignment.resolution === "completada" &&
        updatedAssignment.relatedTo?.startsWith("budget:") &&
        updatedAssignment.title === "Generar desembolso en el sistema de la Iglesia";

      if (isDisbursementCompletion) {
        const budgetId = updatedAssignment.relatedTo!.replace("budget:", "");
        const budgetRequest = await storage.getBudgetRequest(budgetId);
        if (budgetRequest) {
          const allUsers = await storage.getAllUsers();
          const bishop = allUsers.find((u: any) => u.role === "obispo");
          if (bishop) {
            const disbursementDoneNotification = await storage.createNotification({
              userId: bishop.id,
              type: "budget_approved",
              title: "Desembolso generado — Acción requerida",
              description: `El secretario financiero ha generado el desembolso para "${budgetRequest.description}". Por favor finaliza la aprobación en el sistema de la Iglesia.`,
              relatedId: budgetRequest.id,
              isRead: false,
            });

            if (isPushConfigured()) {
              await sendPushNotification(bishop.id, {
                title: "Desembolso generado",
                body: `Entra al sistema de la Iglesia y finaliza la aprobación del desembolso para "${budgetRequest.description}".`,
                url: `/budget?highlight=${encodeURIComponent(budgetRequest.id)}`,
                notificationId: disbursementDoneNotification.id,
              });
            }

            if (bishop.email) {
              const template = await storage.getPdfTemplate();
              const secretary = allUsers.find((u: any) => u.id === updatedAssignment.assignedTo);
              const madridHour = new Date().toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false });
              await sendBudgetDisbursementCompletedEmail({
                toEmail: bishop.email,
                recipientName: shortName(bishop),
                recipientSex: bishop.sex ?? null,
                secretaryName: shortName(secretary) || "el secretario financiero",
                budgetDescription: budgetRequest.description,
                budgetAmount: budgetRequest.amount,
                wardName: template?.wardName,
                timeLabel: madridHour,
              }).catch((err) => console.error("[BudgetDisbursementCompleted email] Error:", err));
            }
          }
        }
      }

      res.json(updatedAssignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/assignments/:id", requireAuth, async (_req: Request, res: Response) => {
    try {
      const req = _req as Request;
      const user = (req as any).user;
      const { id } = req.params;

      if (!user || user.role !== "obispo") {
        return res.status(403).json({
          error: "Solo el obispo puede eliminar asignaciones",
        });
      }

      const assignment = await storage.getAssignment(id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      await storage.deleteAssignment(id);
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // ORGANIZATIONS
  // ========================================

  app.get("/api/organizations", requireAuth, async (req: Request, res: Response) => {
    try {
      const organizations = await storage.getAllOrganizations();
      res.json(organizations);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // HYMNS
  // ========================================

  app.get("/api/hymns", requireAuth, async (req: Request, res: Response) => {
    try {
      const hymns = await storage.getAllHymns();
      res.json(hymns);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // REPORTS
  // ========================================

  app.get("/api/reports", requireAuth, async (req: Request, res: Response) => {
    try {
      const periodMonths = parseInt(req.query.period as string) || 3;
      const orgFilter = req.query.org as string;
      
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - periodMonths);
      
      const [meetings, councils, interviews, activities, budgets, organizations] = await Promise.all([
        storage.getAllSacramentalMeetings(),
        storage.getAllWardCouncils(),
        storage.getAllInterviews(),
        storage.getAllActivities(),
        storage.getAllBudgetRequests(),
        storage.getAllOrganizations(),
      ]);

      // Filter data by period
      const filteredMeetings = meetings.filter(m => new Date(m.date) >= cutoffDate);
      const filteredCouncils = councils.filter(c => new Date(c.date) >= cutoffDate);
      const filteredInterviews = interviews.filter(i => new Date(i.date) >= cutoffDate);
      const filteredActivities = activities.filter(a => new Date(a.date) >= cutoffDate);
      const filteredBudgets = budgets.filter(b => new Date(b.createdAt) >= cutoffDate);

      // Build budget by organization from real data
      const orgTypeNames: Record<string, string> = {
        hombres_jovenes: "Cuórum del Sacerdocio Aarónico",
        mujeres_jovenes: "Mujeres Jóvenes",
        sociedad_socorro: "Sociedad de Socorro",
        primaria: "Primaria",
        escuela_dominical: "Escuela Dominical",
        jas: "Liderazgo JAS",
        cuorum_elderes: "Cuórum de Élderes",
      };

      const budgetByOrganization = organizations
        .filter(org => org.type !== "obispado" && org.type !== "barrio")
        .map(org => {
          const orgBudgets = filteredBudgets.filter(b => b.organizationId === org.id);
          return {
            org: orgTypeNames[org.type] || org.name,
            approved: orgBudgets.filter(b => b.status === "aprobado" || b.status === "completado").length,
            pending: orgBudgets.filter(b => b.status === "solicitado" || b.status === "en_proceso").length,
            total: orgBudgets.reduce((sum, b) => sum + b.amount, 0),
          };
        })
        .filter(org => org.approved > 0 || org.pending > 0 || org.total > 0);

      // Build interviews by month from real data
      const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const interviewsByMonthMap: Record<string, { completed: number; pending: number }> = {};
      
      filteredInterviews.forEach(interview => {
        const date = new Date(interview.date);
        const monthKey = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
        if (!interviewsByMonthMap[monthKey]) {
          interviewsByMonthMap[monthKey] = { completed: 0, pending: 0 };
        }
        if (interview.resolution === "completada" || interview.status === "completada") {
          interviewsByMonthMap[monthKey].completed++;
        } else if (interview.status === "programada") {
          interviewsByMonthMap[monthKey].pending++;
        }
      });

      const interviewsByMonth = Object.entries(interviewsByMonthMap)
        .map(([month, data]) => ({ month, ...data }))
        .slice(-6); // Last 6 months with data

      // Build activities by organization from real data
      const activitiesByOrganization = organizations
        .filter(org => org.type !== "obispado" && org.type !== "barrio")
        .map(org => {
          const orgActivities = filteredActivities.filter(a => a.organizationId === org.id);
          return {
            org: orgTypeNames[org.type] || org.name,
            count: orgActivities.length,
          };
        })
        .filter(org => org.count > 0);

      const reportData = {
        period: `${periodMonths} months`,
        meetingsByType: [
          { type: "Sacramental", count: filteredMeetings.length },
          { type: "Consejo", count: filteredCouncils.length },
        ],
        budgetByStatus: [
          { status: "Solicitado", count: filteredBudgets.filter(b => b.status === "solicitado").length, amount: filteredBudgets.filter(b => b.status === "solicitado").reduce((sum, b) => sum + Number(b.amount), 0) },
          { status: "Aprobado", count: filteredBudgets.filter(b => b.status === "aprobado").length, amount: filteredBudgets.filter(b => b.status === "aprobado").reduce((sum, b) => sum + Number(b.amount), 0) },
          { status: "En Proceso", count: filteredBudgets.filter(b => b.status === "en_proceso").length, amount: filteredBudgets.filter(b => b.status === "en_proceso").reduce((sum, b) => sum + Number(b.amount), 0) },
          { status: "Completado", count: filteredBudgets.filter(b => b.status === "completado").length, amount: filteredBudgets.filter(b => b.status === "completado").reduce((sum, b) => sum + Number(b.amount), 0) },
        ],
        budgetByOrganization,
        interviewsByMonth,
        activitiesByOrganization,
        totalMetrics: {
          totalMeetings: filteredMeetings.length + filteredCouncils.length,
          totalBudget: filteredBudgets.reduce((sum, b) => sum + Number(b.amount), 0),
          totalInterviews: filteredInterviews.length,
          totalActivities: filteredActivities.length,
        },
      };

      res.json(reportData);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // NOTIFICATIONS
  // ========================================

  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const notifications = await storage.getNotificationsByUser(req.session.userId!);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/notifications/count", requireAuth, async (req: Request, res: Response) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.session.userId!);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(notificationData);
      res.status(201).json(notification);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const notification = await storage.markNotificationAsRead(id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/notifications/mark-all-read", requireAuth, async (req: Request, res: Response) => {
    try {
      const notifications = await storage.getNotificationsByUser(req.session.userId!);
      const unreadNotifications = notifications.filter(n => !n.isRead);
      
      for (const notification of unreadNotifications) {
        await storage.markNotificationAsRead(notification.id);
      }
      
      res.json({ message: "All notifications marked as read", count: unreadNotifications.length });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteNotification(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // PUSH NOTIFICATIONS
  // ========================================

  app.get("/api/push/vapid-public-key", (req: Request, res: Response) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return res.status(503).json({ error: "Push notifications not configured" });
    }
    res.json({ publicKey });
  });

  app.get("/api/push/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const subscriptions = await storage.getPushSubscriptionsByUser(userId);
      res.json({
        configured: isPushConfigured(),
        subscribed: subscriptions.length > 0,
        subscriptionCount: subscriptions.length,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/push/subscribe", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { endpoint, p256dh, auth } = req.body;
      
      if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({ error: "Invalid subscription data" });
      }

      const existing = await storage.getPushSubscriptionByEndpoint(endpoint);
      if (existing) {
        if (existing.userId !== userId || existing.p256dh !== p256dh || existing.auth !== auth) {
          await storage.deletePushSubscriptionByEndpoint(endpoint);
        } else {
          return res.json({ message: "Already subscribed", subscription: existing });
        }
      }

      const subscriptionData = insertPushSubscriptionSchema.parse({
        userId,
        endpoint,
        p256dh,
        auth,
      });

      const subscription = await storage.createPushSubscription(subscriptionData);

      if (isPushConfigured()) {
        await sendPushNotification(userId, {
          title: "Notificaciones Activadas",
          body: "Recibirás alertas incluso cuando la app esté cerrada.",
          tag: "welcome-push",
        });
      }

      res.status(201).json({ message: "Subscribed successfully", subscription });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Push subscribe error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/push/unsubscribe", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { endpoint } = req.body;

      if (!endpoint) {
        return res.status(400).json({ error: "Endpoint is required" });
      }

      const subscription = await storage.getPushSubscriptionByEndpoint(endpoint);
      if (!subscription || subscription.userId !== userId) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      await storage.deletePushSubscriptionByEndpoint(endpoint);
      res.json({ message: "Unsubscribed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  const birthdaySendHour = 8;
  const getServerDayKey = (date: Date) => date.toDateString();

  const startHourlyAlignedTask = (task: () => Promise<void>) => {
    const scheduleNextHour = () => {
      const now = new Date();
      const delayMs = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();

      setTimeout(() => {
        void task();
        setInterval(() => {
          void task();
        }, 60 * 60 * 1000);
      }, delayMs);
    };

    scheduleNextHour();
  };

  // ========================================
  // AUTOMATIC BIRTHDAY NOTIFICATIONS
  // ========================================
  
  // Function to send birthday notifications
  async function sendAutomaticBirthdayNotifications() {
    try {
      const currentHour = new Date().getHours();
      if (currentHour !== birthdaySendHour) {
        return;
      }

      const todayBirthdays = await storage.getTodayBirthdays();
      
      if (todayBirthdays.length === 0) {
        console.log("[Birthday Notifications] No birthdays today");
        return;
      }

      console.log(`[Birthday Notifications] Found ${todayBirthdays.length} birthday(s) today`);
      
      const allUsers = await storage.getAllUsers();
      let notificationsSent = 0;

      for (const birthday of todayBirthdays) {
        const age = new Date().getFullYear() - new Date(birthday.birthDate).getFullYear();
        
        for (const recipient of allUsers) {
          // Skip if the birthday person is the recipient
          if (birthday.name === recipient.name) continue;
          
          // Check if notification already sent today for this birthday
          const existingNotifications = await storage.getNotificationsByUser(recipient.id);
          const todayKey = getServerDayKey(new Date());
          const alreadyNotified = existingNotifications.some(
            (n) =>
              n.type === "birthday_today" &&
              n.relatedId === birthday.id &&
              getServerDayKey(new Date(n.createdAt)) === todayKey,
          );
          
          if (alreadyNotified) continue;
          
          const notification = await storage.createNotification({
            userId: recipient.id,
            type: "birthday_today",
            title: "Cumpleaños Hoy",
            description: `Hoy es el cumpleaños de ${shortNameFromString(birthday.name)} (${age} años)`,
            relatedId: birthday.id,
            isRead: false,
          });

          if (isPushConfigured()) {
            await sendPushNotification(recipient.id, {
              title: "Cumpleaños Hoy",
              body: `Hoy es el cumpleaños de ${shortNameFromString(birthday.name)} (${age} años)`,
              url: "/birthdays",
              notificationId: notification.id,
            });
          }
          
          notificationsSent++;
        }
      }

      console.log(`[Birthday Notifications] Sent ${notificationsSent} notifications`);
    } catch (error) {
      console.error("[Birthday Notifications] Error:", error);
    }
  }

  // ========================================
  // AUTOMATIC BIRTHDAY EMAILS
  // ========================================
  let lastBirthdayEmailDate: string | null = null;

  async function sendAutomaticBirthdayEmails() {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const todayKey = getServerDayKey(now);

      if (currentHour !== birthdaySendHour) {
        return;
      }

      if (lastBirthdayEmailDate === todayKey) {
        return;
      }

      const todayBirthdays = await storage.getTodayBirthdays();
      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;
      if (todayBirthdays.length === 0) {
        lastBirthdayEmailDate = todayKey;
        console.log("[Birthday Emails] No birthdays today");
        return;
      }

      const members = await storage.getAllMembers();

      let emailsSent = 0;
      for (const birthday of todayBirthdays) {
        if (!birthday.email) continue;

        const alreadySent = await storage.hasBirthdayEmailBeenSentToday(birthday.id, todayKey);
        if (alreadySent) {
          continue;
        }

        const normalizedBirthdayName = normalizeComparableName(birthday.name);
        const matchedMember = members.find((member) =>
          (birthday.email && member.email && member.email.toLowerCase() === birthday.email.toLowerCase()) ||
          normalizeComparableName(member.nameSurename) === normalizedBirthdayName
        );
        const organization = matchedMember?.organizationId
          ? await storage.getOrganization(matchedMember.organizationId)
          : null;
        const age = new Date().getFullYear() - new Date(birthday.birthDate).getFullYear();
        await sendBirthdayGreetingEmail({
          toEmail: birthday.email,
          name: shortName(matchedMember) || shortNameFromString(birthday.name),
          age,
          recipientSex: matchedMember?.sex,
          recipientOrganizationType: organization?.type,
          wardName,
        });
        await storage.createBirthdayEmailSend({
          birthdayId: birthday.id,
          dayKey: todayKey,
          recipientEmail: birthday.email,
        });
        emailsSent += 1;
      }

      lastBirthdayEmailDate = todayKey;
      console.log(`[Birthday Emails] Sent ${emailsSent} birthday email(s)`);
    } catch (error) {
      console.error("[Birthday Emails] Error:", error);
    }
  }

  let lastSacramentalReminderDate: string | null = null;
  const sentSacramentalReminderKeys = new Set<string>();

  async function sendAutomaticSacramentalAssignmentReminders() {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const todayKey = getServerDayKey(now);

      if (currentHour !== birthdaySendHour) {
        return;
      }

      if (lastSacramentalReminderDate !== todayKey) {
        sentSacramentalReminderKeys.clear();
        lastSacramentalReminderDate = todayKey;
      }

      const meetings = await storage.getAllSacramentalMeetings();
      const todayParts = parseMeetingDateParts(todayKey);
      if (!todayParts) return;
      const todayDateUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);

      let remindersSent = 0;
      for (const meeting of meetings) {
        const meetingParts = parseMeetingDateParts(meeting.date);
        if (!meetingParts) continue;

        const meetingDateUtc = Date.UTC(meetingParts.year, meetingParts.month - 1, meetingParts.day);
        const diffDays = Math.round((meetingDateUtc - todayDateUtc) / (24 * 60 * 60 * 1000));

        const reminderType = diffDays === 4 ? "midweek" : null;
        if (!reminderType) continue;

        const dedupeKey = `${todayKey}:${reminderType}:${meeting.id}`;
        if (sentSacramentalReminderKeys.has(dedupeKey)) continue;

        await notifySacramentalParticipants(meeting, { reminderType });
        sentSacramentalReminderKeys.add(dedupeKey);
        remindersSent += 1;
      }

      if (remindersSent > 0) {
        console.log(`[Sacramental Reminders] Sent ${remindersSent} meeting reminder batch(es)`);
      }
    } catch (error) {
      console.error("[Sacramental Reminders] Error:", error);
    }
  }

  async function runAgendaReminderWorker() {
    try {
      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;
      const due = await storage.getAgendaRemindersDue(new Date());
      for (const reminder of due) {
        try {
          const availability = await getDefaultAvailability(reminder.userId);
          const result = await processAgendaReminder({
            reminder,
            availability,
            deps: {
              getUserById: (userId) => storage.getUser(userId),
              getEventById: (eventId) => storage.getAgendaEvent(eventId),
              getTaskById: (taskId) => storage.getAgendaTask(taskId),
              sendPush: (userId, payload) => sendPushNotification(userId, payload),
              sendEmail: (payload) => sendAgendaReminderEmail({ ...payload, wardName }),
              isPushConfigured,
            },
          });

          if (result.action === "reschedule") {
            await storage.updateAgendaReminder(reminder.id, { remindAt: result.nextRemindAt || new Date(Date.now() + 15 * 60_000) });
            continue;
          }

          await storage.updateAgendaReminder(reminder.id, { status: result.action === "sent" ? "sent" : "failed" });
        } catch (error) {
          await storage.updateAgendaReminder(reminder.id, { status: "failed" });
        }
      }
    } catch (error) {
      console.error("[Agenda Reminders] Error:", error);
    }
  }

  async function sendAgendaDailyBriefing() {
    try {
      const users = await storage.getAllUsers();
      const now = new Date();
      for (const user of users) {
        const availability = await storage.getAvailabilityByUser(user.id);
        const timezone = availability?.timezone || "UTC";
        const localHour = Number(
          new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: timezone }).format(now)
        );
        if (localHour !== 8) continue;

        const [events, tasks] = await Promise.all([
          storage.getAgendaEventsByUser(user.id),
          storage.getAgendaTasksByUser(user.id),
        ]);

        const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
        const todayEvents = events.filter((event) => String(event.date) === todayKey);
        const openTasks = tasks.filter((task) => task.status === "open");
        const body = `Hoy tienes ${todayEvents.length} eventos y ${openTasks.length} tareas pendientes.`;

        const preferredChannels = getPreferredReminderChannels(availability as any);
        if (preferredChannels.includes("push") && isPushConfigured()) {
          await sendPushNotification(user.id, {
            title: "Briefing diario",
            body,
            url: "/agenda",
          });
        }
      }
    } catch (error) {
      console.error("[Agenda Briefing] Error:", error);
    }
  }

  // ========================================
  // BAPTISM SERVICE REMINDERS (2 weeks before)
  // ========================================

  let lastBaptismReminderDate: string | null = null;
  const sentBaptismReminderKeys = new Set<string>();

  async function sendAutomaticBaptismServiceReminders() {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      if (currentHour !== birthdaySendHour) return;

      const todayKey = getServerDayKey(now);
      if (lastBaptismReminderDate !== todayKey) {
        sentBaptismReminderKeys.clear();
        lastBaptismReminderDate = todayKey;
      }

      // Find personas with fecha_bautismo exactly 14 days from today
      const target = new Date(now);
      target.setUTCDate(target.getUTCDate() + 14);
      const targetDateStr = target.toISOString().split("T")[0]; // YYYY-MM-DD

      const result = await db.execute(sql`
        SELECT mp.id, mp.nombre, mp.fecha_bautismo, mp.unit_id
        FROM mission_personas mp
        WHERE mp.fecha_bautismo = ${targetDateStr}
          AND mp.is_archived = false
      `);

      if (result.rows.length === 0) return;

      const BAPTISM_REMINDER_ROLES = new Set([
        "obispo",
        "consejero_obispo",
        "mission_leader",
        "ward_missionary",
        "full_time_missionary",
      ]);

      let sent = 0;
      for (const persona of result.rows as any[]) {
        const dedupeKey = `baptism_reminder:${todayKey}:${persona.id}`;
        if (sentBaptismReminderKeys.has(dedupeKey)) continue;

        const allUsers = await storage.getAllUsers();

        // Core mission roles (organizationId = ward/unit)
        const missionRecipients = allUsers.filter(
          (u: any) =>
            u.organizationId === persona.unit_id &&
            BAPTISM_REMINDER_ROLES.has(u.role),
        );

        // Cuórum elders president and SS president (organizationId = their org, not the ward)
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
          const title = "Servicio Bautismal en 2 semanas";
          const body = `El servicio bautismal de ${persona.nombre} está programado para el ${persona.fecha_bautismo}. Recuerda preparar el programa.`;

          const notification = await storage.createNotification({
            userId: recipient.id,
            type: "reminder",
            title,
            description: body,
            relatedId: persona.id,
            isRead: false,
          });

          if (isPushConfigured()) {
            await sendPushNotification(recipient.id, {
              title,
              body,
              url: "/mission-work",
              notificationId: notification.id,
            });
          }

          if (recipient.email) {
            await sendBaptismReminderEmail({
              toEmail: recipient.email,
              recipientName: shortName(recipient),
              candidateName: persona.nombre,
              baptismDate: persona.fecha_bautismo,
              wardName,
            });
          }
        }

        sentBaptismReminderKeys.add(dedupeKey);
        sent += 1;
      }

      if (sent > 0) {
        console.log(`[Baptism Reminders] Sent reminders for ${sent} upcoming baptism(s)`);
      }
    } catch (error) {
      console.error("[Baptism Reminders] Error:", error);
    }
  }

  // ========================================
  // BAPTISM READINESS CHECK (t14/t10/t7/t2/t1)
  // ========================================
  // Sends a push notification to the mission leader when a service within
  // the next 14 days is still in draft or pending_approval (not yet approved).
  // Deduplicates using a simple in-memory key per day+service+rule bucket.
  const sentReadinessKeys = new Set<string>();
  let lastReadinessDate = "";

  async function sendAutomaticBaptismReadinessReminders() {
    try {
      const now = new Date();
      if (now.getHours() !== birthdaySendHour) return;

      const todayKey = getServerDayKey(now);
      if (lastReadinessDate !== todayKey) {
        sentReadinessKeys.clear();
        lastReadinessDate = todayKey;
      }

      const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const result = await db.execute(sql`
        SELECT id, location_name, service_at, created_by, approval_status
        FROM baptism_services
        WHERE service_at > ${now.toISOString()}
          AND service_at <= ${horizon.toISOString()}
          AND approval_status NOT IN ('approved', 'archived')
      `);

      for (const row of result.rows as any[]) {
        const daysUntil = Math.ceil((new Date(row.service_at).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        const rule = daysUntil <= 1 ? "t1" : daysUntil <= 2 ? "t2" : daysUntil <= 7 ? "t7" : daysUntil <= 10 ? "t10" : "t14";
        const dedupeKey = `readiness:${todayKey}:${row.id}:${rule}`;
        if (sentReadinessKeys.has(dedupeKey)) continue;

        if (!row.created_by) continue;
        const title = `Servicio bautismal no aprobado — ${daysUntil} día(s)`;
        const body = `El servicio en ${row.location_name} aún no está aprobado. Faltan ${daysUntil} día(s).`;

        await db.execute(sql`
          INSERT INTO notifications (user_id, title, message, type, is_read)
          VALUES (${row.created_by}, ${title}, ${body}, 'reminder', false)
        `);
        if (isPushConfigured()) {
          await sendPushNotification(row.created_by, { title, body, url: "/mission-work" });
        }
        sentReadinessKeys.add(dedupeKey);
      }
    } catch (error) {
      console.error("[BaptismReadiness] Error:", error);
    }
  }

  // ========================================
  // BAPTISM LOGISTICS DEADLINE REMINDERS
  // ========================================
  // Fires at birthdaySendHour on the due_date day of each lider_actividades task.
  // If the logistics task is still incomplete, notifies all stakeholders and
  // auto-completes the mission_leader_logistics oversight task.
  const sentLogisticsDeadlineKeys = new Set<string>();
  let lastLogisticsDeadlineDate = "";

  async function sendAutomaticLogisticsDeadlineReminders() {
    try {
      const now = new Date();
      if (now.getHours() !== birthdaySendHour) return;

      const todayKey = getServerDayKey(now);
      if (lastLogisticsDeadlineDate !== todayKey) {
        sentLogisticsDeadlineKeys.clear();
        lastLogisticsDeadlineDate = todayKey;
      }

      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      // Find pending lider_actividades tasks whose due_date is today
      const tasksResult = await db.execute(sql`
        SELECT st.id, st.baptism_service_id, st.assigned_to, st.due_date,
               bs.service_at, bs.unit_id
        FROM service_tasks st
        JOIN baptism_services bs ON bs.id = st.baptism_service_id
        WHERE st.assigned_role = 'lider_actividades'
          AND st.status != 'completed'
          AND st.due_date >= ${todayStart.toISOString()}
          AND st.due_date <= ${todayEnd.toISOString()}
          AND bs.approval_status = 'approved'
      `);

      if ((tasksResult.rows as any[]).length === 0) return;

      const allUsers = await storage.getAllUsers();
      const wardName = (await storage.getPdfTemplate())?.wardName ?? null;

      for (const task of tasksResult.rows as any[]) {
        const dedupeKey = `logistics_deadline:${todayKey}:${task.baptism_service_id}`;
        if (sentLogisticsDeadlineKeys.has(dedupeKey)) continue;

        // Candidate name(s)
        const candResult = await db.execute(sql`
          SELECT mp.nombre FROM baptism_service_candidates bsc
          JOIN mission_personas mp ON mp.id = bsc.persona_id
          WHERE bsc.service_id = ${task.baptism_service_id}
          ORDER BY mp.nombre
        `);
        const candNames = (candResult.rows as any[]).map((r) => r.nombre as string);
        function joinNamesEs(names: string[]) {
          if (names.length === 0) return "Servicio bautismal";
          if (names.length === 1) return names[0];
          if (names.length === 2) return `${names[0]} y ${names[1]}`;
          return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
        }
        const candidateName = joinNamesEs(candNames);
        const svcDate = new Date(task.service_at);
        const svcDateStr = `${String(svcDate.getUTCDate()).padStart(2, "0")}/${String(svcDate.getUTCMonth() + 1).padStart(2, "0")}/${svcDate.getUTCFullYear()}`;

        // Build recipient list: obispado + mission_leader + lider_actividades + org presidents/counselors
        const coreRoles = new Set(["obispo", "consejero_obispo", "mission_leader", "lider_actividades"]);
        const coreRecipients = allUsers.filter(
          (u: any) => u.organizationId === task.unit_id && coreRoles.has(u.role),
        );

        const orgLeadersResult = await db.execute(sql`
          SELECT u.id FROM users u
          JOIN organizations o ON o.id = u.organization_id
          WHERE u.role IN ('presidente_organizacion', 'consejero_organizacion')
            AND o.type IN ('cuorum_elderes', 'sociedad_socorro')
        `);
        const orgLeaderIds = new Set((orgLeadersResult.rows as any[]).map((r) => r.id));
        const orgLeaders = allUsers.filter(
          (u: any) => orgLeaderIds.has(u.id) && !coreRecipients.find((c: any) => c.id === u.id),
        );

        const recipients = [...coreRecipients, ...orgLeaders];

        const title = `⚠️ Logística bautismal — plazo hoy`;
        const body = `La coordinación logística del servicio bautismal de ${candidateName} (${svcDateStr}) vence hoy y aún está pendiente.`;

        for (const recipient of recipients) {
          const notif = await storage.createNotification({
            userId: recipient.id,
            type: "reminder",
            title,
            description: body,
            relatedId: task.baptism_service_id,
            isRead: false,
          });
          if (isPushConfigured()) {
            await sendPushNotification(recipient.id, {
              title,
              body,
              url: `/mission-work?section=servicios_bautismales&highlight=${task.baptism_service_id}`,
              notificationId: notif.id,
            });
          }
          if (recipient.email) {
            await sendAgendaReminderEmail({
              toEmail: recipient.email,
              subject: title,
              body: [
                `Estimado/a ${recipient.name},`,
                "",
                body,
                "",
                "Por favor, coordina o confirma el estado de la logística desde la aplicación.",
                "",
                wardName || "Tu barrio",
              ].join("\n"),
              wardName,
            });
          }
        }

        // Auto-complete the mission_leader_logistics oversight task
        await db.execute(sql`
          UPDATE service_tasks
          SET status = 'completed', completed_at = ${now.toISOString()}, updated_at = ${now.toISOString()}
          WHERE baptism_service_id = ${task.baptism_service_id}
            AND assigned_role = 'mission_leader_logistics'
            AND status != 'completed'
        `);

        sentLogisticsDeadlineKeys.add(dedupeKey);
        console.log(`[LogisticsDeadline] Notified ${recipients.length} recipients for ${candidateName} (${svcDateStr})`);
      }
    } catch (error) {
      console.error("[LogisticsDeadline] Error:", error);
    }
  }

  // ========================================
  // ACTIVITY DEADLINE REMINDERS + AUTO-CANCEL
  // ========================================
  // Runs daily at 08:00. For actividad_org activities:
  //   T-14: notify org to finalize and submit to bishop
  //   T-13 to T-11: escalating urgent reminders
  //   T-10: auto-cancel if still not submitted
  const sentActivityDeadlineKeys = new Set<string>();
  let lastActivityDeadlineDate = "";

  async function sendAutomaticActivityDeadlineReminders() {
    try {
      const now = new Date();
      if (now.getHours() !== birthdaySendHour) return;

      const todayKey = getServerDayKey(now);
      if (lastActivityDeadlineDate !== todayKey) {
        sentActivityDeadlineKeys.clear();
        lastActivityDeadlineDate = todayKey;
      }

      const allUsers = await storage.getAllUsers();

      // Find actividad_org activities in draft/needs_revision/submitted with date in next 10-14 days
      const windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() + 10);
      windowStart.setHours(0, 0, 0, 0);
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + 14);
      windowEnd.setHours(23, 59, 59, 999);

      const pendingResult = await db.execute(sql`
        SELECT a.id, a.title, a.date, a.organization_id, a.approval_status
        FROM activities a
        WHERE a.type = 'actividad_org'
          AND a.approval_status IN ('draft', 'needs_revision', 'submitted')
          AND a.date >= ${windowStart.toISOString()}
          AND a.date <= ${windowEnd.toISOString()}
      `);

      for (const act of pendingResult.rows as any[]) {
        const actDate = new Date(act.date);
        const daysUntil = Math.ceil((actDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const dedupeKey = `act_deadline:${todayKey}:${act.id}:d${daysUntil}`;
        if (sentActivityDeadlineKeys.has(dedupeKey)) continue;

        const orgMembers = act.organization_id
          ? allUsers.filter((u: any) =>
              u.organizationId === act.organization_id &&
              ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion", "lider_actividades"].includes(u.role)
            )
          : [];
        const obispadoMembers = allUsers.filter((u: any) =>
          ["obispo", "consejero_obispo", "secretario_ejecutivo"].includes(u.role)
        );

        if (daysUntil <= 10 && act.approval_status !== "submitted") {
          // AUTO-CANCEL
          await db.execute(sql`
            UPDATE activities
            SET approval_status = 'cancelled', updated_at = NOW()
            WHERE id = ${act.id}
          `);
          // Remove quarterly_plan_item link
          await db.execute(sql`
            UPDATE quarterly_plan_items SET activity_id = NULL
            WHERE activity_id = ${act.id}
          `);

          const recipients = [...orgMembers, ...obispadoMembers];
          for (const r of recipients) {
            await storage.createNotification({
              userId: r.id,
              type: "reminder",
              title: "Actividad cancelada automáticamente",
              description: `${act.title} fue cancelada por no haber sido enviada para aprobación a tiempo.`,
              relatedId: act.id,
              isRead: false,
            });
            if (isPushConfigured()) {
              await sendPushNotification(r.id, {
                title: "Actividad cancelada",
                body: `${act.title} fue cancelada por no enviarse al obispo a tiempo`,
                url: "/activities",
              });
            }
          }
          sentActivityDeadlineKeys.add(dedupeKey);
          console.log(`[ActivityDeadline] Auto-cancelled activity ${act.id} (${act.title}) — ${daysUntil} days remaining`);

        } else if (daysUntil === 14 || (daysUntil < 14 && daysUntil > 10 && act.approval_status !== "submitted")) {
          // REMINDER: submit now
          const isUrgent = daysUntil < 14;
          const title = isUrgent
            ? `⚠️ Urgente: envía "${act.title}" al obispo`
            : `Recordatorio: envía "${act.title}" al obispo`;
          const body = isUrgent
            ? `Faltan ${daysUntil} días. Si no se envía hoy, será cancelada automáticamente al llegar a 10 días.`
            : `Plazo límite: hoy. La actividad debe estar lista y enviada para aprobación.`;

          for (const r of orgMembers) {
            await storage.createNotification({
              userId: r.id,
              type: "reminder",
              title,
              description: body,
              relatedId: act.id,
              isRead: false,
            });
            if (isPushConfigured()) {
              await sendPushNotification(r.id, {
                title,
                body: `${act.title} — ${body}`,
                url: "/activities",
              });
            }
          }
          sentActivityDeadlineKeys.add(dedupeKey);
        }
      }
    } catch (err) {
      console.error("[ActivityDeadline] Error:", err);
    }
  }

  // ── Rolling generator: ensure next 8 weeks of each active recurring series ──
  let lastRecurringGenerateDate = "";
  async function maintainRecurringSeries() {
    try {
      const now = new Date();
      if (now.getHours() !== 7) return; // run once at 07:00
      const todayKey = getServerDayKey(now);
      if (lastRecurringGenerateDate === todayKey) return;
      lastRecurringGenerateDate = todayKey;

      const seriesResult = await db.execute(sql`
        SELECT * FROM recurring_series WHERE active = true
      `);

      const systemUser = await db.execute(sql`
        SELECT id FROM users WHERE role = 'obispo' LIMIT 1
      `);
      const systemUserId = (systemUser.rows[0] as any)?.id;
      if (!systemUserId) return;

      for (const series of seriesResult.rows as any[]) {
        const orgIds: string[] = series.rotation_org_ids ?? [];
        if (!orgIds.length) continue;

        const seriesStart = new Date(series.rotation_start_date);
        const freq: string = series.frequency ?? "weekly";

        const windowEnd = new Date(now);
        if (freq === "quarterly") windowEnd.setFullYear(windowEnd.getFullYear() + 1);
        else if (freq === "monthly") windowEnd.setMonth(windowEnd.getMonth() + 6);
        else windowEnd.setDate(windowEnd.getDate() + 7 * 8);
        // Respect end_date if set
        if (series.end_date) {
          const endDate = new Date(series.end_date);
          if (endDate < windowEnd) windowEnd.setTime(endDate.getTime());
        }
        if (windowEnd < now) continue; // series has ended
        const weekOfMonth = getWeekdayOccurrenceInMonthUTC(seriesStart);

        let occurrences: Date[];
        if (freq === "monthly") {
          occurrences = getMonthlyOccurrencesInRange(series.day_of_week, weekOfMonth, now, windowEnd);
        } else if (freq === "quarterly") {
          occurrences = getQuarterlyOccurrencesInRange(series.day_of_week, weekOfMonth, seriesStart, now, windowEnd);
        } else {
          occurrences = getOccurrencesInRange(series.day_of_week, now, windowEnd);
        }

        for (const date of occurrences) {
          // Check if instance already exists for this series + date
          const [hh, mm] = (series.time_of_day as string).split(":").map(Number);
          date.setUTCHours(hh, mm, 0, 0); // store as UTC so display is timezone-consistent

          const dateStart = new Date(date); dateStart.setUTCHours(0, 0, 0, 0);
          const dateEnd   = new Date(date); dateEnd.setUTCHours(23, 59, 59, 999);

          const existing = await db.execute(sql`
            SELECT id FROM activities
            WHERE recurring_series_id = ${series.id}
              AND date >= ${dateStart.toISOString()}
              AND date <= ${dateEnd.toISOString()}
            LIMIT 1
          `);
          if (existing.rows.length > 0) continue;

          // Calculate rotation index based on frequency
          let nth: number;
          if (freq === "monthly") {
            nth = countMonthlyOccurrencesBetween(series.day_of_week, weekOfMonth, seriesStart, date);
          } else if (freq === "quarterly") {
            nth = countQuarterlyOccurrencesBetween(series.day_of_week, weekOfMonth, seriesStart, date);
          } else {
            nth = countOccurrencesBetween(series.day_of_week, seriesStart, date);
          }
          const orgId = orgIds[(nth - 1 + orgIds.length) % orgIds.length];

          // Generate slug
          const baseSlug = (series.title as string)
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 35);
          const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
          const rnd = Math.random().toString(36).slice(2, 6);
          const slug = `${baseSlug}-${dateStr}-${rnd}`;

          await storage.createActivity({
            title: series.title,
            description: series.description ?? null,
            location: series.location ?? null,
            date: date,
            type: "actividad_org",
            status: "borrador",
            organizationId: orgId,
            createdBy: systemUserId,
            approvalStatus: "approved",
            isPublic: true,
            slug,
            recurringSeriesId: series.id,
          } as any);
          console.log(`[RecurringSeries] Generated instance for series "${series.title}" on ${date.toISOString().slice(0, 10)}, org=${orgId}`);
        }
      }
    } catch (err) {
      console.error("[RecurringSeries] maintainRecurringSeries error:", err);
    }
  }

  // ── Rotation reminders: T-notify_days_before push + email ────────────────
  let lastRecurringReminderDate = "";
  async function sendRecurringActivityRotationReminders() {
    try {
      const now = new Date();
      if (now.getHours() !== 9) return; // run once at 09:00
      const todayKey = getServerDayKey(now);
      if (lastRecurringReminderDate === todayKey) return;
      lastRecurringReminderDate = todayKey;

      const allUsers = await storage.getAllUsers();
      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName ?? "Barrio";

      // Get series notify_days_before per series
      const seriesMap = new Map<string, number>();
      const seriesRows = await db.execute(sql`SELECT id, notify_days_before FROM recurring_series WHERE active = true`);
      for (const s of seriesRows.rows as any[]) {
        seriesMap.set(s.id, Number(s.notify_days_before ?? 14));
      }

      // Find all instances due for notification today
      // We check each series separately because notify_days_before may differ
      for (const [seriesId, daysBefore] of seriesMap.entries()) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysBefore);
        const targetStart = new Date(targetDate); targetStart.setHours(0, 0, 0, 0);
        const targetEnd   = new Date(targetDate); targetEnd.setHours(23, 59, 59, 999);

        const instances = await db.execute(sql`
          SELECT a.id, a.title, a.date, a.organization_id,
                 o.name AS organization_name
          FROM activities a
          LEFT JOIN organizations o ON o.id = a.organization_id
          WHERE a.recurring_series_id = ${seriesId}
            AND a.notified_rotation = false
            AND a.date >= ${targetStart.toISOString()}
            AND a.date <= ${targetEnd.toISOString()}
        `);

        for (const inst of instances.rows as any[]) {
          const actDate = new Date(inst.date);
          const formattedDate = actDate.toLocaleDateString("es-ES", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          });
          const orgName: string = inst.organization_name ?? "vuestra organización";

          // Build recipient list: org leaders + barrio lider_actividades + obispado
          const recipients = allUsers.filter((u: any) => {
            if (!u.active) return false;
            // Org presidency + lider_actividades of assigned org
            if (u.organizationId === inst.organization_id &&
                ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion", "lider_actividades"].includes(u.role))
              return true;
            // Barrio's lider_actividades (org type = barrio)
            if (u.role === "lider_actividades") return true;
            // Obispado
            if (["obispo", "consejero_obispo", "secretario_ejecutivo"].includes(u.role)) return true;
            return false;
          });

          const uniqueRecipients = [...new Map(recipients.map((u: any) => [u.id, u])).values()];

          const pushTitle  = `📅 En ${daysBefore} días — ${inst.title}`;
          const pushBody   = `Le toca a ${orgName} organizar la Noche de Hermanamiento el ${formattedDate}.`;

          for (const user of uniqueRecipients as any[]) {
            // Push notification
            if (isPushConfigured()) {
              try {
                await sendPushNotification(user.id, { title: pushTitle, body: pushBody });
              } catch (_) { /* non-fatal */ }
            }

            // Email
            if (user.email) {
              try {
                const nodemailer = await import("nodemailer");
                const transporter = nodemailer.default.createTransport({
                  host: process.env.SMTP_HOST,
                  port: Number(process.env.SMTP_PORT ?? 587),
                  secure: process.env.SMTP_SECURE === "true",
                  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
                });
                await transporter.sendMail({
                  from: `"${wardName}" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
                  to: user.email,
                  subject: `📅 En ${daysBefore} días — ${inst.title} (${orgName})`,
                  html: `
                    <p>Hola${user.name ? ` ${user.name}` : ""},</p>
                    <p>Te recordamos que en <strong>${daysBefore} días</strong> le corresponde a
                    <strong>${orgName}</strong> organizar:</p>
                    <p style="font-size:18px;font-weight:bold;">${inst.title}</p>
                    <p>📅 ${formattedDate}</p>
                    ${inst.location ? `<p>📍 ${inst.location}</p>` : ""}
                    <p>Por favor, coordina con tu presidencia y prepara el programa con antelación.</p>
                    <br/>
                    <p style="color:#888;font-size:12px;">— ${wardName}</p>
                  `,
                });
              } catch (_) { /* non-fatal */ }
            }
          }

          // Mark as notified
          await db.execute(sql`
            UPDATE activities SET notified_rotation = true WHERE id = ${inst.id}
          `);
          console.log(`[RecurringSeries] Notified ${uniqueRecipients.length} users for instance ${inst.id} (org=${orgName})`);
        }
      }
    } catch (err) {
      console.error("[RecurringSeries] sendRecurringActivityRotationReminders error:", err);
    }
  }

  // Check both automations aligned to each server hour (:00); each sender enforces 08:00.
  // ── AUTO-RELEASE CALLINGS ────────────────────────────────────────────────────
  // Runs at midnight: processes releases and sustainments from today's sacrament program
  async function processReleasedCallings() {
    try {
      if (new Date().getHours() !== 0) return;
      const todayMeetings = await db
        .select()
        .from(sacramentalMeetingsTable)
        .where(sql`DATE(${sacramentalMeetingsTable.date}) = CURRENT_DATE`);

      let releasedCount = 0;
      let sustainedCount = 0;
      for (const meeting of todayMeetings) {
        // Process releases
        const releases = (meeting.releases as { name: string; oldCalling: string; organizationId?: string }[]) ?? [];
        for (const release of releases) {
          if (!release.organizationId || !release.oldCalling) continue;
          const [found] = await db
            .select({ id: memberCallings.id })
            .from(memberCallings)
            .where(and(
              eq(memberCallings.organizationId, release.organizationId),
              sql`lower(${memberCallings.callingName}) = lower(${release.oldCalling})`,
              eq(memberCallings.isActive, true),
            ));
          if (found) {
            await db.delete(memberCallings).where(eq(memberCallings.id, found.id));
            releasedCount++;
            console.log(`[auto-release] ${release.name} — ${release.oldCalling}`);
          }
        }

        // Process sustainments
        const sustainments = (meeting.sustainments as { name: string; calling: string; organizationId?: string }[]) ?? [];
        for (const sustainment of sustainments) {
          if (!sustainment.organizationId || !sustainment.calling || !sustainment.name) continue;

          // Find member by name within the organization
          const [member] = await db
            .select({ id: members.id })
            .from(members)
            .where(and(
              eq(members.organizationId, sustainment.organizationId),
              sql`lower(${members.nameSurename}) = lower(${sustainment.name})`,
            ));
          if (!member) {
            console.log(`[auto-sustain] Miembro no encontrado: ${sustainment.name}`);
            continue;
          }

          // Check if calling already exists (idempotent)
          const [existing] = await db
            .select({ id: memberCallings.id })
            .from(memberCallings)
            .where(and(
              eq(memberCallings.memberId, member.id),
              eq(memberCallings.organizationId, sustainment.organizationId),
              sql`lower(${memberCallings.callingName}) = lower(${sustainment.calling})`,
              eq(memberCallings.isActive, true),
            ));
          if (existing) continue;

          await db.insert(memberCallings).values({
            id: sql`gen_random_uuid()`,
            memberId: member.id,
            organizationId: sustainment.organizationId,
            callingName: sustainment.calling,
            isActive: true,
            startDate: new Date(),
          });
          sustainedCount++;
          console.log(`[auto-sustain] ${sustainment.name} — ${sustainment.calling}`);
        }
      }
      if (releasedCount) console.log(`[auto-release] ${releasedCount} llamamiento(s) liberado(s) automáticamente`);
      if (sustainedCount) console.log(`[auto-sustain] ${sustainedCount} llamamiento(s) asignado(s) automáticamente`);
    } catch (err) {
      console.error("[auto-release] Error:", err);
    }
  }

  startHourlyAlignedTask(processReleasedCallings);
  startHourlyAlignedTask(sendAutomaticBirthdayNotifications);
  startHourlyAlignedTask(sendAutomaticBirthdayEmails);
  startHourlyAlignedTask(sendAutomaticSacramentalAssignmentReminders);
  startHourlyAlignedTask(sendAutomaticInterviewAndAssignmentReminders);
  startHourlyAlignedTask(sendAgendaDailyBriefing);
  startHourlyAlignedTask(sendAutomaticBaptismServiceReminders);
  startHourlyAlignedTask(sendAutomaticBaptismReadinessReminders);
  startHourlyAlignedTask(sendAutomaticLogisticsDeadlineReminders);
  startHourlyAlignedTask(sendAutomaticActivityDeadlineReminders);
  startHourlyAlignedTask(maintainRecurringSeries);
  startHourlyAlignedTask(sendRecurringActivityRotationReminders);
  setInterval(() => {
    void runAgendaReminderWorker();
  }, 60 * 1000);

  return httpServer;
}
