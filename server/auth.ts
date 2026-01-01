import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import geoip from "geoip-lite";
import type { Request } from "express";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;

export function getAccessTokenSecret() {
  if (!process.env.ACCESS_TOKEN_SECRET) {
    throw new Error("ACCESS_TOKEN_SECRET environment variable is required");
  }
  return process.env.ACCESS_TOKEN_SECRET;
}

export function getRefreshTokenSecret() {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    throw new Error("REFRESH_TOKEN_SECRET environment variable is required");
  }
  return process.env.REFRESH_TOKEN_SECRET;
}

export function createAccessToken(userId: string, sessionId?: string) {
  return jwt.sign({ sub: userId, sid: sessionId }, getAccessTokenSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): { userId: string; sessionId?: string } | null {
  try {
    const payload = jwt.verify(token, getAccessTokenSecret()) as { sub: string; sid?: string };
    return { userId: payload.sub, sessionId: payload.sid };
  } catch (error) {
    return null;
  }
}

export function generateRefreshToken() {
  return crypto.randomBytes(64).toString("base64url");
}

export function hashToken(token: string) {
  return crypto
    .createHmac("sha256", getRefreshTokenSecret())
    .update(token)
    .digest("hex");
}

export function generateOtpCode() {
  return `${crypto.randomInt(0, 1000000)}`.padStart(6, "0");
}

export function getOtpExpiry() {
  return new Date(Date.now() + OTP_TTL_MS);
}

export function getRefreshExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}

export function getDeviceHash(deviceId?: string | null) {
  if (!deviceId) return null;
  return hashToken(deviceId);
}

export function getClientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip;
}

export function getCountryFromIp(ip?: string | null) {
  if (!ip) return null;
  const lookup = geoip.lookup(ip);
  return lookup?.country ?? null;
}

export async function sendLoginOtpEmail(toEmail: string, code: string) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "no-reply@liahone.app";

  if (!host || !port || !user || !pass) {
    console.warn("SMTP not configured. OTP code:", code);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: "Tu código de acceso",
    text: `Tu código de verificación es: ${code}. Expira en 10 minutos.`,
  });
}

export async function sendAccessRequestEmail(payload: {
  toEmail: string;
  requesterName: string;
  requesterEmail: string;
  calling?: string | null;
  phone?: string | null;
  reviewUrl: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "no-reply@liahone.app";

  if (!host || !port || !user || !pass) {
    console.warn("SMTP not configured. Access request:", payload);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const callingLine = payload.calling ? `Llamamiento: ${payload.calling}` : "Llamamiento: (no especificado)";
  const phoneLine = payload.phone ? `Teléfono: ${payload.phone}` : "Teléfono: (no especificado)";

  await transporter.sendMail({
    from,
    to: payload.toEmail,
    subject: "Nueva solicitud de acceso",
    text: [
      `Se ha recibido una solicitud de acceso.`,
      `Nombre: ${payload.requesterName}`,
      `Email: ${payload.requesterEmail}`,
      callingLine,
      phoneLine,
      "",
      `Revisar solicitud: ${payload.reviewUrl}`,
    ].join("\n"),
  });
}
