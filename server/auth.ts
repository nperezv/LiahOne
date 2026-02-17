import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import geoip from "geoip-lite";
import type { Request } from "express";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;


const createSmtpTransport = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "no-reply@liahone.app";

  if (!host || !port || !user || !pass) {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return { transporter, from };
};

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
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
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
      buildPastoralGreeting({
        recipientName: payload.name,
        recipientSex: payload.recipientSex,
        recipientOrganizationType: payload.recipientOrganizationType,
      }),
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

const normalizeRecipientName = (value?: string | null) => {
  if (!value) return "";
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  if (cleaned.includes("|")) {
    const [namePart] = cleaned.split("|").map((part) => part.trim());
    return namePart || "";
  }

  // Importante: no reordenamos apellidos/nombres aquí.
  // El orden ya debe venir normalizado desde el flujo que envía el correo.
  // Esto evita "doble normalización" y casos de desnormalización.
  return cleaned;
};

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
  if (["f", "female", "femenino", "femenina"].includes(normalized)) return "female";
  if (["m", "male", "masculino", "masculina"].includes(normalized)) return "male";
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

const buildPastoralGreeting = (options: {
  recipientName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
  timeLabel?: string;
}) => {
  const greeting = getTimeGreeting(options.timeLabel);
  const salutation = getRecipientSalutation(options.recipientSex, options.recipientOrganizationType);
  const normalizedName = normalizeRecipientName(options.recipientName);
  const prefix = [greeting, salutation].filter(Boolean).join(" ");
  return normalizedName
    ? `${prefix} ${normalizedName},`
    : `${prefix},`;
};

const getTimeGreeting = (timeLabel?: string) => {
  if (!timeLabel) return "";
  const hourMatch = timeLabel.match(/(\d{1,2})/);
  const hour = hourMatch ? Number(hourMatch[1]) : null;
  if (hour === null) return "";
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
  const notesLine = payload.notes?.trim()
    ? `Notas adicionales: ${payload.notes.trim()}`
    : null;
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
      buildPastoralGreeting({
        recipientName: payload.recipientName,
        recipientSex: payload.recipientSex,
        recipientOrganizationType: payload.recipientOrganizationType,
        timeLabel: payload.interviewTime,
      }),
      "",
      `Se ha programado una entrevista con ${interviewerLine}.`,
      `Fecha: ${payload.interviewDate}`,
      `Hora: ${payload.interviewTime} hrs.`,
      "Lugar: oficina del obispado.",
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

const buildOrganizationInterviewSignature = (organizationName?: string | null) => {
  const clean = organizationName?.trim();
  return clean ? `Presidencia de ${clean}` : "Presidencia de organización";
};

export async function sendOrganizationInterviewScheduledEmail(payload: {
  toEmail: string;
  recipientName: string;
  interviewDate: string;
  interviewTime: string;
  interviewType?: string | null;
  notes?: string | null;
  organizationName?: string | null;
  requesterName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) {
  const smtp = createSmtpTransport();
  if (!smtp) {
    console.warn("SMTP not configured. Organization interview scheduled:", payload);
    return;
  }

  const notesLine = payload.notes?.trim() ? `Notas adicionales: ${payload.notes.trim()}` : null;

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject: "Entrevista de organización programada",
    text: [
      buildPastoralGreeting({
        recipientName: payload.recipientName,
        recipientSex: payload.recipientSex,
        recipientOrganizationType: payload.recipientOrganizationType,
        timeLabel: payload.interviewTime,
      }),
      "",
      "Se ha programado una entrevista de organización.",
      `Fecha: ${payload.interviewDate}`,
      `Hora: ${payload.interviewTime} hrs.`,
      "Lugar: coordinación interna de la organización.",
      payload.requesterName ? `Solicitada por: ${payload.requesterName}` : null,
      notesLine,
      "",
      "Gracias por tu disposición para ministrar y servir.",
      "",
      "Con aprecio fraternal,",
      buildOrganizationInterviewSignature(payload.organizationName),
    ].filter((line): line is string => Boolean(line)).join("\n"),
  });
}

