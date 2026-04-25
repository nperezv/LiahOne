import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import geoip from "geoip-lite";
import type { Request } from "express";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const DEFAULT_WARD_NAME = "Barrio";
const SMTP_FROM_DEFAULT_ADDRESS = "no-reply@zendapp.org";

const resolveWardName = (wardName?: string | null) => {
  const trimmedWardName = wardName?.trim();
  return trimmedWardName || DEFAULT_WARD_NAME;
};

const wardSig = (wardName?: string | null) => `🧭 ${resolveWardName(wardName)}`;

const getSmtpFromHeader = (wardName?: string | null) => {
  const fromDisplayName = resolveWardName(wardName);
  const configuredFrom = process.env.SMTP_FROM?.trim();
  if (!configuredFrom) {
    return `"${fromDisplayName}" <${SMTP_FROM_DEFAULT_ADDRESS}>`;
  }

  if (configuredFrom.includes("<") && configuredFrom.includes(">")) {
    const extractedAddress = configuredFrom.match(/<([^>]+)>/)?.[1]?.trim();
    const address = extractedAddress || SMTP_FROM_DEFAULT_ADDRESS;
    return `"${fromDisplayName}" <${address}>`;
  }

  if (configuredFrom.includes("@")) {
    return `"${fromDisplayName}" <${configuredFrom}>`;
  }

  return `"${fromDisplayName}" <${SMTP_FROM_DEFAULT_ADDRESS}>`;
};


const createSmtpTransport = (wardName?: string | null) => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = getSmtpFromHeader(wardName);

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


export async function sendAgendaReminderEmail(payload: { toEmail: string; subject?: string; body: string; wardName?: string | null }) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Agenda reminder email:", payload);
    return;
  }

  const { transporter, from } = smtp;
  await transporter.sendMail({
    from,
    to: payload.toEmail,
    subject: payload.subject || "Recordatorio de agenda",
    text: payload.body,
  });
}

export async function sendLoginOtpEmail(toEmail: string, code: string, wardName?: string | null) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = getSmtpFromHeader(wardName);

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

export async function sendAccountRecoveryEmail(payload: {
  toEmail: string;
  name: string;
  username: string;
  temporaryPassword: string;
  wardName?: string | null;
  loginUrl?: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = getSmtpFromHeader(payload.wardName);
  const wardSignature = wardSig(payload.wardName);

  if (!host || !port || !user || !pass) {
    console.warn("SMTP not configured. Recovery payload:", payload);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const recoveryLines = [
    `Hola ${payload.name},`, "",
    "Hemos procesado tu solicitud de recuperación de acceso.",
    `Usuario: ${payload.username}`, `Contraseña temporal: ${payload.temporaryPassword}`,
    payload.loginUrl ? `Iniciar sesión: ${payload.loginUrl}` : null,
    "", "Por seguridad, cambia esta contraseña después de iniciar sesión.", "", wardSignature,
  ];
  await transporter.sendMail({
    from, to: payload.toEmail,
    subject: "Recuperación de acceso",
    text: recoveryLines.filter((l): l is string => Boolean(l)).join("\n"),
    html: buildHtmlEmail(recoveryLines, payload.wardName),
  });
}

export async function sendAccessRequestEmail(payload: {
  toEmail: string;
  requesterName: string;
  requesterEmail: string;
  calling?: string | null;
  phone?: string | null;
  reviewUrl: string;
  wardName?: string | null;
}) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = getSmtpFromHeader(payload.wardName);

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
  callingName?: string | null;
  organizationName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
  wardName?: string | null;
  loginUrl?: string;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. New user credentials:", payload);
    return;
  }

  const ward = resolveWardName(payload.wardName);
  const greeting = buildPastoralGreeting({
    recipientName: payload.name,
    recipientSex: payload.recipientSex,
    recipientOrganizationType: payload.recipientOrganizationType,
  });
  const callingFull = payload.callingName
    ? payload.organizationName
      ? `${payload.callingName} de ${payload.organizationName}`
      : payload.callingName
    : null;
  const callingLine = callingFull ? ` como <strong>${callingFull}</strong>` : "";
  const callingLinePlain = callingFull ? ` como ${callingFull}` : "";
  const loginUrl = payload.loginUrl ?? "";
  const appBase = process.env.APP_BASE_URL || "https://barriom8.zendapp.org";
  const logoUrl = `${appBase}/icons/compass.svg`;

  const subject = `Tu acceso a ${ward} está listo`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

      <!-- HEADER -->
      <tr>
        <td style="background:#1a3554;padding:26px 32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:14px;vertical-align:middle;"><img src="${logoUrl}" width="40" height="40" alt="" style="display:block;" /></td>
            <td style="vertical-align:middle;">
              <div style="font-size:19px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">${ward}</div>
            </td>
          </tr></table>
        </td>
      </tr>

      <!-- BODY -->
      <tr>
        <td style="padding:32px 32px 24px;">
          <p style="margin:0 0 18px;font-size:15px;color:#1e293b;line-height:1.65;">${greeting}</p>
          <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.65;">
            Tu cuenta de acceso${callingLine} en <strong>${ward}</strong> ha sido creada correctamente.
            A continuación encontrarás tus credenciales para iniciar sesión:
          </p>

          <!-- CREDENTIALS BOX -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr>
              <td style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:22px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;padding-bottom:5px;">Usuario</td>
                  </tr>
                  <tr>
                    <td style="font-size:17px;font-weight:700;color:#1a3554;font-family:Courier New,monospace;padding-bottom:18px;border-bottom:1px solid #e2e8f0;">${payload.username}</td>
                  </tr>
                  <tr><td style="padding-top:14px;"></td></tr>
                  <tr>
                    <td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;padding-bottom:5px;">Contraseña temporal</td>
                  </tr>
                  <tr>
                    <td style="font-size:17px;font-weight:700;color:#1a3554;font-family:Courier New,monospace;">${payload.temporaryPassword}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- CTA BUTTON -->
          ${loginUrl ? `
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr>
              <td style="background:#1a3554;border-radius:8px;">
                <a href="${loginUrl}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                  Iniciar sesión &rarr;
                </a>
              </td>
            </tr>
          </table>
          ` : ""}

          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.55;background:#fef9c3;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:4px;">
            🔒 Por seguridad, deberás establecer una nueva contraseña personal en tu primer inicio de sesión.
          </p>
        </td>
      </tr>

      <!-- SIGNATURE -->
      <tr>
        <td style="border-top:1px solid #e2e8f0;padding:20px 32px;background:#f8fafc;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;vertical-align:middle;"><img src="${logoUrl}" width="30" height="30" alt="" style="display:block;" /></td>
            <td style="vertical-align:middle;">
              <div style="font-size:14px;font-weight:700;color:#1a3554;">${ward}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;font-style:italic;">Sirviendo juntos con fe y propósito</div>
            </td>
          </tr></table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    greeting,
    "",
    `Tu cuenta de acceso${callingLinePlain} en ${ward} ha sido creada correctamente.`,
    "",
    `Usuario: ${payload.username}`,
    `Contraseña temporal: ${payload.temporaryPassword}`,
    loginUrl ? `Iniciar sesión: ${loginUrl}` : null,
    "",
    "Por seguridad, deberás establecer una nueva contraseña en tu primer inicio de sesión.",
    "",
    "Con aprecio,",
    `🧭 ${ward}`,
  ].filter((line): line is string => line !== null).join("\n");

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject,
    text,
    html,
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

