import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, inArray, ne, sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "./db";
import { isPushConfigured, sendPushNotification } from "./push-service";
import {
  inventoryAuditItems,
  inventoryAudits,
  inventoryCategories,
  inventoryCategoryCounters,
  inventoryItems,
  inventoryLoans,
  inventoryLocations,
  inventoryMovements,
  inventoryNfcLinks,
  members,
  notifications,
  users,
  insertInventoryAuditSchema,
  insertInventoryCategorySchema,
  insertInventoryItemSchema,
  pdfTemplates,
} from "@shared/schema";

// Dirección pública de la app. Si APP_URL no está definida se deduce de la petición
// (antes quedaba "http://localhost:5173" y los QR apuntaban a localhost).
const ENV_BASE_URL = (process.env.APP_URL ?? "").trim().replace(/\/$/, "");

function getPublicBaseUrl(req?: Request) {
  if (ENV_BASE_URL) return ENV_BASE_URL;
  if (req) {
    const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0].trim();
    const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
    if (host) return `${proto}://${host}`;
  }
  return "http://localhost:5173";
}

const MM_TO_PT = 2.8346456693;
const CIRCLE_MM = 25;
const QR_MM = 14;

const INVENTORY_ALLOWED_ROLES = new Set(["obispo", "consejero_obispo", "bibliotecario", "lider_actividades"]);
const ADMIN_ROLES = new Set(["obispo", "consejero_obispo"]);
const LEADER_ROLES = new Set([...ADMIN_ROLES, "bibliotecario", "lider_actividades"]);

const moveByScanSchema = z.object({
  item_asset_code: z.string().optional(),
  item_nfc_uid: z.string().optional(),
  location_code: z.string().optional(),
  location_nfc_uid: z.string().optional(),
  note: z.string().max(300).optional(),
});

const registerLocationNfcSchema = z.object({
  location_id: z.string().optional(),
  location_code: z.string().optional(),
  nfc_uid: z.string().min(4),
});

const LOAN_REQUEST_PDF_DIR = path.resolve(process.cwd(), "uploads", "inventory-loans");
fs.mkdirSync(LOAN_REQUEST_PDF_DIR, { recursive: true });

const createInventoryLoanRequestSchema = z.object({
  itemId: z.string().min(1),
  borrowerFirstName: z.string().trim().min(2, "Escribe el nombre"),
  borrowerLastName: z.string().trim().min(2, "Escribe los apellidos"),
  borrowerPhone: z.string().trim().min(6, "Escribe un teléfono de contacto"),
  borrowerEmail: z.string().trim().email("El correo no es válido").optional().or(z.literal("")),
  expectedReturnDate: z.string().min(10, "Elige la fecha de devolución"),
  signatureDataUrl: z.string().min(20, "Falta la firma"),
  quantity: z.coerce.number().int().min(1).max(10000).optional(),
  memberId: z.string().optional().nullable(),
  notes: z.string().max(500).optional(),
});

function isAuthed(req: Request) {
  return Boolean((req as any).user);
}
function hasInventoryAccess(req: Request) {
  return INVENTORY_ALLOWED_ROLES.has(String((req as any).user?.role ?? ""));
}
function isAdmin(req: Request) {
  return ADMIN_ROLES.has(String((req as any).user?.role ?? ""));
}
function isLeader(req: Request) {
  return LEADER_ROLES.has(String((req as any).user?.role ?? ""));
}

function requireRead(req: Request, res: any, next: any) {
  if (!isAuthed(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!hasInventoryAccess(req)) return res.status(403).json({ error: "Forbidden" });
  next();
}
function requireLeader(req: Request, res: any, next: any) {
  if (!isAuthed(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!isLeader(req)) return res.status(403).json({ error: "Forbidden" });
  next();
}
function requireAdmin(req: Request, res: any, next: any) {
  if (!isAuthed(req)) return res.status(401).json({ error: "Unauthorized" });
  if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  next();
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Convierte cualquier fallo en una respuesta JSON con un mensaje claro.
// Antes, un error dentro de una ruta async (Express 4) no se capturaba:
// la petición se quedaba colgada o el proceso se caía, y el móvil solo
// mostraba "No se pudo crear el item" sin ningún motivo.
function sendInventoryError(err: any, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    const field = first?.path?.join(".") || "datos";
    return res.status(400).json({ error: `Dato no válido en "${field}": ${first?.message ?? "revisa el formulario"}`, code: "VALIDATION" });
  }
  const pgCode = err?.code ?? err?.cause?.code;
  if (pgCode === "23505") {
    return res.status(409).json({ error: "Ya existe un registro con ese código o esa etiqueta NFC", code: "DUPLICATE" });
  }
  if (pgCode === "23503") {
    return res.status(400).json({ error: "La categoría o la ubicación seleccionada ya no existe", code: "FOREIGN_KEY" });
  }
  console.error("[inventory-error]", err);
  return res.status(500).json({ error: `Error interno del servidor: ${err?.message ?? "desconocido"}`, code: "INTERNAL" });
}

function wrapHandlers(handlers: RequestHandler[]): RequestHandler[] {
  return handlers.map((h) => {
    if (typeof h !== "function") return h;
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const out: any = h(req, res, next);
        if (out && typeof out.catch === "function") out.catch((err: any) => sendInventoryError(err, res, next));
      } catch (err) {
        sendInventoryError(err, res, next);
      }
    };
  });
}

// Envuelve app.get/post/... para que todas las rutas de inventario tengan manejo de errores.
function withSafeRoutes(app: Express) {
  return {
    get: (route: string, ...handlers: RequestHandler[]) => app.get(route, ...wrapHandlers(handlers)),
    post: (route: string, ...handlers: RequestHandler[]) => app.post(route, ...wrapHandlers(handlers)),
    patch: (route: string, ...handlers: RequestHandler[]) => app.patch(route, ...wrapHandlers(handlers)),
    delete: (route: string, ...handlers: RequestHandler[]) => app.delete(route, ...wrapHandlers(handlers)),
  };
}

// Las URLs /a/:codigo y /loc/:codigo son las que llevan los QR impresos.
// Si las abre el navegador (pide HTML) deben ir a la app, no devolver JSON.
function skipIfBrowserNavigation(req: Request, _res: Response, next: NextFunction) {
  if (req.accepts(["html", "json"]) === "html") return next("route");
  next();
}

function auditLog(req: Request, action: string, payload?: Record<string, unknown>) {
  const userId = (req as any).user?.id;
  const ip = req.headers["x-forwarded-for"] ?? req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  console.log("[inventory-audit]", { action, userId, ip, userAgent, ...payload });
}

// El QR se genera en el propio servidor (librería qrcode), sin depender de servicios externos.
async function qrPngForUrl(url: string) {
  return QRCode.toBuffer(url, { type: "png", width: 512, margin: 1, errorCorrectionLevel: "M" }) as Promise<Buffer>;
}

async function getWardCode() {
  const [tpl] = await db.select({ wardName: pdfTemplates.wardName }).from(pdfTemplates).limit(1);
  const wardName = String(tpl?.wardName ?? "Barrio Madrid 8").trim();
  const tokens = wardName.split(/\s+/).filter(Boolean);
  const initials = tokens
    .map((token) => {
      const digits = token.replace(/\D/g, "");
      if (digits) return digits;
      return token[0]?.toUpperCase() ?? "";
    })
    .join("")
    .replace(/[^A-Z0-9]/g, "");
  return initials || "BM8";
}

function getLocationTypeCode(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("capilla")) return "CAP";
  if (normalized.includes("armario")) return "ARM";
  if (normalized.includes("estante")) return "EST";
  return "LOC";
}