export async function sendOrganizationInterviewCancelledEmail(payload: {
  toEmail: string;
  recipientName: string;
  interviewDate: string;
  interviewTime: string;
  organizationName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) {
  const smtp = createSmtpTransport();
  if (!smtp) {
    console.warn("SMTP not configured. Organization interview cancelled:", payload);
    return;
  }

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject: "Cancelación de entrevista de organización",
    text: [
      buildPastoralGreeting({
        recipientName: payload.recipientName,
        recipientSex: payload.recipientSex,
        recipientOrganizationType: payload.recipientOrganizationType,
        timeLabel: payload.interviewTime,
      }),
      "",
      "Te informamos que la entrevista de organización ha sido cancelada por ahora.",
      `Fecha original: ${payload.interviewDate}`,
      `Hora original: ${payload.interviewTime} hrs.`,
      "",
      "Si es necesario, coordinaremos una nueva fecha contigo.",
      "",
      "Con cariño,",
      buildOrganizationInterviewSignature(payload.organizationName),
    ].join("\n"),
  });
}



export async function sendInterviewUpdatedEmail(payload: {
  toEmail: string;
  recipientName: string;
  interviewDate: string;
  interviewTime: string;
  interviewerName?: string | null;
  wardName?: string | null;
  changeLines: string[];
  secretaryName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) {
  const smtp = createSmtpTransport();
  if (!smtp) {
    console.warn("SMTP not configured. Interview updated:", payload);
    return;
  }

  const changeLines = payload.changeLines.length > 0
    ? payload.changeLines.map((line) => `• ${line}`)
    : ["• Se actualizó la información de la entrevista."];

  const secretaryLine = payload.secretaryName?.trim()
    ? `Si necesitas apoyo para coordinar, comunícate con el secretario ${payload.secretaryName.trim()}.`
    : "Si necesitas apoyo para coordinar, comunícate con el secretario ejecutivo.";

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject: "Actualización de tu entrevista",
    text: [
      buildPastoralGreeting({
        recipientName: payload.recipientName,
        recipientSex: payload.recipientSex,
        recipientOrganizationType: payload.recipientOrganizationType,
        timeLabel: payload.interviewTime,
      }),
      "",
      "Esperamos que te encuentres bien. Te compartimos los cambios recientes de tu entrevista:",
      ...changeLines,
      "",
      `Fecha: ${payload.interviewDate}`,
      `Hora: ${payload.interviewTime} hrs.`,
      payload.interviewerName ? `Entrevistador: ${payload.interviewerName}` : null,
      "",
      "Gracias por tu disposición y tu fe.",
      secretaryLine,
      "",
      "Con cariño fraternal,",
      payload.wardName?.trim() || "Obispado",
    ].filter((line): line is string => Boolean(line)).join("\n"),
  });
}

export async function sendInterviewCancelledEmail(payload: {
  toEmail: string;
  recipientName: string;
  interviewDate: string;
  interviewTime: string;
  wardName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) {
  const smtp = createSmtpTransport();
  if (!smtp) {
    console.warn("SMTP not configured. Interview cancelled:", payload);
    return;
  }

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject: "Aviso de cancelación de entrevista",
    text: [
      buildPastoralGreeting({
        recipientName: payload.recipientName,
        recipientSex: payload.recipientSex,
        recipientOrganizationType: payload.recipientOrganizationType,
        timeLabel: payload.interviewTime,
      }),
      "",
      "Con cariño te informamos que la entrevista programada ha sido cancelada por ahora.",
      `Fecha original: ${payload.interviewDate}`,
      `Hora original: ${payload.interviewTime} hrs.`,
      "",
      "Agradecemos mucho tu disposición. Si deseas, con gusto coordinamos una nueva fecha.",
      "",
      "Con aprecio fraternal,",
      payload.wardName?.trim() || "Obispado",
    ].join("\n"),
  });
}