const getMadridGreeting = () => {
  const h = parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Europe/Madrid" }).format(new Date()),
    10
  );
  if (h < 14) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
};

const buildPastoralGreeting = (options: {
  recipientName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) => {
  const greeting = getMadridGreeting();
  const salutation = getRecipientSalutation(options.recipientSex, options.recipientOrganizationType);
  const normalizedName = normalizeRecipientName(options.recipientName);
  const prefix = [greeting, salutation].filter(Boolean).join(" ");
  const raw = normalizedName ? `${prefix} ${normalizedName},` : `${prefix},`;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
  return wardSig(options.wardName);
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
  const from = getSmtpFromHeader(payload.wardName);

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

  const ivLines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, recipientOrganizationType: payload.recipientOrganizationType, }),
    "", `Se ha programado una entrevista con ${interviewerLine}.`,
    `Fecha: ${payload.interviewDate}`, `Hora: ${payload.interviewTime} hrs.`,
    "Lugar: oficina del obispado.", notesLine,
    "", "Agradecemos tu disposición y te invitamos a prepararte espiritualmente.",
    rescheduleLine, "", "Con aprecio y gratitud.", signatureLine,
  ];
  await transporter.sendMail({
    from, to: payload.toEmail,
    subject: "Entrevista programada",
    text: ivLines.filter((l) => l !== null && l !== undefined).join("\n"),
    html: buildHtmlEmail(ivLines, payload.wardName),
  });
}

const buildOrganizationInterviewSignature = (organizationName?: string | null) => {
  const clean = organizationName?.trim();
  return `🧭 ${clean ? `Presidencia de ${clean}` : "Presidencia de organización"}`;
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
  wardName?: string | null;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Organization interview scheduled:", payload);
    return;
  }

  const notesLine = payload.notes?.trim() ? `Notas adicionales: ${payload.notes.trim()}` : null;

  const lines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, recipientOrganizationType: payload.recipientOrganizationType, }),
    "", "Se ha programado una entrevista de organización.",
    `Fecha: ${payload.interviewDate}`, `Hora: ${payload.interviewTime} hrs.`,
    "Lugar: coordinación interna de la organización.",
    payload.requesterName ? `Solicitada por: ${payload.requesterName}` : null,
    notesLine, "",
    "Gracias por tu disposición para ministrar y servir.", "",
    "Con aprecio fraternal,", buildOrganizationInterviewSignature(payload.organizationName),
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Entrevista de organización programada",
    text: lines.filter((l): l is string => Boolean(l)).join("\n"),
    html: buildHtmlEmail(lines, payload.wardName),
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
  wardName?: string | null;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Organization interview cancelled:", payload);
    return;
  }

  const cancelLines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, recipientOrganizationType: payload.recipientOrganizationType, }),
    "", "Te informamos que la entrevista de organización ha sido cancelada por ahora.",
    `Fecha original: ${payload.interviewDate}`, `Hora original: ${payload.interviewTime} hrs.`,
    "", "Si es necesario, coordinaremos una nueva fecha contigo.", "",
    "Con cariño,", buildOrganizationInterviewSignature(payload.organizationName),
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Cancelación de entrevista de organización",
    text: cancelLines.join("\n"),
    html: buildHtmlEmail(cancelLines, payload.wardName),
  });
}



