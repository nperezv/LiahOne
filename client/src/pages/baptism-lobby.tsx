import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import type { BaptismTheme } from "../../../server/baptism-public-routes";

const C = {
  teal:      "#4a7c7e",
  tealDark:  "#2d5e60",
  ink:       "#2c3e35",
  inkLight:  "#5a6e65",
  gold:      "#b8955a",
  sage:      "#7a9e8c",
  creamDark: "#ede9df",
};

type LobbyService = {
  slug: string;
  serviceAt: string;
  candidateNames: string[];
  wardName: string | null;
  theme: BaptismTheme;
};
type LobbyData = { service: LobbyService | null };

function joinNames(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function parseDateParts(iso: string) {
  const d = new Date(iso);
  const month = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" }).format(d).toUpperCase();
  const day   = String(d.getUTCDate()).padStart(2, "0");
  const year  = String(d.getUTCFullYear());
  return { month, day, year };
}

const THEME_CONFIG: Record<BaptismTheme, { image: string; accent: string; accentDark: string; titleColor: string }> = {
  nino:         { image: "/covenantspathboy.png",    accent: "#6ba3c8", accentDark: "#3d7aa8", titleColor: "#3d6080" },
  nina:         { image: "/covenantspathgirl.png",   accent: "#c47a8a", accentDark: "#9a4e62", titleColor: "#8a3e55" },
  joven_varon:  { image: "/covenanthspathhim.png",   accent: "#6a9c7e", accentDark: "#3d7060", titleColor: "#2d5e60" },
  joven_mujer:  { image: "/covenantspathher.png",    accent: "#9b7ec8", accentDark: "#7358a8", titleColor: "#5a3a90" },
  adulto:       { image: "/covenantspath.png",       accent: "#4a7c7e", accentDark: "#2d5e60", titleColor: "#2d5e60" },
  adulta:       { image: "/theshepherd.png",         accent: "#b8955a", accentDark: "#8a6e3a", titleColor: "#4a7c7e" },
  multi_kids:   { image: "/covenantspathkids.png",   accent: "#6a9c7e", accentDark: "#3d7060", titleColor: "#2d5e60" },
  multi_family: { image: "/covenantspathfamily.png", accent: "#4a7c7e", accentDark: "#2d5e60", titleColor: "#2d5e60" },
  multi_adults: { image: "/covenantspath.png",       accent: "#4a7c7e", accentDark: "#2d5e60", titleColor: "#2d5e60" },
  fallback:     { image: "/theshepherd.png",         accent: "#4a7c7e", accentDark: "#2d5e60", titleColor: "#2d5e60" },
};

export default function BaptismLobbyPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const { data, isLoading } = useQuery<LobbyData>({
    queryKey: ["/api/bautismo"],
    refetchInterval: 60_000,
  });

  const svc = data?.service ?? null;
  const tc = THEME_CONFIG[svc?.theme ?? "fallback"];
  const names = svc?.candidateNames ?? [];
  const dateParts = svc ? parseDateParts(svc.serviceAt) : null;

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "#ffffff" }}>
        <img src="/thelambofgod.png" alt="" className="w-24 opacity-20" />
      </main>
    );
  }

  if (!svc) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center gap-5 px-8 text-center"
        style={{ background: "#ffffff", fontFamily: "'EB Garamond', Georgia, serif" }}
      >
        <img src="/thelambofgod.png" alt="" className="w-36 opacity-50" />
        <div>
          <p style={{ fontFamily: "'Cinzel', serif", fontSize: "0.85rem", letterSpacing: "0.08em", color: C.tealDark }} className="font-semibold mb-1">
            Sin servicios hoy
          </p>
          <p className="text-sm leading-relaxed" style={{ color: C.inkLight }}>
            No hay servicios bautismales<br />programados para hoy.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative overflow-hidden select-none"
      style={{ minHeight: "100dvh", background: "#ffffff", fontFamily: "'EB Garamond', Georgia, serif" }}
      onClick={() => navigate(`/bautismo/${svc.slug}`)}
    >
      {/* Ghost watermark image */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{ zIndex: 1 }}>
        <img
          src={tc.image}
          alt=""
          style={{ width: "82%", maxWidth: 340, objectFit: "contain", opacity: 0.18, mixBlendMode: "multiply" }}
        />
      </div>

      {/* Content — vertically centered */}
      <div
        className="relative flex flex-col justify-center px-7"
        style={{ zIndex: 2, minHeight: "100dvh" }}
      >
        {/* Date pill */}
        {dateParts && (
          <div className="flex items-center justify-center mb-4">
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.58rem", letterSpacing: "0.22em", color: tc.accentDark, textTransform: "uppercase" }}>
              {dateParts.month}
            </span>
            <span style={{
              borderLeft: `1px solid ${tc.accentDark}`, borderRight: `1px solid ${tc.accentDark}`,
              margin: "0 9px", padding: "0 9px",
              fontFamily: "'Cinzel', serif", fontSize: "1.35rem",
              fontWeight: 700, lineHeight: 1, color: tc.accent,
            }}>
              {dateParts.day}
            </span>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.58rem", letterSpacing: "0.22em", color: tc.accentDark, textTransform: "uppercase" }}>
              {dateParts.year}
            </span>
          </div>
        )}

        {/* Mi Bautismo */}
        <div className="flex justify-center mb-5">
          <div className="flex flex-col items-start">
            <h1 style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: "clamp(2rem, 10vw, 2.8rem)", fontWeight: 700, lineHeight: 0.88, color: tc.titleColor, margin: 0 }}>
              Mi
            </h1>
            <h1 style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: "clamp(1.7rem, 8.5vw, 2.4rem)", fontWeight: 700, lineHeight: 0.92, color: tc.titleColor, margin: 0 }}>
              Bautismo
            </h1>
          </div>
        </div>

        {/* Names */}
        <div className="flex flex-col items-center">
          {names.map((name, i) => (
            <p key={i} style={{
              fontFamily: "'Dancing Script', cursive",
              fontSize: names.length >= 3 ? "clamp(1.5rem, 7vw, 2rem)" : names.length === 2 ? "clamp(1.9rem, 9vw, 2.6rem)" : "clamp(1.9rem, 9vw, 2.6rem)",
              color: C.ink, lineHeight: 1.3, margin: 0,
            }}>
              {name}
            </p>
          ))}
        </div>
      </div>

      {/* Tap hint */}
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none" style={{ zIndex: 3 }}>
        <p style={{ fontFamily: "'Cinzel', serif", fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase", color: tc.accent, opacity: 0.85 }}>
          Ver programa
        </p>
        <ChevronRight size={16} style={{ color: tc.accent, opacity: 0.75 }} />
      </div>
    </main>
  );
}
