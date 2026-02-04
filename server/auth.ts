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

export function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url");
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

export async function sendNewUserCredentialsEmail(payload: {
  toEmail: string;
  name: string;
  username: string;
  temporaryPassword: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "no-reply@liahone.app";

  if (!host || !port || !user || !pass) {
    console.warn("SMTP not configured. New user credentials:", payload);
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
    to: payload.toEmail,
    subject: "Credenciales de tu nueva cuenta",
    text: [
      `Hola ${payload.name},`,
      "",
      "Tu cuenta ha sido creada. Usa estas credenciales para iniciar sesión:",
      `Usuario: ${payload.username}`,
      `Contraseña temporal: ${payload.temporaryPassword}`,
      "",
      "Por seguridad, deberás cambiar esta contraseña en tu primer inicio de sesión.",
    ].join("\n"),
  });
}

type RecipientGender = "male" | "female" | "unknown";

const formatInterviewType = (type?: string | null) => {
  if (!type) return "";
  const map: Record<string, string> = {
    recomendacion_templo: "Recomendación para el Templo",
    llamamiento: "Llamamiento",
    anual: "Entrevista Anual",
    orientacion: "Orientación",
    otra: "Otra",
    inicial: "Inicial",
    seguimiento: "Seguimiento",
    recomendacion: "Recomendación para el Templo",
  };
  return map[type] ?? type;
};

const getGenderFromSex = (sex?: string | null): RecipientGender => {
  const normalized = sex?.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("mujer") || normalized.includes("femen")) return "female";
  if (normalized.includes("hombre") || normalized.includes("mascul")) return "male";
  return "unknown";
};

const getGenderFromOrganization = (organizationType?: string | null): RecipientGender => {
  switch (organizationType) {
    case "sociedad_socorro":
    case "mujeres_jovenes":
      return "female";
    case "cuorum_elderes":
    case "hombres_jovenes":
      return "male";
    default:
      return "unknown";
  }
};

const getRecipientSalutation = (sex?: string | null, organizationType?: string | null) => {
  const gender = getGenderFromSex(sex);
  const resolvedGender = gender === "unknown" ? getGenderFromOrganization(organizationType) : gender;
  if (resolvedGender === "female") return "apreciada hermana";
  if (resolvedGender === "male") return "apreciado hermano";
  return "apreciado hermano";
};

const getTimeGreeting = (timeLabel?: string) => {
  if (!timeLabel) return "Estimado(a)";
  const hourMatch = timeLabel.match(/(\d{1,2})/);
  const hour = hourMatch ? Number(hourMatch[1]) : null;
  if (hour === null) return "Estimado(a)";
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
};

const getInterviewerArticle = (interviewerRole?: string | null, interviewerName?: string | null) => {
  if (interviewerRole === "presidente_organizacion") {
    const lowerName = interviewerName?.toLowerCase() ?? "";
    if (lowerName.startsWith("presidenta") || lowerName.startsWith("consejera")) {
      return "la";
    }
  }
  return "el";
};

const buildInterviewerReference = (interviewerName?: string | null, interviewerRole?: string | null) => {
  const name = interviewerName?.trim() || "obispado";
  const article = getInterviewerArticle(interviewerRole, interviewerName);
  return `${article} ${name}`;
};

const buildInterviewSignature = (options: { role?: string | null; wardName?: string | null }) => {
  const wardName = options.wardName?.trim();
  if (options.role === "obispo" || options.role === "consejero_obispo" || options.role === "secretario_ejecutivo") {
    return `Obispado ${wardName || "Barrio"}`;
  }
  return wardName || "";
};

export async function sendInterviewScheduledEmail(payload: {
  toEmail: string;
  recipientName: string;
  interviewerName?: string | null;
  interviewerRole?: string | null;
  interviewDate: string;
  interviewTime: string;
  interviewType?: string | null;
  notes?: string | null;
  wardName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
  secretaryName?: string | null;
}) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "no-reply@liahone.app";

  if (!host || !port || !user || !pass) {
    console.warn("SMTP not configured. Interview scheduled:", payload);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const interviewerLine = buildInterviewerReference(payload.interviewerName, payload.interviewerRole);
  const typeLabel = formatInterviewType(payload.interviewType);
  const typeLine = typeLabel ? `Tipo de entrevista: ${typeLabel}` : null;
  const notesLine = payload.notes?.trim()
    ? `Notas adicionales: ${payload.notes.trim()}`
    : null;
  const greeting = getTimeGreeting(payload.interviewTime);
  const salutation = getRecipientSalutation(payload.recipientSex, payload.recipientOrganizationType);
  const secretaryName = payload.secretaryName?.trim();
  const rescheduleLine = secretaryName
    ? `Si necesitas reprogramar, comunícate con el secretario ${secretaryName}.`
    : "Si necesitas reprogramar, comunícate con el secretario ejecutivo.";
  const signatureLine = buildInterviewSignature({
    role: payload.interviewerRole,
    wardName: payload.wardName,
  });

  await transporter.sendMail({
    from,
    to: payload.toEmail,
    subject: "Entrevista programada",
    text: [
      `${greeting} ${salutation} ${payload.recipientName},`,
      "",
      `Se ha programado una entrevista con ${interviewerLine}.`,
      `Fecha: ${payload.interviewDate}`,
      `Hora: ${payload.interviewTime} hrs.`,
      "Lugar: oficina del obispado.",
      typeLine,
      notesLine,
      "",
      "Agradecemos tu disposición y te invitamos a prepararte espiritualmente.",
      rescheduleLine,
      "",
      "Con aprecio y gratitud.",
      signatureLine,
    ]
      .filter((line) => line !== null && line !== undefined)
      .join("\n"),
  });
}

export async function sendBirthdayGreetingEmail(payload: {
  toEmail: string;
  name: string;
  age?: number | null;
  message?: string | null;
}) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "no-reply@liahone.app";

  if (!host || !port || !user || !pass) {
    console.warn("SMTP not configured. Birthday greeting:", payload);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const ageLine = payload.age ? `¡Felices ${payload.age} años!` : "¡Feliz cumpleaños!";
  const messageLine = payload.message?.trim()
    ? payload.message.trim()
    : "Que tengas un día lleno de alegría y bendiciones.";

  await transporter.sendMail({
    from,
    to: payload.toEmail,
    subject: "¡Feliz cumpleaños!",
    text: [
      `Hola ${payload.name},`,
      "",
      ageLine,
      messageLine,
      "",
      "Con cariño,",
      "Tu barrio",
    ].join("\n"),
  });
}
