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
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso));
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

// ── Divider ───────────────────────────────────────────────────────────────────
function GoldDivider() {
  return (
    <div className="flex items-center gap-3 w-full max-w-[200px]">
      <div className="h-px flex-1" style={{ background: C.gold, opacity: 0.45 }} />
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.gold, opacity: 0.5 }} />
      <div className="h-px flex-1" style={{ background: C.gold, opacity: 0.45 }} />
    </div>
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
    refetchInterval: 60_000,
  });

  const svc = data?.service ?? null;
  const plural = (svc?.candidateNames.length ?? 0) > 1;

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

      {/* Header eyebrow */}
      <div className="relative z-10 flex flex-col items-center pt-14 gap-2 px-6 text-center">
        <p
          className="uppercase tracking-[0.25em] text-xs font-semibold"
          style={{ color: C.gold, fontFamily: "'Cinzel', serif" }}
        >
          {svc?.wardName ?? "Servicio Bautismal"}
        </p>
        <GoldDivider />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full px-6 py-6 max-w-sm mx-auto gap-8">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <img src="/thelambofgod.png" alt="" className="w-28 opacity-30" />
            <p className="text-sm" style={{ color: C.inkLight }}>Buscando programa...</p>
          </div>
        ) : svc ? (
          <>
            {/* Hero: candidate name(s) */}
            <div className="flex flex-col items-center gap-2 text-center">
              <p
                className="leading-tight"
                style={{
                  fontFamily: "'Dancing Script', cursive",
                  fontSize: "clamp(2rem, 9vw, 2.8rem)",
                  color: C.ink,
                  lineHeight: 1.15,
                }}
              >
                {joinNames(svc.candidateNames)}
              </p>
              <p
                className="text-sm italic"
                style={{ color: C.inkLight }}
              >
                {plural ? "se bautizan hoy" : "se bautiza hoy"}
              </p>
              <p
                className="text-xs capitalize tracking-wide mt-1"
                style={{ color: C.gold, fontFamily: "'Cinzel', serif" }}
              >
                {formatDateLong(svc.serviceAt)}
              </p>
            </div>

            {/* Theme image — decorative */}
            <div
              className="relative w-40 h-40 flex items-center justify-center"
            >
              <img
                src={`/${themeImage(svc.theme)}`}
                alt=""
                className="w-full h-full object-contain"
                style={{ opacity: 0.88 }}
              />
            </div>

            {/* CTA */}
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
          </>
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
      <div className="relative z-10 mb-8 flex flex-col items-center gap-2">
        <GoldDivider />
        <p className="text-xs tracking-[0.15em] mt-1" style={{ color: C.inkLight, fontFamily: "'Cinzel', serif" }}>
          Programa Bautismal
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
