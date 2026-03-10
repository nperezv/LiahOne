import type { Express, Request, RequestHandler } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { db } from "./db";
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
  insertInventoryAuditSchema,
  insertInventoryCategorySchema,
  insertInventoryItemSchema,
  pdfTemplates,
} from "@shared/schema";

const BASE_URL = process.env.APP_URL ?? "http://localhost:5173";
const QR_PROVIDER_URL = "https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=";
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
  borrowerFirstName: z.string().min(2),
  borrowerLastName: z.string().min(2),
  borrowerPhone: z.string().min(6),
  borrowerEmail: z.string().email(),
  expectedReturnDate: z.string().min(10),
  signatureDataUrl: z.string().min(20),
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

function auditLog(req: Request, action: string, payload?: Record<string, unknown>) {
  const userId = (req as any).user?.id;
  const ip = req.headers["x-forwarded-for"] ?? req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  console.log("[inventory-audit]", { action, userId, ip, userAgent, ...payload });
}

function buildQrUrl(path: string) {
  return `${QR_PROVIDER_URL}${encodeURIComponent(`${BASE_URL.replace(/\/$/, "")}${path}`)}`;
}

async function fetchQrPngForPath(path: string) {
  const response = await fetch(buildQrUrl(path));
  if (!response.ok) throw new Error("QR generation failed");
  return Buffer.from(await response.arrayBuffer());
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

async function allocateAssetCode(categoryId: string) {
  return db.transaction(async (tx) => {
    const [category] = await tx.select({ id: inventoryCategories.id }).from(inventoryCategories).where(eq(inventoryCategories.id, categoryId)).limit(1);
    if (!category) throw new Error("Categoría inválida");
    const wardCode = await getWardCode();
    const dynamicPrefix = `AC${wardCode}`;

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inventory_asset_code_${wardCode}`}))`);
    const seqResult = await tx.execute(sql`
      SELECT COALESCE(MAX(CAST(SUBSTRING(${inventoryItems.assetCode} FROM '-(\\d+)$') AS integer)), 0) + 1 AS seq
      FROM ${inventoryItems}
      WHERE ${inventoryItems.assetCode} LIKE ${`${dynamicPrefix}-%`}
    `);
    const seqRows = "rows" in seqResult ? (seqResult.rows as Array<{ seq: number }>) : [];
    const seq = seqRows[0]?.seq ?? 1;

    return `${dynamicPrefix}-${String(seq).padStart(3, "0")}`;
  });
}

async function allocateLocationCode(name: string) {
  return db.transaction(async (tx) => {
    const wardCode = await getWardCode();
    const type = getLocationTypeCode(name);
    const basePrefix = type === "ARM" ? `AM${wardCode}` : `${type}${wardCode}`;

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inventory_location_code_${basePrefix}`}))`);
    const seqResult = await tx.execute(sql`
      SELECT COALESCE(MAX(CAST(SUBSTRING(${inventoryLocations.code} FROM '-(\\d+)$') AS integer)), 0) + 1 AS seq
      FROM ${inventoryLocations}
      WHERE ${inventoryLocations.code} LIKE ${`${basePrefix}-%`}
    `);
    const seqRows = "rows" in seqResult ? (seqResult.rows as Array<{ seq: number }>) : [];
    const seq = seqRows[0]?.seq ?? 1;

    return `${basePrefix}-${String(seq).padStart(3, "0")}`;
  });
}

async function buildItemCircularLabelPdf(assetCode: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const size = CIRCLE_MM * MM_TO_PT;
  const qr = QR_MM * MM_TO_PT;
  const center = size / 2;
  const page = pdf.addPage([size, size]);
  page.drawCircle({ x: center, y: center, size: center - 2, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  page.drawText(assetCode, { x: 3, y: size - 11, size: 6, maxWidth: size - 6, font });
  try {
    const png = await fetchQrPngForPath(`/a/${assetCode}`);
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: center - qr / 2, y: 4, width: qr, height: qr });
  } catch {
    page.drawText("QR", { x: center - 4, y: center - 4, size: 8, font });
  }
  return Buffer.from(await pdf.save());
}