function buildDynamicAssetPrefix(rawPrefix: string, wardCode: string) {
  const normalizedWard = wardCode.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BM8";
  const cleanedPrefix = rawPrefix.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (!cleanedPrefix) return normalizedWard;

  if (cleanedPrefix.endsWith(normalizedWard)) return cleanedPrefix;

  // Compatibilidad: si quedó guardado un sufijo tipo barrio previo (ej. ABM7),
  // se reemplaza por el barrio actual de configuración.
  const oldWardSuffixMatch = cleanedPrefix.match(/^(.*?)([A-Z]{1,3}\d{1,3})$/);
  const basePrefix = oldWardSuffixMatch?.[1] ? oldWardSuffixMatch[1] : cleanedPrefix;
  return `${basePrefix}${normalizedWard}`;
}

// db o una transacción (tx): solo se usan select y execute.
type DbExecutor = { select: (...args: any[]) => any; execute: (...args: any[]) => any };

// IMPORTANTE: el patrón se escribe como [0-9] y no como \\d.
// Antes llegaba a PostgreSQL como '-(\\d+)$', que busca una barra invertida literal,
// nunca coincidía, y todos los activos recibían el número 001 → el segundo guardado
// fallaba por código duplicado.
const SEQ_SUFFIX_REGEX = "-([0-9]+)$";

async function allocateAssetCode(tx: DbExecutor, categoryId: string) {
  const [category] = await tx.select({ id: inventoryCategories.id }).from(inventoryCategories).where(eq(inventoryCategories.id, categoryId)).limit(1);
  if (!category) throw new HttpError(400, "La categoría seleccionada no existe");
  const wardCode = await getWardCode();
  const dynamicPrefix = `AC${wardCode}`;

  // El bloqueo dura hasta el final de la transacción del que llama,
  // así que cubre también el INSERT y evita dos códigos iguales a la vez.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inventory_asset_code_${wardCode}`}))`);
  const seqResult = await tx.execute(sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING(${inventoryItems.assetCode} FROM ${SEQ_SUFFIX_REGEX}) AS integer)), 0) + 1 AS seq
    FROM ${inventoryItems}
    WHERE ${inventoryItems.assetCode} LIKE ${`${dynamicPrefix}-%`}
  `);
  const seqRows = "rows" in seqResult ? (seqResult.rows as Array<{ seq: number }>) : (seqResult as any as Array<{ seq: number }>);
  const seq = Number(seqRows[0]?.seq ?? 1);

  return `${dynamicPrefix}-${String(seq).padStart(3, "0")}`;
}

async function allocateLocationCode(tx: DbExecutor, name: string) {
  const wardCode = await getWardCode();
  const type = getLocationTypeCode(name);
  const basePrefix = type === "ARM" ? `AM${wardCode}` : `${type}${wardCode}`;

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inventory_location_code_${basePrefix}`}))`);
  const seqResult = await tx.execute(sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING(${inventoryLocations.code} FROM ${SEQ_SUFFIX_REGEX}) AS integer)), 0) + 1 AS seq
    FROM ${inventoryLocations}
    WHERE ${inventoryLocations.code} LIKE ${`${basePrefix}-%`}
  `);
  const seqRows = "rows" in seqResult ? (seqResult.rows as Array<{ seq: number }>) : (seqResult as any as Array<{ seq: number }>);
  const seq = Number(seqRows[0]?.seq ?? 1);

  return `${basePrefix}-${String(seq).padStart(3, "0")}`;
}

const ACTIVE_LOAN_SQL = sql.raw(`('active','overdue')`);

/** Unidades prestadas ahora mismo de un activo. */
async function loanedQuantity(executor: DbExecutor, itemId: string) {
  const r: any = await executor.execute(sql`
    SELECT COALESCE(SUM(quantity), 0)::int AS n FROM inventory_loans
    WHERE item_id = ${itemId} AND status IN ${ACTIVE_LOAN_SQL}
  `);
  const rows = "rows" in r ? r.rows : r;
  return Number(rows?.[0]?.n ?? 0);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeNfcUid(raw: string) {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

async function buildItemCircularLabelPdf(assetCode: string, baseUrl: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const size = CIRCLE_MM * MM_TO_PT;
  const qr = QR_MM * MM_TO_PT;
  const center = size / 2;
  const page = pdf.addPage([size, size]);
  page.drawCircle({ x: center, y: center, size: center - 2, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  page.drawText(assetCode, { x: 3, y: size - 11, size: 6, maxWidth: size - 6, font });
  try {
    const png = await qrPngForUrl(`${baseUrl}/a/${assetCode}`);
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: center - qr / 2, y: 4, width: qr, height: qr });
  } catch {
    page.drawText("QR", { x: center - 4, y: center - 4, size: 8, font });
  }
  return Buffer.from(await pdf.save());
}

async function buildLocationRectLabelPdf(locationCode: string, baseUrl: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = 50 * MM_TO_PT;
  const h = 30 * MM_TO_PT;
  const page = pdf.addPage([w, h]);
  page.drawText(locationCode, { x: 6, y: h - 14, size: 9, font });
  try {
    const png = await qrPngForUrl(`${baseUrl}/loc/${locationCode}`);
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: w - 48, y: 4, width: 44, height: 44 });
  } catch {
    page.drawText("QR", { x: w - 28, y: 10, size: 9, font });
  }
  return Buffer.from(await pdf.save());
}

async function buildLoanRequestPdf(input: {
  assetCode: string;
  itemName: string;
  borrowerFullName: string;
  borrowerPhone: string;
  borrowerEmail?: string;
  expectedReturnDate: string;
  signatureDataUrl: string;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);

  page.drawText("Solicitud de préstamo de activo", { x: 50, y: 790, size: 18, font: bold });
  page.drawText(`Activo: ${input.assetCode} · ${input.itemName}`, { x: 50, y: 750, size: 12, font });
  page.drawText(`Solicitante: ${input.borrowerFullName}`, { x: 50, y: 725, size: 12, font });
  page.drawText(`Teléfono: ${input.borrowerPhone}`, { x: 50, y: 700, size: 12, font });
  page.drawText(`Correo: ${input.borrowerEmail || "—"}`, { x: 50, y: 675, size: 12, font });
  page.drawText(`Fecha estimada devolución: ${input.expectedReturnDate}`, { x: 50, y: 650, size: 12, font });
  page.drawText(`Generado: ${new Date().toLocaleString("es-ES")}`, { x: 50, y: 625, size: 10, font });

  if (input.signatureDataUrl.startsWith("data:image/")) {
    const base64Data = input.signatureDataUrl.split(",")[1] || "";
    const imageBytes = Buffer.from(base64Data, "base64");
    const signatureImage = input.signatureDataUrl.startsWith("data:image/jpeg")
      ? await pdf.embedJpg(imageBytes)
      : await pdf.embedPng(imageBytes);
    page.drawRectangle({ x: 50, y: 500, width: 240, height: 80, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });
    page.drawImage(signatureImage, { x: 55, y: 505, width: 230, height: 70 });
    page.drawText("Firma del solicitante", { x: 50, y: 488, size: 10, font });
  }

  return Buffer.from(await pdf.save());
}

async function resolveItemByInputs(input: { item_asset_code?: string; item_nfc_uid?: string }) {
  if (input.item_asset_code) {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, input.item_asset_code)).limit(1);
    return item ?? null;
  }
  if (input.item_nfc_uid) {
    const [link] = await db.select().from(inventoryNfcLinks).where(eq(inventoryNfcLinks.uid, normalizeNfcUid(input.item_nfc_uid))).limit(1);
    if (!link || link.targetType !== "item") return null;
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, link.targetId)).limit(1);
    return item ?? null;
  }
  return null;
}

async function resolveLocationByInputs(input: { location_code?: string; location_nfc_uid?: string }) {
  if (input.location_code) {
    const [location] = await db.select().from(inventoryLocations).where(eq(inventoryLocations.code, input.location_code)).limit(1);
    return location ?? null;
  }
  if (input.location_nfc_uid) {
    const [link] = await db.select().from(inventoryNfcLinks).where(eq(inventoryNfcLinks.uid, normalizeNfcUid(input.location_nfc_uid))).limit(1);
    if (!link || link.targetType !== "location") return null;
    const [location] = await db.select().from(inventoryLocations).where(eq(inventoryLocations.id, link.targetId)).limit(1);
    return location ?? null;
  }
  return null;
}

