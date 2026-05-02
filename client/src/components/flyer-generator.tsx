import { useState, useRef, useEffect } from "react";
import "@fontsource/raleway/400.css";
import "@fontsource/raleway/500.css";
import "@fontsource/raleway/600.css";
import "@fontsource/raleway/700.css";
import "@fontsource/raleway/900.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/700-italic.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getAccessToken } from "@/lib/auth-tokens";
import { Image, RefreshCw, Sparkles, Upload, BookImage, FileImage, Download, Share2 } from "lucide-react";

const FLYER_W = 1080;
const FLYER_H = 1350;
const PREVIEW_W = 400;
const PREVIEW_H = Math.round(PREVIEW_W * FLYER_H / FLYER_W); // 500
const SCALE = PREVIEW_W / FLYER_W;
const FALLBACK_COLOR = "#1d4080";

const TIPO_LABELS: Record<string, string> = {
  servicio_bautismal: "Servicio Bautismal",
  deportiva: "Deportiva",
  capacitacion: "Capacitación",
  fiesta: "Actividad",
  hermanamiento: "Hermanamiento",
  actividad_org: "Actividad",
  otro: "Actividad",
};

interface FlyCopy {
  titulo: string;
  hook: string;
  descripcion: string;
  cta: string;
  fondo: string;
  lugar?: string;
  direccion?: string;
  barrio?: string;
  candidateName?: string;
  fecha?: string;
  hora?: string;
}

// Returns #rrggbb so hex-alpha suffixes in the gradient stay valid CSS
function pixelsToColor(data: Uint8ClampedArray): string {
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
  }
  if (count === 0) return FALLBACK_COLOR;
  const hex = (v: number) => Math.floor((v / count) * 0.55).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function extractColorFromFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(FALLBACK_COLOR);
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new window.Image();
      img.onerror = () => resolve(FALLBACK_COLOR);
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 100; canvas.height = 100;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(FALLBACK_COLOR); return; }
          ctx.drawImage(img, 0, 0, 100, 100);
          resolve(pixelsToColor(ctx.getImageData(0, 50, 100, 50).data));
        } catch { resolve(FALLBACK_COLOR); }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function extractColorFromUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onerror = () => resolve(FALLBACK_COLOR);
    img.onload = () => {
      try {
        const W = Math.min(img.naturalWidth, 100);
        const H = Math.min(img.naturalHeight, 100);
        if (!W || !H) { resolve(FALLBACK_COLOR); return; }
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(FALLBACK_COLOR); return; }
        ctx.drawImage(img, 0, 0, W, H);
        resolve(pixelsToColor(ctx.getImageData(0, Math.floor(H / 2), W, Math.ceil(H / 2)).data));
      } catch { resolve(FALLBACK_COLOR); }
    };
    img.src = url;
  });
}

function getPhotoUrl(fondo: string, customUrl?: string | null): string | null {
  if (customUrl) return customUrl;
  if (fondo?.startsWith("photos/")) return `/flyer-assets/${fondo}`;
  return null;
}

