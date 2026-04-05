import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { BaptismTheme } from "../../../server/baptism-public-routes";

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  cream:     "#f7f4ed",
  creamDark: "#ede9df",
  teal:      "#4a7c7e",
  tealDark:  "#2d5e60",
  gold:      "#b8955a",
  goldLight: "#d4aa72",
  ink:       "#2c3e35",
  inkLight:  "#5a6e65",
  sage:      "#7a9e8c",
};

// ── Types ─────────────────────────────────────────────────────────────────────
type LobbyService = {
  slug: string;
  serviceAt: string;
  candidateNames: string[];
  wardName: string | null;
  theme: BaptismTheme;
};

type LobbyData = { service: LobbyService | null };

// ── Helpers ───────────────────────────────────────────────────────────────────
function joinNames(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(d);
}

// ── Botanical SVG ─────────────────────────────────────────────────────────────
function BotanicalCorner({ pos = "tl", size = 130 }: { pos?: "tl" | "tr" | "bl" | "br"; size?: number }) {
  const sx = pos === "tr" || pos === "br" ? -1 : 1;
  const sy = pos === "bl" || pos === "br" ? -1 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 130 130" fill="none"
      style={{ opacity: 0.7, transform: `scale(${sx},${sy})`, transformOrigin: "center" }}>
      <path d="M8,122 Q35,85 70,50 Q88,32 108,18" stroke={C.sage} strokeWidth="1.2" strokeOpacity="0.5" fill="none" />
      <path d="M16,110 Q38,88 50,98 Q34,82 16,110Z" fill={C.sage} fillOpacity="0.28" />
      <path d="M32,93 Q52,72 62,83 Q48,68 32,93Z" fill={C.sage} fillOpacity="0.26" />
      <path d="M50,74 Q68,55 76,66 Q64,52 50,74Z" fill={C.sage} fillOpacity="0.30" />
      <path d="M68,56 Q84,40 90,50 Q78,36 68,56Z" fill={C.sage} fillOpacity="0.24" />
      <path d="M86,40 Q98,28 103,36 Q94,25 86,40Z" fill={C.sage} fillOpacity="0.22" />
      <circle cx="54" cy="104" r="2.2" fill={C.gold} fillOpacity="0.4" />
      <circle cx="62" cy="110" r="1.5" fill={C.gold} fillOpacity="0.35" />
    </svg>
  );
}