async function buildLocationPath(locationId?: string | null): Promise<string> {
  if (!locationId) return "Sin ubicación";
  const names: string[] = [];
  let current = locationId;
  for (let i = 0; i < 10 && current; i++) {
    const [loc] = await db.select().from(inventoryLocations).where(eq(inventoryLocations.id, current)).limit(1);
    if (!loc) break;
    names.unshift(loc.name);
    current = loc.parentId ?? "";
  }
  return names.join(" / ");
}

// ── Avisos de préstamos vencidos ────────────────────────────────────────────
// Cada hora revisa los préstamos cuya fecha de devolución ya pasó y avisa (notificación en la app
// y push si está configurado) al bibliotecario y al líder de actividades; si no hay ninguno, al
// obispado. Cada préstamo se vuelve a recordar como mucho cada 3 días.
let overdueWorkerStarted = false;

async function notifyOverdueLoans() {
  const result: any = await db.execute(sql`
    SELECT lo.id, lo.borrower_name, lo.expected_return_date, lo.quantity, i.name AS item_name, i.asset_code
    FROM inventory_loans lo
    JOIN inventory_items i ON i.id = lo.item_id
    WHERE lo.status IN ${ACTIVE_LOAN_SQL}
      AND lo.expected_return_date < CURRENT_DATE
      AND (lo.overdue_notified_at IS NULL OR lo.overdue_notified_at < now() - interval '3 days')
    LIMIT 100
  `);
  const loans = ("rows" in result ? result.rows : result) as any[];
  if (!loans.length) return;

  let recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), inArray(users.role, ["bibliotecario", "lider_actividades"])));
  if (!recipients.length) {
    recipients = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isActive, true), inArray(users.role, ["obispo", "consejero_obispo"])));
  }
  if (!recipients.length) return;

  for (const loan of loans) {
    const qty = Number(loan.quantity ?? 1) > 1 ? ` (${loan.quantity} uds.)` : "";
    const title = "Préstamo vencido";
    const description = `${loan.borrower_name} debía devolver «${loan.item_name}»${qty} el ${new Date(`${loan.expected_return_date}T12:00:00`).toLocaleDateString("es-ES")}.`;
    for (const r of recipients) {
      const [notif] = await db
        .insert(notifications)
        .values({ userId: r.id, type: "reminder", title, description, relatedId: loan.id, isRead: false })
        .returning();
      if (isPushConfigured()) {
        await sendPushNotification(r.id, { title, body: description, url: "/inventory/loans", notificationId: notif?.id }).catch(() => undefined);
      }
    }
    await db.execute(sql`UPDATE inventory_loans SET overdue_notified_at = now() WHERE id = ${loan.id}`);
  }
  console.log(`[inventory] avisos de préstamos vencidos enviados: ${loans.length}`);
}

function startOverdueLoanWorker() {
  if (overdueWorkerStarted || process.env.NODE_ENV === "test") return;
  overdueWorkerStarted = true;
  const run = () => notifyOverdueLoans().catch((err) => console.error("[inventory] error en avisos de vencidos:", err));
  setTimeout(run, 60_000);
  setInterval(run, 60 * 60 * 1000).unref?.();
}

