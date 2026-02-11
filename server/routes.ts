import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { storage } from "./storage";
import { db, pool } from "./db";
import { and, eq, ne, sql } from "drizzle-orm";
import {
  insertUserSchema,
  insertSacramentalMeetingSchema,
  insertWardCouncilSchema,
  insertPresidencyMeetingSchema,
  insertPresidencyResourceSchema,
  insertBudgetRequestSchema,
  insertInterviewSchema,
  insertOrganizationInterviewSchema,
  insertGoalSchema,
  insertBirthdaySchema,
  insertMemberSchema,
  insertMemberCallingSchema,
  insertActivitySchema,
  insertAssignmentSchema,
  insertPdfTemplateSchema,
  insertWardBudgetSchema,
  insertOrganizationBudgetSchema,
  insertAccessRequestSchema,
  insertNotificationSchema,
  insertPushSubscriptionSchema,
  notifications,
  interviews,
  organizationInterviews,
} from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcrypt";
import { sendPushNotification, getVapidPublicKey, isPushConfigured } from "./push-service";
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
  sendNewUserCredentialsEmail,
  sendLoginOtpEmail,
  sendInterviewScheduledEmail,
  sendInterviewUpdatedEmail,
  sendInterviewCancelledEmail,
  sendSacramentalAssignmentEmail,
  sendBirthdayGreetingEmail,
  verifyAccessToken,
} from "./auth";

