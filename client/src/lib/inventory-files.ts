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