async function buildLocationRectLabelPdf(locationCode: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = 50 * MM_TO_PT;
  const h = 30 * MM_TO_PT;
  const page = pdf.addPage([w, h]);
  page.drawText(locationCode, { x: 6, y: h - 14, size: 9, font });
  try {
    const png = await fetchQrPngForPath(`/loc/${locationCode}`);
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
  borrowerEmail: string;
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
  page.drawText(`Correo: ${input.borrowerEmail}`, { x: 50, y: 675, size: 12, font });
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
    const [link] = await db.select().from(inventoryNfcLinks).where(eq(inventoryNfcLinks.uid, input.item_nfc_uid.toUpperCase())).limit(1);
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
    const [link] = await db.select().from(inventoryNfcLinks).where(eq(inventoryNfcLinks.uid, input.location_nfc_uid.toUpperCase())).limit(1);
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

export function registerInventoryRoutes(app: Express, requireAuth: RequestHandler, getUserIdFromRequest: (req: Request) => string | null) {
  app.get("/api/inventory", requireAuth, requireRead, async (req, res) => {
    const search = String(req.query.search ?? "").trim();
    const where = search
      ? sql`(${inventoryItems.assetCode} ILIKE ${`%${search}%`} OR ${inventoryItems.name} ILIKE ${`%${search}%`})`
      : undefined;

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
      })
      .from(inventoryItems)
      .leftJoin(inventoryCategories, eq(inventoryItems.categoryId, inventoryCategories.id))
      .leftJoin(inventoryLocations, eq(inventoryItems.locationId, inventoryLocations.id))
      .where(where)
      .orderBy(desc(inventoryItems.createdAt));

    auditLog(req, "list_inventory", { count: items.length });
    res.json(items);
  });

  app.post("/api/inventory", requireAuth, requireAdmin, async (req, res) => {
    const parsed = insertInventoryItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos de activo inválidos" });
    }

    const payload = parsed.data;
    const assetCode = await allocateAssetCode(payload.categoryId);
    const qrUrl = `${BASE_URL.replace(/\/$/, "")}/a/${assetCode}`;
    const [created] = await db.insert(inventoryItems).values({ ...payload, assetCode, qrUrl }).returning();
    auditLog(req, "create_item", { assetCode });
    res.status(201).json(created);
  });

  app.get("/a/:assetCode", requireAuth, requireRead, async (req, res) => {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, req.params.assetCode)).limit(1);
    if (!item) return res.status(404).json({ error: "Item no encontrado" });
    res.json(item);
  });

  app.get("/api/inventory/categories", requireAuth, requireRead, async (_req, res) => {
    res.json(await db.select().from(inventoryCategories).orderBy(asc(inventoryCategories.name)));
  });

  app.post("/api/inventory/categories", requireAuth, requireAdmin, async (req, res) => {
    const payload = insertInventoryCategorySchema.parse(req.body);
    const [created] = await db.insert(inventoryCategories).values(payload).returning();
    await db.insert(inventoryCategoryCounters).values({ categoryId: created.id, nextSeq: 1 }).onConflictDoNothing();
    res.status(201).json(created);
  });

  app.get("/api/inventory/locations", requireAuth, requireRead, async (_req, res) => {
    const rows = await db.select().from(inventoryLocations).orderBy(asc(inventoryLocations.name));
    res.json(rows);
  });

  app.post("/api/inventory/locations", requireAuth, requireAdmin, async (req, res) => {
    const parsed = z.object({
      name: z.string().min(1),
      parentId: z.string().optional(),
      description: z.string().optional(),
      code: z.string().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Datos de ubicación inválidos" });
    }

    const payload = parsed.data;
    const code = payload.code || (await allocateLocationCode(payload.name));
    const [created] = await db.insert(inventoryLocations).values({ ...payload, code }).returning();
    res.status(201).json(created);
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

    const entries = [...movements, ...loans]
      .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime())
      .slice(0, 250);

    res.json(entries);
  });

  app.get("/api/inventory/:assetCode", requireAuth, requireRead, async (req, res) => {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, req.params.assetCode)).limit(1);
    if (!item) return res.status(404).json({ error: "Item no encontrado" });
    const movements = await db.select().from(inventoryMovements).where(eq(inventoryMovements.itemId, item.id)).orderBy(desc(inventoryMovements.createdAt));
    const loans = await db.select().from(inventoryLoans).where(eq(inventoryLoans.itemId, item.id)).orderBy(desc(inventoryLoans.createdAt));
    auditLog(req, "open_item", { assetCode: item.assetCode });
    res.json({ item, movements, loans });
  });

  app.get("/loc/:locationCode", requireAuth, requireRead, async (req, res) => {
    const [location] = await db.select().from(inventoryLocations).where(eq(inventoryLocations.code, req.params.locationCode)).limit(1);
    if (!location) return res.status(404).json({ error: "Ubicación no encontrada" });
    const children = await db.select().from(inventoryLocations).where(eq(inventoryLocations.parentId, location.id)).orderBy(asc(inventoryLocations.name));
    const items = await db.select().from(inventoryItems).where(eq(inventoryItems.locationId, location.id)).orderBy(asc(inventoryItems.name));
    res.json({ location, children, items, path: await buildLocationPath(location.id) });
  });

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

  app.post("/api/inventory/loan", requireAuth, requireLeader, async (req, res) => {
    const payload = createInventoryLoanRequestSchema.parse(req.body);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, payload.itemId)).limit(1);
    if (!item) return res.status(404).json({ error: "Item no encontrado" });

    const borrowerFullName = `${payload.borrowerFirstName} ${payload.borrowerLastName}`.trim();
    const outDate = new Date().toISOString().slice(0, 10);
    const pdfBytes = await buildLoanRequestPdf({
      assetCode: item.assetCode,
      itemName: item.name,
      borrowerFullName,
      borrowerPhone: payload.borrowerPhone,
      borrowerEmail: payload.borrowerEmail,
      expectedReturnDate: payload.expectedReturnDate,
      signatureDataUrl: payload.signatureDataUrl,
    });

    const storedFilename = `${randomUUID()}-${item.assetCode}-solicitud-prestamo.pdf`;
    const absolutePath = path.join(LOAN_REQUEST_PDF_DIR, storedFilename);
    await fs.promises.writeFile(absolutePath, pdfBytes);

    const [loan] = await db.insert(inventoryLoans).values({
      itemId: payload.itemId,
      borrowerName: borrowerFullName,
      borrowerFirstName: payload.borrowerFirstName,
      borrowerLastName: payload.borrowerLastName,
      borrowerContact: payload.borrowerPhone,
      borrowerPhone: payload.borrowerPhone,
      borrowerEmail: payload.borrowerEmail,
      dateOut: outDate,
      expectedReturnDate: payload.expectedReturnDate,
      signatureDataUrl: payload.signatureDataUrl,
      requestPdfFilename: `solicitud-prestamo-${item.assetCode}.pdf`,
      requestPdfUrl: `/uploads/inventory-loans/${storedFilename}`,
      status: "active",
    }).returning();

    await db.update(inventoryItems).set({ status: "loaned", updatedAt: new Date() }).where(eq(inventoryItems.id, payload.itemId));
    auditLog(req, "loan_item", { itemId: payload.itemId });
    res.status(201).json(loan);
  });

  app.post("/api/inventory/return", requireAuth, requireLeader, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const payload = z.object({
      loanId: z.string().min(1),
      returnHasIncident: z.boolean().optional(),
      returnIncidentNotes: z.string().max(1000).optional(),
    }).parse(req.body);

    if (payload.returnHasIncident && (!payload.returnIncidentNotes || payload.returnIncidentNotes.trim().length < 3)) {
      return res.status(400).json({ error: "Debe registrar una nota de incidencia." });
    }

    const [loan] = await db.select().from(inventoryLoans).where(eq(inventoryLoans.id, payload.loanId)).limit(1);
    if (!loan) return res.status(404).json({ error: "Préstamo no encontrado" });
    await db.update(inventoryLoans).set({
      status: "returned",
      dateReturn: new Date().toISOString().slice(0, 10),
      returnedAt: new Date(),
      returnedBy: userId,
      returnHasIncident: Boolean(payload.returnHasIncident),
      returnIncidentNotes: payload.returnHasIncident ? payload.returnIncidentNotes?.trim() : null,
    }).where(eq(inventoryLoans.id, loan.id));
    await db.update(inventoryItems).set({ status: "available", updatedAt: new Date() }).where(eq(inventoryItems.id, loan.itemId));
    auditLog(req, "return_item", { loanId: loan.id, returnHasIncident: Boolean(payload.returnHasIncident) });
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
    const [link] = await db.select().from(inventoryNfcLinks).where(eq(inventoryNfcLinks.uid, req.params.uid.toUpperCase())).limit(1);
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

    const [location] = await db.select({ code: inventoryLocations.code }).from(inventoryLocations).where(eq(inventoryLocations.id, link.targetId)).limit(1);
    return res.json({ type: "location", location_code: location?.code ?? null });
  };

  app.get("/api/inventory/by-nfc/:uid", requireAuth, requireRead, byNfcHandler);
  app.get("/inventory/by-nfc/:uid", requireAuth, requireRead, byNfcHandler);

  const registerItemNfcHandler = async (req: Request, res: any) => {
    const payload = z.object({ asset_code: z.string().min(1), nfc_uid: z.string().min(4) }).parse(req.body);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.assetCode, payload.asset_code)).limit(1);
    if (!item) return res.status(404).json({ error: "Item no encontrado" });
    const [created] = await db
      .insert(inventoryNfcLinks)
      .values({ uid: payload.nfc_uid.toUpperCase(), targetType: "item", targetId: item.id })
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
      .values({ uid: payload.nfc_uid.toUpperCase(), targetType: "location", targetId: location.id })
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
      const png = await fetchQrPngForPath(`/a/${req.params.assetCode}`);
      res.setHeader("Content-Type", "image/png");
      res.send(png);
    } catch {
      res.status(500).json({ error: "No se pudo generar QR" });
    }
  });

  app.get("/inventory/label/:assetCode", requireAuth, requireRead, async (req, res) => {
    const pdf = await buildItemCircularLabelPdf(req.params.assetCode);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=item-label-${req.params.assetCode}.pdf`);
    res.send(pdf);
  });

  app.get("/inventory/location-label/:locationCode", requireAuth, requireRead, async (req, res) => {
    const pdf = await buildLocationRectLabelPdf(req.params.locationCode);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=location-label-${req.params.locationCode}.pdf`);
    res.send(pdf);
  });

  app.get("/inventory/labels/batch", requireAuth, requireRead, async (req, res) => {
    const assetCodes = String(req.query.assetCodes ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    if (!assetCodes.length) return res.status(400).json({ error: "assetCodes es requerido" });

    const pdf = await PDFDocument.create();
    for (const code of assetCodes) {
      const label = await buildItemCircularLabelPdf(code);
      const src = await PDFDocument.load(label);
      const [page] = await pdf.copyPages(src, [0]);
      pdf.addPage(page);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=inventory-labels.pdf");
    res.send(Buffer.from(await pdf.save()));
  });
}