export function registerInventoryRoutes(rawApp: Express, requireAuth: RequestHandler, getUserIdFromRequest: (req: Request) => string | null) {
  const app = withSafeRoutes(rawApp);
  startOverdueLoanWorker();

  app.get("/api/inventory", requireAuth, requireRead, async (req, res) => {
    const search = String(req.query.search ?? "").trim();
    const includeRetired = req.query.includeRetired === "1";
    const conditions = [
      search ? sql`(${inventoryItems.assetCode} ILIKE ${`%${search}%`} OR ${inventoryItems.name} ILIKE ${`%${search}%`})` : undefined,
      includeRetired ? undefined : ne(inventoryItems.status, "retired"),
    ].filter(Boolean) as any[];
    const where = conditions.length ? and(...conditions) : undefined;

    const items = await db
      .select({
        id: inventoryItems.id,
        assetCode: inventoryItems.assetCode,
        name: inventoryItems.name,
        description: inventoryItems.description,
        status: inventoryItems.status,
        photoUrl: inventoryItems.photoUrl,
        qrUrl: inventoryItems.qrUrl,
        trackerId: inventoryItems.trackerId,
        categoryId: inventoryItems.categoryId,
        categoryName: inventoryCategories.name,
        locationId: inventoryItems.locationId,
        locationName: inventoryLocations.name,
        locationCode: inventoryLocations.code,
        createdAt: inventoryItems.createdAt,
        updatedAt: inventoryItems.updatedAt,
        lastVerifiedAt: inventoryItems.lastVerifiedAt,
        quantity: inventoryItems.quantity,
        retiredAt: inventoryItems.retiredAt,
        retiredReason: inventoryItems.retiredReason,
        hasNfc: sql<boolean>`EXISTS (SELECT 1 FROM inventory_nfc_links l WHERE l.target_type = 'item' AND l.target_id = ${inventoryItems.id})`,
        loanedQuantity: sql<number>`(SELECT COALESCE(SUM(lo.quantity), 0)::int FROM inventory_loans lo WHERE lo.item_id = ${inventoryItems.id} AND lo.status IN ${ACTIVE_LOAN_SQL})`,
        overdueLoans: sql<number>`(SELECT COUNT(*)::int FROM inventory_loans lo WHERE lo.item_id = ${inventoryItems.id} AND lo.status IN ${ACTIVE_LOAN_SQL} AND lo.expected_return_date < CURRENT_DATE)`,
      })
      .from(inventoryItems)
      .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
      .leftJoin(inventoryLocations, eq(inventoryItems.locationId, inventoryLocations.id))
      .where(where)
      .orderBy(desc(inventoryItems.createdAt));

    auditLog(req, "list_inventory", { count: items.length });
    const baseUrl = getPublicBaseUrl(req);
    res.json(items.map((item) => ({ ...item, qrUrl: `${baseUrl}/a/${item.assetCode}` })));
  });

  // Alta de activo. Antes solo obispo/consejero podían crear (requireAdmin), pero el
  // bibliotecario y el líder de actividades ven la pantalla de registro: les salía
  // "no se pudo guardar" (403) sin explicación. Ahora pueden todos los líderes de inventario.
  const itemCreateSchema = insertInventoryItemSchema.extend({
    categoryId: z.string().min(1, "Elige una categoría"),
    quantity: z.coerce.number().int().min(1, "La cantidad mínima es 1").max(10000).optional(),
    status: z.enum(["available", "maintenance"]).optional(),
    name: z.string().trim().min(2, "El nombre debe tener al menos 2 letras"),
    locationId: z.string().optional().nullable(),
  });

  async function createItemInTx(tx: any, body: unknown, baseUrl: string, nfcUid?: string) {
    const payload = itemCreateSchema.parse(body);
    const assetCode = await allocateAssetCode(tx, payload.categoryId);
    const qrUrl = `${baseUrl}/a/${assetCode}`;
    const [created] = await tx
      .insert(inventoryItems)
      .values({ ...payload, locationId: payload.locationId || null, assetCode, qrUrl })
      .returning();

    if (nfcUid) {
      const uid = normalizeNfcUid(nfcUid);
      if (uid.length < 4) throw new HttpError(400, "El UID de la etiqueta NFC no es válido");
      const [existing] = await tx.select().from(inventoryNfcLinks).where(eq(inventoryNfcLinks.uid, uid)).limit(1);
      if (existing) throw new HttpError(409, "Esta etiqueta NFC ya está asignada a otro activo o armario");
      await tx.insert(inventoryNfcLinks).values({ uid, targetType: "item", targetId: created.id });
    }
    return created;
  }

  app.post("/api/inventory", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const created = await db.transaction((tx) => createItemInTx(tx, req.body, getPublicBaseUrl(req)));
    auditLog(req, "create_item", { assetCode: created.assetCode });
    res.status(201).json(created);
  });

  // Crea el activo y vincula la etiqueta NFC en una sola operación:
  // si algo falla, no se queda un activo "huérfano" sin etiqueta.
  app.post("/api/inventory/with-nfc", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const { nfc_uid, ...itemData } = (req.body ?? {}) as Record<string, unknown>;
    if (!nfc_uid) throw new HttpError(400, "Falta el UID de la etiqueta NFC");
    const created = await db.transaction((tx) => createItemInTx(tx, itemData, getPublicBaseUrl(req), String(nfc_uid)));
    auditLog(req, "create_item_with_nfc", { assetCode: created.assetCode });
    res.status(201).json(created);
  });

  // Editar los datos de un activo (nombre, descripción, categoría, foto, estado).
  // El estado "prestado" solo cambia con un préstamo/devolución, no a mano.
  app.patch("/api/inventory/:assetCode", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const payload = z
      .object({
        name: z.string().trim().min(2, "El nombre debe tener al menos 2 letras").optional(),
        description: z.string().max(2000).optional().nullable(),
        categoryId: z.string().min(1).optional(),
        photoUrl: z.string().optional().nullable(),
        trackerId: z.string().max(120).optional().nullable(),
        status: z.enum(["available", "maintenance"]).optional(),
        quantity: z.coerce.number().int().min(1, "La cantidad mínima es 1").max(10000).optional(),
      })
      .parse(req.body ?? {});

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, req.params.assetCode)).limit(1);
    if (!item) throw new HttpError(404, "Activo no encontrado");
    if (item.status === "retired") throw new HttpError(409, "El activo está dado de baja. Reactívalo antes de editarlo.");
    const lent = await loanedQuantity(db, item.id);
    if (payload.status && lent > 0) {
      throw new HttpError(409, "El activo tiene unidades prestadas. Registra la devolución antes de cambiar su estado.");
    }
    if (payload.quantity !== undefined && payload.quantity < lent) {
      throw new HttpError(409, `Hay ${lent} unidad(es) prestada(s); la cantidad no puede ser menor.`);
    }

    const [updated] = await db
      .update(inventoryItems)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(inventoryItems.id, item.id))
      .returning();
    auditLog(req, "update_item", { assetCode: item.assetCode, fields: Object.keys(payload) });
    res.json(updated);
  });

  // Eliminar un activo definitivamente (solo obispo y consejeros).
  // Se borra también su historial, sus préstamos cerrados y se libera su etiqueta NFC.
  app.delete("/api/inventory/:assetCode", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    const result = await db.transaction(async (tx) => {
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.assetCode, req.params.assetCode)).limit(1);
      if (!item) throw new HttpError(404, "Activo no encontrado");
      const [activeLoan] = await tx
        .select({ id: inventoryLoans.id })
        .from(inventoryLoans)
        .where(and(eq(inventoryLoans.itemId, item.id), inArray(inventoryLoans.status, ["active", "overdue"])))
        .limit(1);
      if (activeLoan) throw new HttpError(409, "No se puede eliminar: el activo está prestado. Registra antes la devolución.");

      await tx.delete(inventoryAuditItems).where(eq(inventoryAuditItems.itemId, item.id));
      await tx.delete(inventoryLoans).where(eq(inventoryLoans.itemId, item.id));
      await tx.delete(inventoryMovements).where(eq(inventoryMovements.itemId, item.id));
      await tx.delete(inventoryNfcLinks).where(and(eq(inventoryNfcLinks.targetType, "item"), eq(inventoryNfcLinks.targetId, item.id)));
      await tx.delete(inventoryItems).where(eq(inventoryItems.id, item.id));
      return { assetCode: item.assetCode, name: item.name };
    });
    auditLog(req, "delete_item", result);
    res.json({ ok: true, ...result });
  });

  // /a/:codigo es la URL del QR impreso. Si la abre el navegador, se sirve la app.
  app.get("/a/:assetCode", skipIfBrowserNavigation, requireAuth, requireRead, async (req: Request, res: Response) => {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, req.params.assetCode)).limit(1);
    if (!item) return res.status(404).json({ error: "Item no encontrado" });
    res.json(item);
  });

  app.get("/api/inventory/categories", requireAuth, requireRead, async (_req: Request, res: Response) => {
    res.json(await db.select().from(inventoryCategories).orderBy(asc(inventoryCategories.name)));
  });

  app.post("/api/inventory/categories", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    const payload = insertInventoryCategorySchema.parse(req.body);
    const [created] = await db.insert(inventoryCategories).values(payload).returning();
    await db.insert(inventoryCategoryCounters).values({ categoryId: created.id, nextSeq: 1 }).onConflictDoNothing();
    res.status(201).json(created);
  });

  app.get("/api/inventory/locations", requireAuth, requireRead, async (_req: Request, res: Response) => {
    const rows = await db
      .select({
        ...getTableColumns(inventoryLocations),
        hasNfc: sql<boolean>`EXISTS (SELECT 1 FROM inventory_nfc_links l WHERE l.target_type = 'location' AND l.target_id = ${inventoryLocations.id})`,
      })
      .from(inventoryLocations)
      .orderBy(asc(inventoryLocations.name));
    res.json(rows);
  });

  const locationCreateSchema = z.object({
    name: z.string().trim().min(1, "Escribe un nombre para el armario"),
    parentId: z.string().optional().nullable(),
    description: z.string().optional(),
    code: z.string().optional(),
  });

  async function createLocationInTx(tx: any, body: unknown, nfcUid?: string) {
    const payload = locationCreateSchema.parse(body);
    const code = payload.code || (await allocateLocationCode(tx, payload.name));
    const [created] = await tx
      .insert(inventoryLocations)
      .values({ ...payload, parentId: payload.parentId || null, code })
      .returning();

    if (nfcUid) {
      const uid = normalizeNfcUid(nfcUid);
      if (uid.length < 4) throw new HttpError(400, "El UID de la etiqueta NFC no es válido");
      const [existing] = await tx.select().from(inventoryNfcLinks).where(eq(inventoryNfcLinks.uid, uid)).limit(1);
      if (existing) throw new HttpError(409, "Esta etiqueta NFC ya está asignada a otro activo o armario");
      await tx.insert(inventoryNfcLinks).values({ uid, targetType: "location", targetId: created.id });
    }
    return created;
  }

  app.post("/api/inventory/locations", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const created = await db.transaction((tx) => createLocationInTx(tx, req.body));
    auditLog(req, "create_location", { code: created.code });
    res.status(201).json(created);
  });

  app.post("/api/inventory/locations/with-nfc", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const { nfc_uid, ...locationData } = (req.body ?? {}) as Record<string, unknown>;
    if (!nfc_uid) throw new HttpError(400, "Falta el UID de la etiqueta NFC");
    const created = await db.transaction((tx) => createLocationInTx(tx, locationData, String(nfc_uid)));
    auditLog(req, "create_location_with_nfc", { code: created.code });
    res.status(201).json(created);
  });

  // Eliminar un armario/ubicación (solo obispo y consejeros).
  // - Los activos que tenga dentro se mueven al armario que se elija (o quedan "sin armario").
  // - Sus sub-ubicaciones (estantes) pasan a depender del armario superior.
  // - Su etiqueta NFC queda libre para reutilizarla.
  // - El historial de movimientos se conserva, anotando el nombre del armario eliminado.
  app.delete("/api/inventory/locations/:locationCode", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) throw new HttpError(401, "Tu sesión ha caducado");
    const { moveItemsTo } = z
      .object({ moveItemsTo: z.string().optional().nullable() })
      .parse(req.body ?? {});

    const result = await db.transaction(async (tx) => {
      const [location] = await tx.select().from(inventoryLocations).where(eq(inventoryLocations.code, req.params.locationCode)).limit(1);
      if (!location) throw new HttpError(404, "Ese armario no existe o ya se eliminó");

      let targetId: string | null = null;
      if (moveItemsTo && moveItemsTo !== "none") {
        if (moveItemsTo === location.id) throw new HttpError(400, "No puedes mover los activos al mismo armario que vas a eliminar");
        const [target] = await tx.select().from(inventoryLocations).where(eq(inventoryLocations.id, moveItemsTo)).limit(1);
        if (!target) throw new HttpError(400, "El armario de destino no existe");
        if (target.parentId === location.id) {
          throw new HttpError(400, "El destino es un estante de este mismo armario; elige otro armario");
        }
        targetId = target.id;
      }

      const label = `${location.name} (${location.code})`;

      // 1. Sacar los activos que tenga dentro.
      const items = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.locationId, location.id));
      if (items.length) {
        await tx.update(inventoryItems).set({ locationId: targetId, updatedAt: new Date() }).where(eq(inventoryItems.locationId, location.id));
      }

      // 2. Conservar el historial: quitar la referencia al armario pero dejarlo escrito en la nota.
      await tx.execute(sql`
        UPDATE inventory_movements
        SET note = TRIM(BOTH ' ' FROM COALESCE(note, '') || ' [Armario eliminado: ' || ${label} || ']'),
            from_location = CASE WHEN from_location = ${location.id} THEN NULL ELSE from_location END,
            to_location = CASE WHEN to_location = ${location.id} THEN NULL ELSE to_location END
        WHERE from_location = ${location.id} OR to_location = ${location.id}
      `);

      // 3. Registrar el traslado de cada activo en el historial.
      if (items.length) {
        await tx.insert(inventoryMovements).values(
          items.map((item) => ({
            itemId: item.id,
            fromLocation: null,
            toLocation: targetId,
            userId,
            note: `Traslado automático al eliminar ${label}`,
          })),
        );
      }

      // 4. Los estantes de dentro suben un nivel.
      await tx.update(inventoryLocations).set({ parentId: location.parentId ?? null }).where(eq(inventoryLocations.parentId, location.id));

      // 5. Liberar la etiqueta NFC y borrar el armario.
      await tx.delete(inventoryNfcLinks).where(and(eq(inventoryNfcLinks.targetType, "location"), eq(inventoryNfcLinks.targetId, location.id)));
      await tx.delete(inventoryLocations).where(eq(inventoryLocations.id, location.id));

      return { code: location.code, name: location.name, movedItems: items.length };
    });

    auditLog(req, "delete_location", result);
    res.json({ ok: true, ...result });
  });

  // Préstamos (en curso, vencidos o todos) con el activo, para la pantalla "Préstamos".
  app.get("/api/inventory/loans", requireAuth, requireRead, async (req: Request, res: Response) => {
    const scope = String(req.query.scope ?? "active");
    const where =
      scope === "all"
        ? undefined
        : scope === "overdue"
          ? sql`${inventoryLoans.status} IN ${ACTIVE_LOAN_SQL} AND ${inventoryLoans.expectedReturnDate} < CURRENT_DATE`
          : sql`${inventoryLoans.status} IN ${ACTIVE_LOAN_SQL}`;
    const rows = await db
      .select({
        id: inventoryLoans.id,
        itemId: inventoryLoans.itemId,
        assetCode: inventoryItems.assetCode,
        itemName: inventoryItems.name,
        photoUrl: inventoryItems.photoUrl,
        itemQuantity: inventoryItems.quantity,
        quantity: inventoryLoans.quantity,
        borrowerName: inventoryLoans.borrowerName,
        borrowerFirstName: inventoryLoans.borrowerFirstName,
        borrowerPhone: inventoryLoans.borrowerPhone,
        borrowerEmail: inventoryLoans.borrowerEmail,
        dateOut: inventoryLoans.dateOut,
        expectedReturnDate: inventoryLoans.expectedReturnDate,
        dateReturn: inventoryLoans.dateReturn,
        status: inventoryLoans.status,
        returnHasIncident: inventoryLoans.returnHasIncident,
        returnIncidentNotes: inventoryLoans.returnIncidentNotes,
        requestPdfUrl: inventoryLoans.requestPdfUrl,
        createdAt: inventoryLoans.createdAt,
      })
      .from(inventoryLoans)
      .innerJoin(inventoryItems, eq(inventoryLoans.itemId, inventoryItems.id))
      .where(where)
      .orderBy(scope === "all" ? desc(inventoryLoans.createdAt) : asc(inventoryLoans.expectedReturnDate))
      .limit(300);
    const today = todayIso();
    res.json(rows.map((r) => ({
      ...r,
      isOpen: r.status === "active" || r.status === "overdue",
      isOverdue: (r.status === "active" || r.status === "overdue") && Boolean(r.expectedReturnDate) && String(r.expectedReturnDate) < today,
    })));
  });

  // Buscador de personas para prestar: miembros del directorio y personas a las que ya se prestó.
  // Solo devuelve lo imprescindible (nombre, teléfono, correo) y como mucho 8 resultados.
  app.get("/api/inventory/borrowers", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json([]);
    const like = `%${q}%`;
    const fromMembers = await db
      .select({
        memberId: members.id,
        fullName: members.nameSurename,
        firstName: members.nombre,
        lastName: members.apellidos,
        phone: members.phone,
        email: members.email,
      })
      .from(members)
      .where(sql`(${members.nameSurename} ILIKE ${like} OR ${members.nombre} ILIKE ${like} OR ${members.apellidos} ILIKE ${like})`)
      .orderBy(asc(members.nameSurename))
      .limit(8);

    const pastResult: any = await db.execute(sql`
      SELECT DISTINCT ON (lower(borrower_name)) borrower_name AS "fullName", borrower_first_name AS "firstName",
             borrower_last_name AS "lastName", borrower_phone AS phone, borrower_email AS email
      FROM inventory_loans
      WHERE member_id IS NULL AND borrower_name ILIKE ${like}
      ORDER BY lower(borrower_name), created_at DESC
      LIMIT 5
    `);
    const past = ("rows" in pastResult ? pastResult.rows : pastResult) as any[];

    const splitName = (full: string) => {
      const parts = full.trim().split(/\s+/);
      return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
    };
    const results = [
      ...fromMembers.map((m) => {
        const split = splitName(m.fullName ?? "");
        return {
          source: "member" as const,
          memberId: m.memberId,
          fullName: m.fullName,
          firstName: m.firstName || split.first,
          lastName: m.lastName || split.last,
          phone: m.phone,
          email: m.email,
        };
      }),
      ...past
        .filter((p) => !fromMembers.some((m) => (m.fullName ?? "").toLowerCase() === String(p.fullName ?? "").toLowerCase()))
        .map((p) => ({ source: "previous" as const, memberId: null, ...p })),
    ];
    res.json(results.slice(0, 10));
  });

  // Revisión de armario: se marcan los activos encontrados y se devuelven los que faltan.
  app.post("/api/inventory/locations/:locationCode/check", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const { foundItemIds } = z.object({ foundItemIds: z.array(z.string()).max(2000) }).parse(req.body ?? {});
    const [location] = await db.select().from(inventoryLocations).where(eq(inventoryLocations.code, req.params.locationCode)).limit(1);
    if (!location) throw new HttpError(404, "Armario no encontrado");
    const expected = await db
      .select({ id: inventoryItems.id, assetCode: inventoryItems.assetCode, name: inventoryItems.name, status: inventoryItems.status })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.locationId, location.id), ne(inventoryItems.status, "retired")));
    const found = new Set(foundItemIds);
    const now = new Date();
    const foundIds = expected.filter((i) => found.has(i.id)).map((i) => i.id);
    await db.transaction(async (tx) => {
      if (foundIds.length) {
        await tx.update(inventoryItems).set({ lastVerifiedAt: now }).where(inArray(inventoryItems.id, foundIds));
      }
      await tx.update(inventoryLocations).set({ lastCheckedAt: now }).where(eq(inventoryLocations.id, location.id));
    });
    const missing = expected.filter((i) => !found.has(i.id) && i.status !== "loaned");
    auditLog(req, "check_location", { location: location.code, found: foundIds.length, missing: missing.length });
    res.json({ ok: true, found: foundIds.length, expected: expected.length, missing });
  });

  app.get("/api/inventory/history", requireAuth, requireRead, async (_req, res) => {
    const movements = await db
      .select({
        id: inventoryMovements.id,
        type: sql<string>`'movement'`,
        createdAt: inventoryMovements.createdAt,
        assetCode: inventoryItems.assetCode,
        itemName: inventoryItems.name,
        fromLocation: inventoryMovements.fromLocation,
        toLocation: inventoryMovements.toLocation,
        note: inventoryMovements.note,
        status: sql<string>`null`,
        borrowerName: sql<string>`null`,
        expectedReturnDate: sql<string>`null`,
        dateReturn: sql<string>`null`,
        requestPdfUrl: sql<string>`null`,
      })
      .from(inventoryMovements)
      .innerJoin(inventoryItems, eq(inventoryMovements.itemId, inventoryItems.id))
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(200);

    const loans = await db
      .select({
        id: inventoryLoans.id,
        type: sql<string>`'loan'`,
        createdAt: inventoryLoans.createdAt,
        assetCode: inventoryItems.assetCode,
        itemName: inventoryItems.name,
        fromLocation: sql<string>`null`,
        toLocation: sql<string>`null`,
        note: inventoryLoans.returnIncidentNotes,
        status: inventoryLoans.status,
        borrowerName: inventoryLoans.borrowerName,
        expectedReturnDate: inventoryLoans.expectedReturnDate,
        dateReturn: inventoryLoans.dateReturn,
        requestPdfUrl: inventoryLoans.requestPdfUrl,
      })
      .from(inventoryLoans)
      .innerJoin(inventoryItems, eq(inventoryLoans.itemId, inventoryItems.id))
      .orderBy(desc(inventoryLoans.createdAt))
      .limit(200);

    const allLocations = await db.select({ id: inventoryLocations.id, name: inventoryLocations.name }).from(inventoryLocations);
    const locName = new Map(allLocations.map((l) => [l.id, l.name]));
    const entries = [...movements, ...loans]
      .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime())
      .slice(0, 250)
      .map((e) => ({
        ...e,
        fromLocationName: e.fromLocation ? locName.get(String(e.fromLocation)) ?? null : null,
        toLocationName: e.toLocation ? locName.get(String(e.toLocation)) ?? null : null,
      }));

    res.json(entries);
  });

  app.get("/api/inventory/:assetCode", requireAuth, requireRead, async (req: Request, res: Response) => {
    // Incluye nombre de categoría y ubicación: la ficha mostraba siempre "Sin ubicación".
    const [item] = await db
      .select({
        ...getTableColumns(inventoryItems),
        categoryName: inventoryCategories.name,
        locationName: inventoryLocations.name,
        locationCode: inventoryLocations.code,
        hasNfc: sql<boolean>`EXISTS (SELECT 1 FROM inventory_nfc_links l WHERE l.target_type = 'item' AND l.target_id = ${inventoryItems.id})`,
      })
      .from(inventoryItems)
      .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
      .leftJoin(inventoryLocations, eq(inventoryItems.locationId, inventoryLocations.id))
      .where(eq(inventoryItems.assetCode, req.params.assetCode))
      .limit(1);
    if (!item) return res.status(404).json({ error: "Item no encontrado" });
    const rawMovements = await db.select().from(inventoryMovements).where(eq(inventoryMovements.itemId, item.id)).orderBy(desc(inventoryMovements.createdAt));
    const loans = await db
      .select({
        id: inventoryLoans.id,
        borrowerName: inventoryLoans.borrowerName,
        borrowerPhone: inventoryLoans.borrowerPhone,
        borrowerEmail: inventoryLoans.borrowerEmail,
        dateOut: inventoryLoans.dateOut,
        expectedReturnDate: inventoryLoans.expectedReturnDate,
        dateReturn: inventoryLoans.dateReturn,
        status: inventoryLoans.status,
        requestPdfUrl: inventoryLoans.requestPdfUrl,
        returnHasIncident: inventoryLoans.returnHasIncident,
        returnIncidentNotes: inventoryLoans.returnIncidentNotes,
        quantity: inventoryLoans.quantity,
        memberId: inventoryLoans.memberId,
        createdAt: inventoryLoans.createdAt,
      })
      .from(inventoryLoans)
      .where(eq(inventoryLoans.itemId, item.id))
      .orderBy(desc(inventoryLoans.createdAt));

    // Nombres de armario en el historial (antes solo se veían identificadores internos).
    const allLocations = await db.select({ id: inventoryLocations.id, name: inventoryLocations.name, code: inventoryLocations.code }).from(inventoryLocations);
    const locName = new Map(allLocations.map((l) => [l.id, `${l.name} · ${l.code}`]));
    const movements = rawMovements.map((m) => ({
      ...m,
      fromLocationName: m.fromLocation ? locName.get(m.fromLocation) ?? null : null,
      toLocationName: m.toLocation ? locName.get(m.toLocation) ?? null : null,
    }));

    const activeLoans = loans.filter((loan) => loan.status === "active" || loan.status === "overdue");
    const loanedQty = activeLoans.reduce((acc, loan) => acc + Number(loan.quantity ?? 1), 0);
    auditLog(req, "open_item", { assetCode: item.assetCode });
    res.json({
      item: {
        ...item,
        qrUrl: `${getPublicBaseUrl(req)}/a/${item.assetCode}`,
        loanedQuantity: loanedQty,
        availableQuantity: Math.max(0, Number(item.quantity ?? 1) - loanedQty),
      },
      movements,
      loans,
      activeLoans,
      activeLoan: activeLoans[0] ?? null,
    });
  });

  const locationDetailHandler = async (req: Request, res: Response) => {
    const [location] = await db.select().from(inventoryLocations).where(eq(inventoryLocations.code, req.params.locationCode)).limit(1);
    if (!location) return res.status(404).json({ error: "Ubicación no encontrada" });
    const children = await db.select().from(inventoryLocations).where(eq(inventoryLocations.parentId, location.id)).orderBy(asc(inventoryLocations.name));
    const items = await db.select().from(inventoryItems).where(eq(inventoryItems.locationId, location.id)).orderBy(asc(inventoryItems.name));
    const [nfcLink] = await db
      .select({ uid: inventoryNfcLinks.uid })
      .from(inventoryNfcLinks)
      .where(and(eq(inventoryNfcLinks.targetType, "location"), eq(inventoryNfcLinks.targetId, location.id)))
      .limit(1);
    res.json({ location: { ...location, hasNfc: Boolean(nfcLink) }, children, items, path: await buildLocationPath(location.id) });
  };

  app.get("/api/inventory/loc/:locationCode", requireAuth, requireRead, locationDetailHandler);
  // /loc/:codigo es la URL del QR del armario. Si la abre el navegador, se sirve la app.
  app.get("/loc/:locationCode", skipIfBrowserNavigation, requireAuth, requireRead, locationDetailHandler);

  app.post("/api/inventory/:assetCode/move", requireAuth, requireLeader, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const payload = z.object({ toLocation: z.string().min(1), note: z.string().max(300).optional() }).parse(req.body);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, req.params.assetCode)).limit(1);
    if (!item) return res.status(404).json({ error: "Item no encontrado" });
    await db.insert(inventoryMovements).values({ itemId: item.id, fromLocation: item.locationId, toLocation: payload.toLocation, userId, note: payload.note });
    await db.update(inventoryItems).set({ locationId: payload.toLocation, updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));
    auditLog(req, "move_item", { assetCode: item.assetCode, toLocation: payload.toLocation });
    res.json({ ok: true });
  });

  const moveByScanHandler = async (req: Request, res: any) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const payload = moveByScanSchema.parse(req.body);

    const item = await resolveItemByInputs(payload);
    const location = await resolveLocationByInputs(payload);
    if (!item || !location) return res.status(400).json({ error: "Debe resolverse exactamente 1 item y 1 location" });

    await db.insert(inventoryMovements).values({ itemId: item.id, fromLocation: item.locationId, toLocation: location.id, userId, note: payload.note ?? "Movimiento por doble escaneo" });
    await db.update(inventoryItems).set({ locationId: location.id, updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));

    const path = await buildLocationPath(location.id);
    auditLog(req, "move_by_scan", { item: item.assetCode, location: location.code });
    res.json({ ok: true, item_asset_code: item.assetCode, to_location_path: path });
  };

  app.post("/api/inventory/move-by-scan", requireAuth, requireLeader, moveByScanHandler);
  app.post("/inventory/move-by-scan", requireAuth, requireLeader, moveByScanHandler);

  // Préstamo. Admite cantidades (p. ej. 5 de 20 sillas) y enlazar con un miembro del directorio.
  app.post("/api/inventory/loan", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const payload = createInventoryLoanRequestSchema.parse(req.body);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, payload.itemId)).limit(1);
    if (!item) throw new HttpError(404, "Activo no encontrado");
    if (item.status === "retired") throw new HttpError(409, "Este activo está dado de baja.");
    if (item.status === "maintenance") throw new HttpError(409, "Este activo está en mantenimiento y no se puede prestar.");
    if (payload.expectedReturnDate < todayIso()) throw new HttpError(400, "La fecha de devolución no puede ser anterior a hoy.");

    const total = Number(item.quantity ?? 1);
    const qty = payload.quantity ?? 1;
    const alreadyLent = await loanedQuantity(db, item.id);
    const available = total - alreadyLent;
    if (available <= 0) throw new HttpError(409, "No quedan unidades disponibles: todo está prestado.");
    if (qty > available) throw new HttpError(409, `Solo quedan ${available} unidad(es) disponible(s).`);

    const borrowerFullName = `${payload.borrowerFirstName} ${payload.borrowerLastName}`.trim();
    const pdfBytes = await buildLoanRequestPdf({
      assetCode: item.assetCode,
      itemName: qty > 1 ? `${item.name} (${qty} unidades)` : item.name,
      borrowerFullName,
      borrowerPhone: payload.borrowerPhone,
      borrowerEmail: payload.borrowerEmail || undefined,
      expectedReturnDate: payload.expectedReturnDate,
      signatureDataUrl: payload.signatureDataUrl,
    });

    const storedFilename = `${randomUUID()}-${item.assetCode}-solicitud-prestamo.pdf`;
    await fs.promises.writeFile(path.join(LOAN_REQUEST_PDF_DIR, storedFilename), pdfBytes);

    const loan = await db.transaction(async (tx) => {
      const [created] = await tx.insert(inventoryLoans).values({
        itemId: item.id,
        borrowerName: borrowerFullName,
        borrowerFirstName: payload.borrowerFirstName,
        borrowerLastName: payload.borrowerLastName,
        borrowerContact: payload.borrowerPhone,
        borrowerPhone: payload.borrowerPhone,
        borrowerEmail: payload.borrowerEmail || null,
        memberId: payload.memberId || null,
        quantity: qty,
        dateOut: todayIso(),
        expectedReturnDate: payload.expectedReturnDate,
        signatureDataUrl: payload.signatureDataUrl,
        requestPdfFilename: `solicitud-prestamo-${item.assetCode}.pdf`,
        requestPdfUrl: `/uploads/inventory-loans/${storedFilename}`,
        status: "active",
      }).returning();
      // "Prestado" solo cuando no queda ninguna unidad en el armario.
      const fullyLent = alreadyLent + qty >= total;
      await tx.update(inventoryItems).set({ status: fullyLent ? "loaned" : "available", updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));
      return created;
    });

    auditLog(req, "loan_item", { itemId: item.id, quantity: qty });
    res.status(201).json(loan);
  });

  app.post("/api/inventory/return", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) throw new HttpError(401, "Tu sesión ha caducado");

    const payload = z.object({
      loanId: z.string().min(1),
      returnHasIncident: z.boolean().optional(),
      returnIncidentNotes: z.string().max(1000).optional(),
    }).parse(req.body);

    if (payload.returnHasIncident && (!payload.returnIncidentNotes || payload.returnIncidentNotes.trim().length < 3)) {
      throw new HttpError(400, "Describe la incidencia (mínimo 3 letras).");
    }

    const [loan] = await db.select().from(inventoryLoans).where(eq(inventoryLoans.id, payload.loanId)).limit(1);
    if (!loan) throw new HttpError(404, "Préstamo no encontrado");
    if (loan.status === "returned") throw new HttpError(409, "Este préstamo ya estaba devuelto.");

    await db.transaction(async (tx) => {
      await tx.update(inventoryLoans).set({
        status: "returned",
        dateReturn: todayIso(),
        returnedAt: new Date(),
        returnedBy: userId,
        returnHasIncident: Boolean(payload.returnHasIncident),
        returnIncidentNotes: payload.returnHasIncident ? payload.returnIncidentNotes?.trim() : null,
      }).where(eq(inventoryLoans.id, loan.id));

      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, loan.itemId)).limit(1);
      if (item && item.status !== "retired" && item.status !== "maintenance") {
        const stillLent = await loanedQuantity(tx, loan.itemId);
        await tx.update(inventoryItems)
          .set({ status: stillLent >= Number(item.quantity ?? 1) ? "loaned" : "available", updatedAt: new Date() })
          .where(eq(inventoryItems.id, loan.itemId));
      }
    });
    auditLog(req, "return_item", { loanId: loan.id, returnHasIncident: Boolean(payload.returnHasIncident) });
    res.json({ ok: true });
  });

  // Dar de baja (roto, perdido, donado...) conservando el historial. Se puede deshacer.
  app.post("/api/inventory/:assetCode/retire", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) throw new HttpError(401, "Tu sesión ha caducado");
    const { reason } = z.object({ reason: z.string().trim().min(3, "Indica el motivo de la baja (mínimo 3 letras)").max(500) }).parse(req.body ?? {});
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, req.params.assetCode)).limit(1);
    if (!item) throw new HttpError(404, "Activo no encontrado");
    if (item.status === "retired") throw new HttpError(409, "Ya estaba dado de baja.");
    if ((await loanedQuantity(db, item.id)) > 0) throw new HttpError(409, "Tiene unidades prestadas. Registra antes la devolución.");

    await db.transaction(async (tx) => {
      await tx.update(inventoryItems)
        .set({ status: "retired", retiredAt: new Date(), retiredReason: reason, updatedAt: new Date() })
        .where(eq(inventoryItems.id, item.id));
      await tx.insert(inventoryMovements).values({
        itemId: item.id,
        fromLocation: item.locationId,
        toLocation: item.locationId,
        userId,
        note: `Dado de baja: ${reason}`,
      });
    });
    auditLog(req, "retire_item", { assetCode: item.assetCode, reason });
    res.json({ ok: true });
  });

  app.post("/api/inventory/:assetCode/restore", requireAuth, requireLeader, async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) throw new HttpError(401, "Tu sesión ha caducado");
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, req.params.assetCode)).limit(1);
    if (!item) throw new HttpError(404, "Activo no encontrado");
    if (item.status !== "retired") throw new HttpError(409, "El activo no está dado de baja.");
    await db.transaction(async (tx) => {
      await tx.update(inventoryItems)
        .set({ status: "available", retiredAt: null, retiredReason: null, updatedAt: new Date() })
        .where(eq(inventoryItems.id, item.id));
      await tx.insert(inventoryMovements).values({
        itemId: item.id, fromLocation: item.locationId, toLocation: item.locationId, userId, note: "Reactivado (vuelve al inventario)",
      });
    });
    auditLog(req, "restore_item", { assetCode: item.assetCode });
    res.json({ ok: true });
  });

  app.post("/api/inventory/audits", requireAuth, requireLeader, async (req, res) => {
    const payload = insertInventoryAuditSchema.parse(req.body);
    const [audit] = await db.insert(inventoryAudits).values(payload).returning();
    const items = await db.select({ id: inventoryItems.id }).from(inventoryItems);
    if (items.length) {
      await db.insert(inventoryAuditItems).values(items.map((item) => ({ auditId: audit.id, itemId: item.id, verified: false })));
    }
    res.status(201).json(audit);
  });

  app.post("/api/inventory/audits/:auditId/verify", requireAuth, requireLeader, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const payload = z.object({ assetCode: z.string().min(1) }).parse(req.body);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, payload.assetCode)).limit(1);
    if (!item) return res.status(404).json({ error: "Item no encontrado" });
    await db.update(inventoryAuditItems).set({ verified: true, verifiedAt: new Date(), verifiedBy: userId }).where(and(eq(inventoryAuditItems.auditId, req.params.auditId), eq(inventoryAuditItems.itemId, item.id)));
    await db.update(inventoryItems).set({ lastVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));

    const locationCode = typeof req.query.locationCode === "string" ? req.query.locationCode : "";
    const locationFilter = locationCode
      ? sql`AND i.location_id = (SELECT id FROM inventory_locations WHERE code = ${locationCode} LIMIT 1)`
      : sql``;

    const result = await db.execute(sql`
      SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE ai.verified = true)::int as verified
      FROM inventory_audit_items ai
      JOIN inventory_items i ON i.id = ai.item_id
      WHERE ai.audit_id = ${req.params.auditId}
      ${locationFilter}
    `);
    const rows = "rows" in result ? result.rows : result;
    res.json(Array.isArray(rows) ? rows[0] : rows);
  });

  const byNfcHandler = async (req: Request, res: any) => {
    const [link] = await db.select().from(inventoryNfcLinks).where(eq(inventoryNfcLinks.uid, normalizeNfcUid(req.params.uid))).limit(1);
    if (!link) return res.json({ registered: false });

    if (link.targetType === "item") {
      const [item] = await db
        .select({
          id: inventoryItems.id,
          assetCode: inventoryItems.assetCode,
          name: inventoryItems.name,
          photoUrl: inventoryItems.photoUrl,
          categoryName: inventoryCategories.name,
          locationName: inventoryLocations.name,
          locationCode: inventoryLocations.code,
          status: inventoryItems.status,
        })
        .from(inventoryItems)
        .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
        .leftJoin(inventoryLocations, eq(inventoryItems.locationId, inventoryLocations.id))
        .where(eq(inventoryItems.id, link.targetId))
        .limit(1);

      const [activeLoan] = item?.assetCode
        ? await db.select({ id: inventoryLoans.id })
          .from(inventoryLoans)
          .where(and(eq(inventoryLoans.itemId, link.targetId), eq(inventoryLoans.status, "active")))
          .orderBy(desc(inventoryLoans.createdAt))
          .limit(1)
        : [];

      return res.json({
        type: "item",
        item_id: item?.id ?? null,
        asset_code: item?.assetCode ?? null,
        name: item?.name ?? null,
        photoUrl: item?.photoUrl ?? null,
        categoryName: item?.categoryName ?? null,
        locationName: item?.locationName ?? null,
        location_code: item?.locationCode ?? null,
        status: item?.status ?? null,
        activeLoanId: activeLoan?.id ?? null,
      });
    }

    const [location] = await db
      .select({ code: inventoryLocations.code, name: inventoryLocations.name })
      .from(inventoryLocations)
      .where(eq(inventoryLocations.id, link.targetId))
      .limit(1);
    return res.json({
      type: "location",
      location_code: location?.code ?? null,
      location_name: location?.name ?? null,
    });
  };

  app.get("/api/inventory/by-nfc/:uid", requireAuth, requireRead, byNfcHandler);
  app.get("/inventory/by-nfc/:uid", requireAuth, requireRead, byNfcHandler);

  const registerItemNfcHandler = async (req: Request, res: any) => {
    const payload = z.object({ asset_code: z.string().min(1), nfc_uid: z.string().min(4) }).parse(req.body);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, payload.asset_code)).limit(1);
    if (!item) return res.status(404).json({ error: "Item no encontrado" });
    const [created] = await db
      .insert(inventoryNfcLinks)
      .values({ uid: normalizeNfcUid(payload.nfc_uid), targetType: "item", targetId: item.id })
      .onConflictDoNothing()
      .returning();
    if (!created) return res.status(409).json({ error: "UID ya registrado" });
    auditLog(req, "register_nfc_item", { assetCode: payload.asset_code });
    res.status(201).json(created);
  };

  app.post("/api/inventory/nfc/register-item", requireAuth, requireLeader, registerItemNfcHandler);
  app.post("/inventory/nfc/register-item", requireAuth, requireLeader, registerItemNfcHandler);

  const registerLocationNfcHandler = async (req: Request, res: any) => {
    const payload = registerLocationNfcSchema.parse(req.body);
    const [location] = payload.location_id
      ? await db.select().from(inventoryLocations).where(eq(inventoryLocations.id, payload.location_id)).limit(1)
      : await db.select().from(inventoryLocations).where(eq(inventoryLocations.code, payload.location_code ?? "")).limit(1);
    if (!location) return res.status(404).json({ error: "Ubicación no encontrada" });

    const [created] = await db
      .insert(inventoryNfcLinks)
      .values({ uid: normalizeNfcUid(payload.nfc_uid), targetType: "location", targetId: location.id })
      .onConflictDoNothing()
      .returning();
    if (!created) return res.status(409).json({ error: "UID ya registrado" });
    auditLog(req, "register_nfc_location", { locationCode: location.code });
    res.status(201).json(created);
  };

  app.post("/api/inventory/nfc/register-location", requireAuth, requireLeader, registerLocationNfcHandler);
  app.post("/inventory/nfc/register-location", requireAuth, requireLeader, registerLocationNfcHandler);

  app.get("/inventory/qr/:assetCode", requireAuth, requireRead, async (req, res) => {
    try {
      const png = await qrPngForUrl(`${getPublicBaseUrl(req)}/a/${req.params.assetCode}`);
      res.setHeader("Content-Type", "image/png");
      res.send(png);
    } catch {
      res.status(500).json({ error: "No se pudo generar QR" });
    }
  });

  app.get("/inventory/label/:assetCode", requireAuth, requireRead, async (req, res) => {
    const pdf = await buildItemCircularLabelPdf(req.params.assetCode, getPublicBaseUrl(req));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=item-label-${req.params.assetCode}.pdf`);
    res.send(pdf);
  });

  app.get("/inventory/location-label/:locationCode", requireAuth, requireRead, async (req, res) => {
    const pdf = await buildLocationRectLabelPdf(req.params.locationCode, getPublicBaseUrl(req));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=location-label-${req.params.locationCode}.pdf`);
    res.send(pdf);
  });

  app.get("/inventory/labels/batch", requireAuth, requireRead, async (req, res) => {
    let assetCodes = String(req.query.assetCodes ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    const locationCode = String(req.query.locationCode ?? "").trim();
    if (!assetCodes.length && locationCode) {
      const [location] = await db.select().from(inventoryLocations).where(eq(inventoryLocations.code, locationCode)).limit(1);
      if (!location) throw new HttpError(404, "Armario no encontrado");
      const rows = await db
        .select({ assetCode: inventoryItems.assetCode })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.locationId, location.id), ne(inventoryItems.status, "retired")))
        .orderBy(asc(inventoryItems.assetCode));
      assetCodes = rows.map((r) => r.assetCode);
    }
    if (!assetCodes.length) throw new HttpError(400, "No hay activos para imprimir");

    const pdf = await PDFDocument.create();
    for (const code of assetCodes) {
      const label = await buildItemCircularLabelPdf(code, getPublicBaseUrl(req));
      const src = await PDFDocument.load(label);
      const [page] = await pdf.copyPages(src, [0]);
      pdf.addPage(page);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=etiquetas-${locationCode || "inventario"}.pdf`);
    res.send(Buffer.from(await pdf.save()));
  });
}
