import { useState, useRef } from "react";
import html2canvas from "html2canvas";
import "@fontsource/raleway/400.css";
import "@fontsource/raleway/500.css";
import "@fontsource/raleway/600.css";
import "@fontsource/raleway/700.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/600.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getAccessToken } from "@/lib/auth-tokens";
import { Image, RefreshCw, Sparkles } from "lucide-react";

const FLYER_PX = 1080;
const PREVIEW_PX = 420;
const SCALE = PREVIEW_PX / FLYER_PX;

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

function FlyerCanvas({ copy, activityType }: {
  copy: FlyCopy;
  activityType: string;
}) {
  const gold = "#D4AF37";
  const tipoLabel = TIPO_LABELS[activityType] ?? "Actividad";

  return (
    <div
      style={{
        width: FLYER_PX,
        height: FLYER_PX,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0A0A0A",
      }}
    >
      {/* Background SVG */}
      <img
        src={`/backgrounds/${copy.fondo}.svg`}
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

      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.52) 42%, rgba(0,0,0,0.88) 100%)",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
        }}
      >
        {/* Top: tipo label */}
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
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

        {/* Center: copy */}
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "98px",
              color: "#FFFFFF",
              lineHeight: 1.02,
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {copy.titulo}
          </h1>
          <p
            style={{
              fontFamily: "'Raleway', sans-serif",
              fontSize: "36px",
              color: gold,
              fontWeight: 600,
              lineHeight: 1.35,
              margin: 0,
              letterSpacing: "0.04em",
            }}
          >
            {copy.hook}
          </p>
          <p
            style={{
              fontFamily: "'Raleway', sans-serif",
              fontSize: "27px",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 400,
              lineHeight: 1.55,
              margin: 0,
              maxWidth: "820px",
            }}
          >
            {copy.descripcion}
          </p>
        </div>

        {/* Bottom: date/place + CTA */}
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          {/* Divider */}
          <div
            style={{
              width: "100%",
              height: "1px",
              backgroundColor: "rgba(212,175,55,0.38)",
            }}
          />

          {/* Place · Ward */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {copy.lugar && (
              <span
                style={{
                  fontFamily: "'Raleway', sans-serif",
                  fontSize: "28px",
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
                  fontSize: "22px",
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

          {/* CTA button */}
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
  const [copy, setCopy] = useState<FlyCopy | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  async function generate() {
    setGenerating(true);
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

  async function captureAndUpload() {
    if (!captureRef.current || !copy) return;
    setUploading(true);
    try {
      await document.fonts.ready;

      const canvas = await html2canvas(captureRef.current, {
        width: FLYER_PX,
        height: FLYER_PX,
        scale: 1,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#0A0A0A",
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

      {/* Off-screen canvas for html2canvas capture — always mounted when copy exists */}
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
            />
          </div>
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Vista previa del flyer</DialogTitle>
          </DialogHeader>

          {copy && (
            <div className="flex flex-col gap-4">
              {/* Scaled preview */}
              <div
                style={{
                  width: PREVIEW_PX,
                  height: PREVIEW_PX,
                  overflow: "hidden",
                  position: "relative",
                  borderRadius: "6px",
                  margin: "0 auto",
                }}
              >
                <div
                  style={{
                    width: FLYER_PX,
                    height: FLYER_PX,
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
                  />
                </div>
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
    </>
  );
}
