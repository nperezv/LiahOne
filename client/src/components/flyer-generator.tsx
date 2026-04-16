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
  barrio?: string;
}

function extractDominantColor(img: HTMLImageElement): string {
  try {
    const W = Math.min(img.naturalWidth, 200);
    const H = Math.min(img.naturalHeight, 250);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return FALLBACK_COLOR;
    ctx.drawImage(img, 0, 0, W, H);
    const imageData = ctx.getImageData(0, Math.floor(H / 2), W, Math.ceil(H / 2));
    const data = imageData.data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
    }
    if (count === 0) return FALLBACK_COLOR;
    // Darken for gradient endpoint
    r = Math.floor((r / count) * 0.55);
    g = Math.floor((g / count) * 0.55);
    b = Math.floor((b / count) * 0.55);
    return `rgb(${r},${g},${b})`;
  } catch {
    return FALLBACK_COLOR;
  }
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
          crossOrigin="anonymous"
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
          background: `linear-gradient(to bottom, transparent 0%, transparent 44%, ${dominantColor}55 56%, ${dominantColor}99 68%, ${dominantColor}cc 80%, ${dominantColor} 100%)`,
        }}
      />

      {/* Layer 3 — decorative geometric overlay */}
      <img
        src="/flyer-assets/asset_flyer_m8.svg"
        alt=""
        crossOrigin="anonymous"
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

      {/* Main text block — starts at 50% */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          padding: "0 72px",
          display: "flex",
          flexDirection: "column",
          gap: "22px",
        }}
      >
        {/* Hook — Playfair Display italic */}
        <p
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: "italic",
            fontSize: "44px",
            color: gold,
            fontWeight: 700,
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {copy.hook}
        </p>

        {/* Title — Raleway 900 uppercase */}
        <h1
          style={{
            fontFamily: "'Raleway', sans-serif",
            fontSize: "96px",
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

        {/* Description */}
        <p
          style={{
            fontFamily: "'Raleway', sans-serif",
            fontSize: "28px",
            color: "rgba(255,255,255,0.82)",
            fontWeight: 400,
            lineHeight: 1.5,
            margin: 0,
            maxWidth: "900px",
          }}
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

        {/* Lugar + Barrio */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {copy.lugar && (
            <span
              style={{
                fontFamily: "'Raleway', sans-serif",
                fontSize: "26px",
                color: "#FFFFFF",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              {copy.lugar}
            </span>
          )}
          {copy.barrio && (
            <span
              style={{
                fontFamily: "'Raleway', sans-serif",
                fontSize: "20px",
                color: gold,
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {copy.barrio}
            </span>
          )}
        </div>

        {/* CTA */}
        <div
          style={{
            backgroundColor: gold,
            padding: "18px 54px",
            display: "inline-flex",
            alignSelf: "flex-start",
          }}
        >
          <span
            style={{
              fontFamily: "'Raleway', sans-serif",
              fontSize: "24px",
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

  // Re-extract dominant color whenever photo source changes
  useEffect(() => {
    const url = getPhotoUrl(copy?.fondo ?? "", customPhotoUrl);
    if (!url) { setDominantColor(FALLBACK_COLOR); return; }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setDominantColor(extractDominantColor(img));
    img.onerror = () => setDominantColor(FALLBACK_COLOR);
    img.src = url;
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
    // Apply immediately for preview, then ask about saving
    const blobUrl = URL.createObjectURL(file);
    setCustomPhotoUrl(blobUrl);
    setPendingFile(file);
    setPendingBlobUrl(blobUrl);
    setSaveDialogOpen(true);
    // Reset input so same file can be re-selected
    e.target.value = "";
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
      <div className="flex items-center gap-3">
        {flyerUrl ? (
          <a
            href={flyerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Image className="h-4 w-4" /> Ver flyer
          </a>
        ) : (
          <span className="text-sm text-muted-foreground italic">Sin flyer</span>
        )}
        {canUpload && (
          <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {generating ? "Generando..." : flyerUrl ? "Regenerar flyer" : "Generar flyer"}
          </Button>
        )}
      </div>

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