// Extend Express Session type
declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function getUserIdFromRequest(req: Request): string | null {
  if (req.session.userId) {
    return req.session.userId;
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

  req.session.userId = payload.userId;
  return payload.userId;
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
};

const OBISPADO_ROLES = new Set([
  "obispo",
  "consejero_obispo",
  "secretario",
  "secretario_ejecutivo",
  "secretario_financiero",
]);

const RESOURCES_LIBRARY_ADMIN_ROLES = new Set([
  "obispo",
  "consejero_obispo",
  "secretario",
  "secretario_ejecutivo",
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

const formatInterviewerTitle = (role?: string | null) => {
  if (!role) return "";
  const map: Record<string, string> = {
    obispo: "Obispo",
    consejero_obispo: "Consejero del obispado",
    secretario_ejecutivo: "Secretario Ejecutivo",
  };
  return map[role] ?? "";
};


const formatDateTimeLabels = (value: string | Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { dateLabel: String(value), timeLabel: "" };
  }

  const dateLabel = date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
  const timeLabel = date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { dateLabel, timeLabel };
};

const normalizeComparableName = (value?: string | null) =>
  normalizeMemberName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const buildSacramentalRoleLines = (meeting: any) => {
  const map = new Map<string, string[]>();
  const pushLine = (name: string | undefined | null, line: string) => {
    const normalized = normalizeComparableName(name);
    if (!normalized) return;
    if (!map.has(normalized)) map.set(normalized, []);
    map.get(normalized)!.push(line);
  };

  pushLine(meeting.openingPrayer, "Oración de apertura");
  pushLine(meeting.closingPrayer, "Oración de clausura");

  const discourses = Array.isArray(meeting.discourses) ? meeting.discourses : [];
  discourses.forEach((item: any) => {
    const speaker = typeof item?.speaker === "string" ? item.speaker : "";
    const topic = typeof item?.topic === "string" ? item.topic.trim() : "";
    const line = topic ? `Discurso: ${topic}` : "Discurso";
    pushLine(speaker, line);
  });

  const assignments = Array.isArray(meeting.assignments) ? meeting.assignments : [];
  assignments.forEach((item: any) => {
    const name = typeof item?.name === "string" ? item.name : "";
    const assignment = typeof item?.assignment === "string" ? item.assignment.trim() : "";
    if (!assignment) return;
    pushLine(name, `Asignación: ${assignment}`);
  });

  return map;
};

const areStringArraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
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

  const readRequestBody = async (req: Request) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };

  const parseMultipart = async (req: Request) => {
    const contentType = req.headers["content-type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      throw new Error("Invalid content type");
    }
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    if (!boundaryMatch) {
      throw new Error("Missing boundary");
    }
    const boundary = `--${boundaryMatch[1]}`;
    const body = await readRequestBody(req);
    const parts = body.toString("binary").split(boundary);
    const files: Array<{ fieldname: string; filename: string; contentType?: string; data: Buffer }> = [];

    for (const part of parts) {
      if (!part || part === "--\r\n" || part === "--") {
        continue;
      }
      const [rawHeaders, rawBody] = part.split("\r\n\r\n");
      if (!rawBody || !rawHeaders) {
        continue;
      }
      const headers = rawHeaders.split("\r\n").filter(Boolean);
      const disposition = headers.find((header) =>
        header.toLowerCase().startsWith("content-disposition")
      );
      if (!disposition) {
        continue;
      }
      const nameMatch = disposition.match(/name="([^"]+)"/i);
      const filenameMatch = disposition.match(/filename="([^"]*)"/i);
      if (!nameMatch || !filenameMatch || !filenameMatch[1]) {
        continue;
      }
      const fieldname = nameMatch[1];
      const filename = path.basename(filenameMatch[1]);
      const contentTypeHeader = headers.find((header) =>
        header.toLowerCase().startsWith("content-type")
      );
      const contentTypeValue = contentTypeHeader?.split(":")[1]?.trim();
      const data = Buffer.from(rawBody.replace(/\r\n--$/, ""), "binary");
      files.push({ fieldname, filename, contentType: contentTypeValue, data });
    }

    return { files };
  };

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
        user.requireEmailOtp ||
        !deviceHash ||
        !existingDevice?.trusted ||
        unusualCountry;

      const canSendOtp = Boolean(user.email);
      if (requiresOtp && canSendOtp) {
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

        await sendLoginOtpEmail(user.email, otpCode);

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

  app.post("/api/login/verify", async (req: Request, res: Response) => {
    try {
      const { otpId, code, rememberDevice, deviceId } = req.body;
      if (!otpId || !code) {
        return res.status(400).json({ error: "Code is required" });
      }
      const deviceHash = getDeviceHash(deviceId);
      const ipAddress = getClientIp(req);
      const country = getCountryFromIp(ipAddress);
      const userAgent = req.headers["user-agent"] ?? null;
      const otp = await storage.getEmailOtpById(otpId);
      if (!otp || otp.consumedAt || otp.expiresAt < new Date()) {
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      const codeHash = hashToken(code);
      if (codeHash !== otp.codeHash) {
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      await storage.consumeEmailOtp(otp.id);
      const user = await storage.getUser(otp.userId);
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
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========================================
  // UPLOADS
  // ========================================

  app.post("/api/uploads", requireAuth, async (req: Request, res: Response) => {
    try {
      const { files } = await parseMultipart(req);
      const uploadedFile = files.find((file) => file.fieldname === "file");
      if (!uploadedFile) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const extension = path.extname(uploadedFile.filename);
      const storedFilename = `${randomUUID()}${extension}`;
      const storedPath = path.join(uploadsPath, storedFilename);
      await fs.promises.writeFile(storedPath, uploadedFile.data);

      res.status(201).json({
        filename: uploadedFile.filename,
        url: `/uploads/${storedFilename}`,
      });
    } catch (error) {
      res.status(400).json({ error: "Invalid upload data" });
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

      const accessRequest = await storage.createAccessRequest(parsed.data);

      const users = await storage.getAllUsers();
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

      if (recipients.length > 0) {
        const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
        const reviewUrl = `${baseUrl}/admin/users?requestId=${accessRequest.id}`;
        await Promise.all(
          recipients.map((recipient) =>
            sendAccessRequestEmail({
              toEmail: recipient,
              requesterName: accessRequest.name,
              requesterEmail: accessRequest.email,
              calling: accessRequest.calling,
              phone: accessRequest.phone,
              reviewUrl,
            })
          )
        );
      } else {
        console.warn("No access request email recipients configured.", accessRequest);
      }

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
  // USERS
  // ========================================

  app.get("/api/users", requireAuth, async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
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
      const bishopRoles = ["consejero_obispo", "secretario"];
      const obispadoId = "0fc67882-5b4e-43d5-9384-83b1f8afe1e3"; // replace with the real Obispado ID
      const finalOrganizationId = bishopRoles.includes(role) ? obispadoId : organizationId || null;

      const temporaryPassword = generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
      const user = await storage.createUser({
        username: derivedUsername,
        password: hashedPassword,
        name: normalizedName,
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

      await sendNewUserCredentialsEmail({
        toEmail: email,
        name: normalizedName,
        username: derivedUsername,
        temporaryPassword,
        recipientSex: memberForCalling?.sex,
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
      const { username, name, email, role, organizationId, phone, memberId, isActive } = req.body;

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

      const updatedUser = await storage.updateUser(id, {
        username: username || undefined,
        name: name || undefined,
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

      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.patch("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, email, username, requireEmailOtp, avatarUrl } = req.body;
      const hasAvatarUpdate = Object.prototype.hasOwnProperty.call(req.body ?? {}, "avatarUrl");
      const user = await storage.updateUser(req.session.userId!, {
        name: name || undefined,
        email: email || undefined,
        username: username || undefined,
        requireEmailOtp: typeof requireEmailOtp === "boolean" ? requireEmailOtp : undefined,
        avatarUrl: hasAvatarUpdate ? avatarUrl : undefined,
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
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

        await storage.updateUserDeletionRequest(id, {
          status: "aprobada",
          reviewedBy: req.session.userId!,
          reviewedAt: new Date(),
        });

        const user = await storage.getUser(request.userId);
        if (user) {
          await removeAutoCallingForUser(user);
        }

        if (cleanAll) {
          await storage.deleteUserWithCleanup(request.userId);
        } else {
          await storage.deleteUser(request.userId);
        }

        res.status(200).json({ message: "User deleted" });
      } catch (error) {
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
      previousMeeting?: any;
    }
  ) => {
    const users = await storage.getAllUsers();
    const members = await storage.getAllMembers();
    const template = await storage.getPdfTemplate();
    const wardName = template?.wardName;
    const rolesByName = buildSacramentalRoleLines(meeting);
    const previousRolesByName = options?.previousMeeting
      ? buildSacramentalRoleLines(options.previousMeeting)
      : null;

    const roleEntries = Array.from(rolesByName.entries());
    for (const [normalizedName, lines] of roleEntries) {
      const member = members.find((m) => normalizeComparableName(m.nameSurename) === normalizedName);
      const matchedUser = users.find((u) => normalizeComparableName(u.name) === normalizedName);
      const toEmail = matchedUser?.email || member?.email;
      const recipientName = normalizeMemberName(matchedUser?.name || member?.nameSurename || normalizedName);

      if (!toEmail) continue;

      if (previousRolesByName) {
        const previousLines = previousRolesByName.get(normalizedName) || [];
        const rolesChanged = !areStringArraysEqual(lines, previousLines);
        const previousDate = options?.previousMeeting?.date;
        const dateChanged = String(previousDate || "") !== String(meeting.date || "");
        if (!rolesChanged && !dateChanged) {
          continue;
        }
      }

      const { dateLabel, timeLabel } = formatDateTimeLabels(meeting.date);
      await sendSacramentalAssignmentEmail({
        toEmail,
        recipientName,
        meetingDate: dateLabel,
        meetingTime: timeLabel,
        assignmentLines: lines,
        wardName,
        isUpdate: Boolean(previousRolesByName),
        recipientSex: member?.sex,
        recipientOrganizationType: member?.organizationId
          ? (await storage.getOrganization(member.organizationId))?.type
          : undefined,
      });
    }
  };

  app.post("/api/sacramental-meetings", requireAuth, async (req: Request, res: Response) => {
    try {
      const dataToValidate = {
        ...req.body,
        createdBy: req.session.userId,
      };

      const meetingData = insertSacramentalMeetingSchema.parse(dataToValidate);

      const meeting = await storage.createSacramentalMeeting(meetingData);
      await notifySacramentalParticipants(meeting);
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

      await notifySacramentalParticipants(meeting, { previousMeeting: currentMeeting });

      res.json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
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
      const updaterName = currentUser?.name || "Un usuario";
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
      const requestData = insertBudgetRequestSchema.parse({
        ...req.body,
        requestedBy: user?.id || "system",
      });
      const budgetRequest = await storage.createBudgetRequest(requestData);

      // Notify obispado about new budget request
      const allUsers = await storage.getAllUsers();
      const obispadoMembers = allUsers.filter((u: any) => 
        u.role === "obispo" || u.role === "consejero_obispo" || u.role === "secretario_financiero"
      );

      for (const member of obispadoMembers) {
        if (member.id !== user?.id) {
          const notification = await storage.createNotification({
            userId: member.id,
            type: "reminder",
            title: "Nueva Solicitud de Presupuesto",
            description: `${user?.name || "Un usuario"} solicita $${budgetRequest.amount} para "${budgetRequest.description}"`,
            relatedId: budgetRequest.id,
            isRead: false,
          });

          if (isPushConfigured()) {
            await sendPushNotification(member.id, {
              title: "Nueva Solicitud de Presupuesto",
              body: `${user?.name || "Un usuario"} solicita $${budgetRequest.amount} para "${budgetRequest.description}"`,
              url: "/budget",
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
      const requestData = insertBudgetRequestSchema.partial().parse(req.body);

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
          });

          const currentUser = (req as any).user;
          const completerName = currentUser?.name || "La persona asignada";
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
                url: "/budget",
                notificationId: notification.id,
              });
            }
          }
        }
      }

      const currentUser = (req as any).user;
      const updaterName = currentUser?.name || "Un usuario";
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
            url: "/budget",
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
      const { id } = req.params;
      const existingRequest = await storage.getBudgetRequest(id);      
      const budgetRequest = await storage.approveBudgetRequest(id, req.session.userId!);
      if (!budgetRequest) {
        return res.status(404).json({ error: "Budget request not found" });
      }

      if (existingRequest && existingRequest.status !== "aprobado" && budgetRequest.requestedBy) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);
        const assignment = await storage.createAssignment({
          title: "Adjuntar comprobantes de gasto",
          description: `Adjunta los comprobantes de gasto para la solicitud "${budgetRequest.description}" por €${budgetRequest.amount}.`,
          assignedTo: budgetRequest.requestedBy,
          assignedBy: req.session.userId!,
          dueDate,
          relatedTo: `budget:${budgetRequest.id}`,
        });

        const notification = await storage.createNotification({
          userId: budgetRequest.requestedBy,
          type: "assignment_created",
          title: "Nueva Asignación",
          description: `Se te ha asignado: "${assignment.title}"`,
          relatedId: assignment.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(budgetRequest.requestedBy, {
            title: "Nueva Asignación",
            body: `Se te ha asignado: "${assignment.title}"`,
            url: "/assignments",
            notificationId: notification.id,
          });
        }
      }      

      // Create notification for the user who requested the budget
      if (budgetRequest.requestedBy) {
        const notification = await storage.createNotification({
          userId: budgetRequest.requestedBy,
          type: "budget_approved",
          title: "Presupuesto Aprobado",
          description: `Tu solicitud "${budgetRequest.description}" por $${budgetRequest.amount} ha sido aprobada`,
          relatedId: budgetRequest.id,
          isRead: false,
        });
        
        // Send push notification if configured
        if (isPushConfigured()) {
          await sendPushNotification(budgetRequest.requestedBy, {
            title: "Presupuesto Aprobado",
            body: `Tu solicitud "${budgetRequest.description}" por $${budgetRequest.amount} ha sido aprobada`,
            url: "/budget",
            notificationId: notification.id,
          });
        }
      }

      res.json(budgetRequest);
    } catch (error) {
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

      // Check authorization: only obispo and consejero_obispo can delete budget requests
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";

      if (!isObispado) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.deleteBudgetRequest(id);
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
        memberName = normalizeMemberName(member.nameSurename);
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
        day: "2-digit",
      });
      const interviewTime = interviewDateValue.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const interviewerRoleTitle = formatInterviewerTitle(interviewer?.role);
      const interviewerTitle = interviewer?.name
        ? interviewerRoleTitle
          ? `${interviewerRoleTitle} ${interviewer.name}`
          : interviewer.name
        : interviewerRoleTitle || "obispado";
      const template = await storage.getPdfTemplate();
      const wardName = template?.wardName;
      const allUsers = await storage.getAllUsers();
      const secretaryExecutive = allUsers.find((u) => u.role === "secretario_ejecutivo");
      const secretaryExecutiveName = secretaryExecutive?.name
        ? normalizeMemberName(secretaryExecutive.name)
        : null;

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
          name: normalizeMemberName(assignedUser.name),
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
            url: "/interviews",
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
          day: "2-digit",
        });
        const interviewDateTitle = interviewDateValue.toLocaleDateString("es-ES", {
          day: "2-digit",
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
          `Entrevista con ${normalizeMemberName(interview.personName)} programada para el ${interviewDate}.`,
          `Entrevistador: ${interviewer?.name || "Obispado"}.`,
        ];
        if (rest.notes) {
          descriptionParts.push(`Notas: ${rest.notes}`);
        }

        const assignment = await storage.createAssignment({
          title: assignmentTitle,
          description: descriptionParts.join(" "),
          assignedTo: interview.interviewerId,
          assignedBy: req.session.userId!,
          dueDate: interview.date,
          status: "pendiente",
          relatedTo: `interview:${interview.id}`,
        });

        const notification = await storage.createNotification({
          userId: interview.interviewerId,
          type: "assignment_created",
          title: "Nueva Asignación",
          description: `Se te ha asignado: "${assignment.title}"`,
          relatedId: assignment.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(interview.interviewerId, {
            title: "Nueva Asignación",
            body: `Se te ha asignado: "${assignment.title}"`,
            url: "/assignments",
            notificationId: notification.id,
          });
        }
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
              requestingUser?.name || personName
            } solicita una entrevista`,
            relatedId: interview.id,
            eventDate: interview.date,
            isRead: false,
          });
      
          if (isPushConfigured()) {
            await sendPushNotification(member.id, {
              title: "Nueva Solicitud de Entrevista",
              body: "Se ha solicitado una entrevista",
              url: "/interviews",
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
      const { personName, memberId, ...rest } = req.body;

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
        })
        .parse(updateData);

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
    
      const interview = await storage.updateInterview(id, interviewData);
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
          name: normalizeMemberName(member.nameSurename),
          sex: member.sex,
          organizationType: memberOrganization?.type,
        };
        interviewRecipients.push(intervieweeRecipient);
      } else if (personUser?.email) {
        intervieweeRecipient = {
          email: personUser.email,
          name: normalizeMemberName(personUser.name),
        };
        interviewRecipients.push(intervieweeRecipient);
      }

      if (currentInterviewer?.email) {
        interviewRecipients.push({
          email: currentInterviewer.email,
          name: normalizeMemberName(currentInterviewer.name),
        });
      }

      const uniqueRecipients = interviewRecipients.filter(
        (recipient, index, arr) => arr.findIndex((item) => item.email === recipient.email) === index
      );

      const wasCancelledNow = currentInterview.status !== "cancelada" && interview.status === "cancelada";
      const changeLines: string[] = [];
      if (String(currentInterview.date) !== String(interview.date)) {
        changeLines.push(`Fecha/Hora: ${previousDateLabel} ${previousTimeLabel} → ${currentDateLabel} ${currentTimeLabel}`);
      }
      if (currentInterview.interviewerId !== interview.interviewerId) {
        changeLines.push(
          `Entrevistador: ${normalizeMemberName(previousInterviewer?.name || "Sin asignar")} → ${normalizeMemberName(currentInterviewer?.name || "Sin asignar")}`
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
            interviewerName: normalizeMemberName(currentInterviewer?.name || ""),
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
  
      if (interviewData.date || interviewData.status === "completada" || interviewData.status === "cancelada") {
        const assignments = await storage.getAllAssignments();
        const relatedAssignment = assignments.find(
          (assignment: any) => assignment.relatedTo === `interview:${interview.id}`
        );

        if (relatedAssignment) {
          if (interviewData.status === "cancelada") {
            await storage.deleteAssignment(relatedAssignment.id);
          } else {
          const updateAssignmentData: any = {};

          if (interviewData.date) {
            const interviewDateValue = new Date(interview.date);
            const interviewDate = interviewDateValue.toLocaleDateString("es-ES", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            });
            const interviewDateTitle = interviewDateValue.toLocaleDateString("es-ES", {
              day: "2-digit",
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

          if (interviewData.status === "completada") {
            updateAssignmentData.status = "completada";
          }

          if (Object.keys(updateAssignmentData).length > 0) {
            await storage.updateAssignment(relatedAssignment.id, updateAssignmentData);
          }
          }
        } else if (interview.status === "programada" && interview.assignedToId) {
          const interviewDateValue = new Date(interview.date);
          const interviewDate = interviewDateValue.toLocaleDateString("es-ES", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const interviewDateTitle = interviewDateValue.toLocaleDateString("es-ES", {
            day: "2-digit",
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
          });
        }
      }

      const currentUser = (req as any).user;
      const updaterName = currentUser?.name || "Un usuario";
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
          description: `${updaterName} actualizó la entrevista con ${interview.personName} para el ${interviewDate}.`,
          relatedId: interview.id,
          eventDate: interview.date,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(userId, {
            title: "Entrevista actualizada",
            body: `${updaterName} actualizó la entrevista con ${interview.personName}.`,
            url: "/interviews",
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
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const interview = await storage.getInterview(id);
        if (!interview) {
          return res.status(404).json({ error: "Interview not found" });
        }

        const assignments = await storage.getAllAssignments();
        const relatedAssignment = assignments.find(
          (assignment: any) => assignment.relatedTo === `interview:${id}`
        );
        if (relatedAssignment) {
          await storage.deleteAssignment(relatedAssignment.id);
        }
    
        await storage.deleteInterview(id);
        res.status(204).send();
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
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
  
      const members =
        await storage.getOrganizationMembers(user.organizationId);
  
      for (const member of members) {
        if (!allowedRoles.includes(member.role)) continue;
      
        const notification = await storage.createNotification({
          userId: member.id,
          type: "upcoming_interview",
          title: "Nueva entrevista de organización",
          description: `Entrevista con ${interview.personName}`,
          relatedId: interview.id,
          eventDate: interview.date,
          isRead: false,
        });
    
        if (isPushConfigured()) {
          await sendPushNotification(member.id, {
            title: "Nueva entrevista de organización",
            body: `Entrevista con ${interview.personName}`,
            url: "/organization-interviews",
            notificationId: notification.id,
          });
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
    
        const updateData =
          insertOrganizationInterviewSchema.partial().parse(req.body);

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
    
        const updated =
          await storage.updateOrganizationInterview(id, updateData);
    
        if (!updated) {
          return res.status(404).json({ error: "No encontrada" });
        }

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
                ? `La entrevista con ${updated.personName} ahora está ${updated.status}`
                : updateData.date
                  ? `La fecha de la entrevista con ${updated.personName} fue modificada`
                  : `Se actualizaron los detalles de la entrevista con ${updated.personName}`,
              relatedId: updated.id,
              eventDate: updated.date,
              isRead: false,
            });
        
            if (isPushConfigured()) {
              await sendPushNotification(member.id, {
                title: "Entrevista actualizada",
                body: `Entrevista con ${updated.personName}`,
                url: "/organization-interviews",
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
    
        if (user.role !== "presidente_organizacion") {
          return res
            .status(403)
            .json({ error: "Solo el presidente puede eliminar" });
        }
    
        await storage.deleteOrganizationInterview(id);
        res.status(204).send();
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
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
            description: `${user.name || "Una organización"} ha creado la meta: "${goal.title}"`,
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

      if (!isObispado) {
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

      if (!isObispado) {
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

      const members = await storage.getAllMembers();
      const organizationMembers = members.filter((member: any) => member.organizationId === organizationId);
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

  app.post("/api/birthdays", requireAuth, async (req: Request, res: Response) => {
    try {
      const birthdayData = insertBirthdaySchema.parse(req.body);
      const birthday = await storage.createBirthday(birthdayData);
      res.status(201).json(birthday);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/birthdays/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const birthdayData = insertBirthdaySchema.partial().parse(req.body);

      const birthday = await storage.updateBirthday(id, birthdayData);
      if (!birthday) {
        return res.status(404).json({ error: "Birthday not found" });
      }

      res.json(birthday);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/birthdays/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteBirthday(id);
      res.status(204).send();
    } catch (error) {
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
            description: `Hoy es el cumpleaños de ${birthday.name} (${age} años)`,
            relatedId: birthday.id,
            isRead: false,
          });

          if (isPushConfigured()) {
            await sendPushNotification(recipient.id, {
              title: "Cumpleaños Hoy",
              body: `Hoy es el cumpleaños de ${birthday.name} (${age} años)`,
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
      const filteredAssignments = isOrgMember
        ? assignments.filter(a => a && (a.assignedTo === user.id || a.assignedBy === user.id))
        : assignments;

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
        pendingAssignments: filteredAssignments.filter(a => a && a.status === "pendiente").length,
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
          .filter(b => b)
          .map(b => ({
            name: b.name,
            date: new Date(b.birthDate).toLocaleDateString("es-ES", { month: "long", day: "numeric" }),
          }))
          .slice(0, 5),
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
            date: new Date(a.date).toLocaleDateString("es-ES", { month: "short", day: "numeric" }),
            location: a.location || "",
          })),
        userRole: user.role,
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
      });
    }
    res.json(template);
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
    const updaterName = currentUser?.name || "Un usuario";
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
          url: "/budget",
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

      const isObispado = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero"].includes(user.role);
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
      if (!isObispado && !(isOrgMember && user.organizationId === parsed.data.organizationId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const uniqueMemberIds = Array.from(new Set(parsed.data.attendeeMemberIds ?? []));
      const attendeesCount = uniqueMemberIds.length > 0 ? uniqueMemberIds.length : parsed.data.attendeesCount;
      const totalMembers = parsed.data.totalMembers ?? 0;

      const payload = {
        organizationId: parsed.data.organizationId,
        weekStartDate: new Date(parsed.data.weekStartDate),
        attendeesCount,
        attendeeMemberIds: uniqueMemberIds,
        totalMembers,
        createdBy: req.session.userId!,
      };

      const attendance = await storage.upsertOrganizationWeeklyAttendance(payload);
      res.status(201).json(attendance);
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
          title: `Entrevista con ${i.personName}`,
          date: i.date,
          type: "entrevista" as const,
          location: "Oficina",
          status: i.status,
          description: i.notes ?? undefined,
          organizationId: null,
        })),
        ...organizationInterviews.map(i => ({
          id: i.id,
          title: `Entrevista con ${i.personName}`,
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
        ...visibleInterviews.map(i => ({ id: i.id, date: new Date(i.date), title: `Entrevista con ${i.personName}`, type: "entrevista", duration: 30 })),
        ...organizationInterviews.map(i => ({ id: i.id, date: new Date(i.date), title: `Entrevista con ${i.personName}`, type: "entrevista", duration: 30 })),
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

  app.get("/api/activities", requireAuth, async (req: Request, res: Response) => {
    try {
      const activities = await storage.getAllActivities();
      res.json(activities);
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

  // ========================================
  // ASSIGNMENTS
  // ========================================

  app.get("/api/assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const assignments = await storage.getAllAssignments();
      res.json(assignments);
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

      // Check authorization: obispo, consejero_obispo, secretario, or assigned/created by user
      const isObispado =
        user.role === "obispo" || user.role === "consejero_obispo" || user.role === "secretario";
      const isAssignedTo = assignment.assignedTo === user.id;
      const isCreatedBy = assignment.assignedBy === user.id;

      if (!isObispado && !isAssignedTo && !isCreatedBy) {
        return res.status(403).json({ error: "Forbidden" });
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

      const assignmentData = insertAssignmentSchema.partial().parse(req.body);

      const updatedAssignment = await storage.updateAssignment(id, assignmentData);
      if (!updatedAssignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const statusLabels: Record<string, string> = {
        pendiente: "pendiente",
        en_proceso: "en proceso",
        completada: "completada",
      };
      const statusText = assignmentData.status
        ? ` Estado: ${statusLabels[updatedAssignment.status] || updatedAssignment.status}.`
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
            url: "/assignments",
            notificationId: notification.id,
          });
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

  app.delete("/api/assignments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo" || user.role === "secretario";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
      
      // Get the assignment to check ownership
      const assignment = await storage.getAssignment(id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      
      // Obispado can delete any assignment
      // Org members can only delete assignments they created
      if (!isObispado) {
        if (!isOrgMember || assignment.assignedBy !== user.id) {
          return res.status(403).json({ error: "Forbidden - You can only delete assignments you created" });
        }
      }
      
      await storage.deleteAssignment(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
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
        if (interview.status === "completada") {
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
          { status: "Solicitado", count: filteredBudgets.filter(b => b.status === "solicitado").length, amount: filteredBudgets.filter(b => b.status === "solicitado").reduce((sum, b) => sum + b.amount, 0) },
          { status: "Aprobado", count: filteredBudgets.filter(b => b.status === "aprobado").length, amount: filteredBudgets.filter(b => b.status === "aprobado").reduce((sum, b) => sum + b.amount, 0) },
          { status: "En Proceso", count: filteredBudgets.filter(b => b.status === "en_proceso").length, amount: filteredBudgets.filter(b => b.status === "en_proceso").reduce((sum, b) => sum + b.amount, 0) },
          { status: "Completado", count: filteredBudgets.filter(b => b.status === "completado").length, amount: filteredBudgets.filter(b => b.status === "completado").reduce((sum, b) => sum + b.amount, 0) },
        ],
        budgetByOrganization,
        interviewsByMonth,
        activitiesByOrganization,
        totalMetrics: {
          totalMeetings: filteredMeetings.length + filteredCouncils.length,
          totalBudget: filteredBudgets.reduce((sum, b) => sum + b.amount, 0),
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
      const subscriptions = await storage.getPushSubscriptionsByUser(req.session.userId!);
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
      const { endpoint, p256dh, auth } = req.body;
      
      if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({ error: "Invalid subscription data" });
      }

      const existing = await storage.getPushSubscriptionByEndpoint(endpoint);
      if (existing) {
        return res.json({ message: "Already subscribed", subscription: existing });
      }

      const subscriptionData = insertPushSubscriptionSchema.parse({
        userId: req.session.userId,
        endpoint,
        p256dh,
        auth,
      });

      const subscription = await storage.createPushSubscription(subscriptionData);
      
      if (isPushConfigured()) {
        await sendPushNotification(req.session.userId!, {
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
      const { endpoint } = req.body;
      
      if (!endpoint) {
        return res.status(400).json({ error: "Endpoint is required" });
      }

      await storage.deletePushSubscriptionByEndpoint(endpoint);
      res.json({ message: "Unsubscribed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  // ========================================
  // AUTOMATIC BIRTHDAY NOTIFICATIONS
  // ========================================
  
  // Function to send birthday notifications
  async function sendAutomaticBirthdayNotifications() {
    try {
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
          const alreadyNotified = existingNotifications.some(
            n => n.type === "birthday_today" && 
                 n.relatedId === birthday.id && 
                 new Date(n.createdAt).toDateString() === new Date().toDateString()
          );
          
          if (alreadyNotified) continue;
          
          const notification = await storage.createNotification({
            userId: recipient.id,
            type: "birthday_today",
            title: "Cumpleaños Hoy",
            description: `Hoy es el cumpleaños de ${birthday.name} (${age} años)`,
            relatedId: birthday.id,
            isRead: false,
          });

          if (isPushConfigured()) {
            await sendPushNotification(recipient.id, {
              title: "Cumpleaños Hoy",
              body: `Hoy es el cumpleaños de ${birthday.name} (${age} años)`,
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
      const todayKey = new Date().toDateString();
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
          name: normalizeMemberName(birthday.name),
          age,
          recipientSex: matchedMember?.sex,
          recipientOrganizationType: organization?.type,
          wardName,
        });
        emailsSent += 1;
      }

      lastBirthdayEmailDate = todayKey;
      console.log(`[Birthday Emails] Sent ${emailsSent} birthday email(s)`);
    } catch (error) {
      console.error("[Birthday Emails] Error:", error);
    }
  }

  // Schedule birthday notifications check every hour
  // This ensures notifications are sent even if server restarts
  setInterval(sendAutomaticBirthdayNotifications, 60 * 60 * 1000); // Every hour
  
  // Also run once on startup (with a small delay to ensure DB is ready)
  setTimeout(sendAutomaticBirthdayNotifications, 10000); // 10 seconds after startup

  // Schedule birthday emails once per day (24 hours)
  setInterval(sendAutomaticBirthdayEmails, 24 * 60 * 60 * 1000);
  setTimeout(sendAutomaticBirthdayEmails, 15000);

  return httpServer;
}
