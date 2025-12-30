import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { storage } from "./storage";
import { db } from "./db";
import { and, eq, sql } from "drizzle-orm";
import {
  insertUserSchema,
  insertSacramentalMeetingSchema,
  insertWardCouncilSchema,
  insertPresidencyMeetingSchema,
  insertBudgetRequestSchema,
  insertInterviewSchema,
  insertOrganizationInterviewSchema,
  insertGoalSchema,
  insertBirthdaySchema,
  insertActivitySchema,
  insertAssignmentSchema,
  insertPdfTemplateSchema,
  insertWardBudgetSchema,
  insertOrganizationBudgetSchema,
  insertNotificationSchema,
  insertPushSubscriptionSchema,
  notifications,
} from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcrypt";
import { sendPushNotification, getVapidPublicKey, isPushConfigured } from "./push-service";
import {
  createAccessToken,
  generateRefreshToken,
  generateOtpCode,
  getClientIp,
  getCountryFromIp,
  getDeviceHash,
  getOtpExpiry,
  getRefreshExpiry,
  hashToken,
  sendLoginOtpEmail,
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
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
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

  app.post("/api/users", requireAuth, requireRole("obispo", "consejero_obispo"), async (req: Request, res: Response) => {
    try {
      const { username, password, name, email, role, organizationId } = req.body;

      if (!username || !password || !name || !role) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if the username already exists
      const existingUsers = await storage.getAllUsers();
      const usernameExists = existingUsers.some(u => u.username.toLowerCase() === username.toLowerCase());
      if (usernameExists) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Roles that require an organizationId
      const rolesRequireOrg = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"];
      if (rolesRequireOrg.includes(role) && !organizationId) {
        return res.status(400).json({ error: "organizationId is required for this role" });
      }

      // Bishop-level roles automatically get the Obispado organizationId
      const bishopRoles = ["consejero_obispo", "secretario"];
      const obispadoId = "0fc67882-5b4e-43d5-9384-83b1f8afe1e3"; // replace with the real Obispado ID
      const finalOrganizationId = bishopRoles.includes(role) ? obispadoId : organizationId || null;

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        email: email || null,
        role,
        organizationId: finalOrganizationId,
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

  app.patch("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, email, username, requireEmailOtp } = req.body;
      const user = await storage.updateUser(req.session.userId!, {
        name: name || undefined,
        email: email || undefined,
        username: username || undefined,
        requireEmailOtp: typeof requireEmailOtp === "boolean" ? requireEmailOtp : undefined,
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
      });

      if (!updatedUser) {
        return res.status(500).json({ error: "Failed to update password" });
      }

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  app.post("/api/users/:id/reset-password", requireAuth, requireRole("obispo", "consejero_obispo"), async (req: Request, res: Response) => {
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

  app.get("/api/admin/sessions", requireAuth, requireRole("obispo", "consejero_obispo"), async (req: Request, res: Response) => {
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
    requireRole("obispo", "consejero_obispo"),
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
    requireRole("obispo", "consejero_obispo"),
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

  app.patch("/api/users/:id/role", requireAuth, requireRole("obispo", "consejero_obispo"), async (req: Request, res: Response) => {
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

  app.delete("/api/users/:id", requireAuth, requireRole("obispo", "consejero_obispo"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deleteUser(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

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

  app.post("/api/sacramental-meetings", requireAuth, async (req: Request, res: Response) => {
    try {
      console.log("=== SACRAMENTAL MEETING CREATE START ===");
      console.log("Raw request body keys:", Object.keys(req.body));
      console.log("Raw body.discourses exists:", "discourses" in req.body);
      console.log("Raw body.discourses value:", req.body.discourses);
      console.log("Raw body.isTestimonyMeeting exists:", "isTestimonyMeeting" in req.body);
      console.log("Raw body.isTestimonyMeeting type:", typeof req.body.isTestimonyMeeting);
      console.log("Raw body.isTestimonyMeeting value:", req.body.isTestimonyMeeting);
      
      const dataToValidate = {
        ...req.body,
        createdBy: req.session.userId,
      };
      console.log("Data to validate keys:", Object.keys(dataToValidate));
      console.log("Data to validate.discourses:", dataToValidate.discourses);
      
      const meetingData = insertSacramentalMeetingSchema.parse(dataToValidate);
      console.log("After Zod parse - discourses:", meetingData.discourses);
      console.log("After Zod parse - isTestimonyMeeting:", meetingData.isTestimonyMeeting);
      console.log("=== SACRAMENTAL MEETING CREATE END ===");
      
      const meeting = await storage.createSacramentalMeeting(meetingData);
      res.status(201).json(meeting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Zod validation error:", error.errors);
        return res.status(400).json({ error: error.errors });
      }
      console.error("Sacramental meeting creation error:", error instanceof Error ? error.message : String(error));
      console.error("Full error:", error);
      res.status(500).json({ error: "Internal server error", details: String(error) });
    }
  });

  app.patch("/api/sacramental-meetings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const meetingData = insertSacramentalMeetingSchema.partial().parse(req.body);

      const meeting = await storage.updateSacramentalMeeting(id, meetingData);
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
      const interviews = await storage.getAllInterviews();
      res.json(interviews);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/interviews", requireAuth, async (req: Request, res: Response) => {
    try {
      const { personName, ...rest } = req.body;
  
      let assignedToId: string | undefined;
      let assignedUser: any | undefined; 

      if (personName) {
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
      }
      const requestingUser = await storage.getUser(req.session.userId!);
      const isRequestFromObispado = ["obispo", "consejero_obispo", "secretario_ejecutivo"].includes(
        requestingUser?.role || ""
      );
      const isAssignedOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(
        assignedUser?.role || ""
      );
      const shouldCreateAssignment = Boolean(
        isRequestFromObispado && assignedToId && isAssignedOrgMember
      );  
      const interviewData = insertInterviewSchema.parse({
        personName,
        ...rest,
        assignedBy: req.session.userId,
        ...(assignedToId && !shouldCreateAssignment && { assignedToId }),	
      });
  
      const interview = await storage.createInterview(interviewData);
  
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
      if (assignedToId && !shouldCreateAssignment && assignedToId !== interview.interviewerId) {      
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
 
      if (shouldCreateAssignment && assignedToId) {
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
          `Entrevista programada con ${interviewer?.name || "el obispado"} el ${interviewDate}.`,
        ];
        if (rest.notes) {
          descriptionParts.push(`Notas: ${rest.notes}`);
        }

        const assignment = await storage.createAssignment({
          title: assignmentTitle,
          description: descriptionParts.join(" "),
          assignedTo: assignedToId,
          assignedBy: req.session.userId!,
          dueDate: interview.date,
          status: "pendiente",
          relatedTo: `interview:${interview.id}`,
        });

        const notification = await storage.createNotification({
          userId: assignedToId,
          type: "assignment_created",
          title: "Nueva Asignación",
          description: `Se te ha asignado: "${assignment.title}"`,
          relatedId: assignment.id,
          isRead: false,
        });

        if (isPushConfigured()) {
          await sendPushNotification(assignedToId, {
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
      const { personName, ...rest } = req.body;
  
      let updateData: any = rest;
  
      if (personName) {
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
    
      const interview = await storage.updateInterview(id, interviewData);
      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
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
  
      if (interviewData.date || interviewData.status === "completada") {
        const assignments = await storage.getAllAssignments();
        const relatedAssignment = assignments.find(
          (assignment: any) => assignment.relatedTo === `interview:${interview.id}`
        );

        if (relatedAssignment) {
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
    
        const updated =
          await storage.updateOrganizationInterview(id, updateData);
    
        if (!updated) {
          return res.status(404).json({ error: "No encontrada" });
        }
    
        // 🔔 Notificar cambios (estado o fecha)
        if (updateData.status || updateData.date) {
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
                : `La fecha de la entrevista con ${updated.personName} fue modificada`,
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
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
      const isSecretary = user.role === "secretario";
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
      
      if (goalData.currentValue !== undefined && oldProgress !== newProgress) {
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
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
      const isObispadoSecretary = user.role === "secretario"; // Secretarios generales del Obispado
      const isOrgMember = user.role === "presidente_organizacion" || user.role === "consejero_organizacion" || user.role === "secretario_organizacion";

      const assignments = await storage.getAllAssignments();
      const interviews = await storage.getAllInterviews();
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

      // For organization members: show their interview requests AND interviews assigned to them
      // For obispado/secretarios: show all interviews
      const filteredInterviews = isOrgMember
        ? interviews.filter(i => i && (i.assignedBy === user.id || i.assignedToId === user.id))
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
      const visibleOrganizations = isObispado
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
      const upcomingInterviews = filteredInterviews.filter(i => {
        if (!i || i.status !== "programada") return false;
        if (isOrgMember) {
          return true; // Show all programmed interviews for org members
        } else {
          return new Date(i.date) <= weekFromNow; // Show only next 7 days for obispado
        }
      }).length;

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
    res.json(budget || { amount: 0 });
  });

  app.patch("/api/ward-budget", requireRole("obispo", "consejero_obispo"), async (req: Request, res: Response) => {
    const parsed = insertWardBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid budget data" });
    }
    const budget = await storage.updateWardBudget(parsed.data);
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
  // REMINDERS
  // ========================================

  app.post("/api/reminders/send", requireRole("obispo", "secretario"), async (req: Request, res: Response) => {
    const interviews = await storage.getAllInterviews();
    const assignments = await storage.getAllAssignments();
    
    // Get pending interviews for next 3-4 days
    const now = new Date();
    const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const inFourDays = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    
    const upcomingInterviews = interviews.filter((i: any) => {
      const iDate = new Date(i.date);
      return i.status === "programada" && iDate >= now && iDate <= inFourDays;
    });

    // Get pending assignments
    const pendingAssignments = assignments.filter((a: any) => a.status === "pendiente");

    // Format reminder data
    const reminderData = {
      timestamp: new Date(),
      upcomingInterviews: upcomingInterviews.length,
      pendingAssignments: pendingAssignments.length,
      details: {
        interviews: upcomingInterviews.map((i: any) => ({
          personName: i.personName,
          date: i.date,
          type: i.type,
        })),
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
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
      const isSecretary = user.role === "secretario";
      const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user.role);
      
      const [sacramentalMeetings, wardCouncils, interviews, activities] = await Promise.all([
        storage.getAllSacramentalMeetings(),
        storage.getAllWardCouncils(),
        storage.getAllInterviews(),
        storage.getAllActivities(),
      ]);

      // Filter interviews based on role
      // For organization members: show only interviews where personName matches their name or they requested
      // For obispado/secretarios: show all interviews
      const filteredInterviews = isOrgMember
        ? interviews.filter(i => i && (i.personName === user.name || i.assignedToId === user.id))
        : interviews;

      // Filter activities based on role
      // For organization members: show only activities for their organization OR ward-wide activities (no organizationId)
      // For obispado/secretarios: show all activities
      const filteredActivities = isOrgMember
        ? activities.filter(a => a && (!a.organizationId || a.organizationId === user.organizationId))
        : activities;

      const events = [
        ...sacramentalMeetings.map(m => ({
          id: m.id,
          title: "Reunión Sacramental",
          date: m.date,
          type: "reunion" as const,
          location: "Salón sacramental",
          organizationId: null,
        })),
        ...wardCouncils.map(c => ({
          id: c.id,
          title: "Consejo de Barrio",
          date: c.date,
          type: "consejo" as const,
          location: "Salón de consejeros",
          organizationId: null,
        })),
        ...filteredInterviews.map(i => ({
          id: i.id,
          title: `Entrevista con ${i.personName}`,
          date: i.date,
          type: "entrevista" as const,
          location: "Oficina",
          organizationId: null,
        })),
        ...filteredActivities.map(a => ({
          id: a.id,
          title: a.title,
          date: a.date,
          type: "actividad" as const,
          location: a.location,
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

      const eventDate = new Date(date);
      const eventEndTime = new Date(eventDate.getTime() + duration * 60000);
      
      const [sacramentalMeetings, wardCouncils, interviews, activities] = await Promise.all([
        storage.getAllSacramentalMeetings(),
        storage.getAllWardCouncils(),
        storage.getAllInterviews(),
        storage.getAllActivities(),
      ]);

      const allEvents = [
        ...sacramentalMeetings.map(m => ({ id: m.id, date: new Date(m.date), title: "Reunión Sacramental", type: "reunion", duration: 90 })),
        ...wardCouncils.map(c => ({ id: c.id, date: new Date(c.date), title: "Consejo de Barrio", type: "consejo", duration: 120 })),
        ...interviews.map(i => ({ id: i.id, date: new Date(i.date), title: `Entrevista con ${i.personName}`, type: "entrevista", duration: 30 })),
        ...activities.map(a => ({ id: a.id, date: new Date(a.date), title: a.title, type: "actividad", duration: 120 })),
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

      // Check authorization: obispo, consejero_obispo, or assigned/created by user
      const isObispado = user.role === "obispo" || user.role === "consejero_obispo";
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
        hombres_jovenes: "Hombres Jóvenes",
        mujeres_jovenes: "Mujeres Jóvenes",
        sociedad_socorro: "Sociedad de Socorro",
        primaria: "Primaria",
        escuela_dominical: "Escuela Dominical",
        jas: "JAS",
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

  // Schedule birthday notifications check every hour
  // This ensures notifications are sent even if server restarts
  setInterval(sendAutomaticBirthdayNotifications, 60 * 60 * 1000); // Every hour
  
  // Also run once on startup (with a small delay to ensure DB is ready)
  setTimeout(sendAutomaticBirthdayNotifications, 10000); // 10 seconds after startup

  return httpServer;
}