// ── Main lobby page ───────────────────────────────────────────────────────────
export default function BaptismLobbyPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const { data, isLoading } = useQuery<LobbyData>({
    queryKey: ["/api/bautismo"],
    refetchInterval: 60_000, // refresh every minute
  });

  const svc = data?.service ?? null;

  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-between overflow-hidden"
      style={{ background: C.cream, fontFamily: "'EB Garamond', Georgia, serif" }}
    >
      {/* Botanical corners */}
      <div className="absolute top-0 left-0 pointer-events-none"><BotanicalCorner pos="tl" size={140} /></div>
      <div className="absolute top-0 right-0 pointer-events-none"><BotanicalCorner pos="tr" size={140} /></div>
      <div className="absolute bottom-0 left-0 pointer-events-none"><BotanicalCorner pos="bl" size={110} /></div>
      <div className="absolute bottom-0 right-0 pointer-events-none"><BotanicalCorner pos="br" size={110} /></div>

      {/* Header */}
      <div className="relative z-10 flex flex-col items-center pt-14 gap-2 px-6 text-center">
        {/* Gold rule + title */}
        <div className="flex items-center gap-3">
          <div className="h-px w-10" style={{ background: C.gold, opacity: 0.6 }} />
          <p
            className="uppercase tracking-[0.25em] text-xs font-semibold"
            style={{ color: C.gold, fontFamily: "'Cinzel', serif" }}
          >
            Programa Bautismal
          </p>
          <div className="h-px w-10" style={{ background: C.gold, opacity: 0.6 }} />
        </div>
        <h1
          className="font-bold leading-none"
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: "clamp(1.6rem, 7vw, 2.4rem)",
            color: C.tealDark,
            letterSpacing: "0.04em",
          }}
        >
          Mí Bautismo
        </h1>
        <p className="text-xs tracking-wide" style={{ color: C.inkLight }}>
          {new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
        </p>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full px-6 py-10 max-w-sm mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <img src="/thelambofgod.png" alt="" className="w-28 opacity-30" />
            <p className="text-sm" style={{ color: C.inkLight }}>Buscando programa...</p>
          </div>
        ) : svc ? (
          /* ── Service card ── */
          <div
            className="w-full rounded-2xl overflow-hidden shadow-lg"
            style={{ border: `1px solid ${C.creamDark}` }}
          >
            {/* Card image strip */}
            <div
              className="relative w-full flex items-center justify-center"
              style={{ background: C.cream, height: 220 }}
            >
              <img
                src={`/${themeImage(svc.theme)}`}
                alt=""
                className="h-full w-full object-contain"
                style={{ opacity: 0.92 }}
              />
              {/* Gradient overlay at bottom */}
              <div
                className="absolute bottom-0 left-0 right-0 h-16"
                style={{ background: `linear-gradient(to bottom, transparent, ${C.cream})` }}
              />
            </div>

            {/* Card body */}
            <div className="px-6 pb-6 pt-2 text-center" style={{ background: C.cream }}>
              {svc.wardName && (
                <p className="text-xs uppercase tracking-[0.2em] mb-2"
                  style={{ color: C.gold, fontFamily: "'Cinzel', serif" }}>
                  {svc.wardName}
                </p>
              )}
              <p
                className="leading-snug mb-1"
                style={{
                  fontFamily: "'Dancing Script', cursive",
                  fontSize: "clamp(1.4rem, 5vw, 1.9rem)",
                  color: C.ink,
                }}
              >
                {joinNames(svc.candidateNames)}
              </p>
              <p className="text-xs capitalize mb-5" style={{ color: C.inkLight }}>
                {formatDateLong(svc.serviceAt)}
              </p>

              {/* CTA button */}
              <button
                onClick={() => navigate(`/bautismo/${svc.slug}`)}
                className="w-full py-3 rounded-xl font-semibold text-sm tracking-wide text-white transition-opacity hover:opacity-90 active:opacity-80"
                style={{
                  background: `linear-gradient(135deg, ${C.teal} 0%, ${C.tealDark} 100%)`,
                  fontFamily: "'Cinzel', serif",
                  letterSpacing: "0.1em",
                }}
              >
                Ver programa
              </button>
            </div>
          </div>
        ) : (
          /* ── Empty state ── */
          <div className="flex flex-col items-center gap-5 py-10 text-center">
            <img src="/thelambofgod.png" alt="" className="w-40 opacity-60" />
            <div>
              <p className="font-semibold mb-1" style={{ color: C.tealDark, fontFamily: "'Cinzel', serif", fontSize: "0.85rem", letterSpacing: "0.08em" }}>
                Sin servicios hoy
              </p>
              <p className="text-sm leading-relaxed" style={{ color: C.inkLight }}>
                No hay servicios bautismales<br />programados para hoy.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 mb-8 flex flex-col items-center gap-1">
        <div className="h-px w-16" style={{ background: C.gold, opacity: 0.4 }} />
        <p className="text-xs tracking-[0.12em] mt-2" style={{ color: C.inkLight, fontFamily: "'Cinzel', serif" }}>
          {svc?.wardName ?? ""}
        </p>
      </div>
    </main>
  );
}

function themeImage(theme: BaptismTheme): string {
  const map: Record<BaptismTheme, string> = {
    nino:          "covenantspathboy.png",
    nina:          "covenantspathgirl.png",
    joven_varon:   "covenanthspathhim.png",
    joven_mujer:   "covenantspathher.png",
    adulto:        "covenantspath.png",
    adulta:        "theshepherd.png",
    multi_kids:    "covenantspathkids.png",
    multi_family:  "covenantspathfamily.png",
    multi_adults:  "covenantspath.png",
    fallback:      "theshepherd.png",
  };
  return map[theme] ?? "theshepherd.png";
}