export async function sendInterviewUpdatedEmail(payload: {
  toEmail: string;
  recipientName: string;
  interviewDate: string;
  interviewTime: string;
  interviewerName?: string | null;
  changeLines: string[];
  secretaryName?: string | null;
  wardName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) {
  const smtp = createSmtpTransport(payload.wardName);
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

  const updatedLines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, recipientOrganizationType: payload.recipientOrganizationType, }),
    "", "Esperamos que te encuentres bien. Te compartimos los cambios recientes de tu entrevista:",
    ...changeLines, "",
    `Fecha: ${payload.interviewDate}`, `Hora: ${payload.interviewTime} hrs.`,
    payload.interviewerName ? `Entrevistador: ${payload.interviewerName}` : null,
    "", "Gracias por tu disposición y tu fe.", secretaryLine, "",
    "Con cariño fraternal,", wardSig(payload.wardName),
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Actualización de tu entrevista",
    text: updatedLines.filter((l): l is string => Boolean(l)).join("\n"),
    html: buildHtmlEmail(updatedLines, payload.wardName),
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
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Interview cancelled:", payload);
    return;
  }

  const cancelledLines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, recipientOrganizationType: payload.recipientOrganizationType, }),
    "", "Con cariño te informamos que la entrevista programada ha sido cancelada por ahora.",
    `Fecha original: ${payload.interviewDate}`, `Hora original: ${payload.interviewTime} hrs.`,
    "", "Agradecemos mucho tu disposición. Si deseas, con gusto coordinamos una nueva fecha.", "",
    "Con aprecio fraternal,", wardSig(payload.wardName),
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Aviso de cancelación de entrevista",
    text: cancelledLines.join("\n"),
    html: buildHtmlEmail(cancelledLines, payload.wardName),
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
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Interview reminder 24h:", payload);
    return;
  }

  const reminder24Lines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, recipientOrganizationType: payload.recipientOrganizationType, }),
    "", "Te recordamos con cariño que tienes una entrevista programada para mañana.",
    `Fecha: ${payload.interviewDate}`, `Hora: ${payload.interviewTime} hrs.`,
    payload.interviewerName ? `Entrevistador: ${payload.interviewerName}` : null,
    "", "Si necesitas apoyo para reprogramar, contacta al secretario ejecutivo.", "",
    "Con aprecio fraternal,", wardSig(payload.wardName),
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Recordatorio: entrevista en 24 horas",
    text: reminder24Lines.filter((l): l is string => Boolean(l)).join("\n"),
    html: buildHtmlEmail(reminder24Lines, payload.wardName),
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
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Assignment reminder 24h:", payload);
    return;
  }

  const assignLines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, recipientOrganizationType: payload.recipientOrganizationType }),
    "", "Te recordamos que tienes una asignación pendiente por completar.",
    `Asignación: ${payload.assignmentTitle}`, `Fecha límite: ${payload.dueDate}`,
    "", "Gracias por tu servicio y disposición.", "",
    "Con aprecio fraternal,", wardSig(payload.wardName),
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Recordatorio: asignación por vencer (24h)",
    text: assignLines.join("\n"),
    html: buildHtmlEmail(assignLines, payload.wardName),
  });
}

export async function sendWardCouncilAssignmentEmail(payload: {
  toEmail: string;
  recipientName: string;
  assignmentTitle: string;
  dueDate?: string | null;
  wardName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Ward council assignment email:", payload);
    return;
  }

  const councilLines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, recipientOrganizationType: payload.recipientOrganizationType }),
    "", "El Consejo de Barrio te ha asignado la siguiente responsabilidad:",
    `Asignación: ${payload.assignmentTitle}`,
    payload.dueDate ? `Fecha límite: ${payload.dueDate}` : null,
    "", "Gracias por tu disposición y servicio en el barrio.", "",
    "Con aprecio fraternal,", wardSig(payload.wardName),
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Nueva asignación del Consejo de Barrio",
    text: councilLines.filter((l): l is string => Boolean(l)).join("\n"),
    html: buildHtmlEmail(councilLines, payload.wardName),
  });
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const b = (value: string) => `<strong>${escapeHtml(value)}</strong>`;