export async function sendInterviewReminder24hEmail(payload: {
  toEmail: string;
  recipientName: string;
  interviewDate: string;
  interviewTime: string;
  interviewerName?: string | null;
  wardName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) {
  const smtp = createSmtpTransport();
  if (!smtp) {
    console.warn("SMTP not configured. Interview reminder 24h:", payload);
    return;
  }

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject: "Recordatorio: entrevista en 24 horas",
    text: [
      buildPastoralGreeting({
        recipientName: payload.recipientName,
        recipientSex: payload.recipientSex,
        recipientOrganizationType: payload.recipientOrganizationType,
        timeLabel: payload.interviewTime,
      }),
      "",
      "Te recordamos con cariño que tienes una entrevista programada para mañana.",
      `Fecha: ${payload.interviewDate}`,
      `Hora: ${payload.interviewTime} hrs.`,
      payload.interviewerName ? `Entrevistador: ${payload.interviewerName}` : null,
      "",
      "Si necesitas apoyo para reprogramar, contacta al secretario ejecutivo.",
      "",
      "Con aprecio fraternal,",
      payload.wardName?.trim() || "Obispado",
    ].filter((line): line is string => Boolean(line)).join("\n"),
  });
}

export async function sendAssignmentDueReminderEmail(payload: {
  toEmail: string;
  recipientName: string;
  assignmentTitle: string;
  dueDate: string;
  wardName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) {
  const smtp = createSmtpTransport();
  if (!smtp) {
    console.warn("SMTP not configured. Assignment reminder 24h:", payload);
    return;
  }

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject: "Recordatorio: asignación por vencer (24h)",
    text: [
      buildPastoralGreeting({
        recipientName: payload.recipientName,
        recipientSex: payload.recipientSex,
        recipientOrganizationType: payload.recipientOrganizationType,
      }),
      "",
      "Te recordamos que tienes una asignación pendiente por completar.",
      `Asignación: ${payload.assignmentTitle}`,
      `Fecha límite: ${payload.dueDate}`,
      "",
      "Gracias por tu servicio y disposición.",
      "",
      "Con aprecio fraternal,",
      payload.wardName?.trim() || "Obispado",
    ].join("\n"),
  });
}

export async function sendSacramentalAssignmentEmail(payload: {
  toEmail: string;
  recipientName: string;
  meetingDate: string;
  meetingTime: string;
  assignmentLines: string[];
  wardName?: string | null;
  isUpdate?: boolean;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) {
  const smtp = createSmtpTransport();
  if (!smtp) {
    console.warn("SMTP not configured. Sacramental assignment:", payload);
    return;
  }

  const subject = payload.isUpdate
    ? "Actualización de tu participación en la reunión sacramental"
    : "Tu participación en la próxima reunión sacramental";

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject,
    text: [
      buildPastoralGreeting({
        recipientName: payload.recipientName,
        recipientSex: payload.recipientSex,
        recipientOrganizationType: payload.recipientOrganizationType,
        timeLabel: payload.meetingTime,
      }),
      "",
      payload.isUpdate
        ? "Con cariño te compartimos una actualización de tu participación:"
        : "Con mucho aprecio te compartimos tu participación en la próxima reunión sacramental:",
      ...payload.assignmentLines.map((line) => `• ${line}`),
      "",
      `Fecha: ${payload.meetingDate}`,
      `Hora: ${payload.meetingTime} hrs.`,
      "",
      "Gracias por tu disposición para servir.",
      "",
      "Con cariño fraternal,",
      payload.wardName?.trim() || "Obispado",
    ].join("\n"),
  });
}

export async function sendBirthdayGreetingEmail(payload: {
  toEmail: string;
  name: string;
  age?: number | null;
  message?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
  wardName?: string | null;
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
  const salutation = getRecipientSalutation(payload.recipientSex, payload.recipientOrganizationType);
  const normalizedName = normalizeRecipientName(payload.name);
  const headerLine = normalizedName
    ? `${salutation.charAt(0).toUpperCase()}${salutation.slice(1)} ${normalizedName},`
    : `${salutation.charAt(0).toUpperCase()}${salutation.slice(1)},`;

  await transporter.sendMail({
    from,
    to: payload.toEmail,
    subject: "¡Feliz cumpleaños!",
    text: [
      headerLine,
      "",
      ageLine,
      messageLine,
      "",
      "Con cariño,",
      payload.wardName?.trim() || "Tu barrio",
    ].join("\n"),
  });
}