// ── Canvas-based renderer ─────────────────────────────────────────────────────
// Draws the flyer entirely in memory — no DOM, no flicker, always 1080×1350.

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar: ${src}`));
    img.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
  vAlign: "top" | "center" = "top",
) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = img.naturalWidth * scale;
  const sh = img.naturalHeight * scale;
  const dx = x + (w - sw) / 2;
  const dy = vAlign === "top" ? y : y + (h - sh) / 2;
  ctx.drawImage(img, dx, dy, sw, sh);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildFlyerCanvas(
  copy: FlyCopy,
  activityType: string,
  dominantColor: string,
  photoUrl: string | null,
): Promise<HTMLCanvasElement> {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = FLYER_W;
  canvas.height = FLYER_H;
  const ctx = canvas.getContext("2d")!;
  const gold = "#D4AF37";
  const tipoLabel = TIPO_LABELS[activityType] ?? "Actividad";
  const { r, g, b } = hexToRgb(dominantColor);

  // Layer 1 — background color
  ctx.fillStyle = dominantColor;
  ctx.fillRect(0, 0, FLYER_W, FLYER_H);

  // Layer 2 — photo
  if (photoUrl) {
    try {
      const img = await loadImg(photoUrl);
      drawCover(ctx, img, 0, 0, FLYER_W, FLYER_H, "top");
    } catch { /* keep bg color */ }
  }

  // Layer 3 — gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, FLYER_H);
  grad.addColorStop(0.00, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.30, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.40, `rgba(${r},${g},${b},${0x20 / 255})`);
  grad.addColorStop(0.52, `rgba(${r},${g},${b},${0x55 / 255})`);
  grad.addColorStop(0.60, `rgba(${r},${g},${b},${0xcc / 255})`);
  grad.addColorStop(0.63, `rgba(${r},${g},${b},1)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, FLYER_W, FLYER_H);

  // Layer 4 — decorative SVG overlay
  try {
    const svgImg = await loadImg("/flyer-assets/asset_flyer_m8.svg");
    ctx.drawImage(svgImg, 0, 0, FLYER_W, FLYER_H);
  } catch { /* no overlay */ }

  // Layer 5 — text
  ctx.save();
  const pad = 72;
  const maxW = FLYER_W - pad * 2; // 936px

  // Tipo label — top left
  ctx.fillStyle = gold;
  ctx.fillRect(pad, 72, 3, 46);
  ctx.font = "700 22px Raleway";
  ctx.fillStyle = gold;
  (ctx as any).letterSpacing = "6.6px"; // 0.30em × 22px
  ctx.textBaseline = "middle";
  ctx.fillText(tipoLabel.toUpperCase(), pad + 21, 72 + 23);
  (ctx as any).letterSpacing = "0px";

  // Main text block — starts at 60%
  let y = Math.round(FLYER_H * 0.60); // 810px
  ctx.textBaseline = "top";

  // Hook — Playfair Display italic, each sentence on its own line
  ctx.font = "italic 700 30px 'Playfair Display'";
  ctx.fillStyle = gold;
  const hookSentences = copy.hook
    .split(/\.\s+/)
    .map((s, i, arr) => (i < arr.length - 1 ? s + "." : s))
    .filter(Boolean)
    .flatMap((s) => wrapText(ctx, s, maxW));
  hookSentences.forEach((l, i) => ctx.fillText(l, pad, y + i * 37));
  y += hookSentences.length * 37 + 12;

  // Title
  if (activityType === "servicio_bautismal") {
    // "SERVICIO BAUTISMAL DE" on one line — DE bottom-aligned with the big text
    ctx.font = "900 56px Raleway";
    ctx.fillStyle = "#ffffff";
    (ctx as any).letterSpacing = "-0.56px";
    ctx.fillText("SERVICIO BAUTISMAL", pad, y);
    const sbW = ctx.measureText("SERVICIO BAUTISMAL").width;

    ctx.font = "700 28px Raleway";
    (ctx as any).letterSpacing = "5px";
    ctx.fillText("DE", pad + sbW + 16, y + (56 - 28)); // baseline-align with 56px text
    y += 56 + 10;

    ctx.font = "900 56px Raleway";
    ctx.fillStyle = "#ffffff";
    (ctx as any).letterSpacing = "-0.56px";
    const name = (copy.candidateName || copy.titulo).toUpperCase();
    const nameLines = wrapText(ctx, name, maxW);
    nameLines.forEach((l, i) => ctx.fillText(l, pad, y + i * 59));
    y += nameLines.length * 59 + 12;
  } else {
    ctx.font = "900 80px Raleway";
    ctx.fillStyle = "#ffffff";
    (ctx as any).letterSpacing = "-0.8px";
    const titleLines = wrapText(ctx, copy.titulo.toUpperCase(), maxW);
    titleLines.forEach((l, i) => ctx.fillText(l, pad, y + i * 82));
    y += titleLines.length * 82 + 12;
  }

  // Description (max 2 lines)
  ctx.font = "400 26px Raleway";
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  (ctx as any).letterSpacing = "0px";
  const descLines = wrapText(ctx, copy.descripcion, maxW).slice(0, 2);
  descLines.forEach((l, i) => ctx.fillText(l, pad, y + i * 34));
  y += descLines.length * 34 + 8;

  // Divider
  ctx.fillStyle = "rgba(212,175,55,0.32)";
  ctx.fillRect(pad, y, maxW, 1);
  y += 12;

  // Fecha y hora
  if (copy.fecha) {
    ctx.font = "400 21px Raleway";
    ctx.fillStyle = "rgba(255,255,255,0.60)";
    (ctx as any).letterSpacing = "0.5px";
    ctx.textBaseline = "top";
    const fechaHoraText = copy.hora ? `${copy.fecha}  ·  ${copy.hora}` : copy.fecha;
    ctx.fillText(fechaHoraText, pad, y);
    y += 28 + 8;
  }

  // Lugar
  if (copy.lugar) {
    ctx.font = "600 30px Raleway";
    ctx.fillStyle = "#ffffff";
    (ctx as any).letterSpacing = "0.6px";
    ctx.fillText(copy.lugar, pad, y);
    y += 39 + 4;
  }

  // Dirección
  if (copy.direccion) {
    ctx.font = "400 26px Raleway";
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    (ctx as any).letterSpacing = "0.26px";
    ctx.fillText(copy.direccion, pad, y);
    y += 34 + 4;
  }

  // Barrio
  if (copy.barrio) {
    ctx.font = "500 24px Raleway";
    ctx.fillStyle = gold;
    (ctx as any).letterSpacing = "4.32px"; // 0.18em × 24px
    ctx.fillText(copy.barrio.toUpperCase(), pad, y);
  }

  // CTA — fixed position from bottom
  ctx.font = "700 20px Raleway";
  (ctx as any).letterSpacing = "2.8px";
  const ctaText = copy.cta.toUpperCase();
  const ctaW = ctx.measureText(ctaText).width + 96; // 48px padding each side
  const ctaH = 48;
  const ctaY = FLYER_H - 80 - ctaH;
  ctx.fillStyle = gold;
  ctx.fillRect(pad, ctaY, ctaW, ctaH);
  ctx.fillStyle = "#0A0A0A";
  ctx.textBaseline = "middle";
  ctx.fillText(ctaText, pad + 48, ctaY + ctaH / 2);

  ctx.restore();
  return canvas;
}

