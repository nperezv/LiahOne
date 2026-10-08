import QRCode from "qrcode";
import { fetchWithAuthRetry } from "@/lib/auth-tokens";

/**
 * Descarga/abre un PDF de etiqueta usando la sesión del usuario.
 *
 * Antes las etiquetas se abrían con un enlace normal en otra pestaña; esa pestaña no lleva
 * el token de sesión de la app y el servidor respondía {"error":"Unauthorized"}.
 */
export async function openInventoryPdf(path: string, filename: string) {
  // En iOS/Android abrir una pestaña después de un "await" suele estar bloqueado:
  // se reserva la ventana antes de descargar y luego se le pone el contenido.
  const isMobile = typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const reserved = !isMobile ? window.open("", "_blank") : null;

  const res = await fetchWithAuthRetry(path);
  if (!res.ok) {
    reserved?.close();
    let message = `No se pudo generar la etiqueta (código ${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = `${body.error} (código ${res.status})`;
    } catch {
      // respuesta no JSON
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  if (reserved) {
    reserved.location.href = url;
  } else {
    // En el móvil se descarga el PDF; desde ahí se abre con la app de la impresora.
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function itemLabelPdf(assetCode: string) {
  return openInventoryPdf(`/inventory/label/${encodeURIComponent(assetCode)}`, `etiqueta-${assetCode}.pdf`);
}

export function locationLabelPdf(locationCode: string) {
  return openInventoryPdf(`/inventory/location-label/${encodeURIComponent(locationCode)}`, `etiqueta-${locationCode}.pdf`);
}

/** URL que lleva el QR de un activo: siempre el dominio desde el que se usa la app, nunca localhost. */
export function assetPublicUrl(assetCode: string) {
  return `${window.location.origin}/a/${encodeURIComponent(assetCode)}`;
}

export function locationPublicUrl(locationCode: string) {
  return `${window.location.origin}/loc/${encodeURIComponent(locationCode)}`;
}

/** Imagen del QR generada en el propio móvil/navegador (no necesita servidor ni internet). */
export function qrDataUrl(text: string) {
  return QRCode.toDataURL(text, { width: 480, margin: 1, errorCorrectionLevel: "M" });
}

/** Sube una foto (comprimida) con la sesión del usuario y devuelve su URL. */
export async function uploadInventoryPhoto(file: File): Promise<string> {
  const { compressImageIfNeeded } = await import("@/lib/compress-image");
  const ready = await compressImageIfNeeded(file);
  const formData = new FormData();
  formData.append("file", ready);
  const res = await fetchWithAuthRetry("/api/uploads", { method: "POST", body: formData });
  if (!res.ok) {
    let message = `No se pudo subir la foto (código ${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = `${body.error} (código ${res.status})`;
    } catch {
      // respuesta no JSON
    }
    throw new Error(message);
  }
  const uploaded = await res.json();
  if (!uploaded?.url) throw new Error("El servidor no devolvió la dirección de la foto");
  return uploaded.url as string;
}

/** PDF con las etiquetas de todos los activos de un armario. */
export function locationItemsLabelsPdf(locationCode: string) {
  return openInventoryPdf(`/inventory/labels/batch?locationCode=${encodeURIComponent(locationCode)}`, `etiquetas-${locationCode}.pdf`);
}

/** Enlace de WhatsApp con un mensaje ya escrito. Si el número no lleva prefijo, se asume España (+34). */
export function whatsappLink(phone: string | null | undefined, text: string) {
  let digits = String(phone ?? "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 9) digits = `34${digits}`;
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

export function formatShortDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function loanReminderText(name: string | null | undefined, itemName: string, expected?: string | null) {
  const first = String(name ?? "").split(" ")[0] || "";
  return `Hola${first ? ` ${first}` : ""}, te escribimos del barrio para recordarte la devolución de «${itemName}»${expected ? `, prevista para el ${formatShortDate(expected)}` : ""}. ¡Gracias!`;
}

// ── Etiqueta con el diseño del barrio (misma plantilla que el PDF del servidor) ──
const LABEL_TEMPLATE_URL = "/inventory/label-template.jpg";
const LABEL_BOX = { x: 0.6259, y: 0.1788, w: 0.3282, h: 0.6348 };

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}

function fitCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  let t = text;
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Dibuja la etiqueta (plantilla + QR + código + nombre) y devuelve una imagen PNG (data URL). */
export async function renderInventoryLabelPng(opts: { code: string; title?: string | null; url: string }) {
  const [template, qr] = await Promise.all([
    loadImage(LABEL_TEMPLATE_URL),
    qrDataUrl(opts.url).then(loadImage),
  ]);
  const W = template.naturalWidth;
  const H = template.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(template, 0, 0, W, H);

  const ptToPx = W / (76 * 2.8346456693); // misma escala que la etiqueta de 76 mm
  const bx = LABEL_BOX.x * W;
  const by = LABEL_BOX.y * H;
  const bw = LABEL_BOX.w * W;
  const bh = LABEL_BOX.h * H;
  const pad = bw * 0.07;
  const codePx = 6.2 * ptToPx;
  const titlePx = 4.6 * ptToPx;
  const textBlock = codePx + (opts.title ? titlePx + 2 * ptToPx : 0) + 2 * ptToPx;
  const q = Math.min(bw - pad * 2, bh - pad * 2 - textBlock);
  const qx = bx + (bw - q) / 2;
  const qy = by + pad;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, qx, qy, q, q);
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = "#2b3d4f";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `700 ${codePx}px Helvetica, Arial, sans-serif`;
  const codeY = qy + q + 2 * ptToPx;
  ctx.fillText(fitCanvasText(ctx, opts.code, bw - pad), bx + bw / 2, codeY);
  if (opts.title) {
    ctx.font = `400 ${titlePx}px Helvetica, Arial, sans-serif`;
    ctx.fillText(fitCanvasText(ctx, opts.title, bw - pad), bx + bw / 2, codeY + codePx + 2 * ptToPx);
  }
  return canvas.toDataURL("image/png");
}
