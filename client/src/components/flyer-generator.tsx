import { useState, useRef, useEffect } from "react";
import html2canvas from "html2canvas";
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
import { Image, RefreshCw, Sparkles, Upload, BookImage, FileImage } from "lucide-react";

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
}

// Returns #rrggbb so hex-alpha suffixes in the gradient (${color}55 etc.) stay valid CSS
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

// Reliable cross-browser extraction: FileReader → data URL → Image → canvas
// Data URLs are always origin-clean; no CORS, no canvas taint possible.
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
        } catch {
          resolve(FALLBACK_COLOR);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

// Extract dominant color from a same-origin URL (library photos)
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
      } catch {
        resolve(FALLBACK_COLOR);
      }
    };
    img.src = url;
  });
}

function getPhotoUrl(fondo: string, customUrl?: string | null): string | null {
  if (customUrl) return customUrl;
  if (fondo?.startsWith("photos/")) return `/flyer-assets/${fondo}`;
  return null;
}

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
      {/* Layer 1 — photo background */}
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

      {/* Layer 2 — gradient: transparent → dominant color */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to bottom, transparent 0%, transparent 30%, ${dominantColor}20 40%, ${dominantColor}55 52%, ${dominantColor}cc 60%, ${dominantColor} 63%)`,
        }}
      />

      {/* Layer 3 — decorative geometric overlay */}
      <img
        src="/flyer-assets/asset_flyer_m8.svg"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Layer 4 — text */}

      {/* Tipo label — top left */}
      <div
        style={{
          position: "absolute",
          top: "72px",
          left: "72px",
          right: "72px",
          display: "flex",
          alignItems: "center",
          gap: "18px",
        }}
      >
        <div
          style={{
            width: "3px",
            height: "46px",
            backgroundColor: gold,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "'Raleway', sans-serif",
            color: gold,
            fontSize: "22px",
            letterSpacing: "0.30em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {tipoLabel}
        </span>
      </div>

      {/* Main text block — starts at 54% */}
      <div
        style={{
          position: "absolute",
          top: "54%",
          bottom: "80px",
          left: 0,
          right: 0,
          padding: "0 72px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* Upper content group */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Hook — Playfair Display italic */}
          <p
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: "italic",
              fontSize: "30px",
              color: gold,
              fontWeight: 700,
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {copy.hook}
          </p>

          {/* Title — fixed structure for baptisms, dynamic for other types */}
          {activityType === "servicio_bautismal" ? (
            <div style={{ margin: 0, display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{
                fontFamily: "'Raleway', sans-serif",
                fontSize: "56px",
                color: "#FFFFFF",
                fontWeight: 900,
                lineHeight: 1.0,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
              }}>
                SERVICIO BAUTISMAL
              </div>
              <div style={{
                fontFamily: "'Raleway', sans-serif",
                fontSize: "22px",
                color: "#FFFFFF",
                fontWeight: 700,
                lineHeight: 1.0,
                letterSpacing: "0.35em",
                textTransform: "uppercase",
                marginTop: "10px",
              }}>
                DE
              </div>
              <div style={{
                fontFamily: "'Raleway', sans-serif",
                fontSize: "56px",
                color: "#FFFFFF",
                fontWeight: 900,
                lineHeight: 1.05,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                marginTop: "4px",
                wordBreak: "break-word",
              }}>
                {copy.candidateName || copy.titulo}
              </div>
            </div>
          ) : (
            <h1
              style={{
                fontFamily: "'Raleway', sans-serif",
                fontSize: "80px",
                color: "#FFFFFF",
                lineHeight: 1.0,
                fontWeight: 900,
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
              }}
            >
              {copy.titulo}
            </h1>
          )}

          {/* Description */}
          <p
            style={{
              fontFamily: "'Raleway', sans-serif",
              fontSize: "20px",
              color: "rgba(255,255,255,0.82)",
              fontWeight: 400,
              lineHeight: 1.35,
              margin: 0,
              maxWidth: "900px",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            } as React.CSSProperties}
          >
            {copy.descripcion}
          </p>

          {/* Divider */}
          <div
            style={{
              width: "100%",
              height: "1px",
              backgroundColor: "rgba(212,175,55,0.32)",
            }}
          />

          {/* Lugar + Dirección + Barrio */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {copy.lugar && (
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                <span style={{
                  fontFamily: "'Raleway', sans-serif",
                  fontSize: "22px",
                  color: "#FFFFFF",
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  lineHeight: 1.4,
                }}>
                  {copy.lugar}
                </span>
              </div>
            )}
            {copy.direccion && (
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                <span style={{
                  fontFamily: "'Raleway', sans-serif",
                  fontSize: "17px",
                  color: "rgba(255,255,255,0.70)",
                  fontWeight: 400,
                  letterSpacing: "0.01em",
                  lineHeight: 1.4,
                }}>
                  {copy.direccion}
                </span>
              </div>
            )}
            {copy.barrio && (
              <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginTop: "2px" }}>
                <span style={{
                  fontFamily: "'Raleway', sans-serif",
                  fontSize: "18px",
                  color: gold,
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  lineHeight: 1.4,
                }}>
                  {copy.barrio}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CTA — pinned to bottom by space-between */}
        <div
          style={{
            backgroundColor: gold,
            padding: "14px 48px",
            display: "inline-flex",
            alignSelf: "flex-start",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Raleway', sans-serif",
              fontSize: "20px",
              fontWeight: 700,
              color: "#0A0A0A",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
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
  // Save-to-library dialog
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingBlobUrl, setPendingBlobUrl] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Re-extract dominant color from library photo (custom file uploads handled in handlePhotoSelect)
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
    // createImageBitmap(File) is always origin-clean — guaranteed no canvas taint
    extractColorFromFile(file).then(setDominantColor);
  }

  async function handleSaveDecision(saveToLibrary: boolean) {
    setSaveDialogOpen(false);
    if (!saveToLibrary || !pendingFile || !pendingBlobUrl) {
      setPendingFile(null);
      setPendingBlobUrl(null);
      return;
    }
    // Upload to server library
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
    if (!captureRef.current || !copy) return;
    setUploading(true);
    try {
      await document.fonts.ready;

      const canvas = await html2canvas(captureRef.current, {
        width: FLYER_W,
        height: FLYER_H,
        scale: 1,
        useCORS: true,
        allowTaint: false,
        backgroundColor: dominantColor,
        logging: false,
      });

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob falló"))),
          "image/jpeg",
          0.92,
        ),
      );

      const form = new FormData();
      form.append("flyer", blob, "flyer.jpg");
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
        /* ── Flyer exists: thumbnail card ── */
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
              <a
                href={flyerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs bg-white/20 hover:bg-white/35 text-white px-2.5 py-1 rounded-md backdrop-blur-sm transition-colors"
              >
                <Image className="h-3 w-3" /> Ver
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
        /* ── No flyer, can generate: dashed CTA ── */
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
        /* ── No flyer, read-only ── */
        <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-3 flex items-center gap-2">
          <Image className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <span className="text-sm text-muted-foreground italic">Sin flyer</span>
        </div>
      )}

      {/* Off-screen canvas for html2canvas capture */}
      {copy && (
        <div
          style={{
            position: "fixed",
            left: "-9999px",
            top: "-9999px",
            zIndex: -1,
            pointerEvents: "none",
          }}
        >
          <div ref={captureRef}>
            <FlyerCanvas
              copy={copy}
              activityType={activity.type}
              dominantColor={dominantColor}
              photoUrl={photoUrl}
            />
          </div>
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
              {/* Scaled preview */}
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
              <img
                src={pendingBlobUrl}
                alt="Vista previa"
                className="w-full h-40 object-cover rounded-md"
              />
            )}
            <p className="text-sm text-muted-foreground">
              ¿Quieres guardar esta imagen en la biblioteca para que se use automáticamente
              en futuros flyers de este tipo de actividad?
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleSaveDecision(false)}
              >
                <FileImage className="h-4 w-4 mr-1" />
                Solo este flyer
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleSaveDecision(true)}
              >
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