// Generates a 1200×630 landscape image from the portrait flyer (top crop).
// WhatsApp renders og:image as a large card only when the image is landscape (≥1.91:1).
async function buildOgCanvas(flyerCanvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const og = document.createElement("canvas");
  og.width = 1200;
  og.height = 630;
  const ctx = og.getContext("2d")!;
  // Scale flyer to fill 1200px wide; canvas clips at 630px showing the top (photo + tipo label)
  const scaledH = Math.round(FLYER_H * (1200 / FLYER_W));
  ctx.drawImage(flyerCanvas, 0, 0, 1200, scaledH);
  return og;
}

// ── CSS preview component (dialog display only) ───────────────────────────────

function FlyerCanvas({ copy, activityType, dominantColor, photoUrl }: {
  copy: FlyCopy;
  activityType: string;
  dominantColor: string;
  photoUrl: string | null;
}) {
  const gold = "#D4AF37";
  const tipoLabel = TIPO_LABELS[activityType] ?? "Actividad";

  return (
    <div
      style={{
        width: FLYER_W,
        height: FLYER_H,
        position: "relative",
        overflow: "hidden",
        backgroundColor: dominantColor,
      }}
    >
      {photoUrl && (
        <img
          src={photoUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to bottom, transparent 0%, transparent 30%, ${dominantColor}20 40%, ${dominantColor}55 52%, ${dominantColor}cc 60%, ${dominantColor} 63%)`,
        }}
      />

      <img
        src="/flyer-assets/asset_flyer_m8.svg"
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* Tipo label */}
      <div style={{ position: "absolute", top: "72px", left: "72px", right: "72px", display: "flex", alignItems: "center", gap: "18px" }}>
        <div style={{ width: "3px", height: "46px", backgroundColor: gold, flexShrink: 0 }} />
        <span style={{ fontFamily: "'Raleway', sans-serif", color: gold, fontSize: "22px", letterSpacing: "0.30em", textTransform: "uppercase", fontWeight: 700 }}>
          {tipoLabel}
        </span>
      </div>

      {/* Main text block */}
      <div
        style={{
          position: "absolute",
          top: "60%",
          bottom: "80px",
          left: 0,
          right: 0,
          padding: "0 72px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: "italic", fontSize: "30px", color: gold, fontWeight: 700, lineHeight: 1.2, margin: 0, whiteSpace: "pre-line" }}>
            {copy.hook.replace(/\.\s+/g, ".\n")}
          </p>

          {activityType === "servicio_bautismal" ? (
            <div style={{ margin: 0, display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "16px" }}>
                <div style={{ fontFamily: "'Raleway', sans-serif", fontSize: "56px", color: "#FFFFFF", fontWeight: 900, lineHeight: 1.0, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
                  SERVICIO BAUTISMAL
                </div>
                <div style={{ fontFamily: "'Raleway', sans-serif", fontSize: "28px", color: "#FFFFFF", fontWeight: 700, lineHeight: 1.0, letterSpacing: "0.18em", textTransform: "uppercase", paddingBottom: "4px" }}>
                  DE
                </div>
              </div>
              <div style={{ fontFamily: "'Raleway', sans-serif", fontSize: "56px", color: "#FFFFFF", fontWeight: 900, lineHeight: 1.05, textTransform: "uppercase", letterSpacing: "-0.01em", marginTop: "10px", wordBreak: "break-word" }}>
                {copy.candidateName || copy.titulo}
              </div>
            </div>
          ) : (
            <h1 style={{ fontFamily: "'Raleway', sans-serif", fontSize: "80px", color: "#FFFFFF", lineHeight: 1.0, fontWeight: 900, margin: 0, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
              {copy.titulo}
            </h1>
          )}

          <p style={{
            fontFamily: "'Raleway', sans-serif",
            fontSize: "26px",
            color: "rgba(255,255,255,0.82)",
            fontWeight: 400,
            lineHeight: 1.3,
            margin: 0,
            maxWidth: "900px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          } as React.CSSProperties}>
            {copy.descripcion}
          </p>

          <div style={{ width: "100%", height: "1px", backgroundColor: "rgba(212,175,55,0.32)" }} />

          {copy.fecha && (
            <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              <span style={{ fontFamily: "'Raleway', sans-serif", fontSize: "21px", color: "rgba(255,255,255,0.60)", fontWeight: 400, letterSpacing: "0.5px", lineHeight: 1.3 }}>
                {copy.hora ? `${copy.fecha}  ·  ${copy.hora}` : copy.fecha}
              </span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {copy.lugar && (
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                <span style={{ fontFamily: "'Raleway', sans-serif", fontSize: "30px", color: "#FFFFFF", fontWeight: 600, letterSpacing: "0.02em", lineHeight: 1.3 }}>
                  {copy.lugar}
                </span>
              </div>
            )}
            {copy.direccion && (
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                <span style={{ fontFamily: "'Raleway', sans-serif", fontSize: "26px", color: "rgba(255,255,255,0.70)", fontWeight: 400, letterSpacing: "0.01em", lineHeight: 1.3 }}>
                  {copy.direccion}
                </span>
              </div>
            )}
            {copy.barrio && (
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginTop: "2px" }}>
                <span style={{ fontFamily: "'Raleway', sans-serif", fontSize: "24px", color: gold, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", lineHeight: 1.3 }}>
                  {copy.barrio}
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ backgroundColor: gold, padding: "14px 48px", display: "inline-flex", alignSelf: "flex-start", flexShrink: 0 }}>
          <span style={{ fontFamily: "'Raleway', sans-serif", fontSize: "20px", fontWeight: 700, color: "#0A0A0A", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {copy.cta}
          </span>
        </div>
      </div>
    </div>
  );
}

interface FlyerGeneratorProps {
  activityId: string;
  flyerUrl?: string | null;
  canUpload: boolean;
  activity: { type: string };
}

export function FlyerGenerator({ activityId, flyerUrl, canUpload, activity }: FlyerGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [copy, setCopy] = useState<FlyCopy | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dominantColor, setDominantColor] = useState(FALLBACK_COLOR);
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingBlobUrl, setPendingBlobUrl] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (customPhotoUrl) return;
    const url = getPhotoUrl(copy?.fondo ?? "", null);
    if (!url) { setDominantColor(FALLBACK_COLOR); return; }
    extractColorFromUrl(url).then(setDominantColor);
  }, [copy?.fondo, customPhotoUrl]);

  async function generate() {
    setGenerating(true);
    setCustomPhotoUrl(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/activities/${activityId}/generate-flyer-copy`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(err.error ?? "Error al generar");
      }
      const data: FlyCopy = await res.json();
      setCopy(data);
      setPreviewOpen(true);
    } catch (e: any) {
      toast({ title: "Error al generar flyer", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    setCustomPhotoUrl(blobUrl);
    setPendingFile(file);
    setPendingBlobUrl(blobUrl);
    setSaveDialogOpen(true);
    e.target.value = "";
    extractColorFromFile(file).then(setDominantColor);
  }

  async function handleSaveDecision(saveToLibrary: boolean) {
    setSaveDialogOpen(false);
    if (!saveToLibrary || !pendingFile || !pendingBlobUrl) {
      setPendingFile(null);
      setPendingBlobUrl(null);
      return;
    }
    setSavingToLibrary(true);
    try {
      const token = getAccessToken();
      const form = new FormData();
      form.append("photo", pendingFile, pendingFile.name);
      const res = await fetch("/api/flyer-assets/photo", {
        method: "POST",
        body: form,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Error al guardar en biblioteca");
      const { url, category } = await res.json();
      URL.revokeObjectURL(pendingBlobUrl);
      setCustomPhotoUrl(url);
      toast({ title: "Guardada en biblioteca", description: `Categoría: ${category}` });
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
    } finally {
      setSavingToLibrary(false);
      setPendingFile(null);
      setPendingBlobUrl(null);
    }
  }

  async function captureAndUpload() {
    if (!copy) return;
    setUploading(true);
    try {
      const photoUrl = getPhotoUrl(copy.fondo, customPhotoUrl);
      const canvas = await buildFlyerCanvas(copy, activity.type, dominantColor, photoUrl);

      const [blob, ogBlob] = await Promise.all([
        new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob falló"))),
            "image/jpeg",
            0.92,
          ),
        ),
        buildOgCanvas(canvas).then(
          (ogCanvas) =>
            new Promise<Blob>((resolve, reject) =>
              ogCanvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error("toBlob og falló"))),
                "image/jpeg",
                0.85,
              ),
            ),
        ),
      ]);

      const form = new FormData();
      form.append("flyer", blob, "flyer.jpg");
      form.append("og", ogBlob, "og.jpg");
      const token = getAccessToken();
      const uploadRes = await fetch(`/api/activities/${activityId}/flyer`, {
        method: "POST",
        body: form,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!uploadRes.ok) throw new Error("Error al subir");

      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actividades"] });
      setPreviewOpen(false);
      toast({ title: "Flyer generado y guardado" });
    } catch (e: any) {
      toast({ title: "Error al guardar flyer", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const photoUrl = getPhotoUrl(copy?.fondo ?? "", customPhotoUrl);

  return (
    <>
      {flyerUrl ? (
        <div className="relative rounded-lg overflow-hidden border border-border group" style={{ height: 136 }}>
          <img
            src={flyerUrl}
            alt="Flyer"
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2">
            <span className="text-xs font-medium text-white/90 flex items-center gap-1.5">
              <Image className="h-3.5 w-3.5" /> Flyer listo
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/f/${activityId}`;
                  if (navigator.share) {
                    navigator.share({ url });
                  } else {
                    navigator.clipboard.writeText(url).then(() =>
                      toast({ title: "Enlace copiado", description: "Pégalo en WhatsApp para compartir el flyer" })
                    );
                  }
                }}
                className="inline-flex items-center gap-1 text-xs bg-white/20 hover:bg-white/35 text-white px-2.5 py-1 rounded-md backdrop-blur-sm transition-colors"
              >
                <Share2 className="h-3 w-3" /> Compartir
              </button>
              <a
                href={flyerUrl}
                download="flyer.jpg"
                className="inline-flex items-center gap-1 text-xs bg-white/20 hover:bg-white/35 text-white px-2.5 py-1 rounded-md backdrop-blur-sm transition-colors"
              >
                <Download className="h-3 w-3" /> Guardar
              </a>
              {canUpload && (
                <button
                  onClick={generate}
                  disabled={generating}
                  className="inline-flex items-center gap-1 text-xs bg-white/20 hover:bg-white/35 text-white px-2.5 py-1 rounded-md backdrop-blur-sm transition-colors disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  {generating ? "…" : "Regenerar"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : canUpload ? (
        <button
          onClick={generate}
          disabled={generating}
          className="w-full rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/40 bg-muted/30 hover:bg-muted/50 transition-all p-4 text-left group disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center shrink-0 transition-colors">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {generating ? "Generando flyer…" : "Generar flyer"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Crea un flyer atractivo para compartir
              </p>
            </div>
            {!generating && (
              <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                Crear →
              </span>
            )}
          </div>
        </button>
      ) : (
        <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3 flex items-center gap-2">
          <Image className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <span className="text-sm text-muted-foreground italic">Sin flyer</span>
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista previa del flyer</DialogTitle>
          </DialogHeader>

          {copy && (
            <div className="flex flex-col gap-4">
              {/* Scaled CSS preview — display only */}
              <div
                style={{
                  width: PREVIEW_W,
                  height: PREVIEW_H,
                  overflow: "hidden",
                  position: "relative",
                  borderRadius: "6px",
                  margin: "0 auto",
                }}
              >
                <div
                  style={{
                    width: FLYER_W,
                    height: FLYER_H,
                    transform: `scale(${SCALE})`,
                    transformOrigin: "top left",
                    position: "absolute",
                    top: 0,
                    left: 0,
                  }}
                >
                  <FlyerCanvas
                    copy={copy}
                    activityType={activity.type}
                    dominantColor={dominantColor}
                    photoUrl={photoUrl}
                  />
                </div>
              </div>

              {/* Editable location fields */}
              <div className="space-y-2 rounded-lg border px-3 py-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lugar del evento</p>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Centro de reuniones</Label>
                  <Input
                    className="h-8 text-sm"
                    value={copy.lugar ?? ""}
                    onChange={(e) => setCopy(c => c ? { ...c, lugar: e.target.value } : c)}
                    placeholder="Nombre del centro"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Dirección</Label>
                  <Input
                    className="h-8 text-sm"
                    value={copy.direccion ?? ""}
                    onChange={(e) => setCopy(c => c ? { ...c, direccion: e.target.value } : c)}
                    placeholder="Calle, número, ciudad…"
                  />
                </div>
              </div>

              {/* Custom photo */}
              <div className="flex items-center gap-2">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={savingToLibrary}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  {savingToLibrary ? "Guardando..." : "Cambiar imagen"}
                </Button>
                {customPhotoUrl && (
                  <span className="text-xs text-muted-foreground italic">Imagen personalizada activa</span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generate}
                  disabled={generating || uploading}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {generating ? "Regenerando..." : "Regenerar"}
                </Button>
                <Button
                  className="flex-1"
                  onClick={captureAndUpload}
                  disabled={uploading || generating}
                >
                  {uploading ? "Guardando..." : "Guardar flyer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Save-to-library confirmation dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={() => handleSaveDecision(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Guardar en la biblioteca?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {pendingBlobUrl && (
              <img src={pendingBlobUrl} alt="Vista previa" className="w-full h-40 object-cover rounded-md" />
            )}
            <p className="text-sm text-muted-foreground">
              ¿Quieres guardar esta imagen en la biblioteca para que se use automáticamente
              en futuros flyers de este tipo de actividad?
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => handleSaveDecision(false)}>
                <FileImage className="h-4 w-4 mr-1" />
                Solo este flyer
              </Button>
              <Button className="flex-1" onClick={() => handleSaveDecision(true)}>
                <BookImage className="h-4 w-4 mr-1" />
                Guardar en biblioteca
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