const buildHtmlSignatureFooter = (wardName?: string | null) => {
  const appBase = process.env.APP_BASE_URL || "https://barriom8.zendapp.org";
  const logoUrl = `${appBase}/icons/compass.svg`;
  const ward = escapeHtml(resolveWardName(wardName));
  return `<tr>
        <td style="border-top:1px solid #e2e8f0;padding:20px 32px;background:#f8fafc;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;vertical-align:middle;"><img src="${logoUrl}" width="30" height="30" alt="" style="display:block;" /></td>
            <td style="vertical-align:middle;">
              <div style="font-size:14px;font-weight:700;color:#1a3554;">${ward}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;font-style:italic;">Sirviendo juntos con fe y propósito</div>
            </td>
          </tr></table>
        </td>
      </tr>`;
};

const buildHtmlEmail = (lines: (string | null | undefined)[], wardName?: string | null) => {
  const bodyHtml = lines
    .filter((l): l is string => l !== null && l !== undefined)
    .filter(line => !line.startsWith("🧭"))
    .map(line => {
      if (line === "") return `<div style="height:8px;"></div>`;
      if (line.startsWith("──")) return `<p style="margin:12px 0 4px;font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.06em;border-bottom:1px solid #f1f5f9;padding-bottom:4px;">${escapeHtml(line)}</p>`;
      return `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(line)}</p>`;
    })
    .join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <tr><td style="padding:32px 32px 24px;">${bodyHtml}</td></tr>
    ${buildHtmlSignatureFooter(wardName)}
  </table>
</td></tr></table>
</body></html>`;
};

export async function sendSacramentalAssignmentEmail(payload: {
  toEmail: string;
  recipientName: string;
  meetingDate: string;
  meetingTime: string;
  assignmentKind: "discourse" | "opening_prayer" | "closing_prayer" | "other_assignment";
  topic?: string;
  assignmentLabel?: string;
  suggestedMinutes?: number | null;
  wardName?: string | null;
  recipientSex?: string | null;
  recipientOrganizationType?: string | null;
  reminderType?: "midweek" | "day_before";
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Sacramental assignment:", payload);
    return;
  }

  const salutation = getRecipientSalutation(payload.recipientSex, payload.recipientOrganizationType);
  const normalizedName = normalizeRecipientName(payload.recipientName);
  const greeting = getMadridGreeting();
  const headerLine = normalizedName
    ? `${greeting}, ${salutation} ${normalizedName}:`
    : `${greeting}, ${salutation}:`;

  const signature = wardSig(payload.wardName);

  const reminderIntro =
    payload.reminderType === "day_before"
      ? "Te escribimos como recordatorio de tu asignación para mañana."
      : payload.reminderType === "midweek"
        ? "Te escribimos como recordatorio de tu asignación para esta semana."
        : null;

  let subject: string;
  let textLines: string[];
  let htmlLines: string[];

  if (payload.assignmentKind === "discourse") {
    const topic = payload.topic || "el Salvador Jesucristo";
    const minutes = payload.suggestedMinutes || 10;

    subject = payload.reminderType
      ? "Recordatorio: participación como discursante en reunión sacramental"
      : "Asignación como discursante en reunión sacramental";

    if (reminderIntro) {
      textLines = [
        headerLine,
        "",
        "Esperamos que usted y su familia se encuentren bien y disfrutando de las bendiciones del evangelio.",
        "",
        `Le recordamos con cariño su participación como discursante el domingo ${payload.meetingDate}, compartiendo un mensaje sobre ${topic}, con un tiempo aproximado de ${minutes} minutos.`,
        "",
        "Confiamos en que el Padre Celestial le inspirará y sostendrá. Gracias por su disposición.",
        "",
        "Con aprecio,",
        signature,
      ];

      htmlLines = [
        escapeHtml(headerLine),
        "",
        "Esperamos que usted y su familia se encuentren bien y disfrutando de las bendiciones del evangelio.",
        "",
        `Le recordamos con cariño su participación como discursante el ${b(`domingo ${payload.meetingDate}`)}, ${b(`compartiendo un mensaje sobre ${topic}`)}, con un tiempo aproximado de ${b(`${minutes} minutos`)}.`,
        "",
        "Confiamos en que el Padre Celestial le inspirará y sostendrá. Gracias por su disposición.",
        "",
        "Con aprecio,",
        escapeHtml(signature),
      ];
    } else {
      textLines = [
        headerLine,
        "",
        "Esperamos que usted y su familia se encuentren bien y disfrutando de las bendiciones del evangelio.",
        "",
        `Bajo espíritu de oración, nos hemos sentido inspirados a solicitar su participación en la reunión sacramental del domingo ${payload.meetingDate}, como discursante, para compartir un mensaje sobre ${topic}.`,
        "",
        "Le sugerimos preparar su mensaje basándose en las Escrituras y en los discursos de la conferencia general, con el propósito principal de ayudar a la congregación a recordar al Salvador Jesucristo y Su Expiación.",
        "",
        "Confiamos en que el Padre Celestial le inspirará, le ayudará y le sostendrá al prepararse para cumplir con esta asignación.",
        "",
        `Le agradeceremos que su mensaje pueda ajustarse a un tiempo aproximado de ${minutes} minutos, y valoramos sinceramente su disposición para servir y fortalecer a la congregación con su participación.`,
        "",
        "Con aprecio,",
        signature,
      ];

      htmlLines = [
        escapeHtml(headerLine),
        "",
        "Esperamos que usted y su familia se encuentren bien y disfrutando de las bendiciones del evangelio.",
        "",
        `Bajo espíritu de oración, nos hemos sentido inspirados a solicitar su participación en la reunión sacramental del ${b(`domingo ${payload.meetingDate}`)}, como discursante, para ${b(`compartir un mensaje sobre ${topic}`)}.`,
        "",
        "Le sugerimos preparar su mensaje basándose en las Escrituras y en los discursos de la conferencia general, con el propósito principal de ayudar a la congregación a recordar al Salvador Jesucristo y Su Expiación.",
        "",
        "Confiamos en que el Padre Celestial le inspirará, le ayudará y le sostendrá al prepararse para cumplir con esta asignación.",
        "",
        `Le agradeceremos que su mensaje pueda ajustarse a un tiempo aproximado de ${b(`${minutes} minutos`)}, y valoramos sinceramente su disposición para servir y fortalecer a la congregación con su participación.`,
        "",
        "Con aprecio,",
        escapeHtml(signature),
      ];
    }
  } else if (payload.assignmentKind === "opening_prayer" || payload.assignmentKind === "closing_prayer") {
    const prayerLabel = payload.assignmentKind === "opening_prayer" ? "oración inicial" : "oración final";

    subject = payload.reminderType
      ? `Recordatorio: ${prayerLabel} en reunión sacramental`
      : `Asignación de ${prayerLabel} en reunión sacramental`;

    textLines = [
      headerLine,
      "",
      "Esperamos que usted y su familia se encuentren bien y disfrutando de las bendiciones del evangelio.",
      "",
      ...(reminderIntro ? [reminderIntro, ""] : []),
      `Bajo espíritu de oración, nos hemos sentido inspirados a solicitar su participación en la reunión sacramental del domingo ${payload.meetingDate}, para ofrecer la ${prayerLabel}.`,
      "",
      "Confiamos en que el Padre Celestial le inspirará, le ayudará y le sostendrá al prepararse para cumplir con esta asignación.",
      "",
      "Agradecemos sinceramente su disposición para servir y fortalecer a la congregación con su participación.",
      "",
      "Con aprecio,",
      signature,
    ];

    htmlLines = [
      escapeHtml(headerLine),
      "",
      "Esperamos que usted y su familia se encuentren bien y disfrutando de las bendiciones del evangelio.",
      "",
      ...(reminderIntro ? [escapeHtml(reminderIntro), ""] : []),
      `Bajo espíritu de oración, nos hemos sentido inspirados a solicitar su participación en la reunión sacramental del ${b(`domingo ${payload.meetingDate}`)}, para ofrecer la ${b(prayerLabel)}.`,
      "",
      "Confiamos en que el Padre Celestial le inspirará, le ayudará y le sostendrá al prepararse para cumplir con esta asignación.",
      "",
      "Agradecemos sinceramente su disposición para servir y fortalecer a la congregación con su participación.",
      "",
      "Con aprecio,",
      escapeHtml(signature),
    ];
  } else {
    const assignmentLabel = payload.assignmentLabel || "asignación especial";

    subject = payload.reminderType
      ? "Recordatorio: asignación en reunión sacramental"
      : "Asignación en reunión sacramental";

    textLines = [
      headerLine,
      "",
      "Esperamos que usted y su familia se encuentren bien y disfrutando de las bendiciones del evangelio.",
      "",
      ...(reminderIntro ? [reminderIntro, ""] : []),
      `Bajo espíritu de oración, nos hemos sentido inspirados a solicitar su participación en la reunión sacramental del domingo ${payload.meetingDate}, para cumplir con la siguiente asignación: ${assignmentLabel}.`,
      "",
      "Confiamos en que el Padre Celestial le inspirará, le ayudará y le sostendrá al prepararse para cumplir con esta asignación.",
      "",
      "Agradecemos sinceramente su disposición para servir y fortalecer a la congregación con su participación.",
      "",
      "Con aprecio,",
      signature,
    ];

    htmlLines = [
      escapeHtml(headerLine),
      "",
      "Esperamos que usted y su familia se encuentren bien y disfrutando de las bendiciones del evangelio.",
      "",
      ...(reminderIntro ? [escapeHtml(reminderIntro), ""] : []),
      `Bajo espíritu de oración, nos hemos sentido inspirados a solicitar su participación en la reunión sacramental del ${b(`domingo ${payload.meetingDate}`)}, para cumplir con la siguiente asignación: ${b(assignmentLabel)}.`,
      "",
      "Confiamos en que el Padre Celestial le inspirará, le ayudará y le sostendrá al prepararse para cumplir con esta asignación.",
      "",
      "Agradecemos sinceramente su disposición para servir y fortalecer a la congregación con su participación.",
      "",
      "Con aprecio,",
      escapeHtml(signature),
    ];
  }

  const htmlBodyInner = htmlLines
    .filter((line) => !line.startsWith("🧭"))
    .map((line) => (line === "" ? `<div style="height:8px;"></div>` : `<p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">${line}</p>`))
    .join("");

  const htmlBody = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <tr><td style="padding:32px 32px 24px;">${htmlBodyInner}</td></tr>
    ${buildHtmlSignatureFooter(payload.wardName)}
  </table>
</td></tr></table>
</body></html>`;

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject,
    text: textLines.join("\n"),
    html: htmlBody,
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
  const from = getSmtpFromHeader(payload.wardName);

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

  const bdayLines = [headerLine, "", ageLine, messageLine, "", "Con cariño,", wardSig(payload.wardName)];
  await transporter.sendMail({
    from, to: payload.toEmail,
    subject: "¡Feliz cumpleaños!",
    text: bdayLines.join("\n"),
    html: buildHtmlEmail(bdayLines, payload.wardName),
  });
}

export async function sendBaptismReminderEmail(payload: {
  toEmail: string;
  recipientName: string;
  candidateName: string;
  baptismDate: string;
  wardName?: string | null;
  isException?: boolean;
  daysUntil?: number;
}) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = getSmtpFromHeader(payload.wardName);

  if (!host || !port || !user || !pass) {
    console.warn("[Baptism Email] SMTP not configured, skipping:", payload.toEmail);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const subject = payload.isException
    ? `URGENTE — Servicio bautismal de ${payload.candidateName} en ${payload.daysUntil} día(s)`
    : `Servicio bautismal de ${payload.candidateName} — quedan 2 semanas`;

  const body = payload.isException
    ? [
        `Estimado/a ${payload.recipientName},`,
        "",
        `NOTA: Este aviso se envía como excepción a la pauta habitual de 2 semanas.`,
        "",
        `El servicio bautismal de ${payload.candidateName} está programado para el ${payload.baptismDate}, es decir, en tan solo ${payload.daysUntil} día(s).`,
        "",
        "Dada la fecha tan avanzada, es necesario acelerar el proceso de preparación del servicio. Por favor, verifica urgentemente que se haya cubierto lo siguiente a nivel espiritual y logístico:",
        "",
        "  • Los candidatos al bautismo han completado la entrevista bautismal",
        "  • El programa del servicio está completo y enviado a aprobación",
        "  • El espacio está reservado en el calendario de la iglesia",
        "  • El equipo o material tecnológico ha sido coordinado con el líder de actividades",
        "  • Se ha gestionado la solicitud de presupuesto para el refrigerio (si aplica)",
        "  • Está designado el recojo de la ropa bautismal al terminar el servicio",
        "  • Está designada la limpieza de los ambientes al finalizar",
        "",
        "Puedes gestionar el checklist desde 'Obra Misional > Servicios Bautismales' y desde la sección 'Actividades' en la aplicación.",
        "",
        "Atentamente,",
        wardSig(payload.wardName),
      ].join("\n")
    : [
        `Estimado/a ${payload.recipientName},`,
        "",
        `Te recordamos que el servicio bautismal de ${payload.candidateName} está programado para el ${payload.baptismDate}.`,
        "",
        "Faltan aproximadamente 2 semanas. Por favor, asegúrate de que el programa esté preparado y que todos los participantes estén confirmados.",
        "",
        "Puedes revisar y editar el programa desde la sección 'Obra Misional > Servicios Bautismales' en la aplicación.",
        "",
        "Atentamente,",
        wardSig(payload.wardName),
      ].join("\n");

  await transporter.sendMail({
    from, to: payload.toEmail,
    subject,
    text: body,
    html: buildHtmlEmail(body.split("\n"), payload.wardName),
  });
}

export async function sendBudgetDisbursementRequestEmail(payload: {
  toEmail: string;
  recipientName: string;
  recipientSex?: string | null;
  bishopName: string;
  budgetDescription: string;
  budgetAmount: number | string;
  wardName?: string | null;
  timeLabel?: string;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Budget disbursement request email:", payload);
    return;
  }

  const budgetReqLines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, }),
    "", `El obispo ${payload.bishopName} ha firmado y aprobado la siguiente solicitud de gasto:`,
    "", `Concepto: ${payload.budgetDescription}`, `Importe: €${payload.budgetAmount}`,
    "", "El siguiente paso es generar el desembolso correspondiente en el sistema (LCR/MLS Finance).",
    "", "Una vez realizado, ve al apartado de Asignaciones y marca como completada la asignación «Generar desembolso».",
    "", "Gracias por tu diligencia y servicio.", "", "Con aprecio fraternal,", wardSig(payload.wardName),
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Solicitud de gasto aprobada — Generar desembolso",
    text: budgetReqLines.join("\n"),
    html: buildHtmlEmail(budgetReqLines, payload.wardName),
  });
}

export async function sendBudgetDisbursementCompletedEmail(payload: {
  toEmail: string;
  recipientName: string;
  recipientSex?: string | null;
  secretaryName: string;
  budgetDescription: string;
  budgetAmount: number | string;
  wardName?: string | null;
  timeLabel?: string;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Budget disbursement completed email:", payload);
    return;
  }

  const budgetDoneLines = [
    buildPastoralGreeting({ recipientName: payload.recipientName, recipientSex: payload.recipientSex, }),
    "", `El secretario financiero ${payload.secretaryName} ha generado el desembolso para la siguiente solicitud:`,
    "", `Concepto: ${payload.budgetDescription}`, `Importe: €${payload.budgetAmount}`,
    "", "Por favor, entra al sistema (LCR/MLS Finance) y finaliza la aprobación del desembolso para que el pago pueda procesarse.",
    "", "Gracias.", "", "Con aprecio fraternal,", wardSig(payload.wardName),
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Desembolso generado — Acción requerida en el sistema",
    text: budgetDoneLines.join("\n"),
    html: buildHtmlEmail(budgetDoneLines, payload.wardName),
  });
}

export async function sendAccessRequestConfirmationEmail(payload: {
  toEmail: string;
  name: string;
  consentAt: Date;
  wardName?: string | null;
  bajaUrl: string;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Access request confirmation:", payload);
    return;
  }

  const consentDateStr = payload.consentAt.toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
  const ward = payload.wardName?.trim() || "el barrio";

  const accessConfLines = [
    `Hola ${payload.name},`, "",
    "Hemos recibido tu solicitud de acceso a la plataforma de gestión del barrio. Este correo confirma los datos que has proporcionado y el consentimiento otorgado.",
    "", "── DATOS REGISTRADOS ──────────────────",
    `Nombre: ${payload.name}`, `Email: ${payload.toEmail}`,
    "", "── CONSENTIMIENTO ─────────────────────",
    `Fecha y hora: ${consentDateStr}`,
    "Consentiste ser contactado por email y/o WhatsApp para asuntos relacionados con tu llamamiento en el barrio.",
    "", "── FINALIDAD DEL TRATAMIENTO ──────────",
    `Tus datos son utilizados exclusivamente por los líderes de ${ward} para la gestión interna de llamamientos y comunicaciones del barrio. No se comparten con terceros.`,
    "", "── TUS DERECHOS (RGPD) ────────────────",
    `Puedes solicitar la eliminación de tus datos en cualquier momento en: ${payload.bajaUrl}`,
    "También puedes ejercer tus derechos de acceso, rectificación y portabilidad respondiendo a este correo.",
    "", "Un líder revisará tu solicitud y se pondrá en contacto contigo en breve.",
    "", "Con aprecio fraternal,", `🧭 ${ward}`,
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Confirmación de solicitud de acceso — Zendapp",
    text: accessConfLines.join("\n"),
    html: buildHtmlEmail(accessConfLines, payload.wardName),
  });
}

export async function sendRegistroConfirmationEmail(payload: {
  toEmail: string;
  nombre: string;
  apellidos: string;
  consentEmail: boolean;
  consentPhone: boolean;
  consentAt: Date;
  wardName?: string | null;
  bajaUrl: string;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Registro confirmation:", payload);
    return;
  }

  const consentDateStr = payload.consentAt.toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
  const ward = payload.wardName?.trim() || "el barrio";
  const consentChannels = [
    payload.consentEmail ? "correo electrónico" : null,
    payload.consentPhone ? "teléfono/WhatsApp" : null,
  ].filter(Boolean).join(" y ");

  const regLines = [
    `Hola ${payload.nombre} ${payload.apellidos},`, "",
    "Hemos recibido tu solicitud de registro en el directorio del barrio. Este correo confirma los datos proporcionados y el consentimiento otorgado.",
    "", "── DATOS REGISTRADOS ──────────────────",
    `Nombre: ${payload.nombre} ${payload.apellidos}`, `Email: ${payload.toEmail}`,
    "", "── CONSENTIMIENTO ─────────────────────",
    `Fecha y hora: ${consentDateStr}`,
    `Consentiste ser contactado por ${consentChannels} para comunicaciones del barrio.`,
    "", "── FINALIDAD DEL TRATAMIENTO ──────────",
    `Tus datos se utilizan exclusivamente por los líderes autorizados de ${ward} para la coordinación interna del barrio. No se comparten con terceros.`,
    "", "── BASE LEGAL ─────────────────────────",
    "Tus datos se tratan con base en tu consentimiento expreso (RGPD Art. 6.1.a).",
    "", "── TUS DERECHOS (RGPD) ────────────────",
    `Puedes solicitar la eliminación de tus datos en cualquier momento en: ${payload.bajaUrl}`,
    "También puedes ejercer tus derechos de acceso, rectificación y portabilidad respondiendo a este correo.",
    "", "Tu solicitud está pendiente de revisión por un líder del barrio, que la confirmará en breve.",
    "", "Con aprecio fraternal,", `🧭 ${ward}`,
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Confirmación de registro en el directorio — Zendapp",
    text: regLines.join("\n"),
    html: buildHtmlEmail(regLines, payload.wardName),
  });
}

export async function sendBajaConfirmationEmail(payload: {
  toEmail: string;
  nombre: string;
  apellidos: string;
  wardName?: string | null;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Baja confirmation:", payload);
    return;
  }

  const ward = payload.wardName?.trim() || "el barrio";

  const bajaLines = [
    `Hola ${payload.nombre} ${payload.apellidos},`, "",
    "Hemos recibido tu solicitud de eliminación de datos del directorio del barrio.",
    "", "Conforme al artículo 17 del RGPD (derecho de supresión), procesaremos tu solicitud en un plazo máximo de 30 días naturales.",
    "", "Una vez completada la eliminación, todos tus datos personales serán borrados permanentemente de los sistemas de la plataforma.",
    "", "Si tienes alguna duda o deseas confirmar el estado de tu solicitud, responde a este correo.",
    "", "Con aprecio fraternal,", `🧭 ${ward}`,
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: "Confirmación de solicitud de baja — Zendapp",
    text: bajaLines.join("\n"),
    html: buildHtmlEmail(bajaLines, payload.wardName),
  });
}

export async function sendBajaLeaderNotificationEmail(payload: {
  toEmail: string;
  nombre: string;
  apellidos: string;
  email?: string | null;
  motivo?: string | null;
  wardName?: string | null;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Baja leader notification:", payload);
    return;
  }

  await smtp.transporter.sendMail({
    from: smtp.from,
    to: payload.toEmail,
    subject: "Nueva solicitud de baja del directorio",
    text: [
      "Se ha recibido una solicitud de eliminación de datos:",
      "",
      `Nombre: ${payload.apellidos}, ${payload.nombre}`,
      payload.email ? `Email: ${payload.email}` : "Email: (no proporcionado)",
      payload.motivo ? `Motivo: ${payload.motivo}` : null,
      "",
      "Debes procesar esta baja en un plazo máximo de 30 días (RGPD Art. 17).",
    ].filter((l): l is string => l !== null).join("\n"),
  });
}

export async function sendBaptismModerationReminderEmail(payload: {
  toEmail: string;
  candidateNames: string[];
  pendingCount: number;
  wardName?: string | null;
  missionUrl: string;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Baptism moderation reminder:", payload);
    return;
  }

  const names = payload.candidateNames.join(", ");
  const ward = payload.wardName?.trim() || "el barrio";

  const moderLines = [
    "Hola,", "",
    `Hay ${payload.pendingCount} felicitación(es) pendiente(s) de aprobación para el bautismo de ${names}.`,
    "", "En aproximadamente 1 hora se generarán y enviarán automáticamente los recuerdos de bautismo con los mensajes aprobados hasta ese momento.",
    "", `Aprueba los mensajes aquí: ${payload.missionUrl}`,
    "", "Con aprecio fraternal,", `🧭 ${ward}`,
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: `Recordatorio: aprueba las felicitaciones antes del envío del recuerdo de bautismo`,
    text: moderLines.join("\n"),
    html: buildHtmlEmail(moderLines, payload.wardName),
  });
}

export async function sendBaptismBannerEmail(payload: {
  toEmail: string;
  candidateName: string;
  serviceDate: Date;
  wardName?: string | null;
  bannerPng: Buffer;
}) {
  const smtp = createSmtpTransport(payload.wardName);
  if (!smtp) {
    console.warn("SMTP not configured. Baptism banner email:", payload.candidateName);
    return;
  }

  const ward = payload.wardName?.trim() || "el barrio";
  const dateStr = payload.serviceDate.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
  const filename = `recuerdo-bautismo-${payload.candidateName.toLowerCase().replace(/\s+/g, "-")}.png`;

  const bannerLines = [
    `Hola ${payload.candidateName},`, "",
    `En nombre de los miembros de ${ward}, te enviamos este recuerdo de tu bautismo del ${dateStr}.`,
    "", "En él encontrarás las felicitaciones de quienes estuvieron presentes ese día.",
    "", "¡Bienvenido/a a la familia del evangelio!", "",
    "Con aprecio fraternal,", `🧭 ${ward}`,
  ];
  await smtp.transporter.sendMail({
    from: smtp.from, to: payload.toEmail,
    subject: `Tu recuerdo de bautismo — ${payload.candidateName}`,
    text: bannerLines.join("\n"),
    html: buildHtmlEmail(bannerLines, payload.wardName),
    attachments: [
      {
        filename,
        content: payload.bannerPng,
        contentType: "image/png",
      },
    ],
  });
}
