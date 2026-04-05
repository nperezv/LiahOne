import { useState, useRef, useCallback, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, ChevronLeft, ChevronRight, Heart, Send } from "lucide-react";

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  cream:     "#f7f4ed",
  creamDark: "#ede9df",
  teal:      "#4a7c7e",
  tealDark:  "#2d5e60",
  sage:      "#7a9e8c",
  ink:       "#2c3e35",
  inkLight:  "#5a6e65",
  gold:      "#b8955a",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type BaptismTheme = "nino" | "nina" | "joven_varon" | "joven_mujer" | "adulto" | "adulta" | "multi_kids" | "multi_family" | "multi_adults" | "fallback";
type Candidate = { nombre: string };
type ProgramItem = {
  type: string; title: string | null; order: number;
  hymn: { number: number | null; title: string | null; externalUrl: string | null } | null;
};
type Post = { id: string; displayName: string; message: string };
type ServiceData = {
  program: ProgramItem[]; posts: Post[]; expiresAtMadrid: string;
  candidates: Candidate[]; serviceAt: string | null; wardName: string | null;
  theme?: BaptismTheme;
  unavailable?: "not_approved" | "outside_window" | "pending_logistics";
};

// ── Theme config ──────────────────────────────────────────────────────────────
type DecoType = "sage" | "rose" | "blue_soft" | "lavender" | "geometric" | "warm";

const THEME_CONFIG: Record<BaptismTheme, {
  image: string; accent: string; accentDark: string; titleColor: string; deco: DecoType;
}> = {
  nino:         { image: "/covenantspathboy.png",    accent: "#6ba3c8", accentDark: "#3d7aa8", titleColor: "#3d6080", deco: "blue_soft" },
  nina:         { image: "/covenantspathgirl.png",   accent: "#c47a8a", accentDark: "#9a4e62", titleColor: "#8a3e55", deco: "rose" },
  joven_varon:  { image: "/covenanthspathhim.png",   accent: "#6a9c7e", accentDark: "#3d7060", titleColor: "#2d5e60", deco: "sage" },
  joven_mujer:  { image: "/covenantspathher.png",    accent: "#9b7ec8", accentDark: "#7358a8", titleColor: "#5a3a90", deco: "lavender" },
  adulto:       { image: "/covenantspath.png",       accent: "#4a7c7e", accentDark: "#2d5e60", titleColor: "#2d5e60", deco: "geometric" },
  adulta:       { image: "/theshepherd.png",         accent: "#b8955a", accentDark: "#8a6e3a", titleColor: "#4a7c7e", deco: "warm" },
  multi_kids:   { image: "/covenantspathkids.png",   accent: "#6a9c7e", accentDark: "#3d7060", titleColor: "#2d5e60", deco: "sage" },
  multi_family: { image: "/covenantspathfamily.png", accent: "#4a7c7e", accentDark: "#2d5e60", titleColor: "#2d5e60", deco: "sage" },
  multi_adults: { image: "/covenantspath.png",       accent: "#4a7c7e", accentDark: "#2d5e60", titleColor: "#2d5e60", deco: "sage" },
  fallback:     { image: "/theshepherd.png",         accent: "#4a7c7e", accentDark: "#2d5e60", titleColor: "#2d5e60", deco: "sage" },
};

// ── Program labels ────────────────────────────────────────────────────────────

const PROGRAM_LABELS: Record<string, string> = {
  // Current DB types
  preside:                 "Preside",
  dirige:                  "Dirige",
  dirige_musica:           "Dirección de la música",
  acompanamiento_piano:    "Acomp. Piano",
  primer_himno:            "Himno inicial",
  oracion_apertura:        "Oración",
  primer_mensaje:          "Primer mensaje",
  numero_especial:         "Número especial",
  segundo_mensaje:         "Segundo mensaje",
  ultimo_himno:            "Himno final",
  ultima_oracion:          "Oración de cierre",
  ordenanza_bautismo:      "Oficia el bautismo",
  ordenanza_confirmacion:  "Oficia la confirmación",
  testigos:                "Testigos",
  interludio:              "Interludio",
  // Legacy keys
  oracion_cierre:          "Oración de cierre",
  himno_apertura:          "Himno inicial",
  himno_cierre:            "Himno final",
  discurso:                "Discurso",
  bautismo:                "Oficia el bautismo",
  confirmacion:            "Oficia la confirmación",
  musica_especial:         "Número especial",
  presentacion:            "Presentación",
  himno:                   "Himno",
  otro:                    "Otro",
};

// Types that belong inside the "Realización de la ordenanza" section
const ORDINANCE_TYPES = new Set([
  "ordenanza_bautismo", "ordenanza_confirmacion",
  "bautismo", "confirmacion",
  "testigos", "interludio",
]);

// Canonical display order for program types.
// Items of the same type keep their relative DB order among themselves.
const TYPE_DISPLAY_ORDER: Record<string, number> = {
  preside:                0,
  dirige:                 1,
  dirige_musica:          2,
  acompanamiento_piano:   3,
  primer_himno:           4,
  himno_apertura:         4,
  oracion_apertura:       5,
  primer_mensaje:         6,
  numero_especial:        7,
  segundo_mensaje:        8,
  // ── ordenanza section ──
  ordenanza_bautismo:     9,
  bautismo:               9,
  testigos:              10,
  interludio:            11,
  ordenanza_confirmacion:12,
  confirmacion:          12,
  // ── post-ordinance ──
  ultimo_himno:          13,
  himno_cierre:          13,
  ultima_oracion:        14,
  oracion_cierre:        14,
};

function sortItems(items: ProgramItem[]): ProgramItem[] {
  return [...items].sort((a, b) => {
    const oa = TYPE_DISPLAY_ORDER[a.type] ?? 50;
    const ob = TYPE_DISPLAY_ORDER[b.type] ?? 50;
    if (oa !== ob) return oa - ob;
    return a.order - b.order; // tie-break by DB order
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDateParts(iso: string | null): { month: string; day: string; year: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const month = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" }).format(d).toUpperCase();
  const day = String(d.getUTCDate()).padStart(2, "0");
  const year = String(d.getUTCFullYear());
  return { month, day, year };
}

function joinNames(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

// ── SVG decorations ───────────────────────────────────────────────────────────

// ── Theme decorations (top-right corner of cover) ────────────────────────────

function DecoSage({ size = 160 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none">
      <path d="M155,5 Q120,40 85,75 Q65,95 40,120 Q20,140 5,155" stroke="#7a9e8c" strokeWidth="1.2" strokeOpacity="0.45" fill="none" />
      <path d="M145,15 Q115,35 120,55 Q100,35 145,15Z" fill="#7a9e8c" fillOpacity="0.28" />
      <path d="M125,35 Q95,55 102,74 Q82,54 125,35Z" fill="#5a8270" fillOpacity="0.26" />
      <path d="M105,58 Q76,76 84,94 Q65,74 105,58Z" fill="#7a9e8c" fillOpacity="0.30" />
      <path d="M82,82 Q55,98 64,114 Q46,95 82,82Z" fill="#5a8270" fillOpacity="0.25" />
      <path d="M60,108 Q36,122 44,136 Q28,118 60,108Z" fill="#7a9e8c" fillOpacity="0.22" />
      <circle cx="138" cy="28" r="2.2" fill="#b8955a" fillOpacity="0.38" />
      <circle cx="128" cy="38" r="1.5" fill="#b8955a" fillOpacity="0.30" />
    </svg>
  );
}

function DecoRose({ size = 160 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none">
      <path d="M155,5 Q110,50 70,90 Q45,115 15,148" stroke="#c47a8a" strokeWidth="1" strokeOpacity="0.35" fill="none" />
      <circle cx="148" cy="20" r="8" fill="#e8a0b0" fillOpacity="0.35" />
      <circle cx="140" cy="14" r="6" fill="#d47888" fillOpacity="0.30" />
      <circle cx="155" cy="28" r="5" fill="#e8a0b0" fillOpacity="0.28" />
      <circle cx="144" cy="26" r="4" fill="#c46878" fillOpacity="0.40" />
      <circle cx="115" cy="48" r="6" fill="#e8a0b0" fillOpacity="0.28" />
      <circle cx="110" cy="44" r="4" fill="#d47888" fillOpacity="0.25" />
      <path d="M130,30 Q112,42 118,56 Q100,42 130,30Z" fill="#8ab08a" fillOpacity="0.28" />
      <path d="M105,60 Q88,72 94,84 Q77,70 105,60Z" fill="#8ab08a" fillOpacity="0.25" />
      <path d="M78,88 Q62,98 68,110 Q52,97 78,88Z" fill="#8ab08a" fillOpacity="0.22" />
    </svg>
  );
}

function DecoBlueSoft({ size = 160 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none">
      <circle cx="138" cy="22" r="14" fill="#a8d0e8" fillOpacity="0.28" />
      <circle cx="152" cy="32" r="10" fill="#8abcd8" fillOpacity="0.22" />
      <circle cx="125" cy="18" r="9"  fill="#c0dff0" fillOpacity="0.25" />
      <circle cx="118" cy="44" r="12" fill="#a8d0e8" fillOpacity="0.22" />
      <circle cx="135" cy="50" r="8"  fill="#8abcd8" fillOpacity="0.18" />
      <circle cx="100" cy="62" r="10" fill="#c0dff0" fillOpacity="0.20" />
      <circle cx="145" cy="60" r="3"  fill="#6ba3c8" fillOpacity="0.30" />
      <circle cx="110" cy="80" r="3"  fill="#6ba3c8" fillOpacity="0.25" />
      <path d="M148,8 Q130,22 136,36 Q118,22 148,8Z"   fill="#90c0d8" fillOpacity="0.22" />
      <path d="M120,32 Q104,44 110,56 Q93,42 120,32Z"  fill="#90c0d8" fillOpacity="0.20" />
    </svg>
  );
}

function DecoLavender({ size = 160 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none">
      <path d="M155,5 Q115,45 80,80 Q55,105 20,145" stroke="#9b7ec8" strokeWidth="1" strokeOpacity="0.35" fill="none" />
      <path d="M142,18 Q118,36 124,54 Q104,36 142,18Z" fill="#c0a8e0" fillOpacity="0.28" />
      <path d="M120,40 Q96,58 104,74 Q85,56 120,40Z"   fill="#9b7ec8" fillOpacity="0.26" />
      <path d="M96,66  Q74,82 82,96  Q64,78 96,66Z"    fill="#c0a8e0" fillOpacity="0.24" />
      <path d="M70,92  Q50,106 58,118 Q41,102 70,92Z"  fill="#9b7ec8" fillOpacity="0.20" />
      <circle cx="148" cy="24" r="5"   fill="#d4b8f0" fillOpacity="0.38" />
      <circle cx="138" cy="16" r="3.5" fill="#c0a8e0" fillOpacity="0.32" />
    </svg>
  );
}

function DecoGeometric({ size = 160 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none">
      <path d="M130,10 L155,52 L130,94 L80,94 L55,52 L80,10Z"  stroke="#4a7c7e" strokeWidth="0.8" strokeOpacity="0.25" fill="none" />
      <path d="M145,20 L160,46 L145,72 L115,72 L100,46 L115,20Z" stroke="#4a7c7e" strokeWidth="0.6" strokeOpacity="0.18" fill="none" />
      <line x1="155" y1="0"  x2="90"  y2="65"  stroke="#4a7c7e" strokeWidth="0.7" strokeOpacity="0.15" />
      <line x1="160" y1="20" x2="105" y2="75"  stroke="#4a7c7e" strokeWidth="0.5" strokeOpacity="0.12" />
      <circle cx="148" cy="18" r="2.5" fill="#b8955a" fillOpacity="0.45" />
      <circle cx="155" cy="40" r="2"   fill="#b8955a" fillOpacity="0.35" />
      <circle cx="138" cy="8"  r="1.8" fill="#b8955a" fillOpacity="0.30" />
    </svg>
  );
}

function DecoWarm({ size = 160 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" fill="none">
      <path d="M155,5 Q118,42 82,78 Q58,102 22,148" stroke="#b8955a" strokeWidth="1" strokeOpacity="0.35" fill="none" />
      <path d="M145,15 Q118,32 124,50 Q105,32 145,15Z" fill="#c4a06a" fillOpacity="0.28" />
      <path d="M122,38 Q97,54 104,70 Q85,54 122,38Z"  fill="#9a7a4a" fillOpacity="0.26" />
      <path d="M100,62 Q76,76 84,90 Q66,74 100,62Z"   fill="#c4a06a" fillOpacity="0.24" />
      <path d="M76,88  Q54,100 62,112 Q45,98 76,88Z"  fill="#9a7a4a" fillOpacity="0.20" />
      <circle cx="150" cy="22" r="3.5" fill="#d4aa72" fillOpacity="0.50" />
      <circle cx="140" cy="14" r="2.5" fill="#d4aa72" fillOpacity="0.40" />
    </svg>
  );
}

function ThemeDeco({ deco, size = 160 }: { deco: DecoType; size?: number }) {
  if (deco === "rose")      return <DecoRose size={size} />;
  if (deco === "blue_soft") return <DecoBlueSoft size={size} />;
  if (deco === "lavender")  return <DecoLavender size={size} />;
  if (deco === "geometric") return <DecoGeometric size={size} />;
  if (deco === "warm")      return <DecoWarm size={size} />;
  return <DecoSage size={size} />;
}

// ── Cover page ────────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: ServiceData }) {
  const theme = data.theme ?? "fallback";
  const tc = THEME_CONFIG[theme];
  const names = data.candidates.map((c) => c.nombre);
  const dateParts = parseDateParts(data.serviceAt);

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{ minHeight: "100dvh", background: "#ffffff", fontFamily: "'EB Garamond', Georgia, serif" }}
    >
      {/* Theme decoration — top-right */}
      <div className="absolute top-0 right-0 pointer-events-none" style={{ zIndex: 1 }}>
        <ThemeDeco deco={tc.deco} size={190} />
      </div>

      {/* Christ image — full-page ghost watermark */}
      <div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        style={{ zIndex: 2 }}
      >
        <img
          src={tc.image}
          alt=""
          style={{
            width: "82%",
            maxWidth: 340,
            objectFit: "contain",
            opacity: 0.18,
            mixBlendMode: "multiply",
            display: "block",
          }}
        />
      </div>

      {/* Content — vertically centered */}
      <div
        className="relative flex flex-col justify-center px-7"
        style={{ zIndex: 3, minHeight: "100dvh", paddingTop: "12%" }}
      >
        {/* Date: ENERO | 06 | 2024 — centered */}
        {dateParts && (
          <div className="flex items-center justify-center mb-3">
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.58rem",
                           letterSpacing: "0.22em", color: tc.accentDark, textTransform: "uppercase" }}>
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
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: "0.58rem",
                           letterSpacing: "0.22em", color: tc.accentDark, textTransform: "uppercase" }}>
              {dateParts.year}
            </span>
          </div>
        )}

        {/* "Mi Bautismo" — bloque centrado, "Mi" alineado al borde izq de "Bautismo" */}
        <div className="flex justify-center mb-5">
          <div className="flex flex-col items-start">
            <h1 style={{
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: "clamp(2rem, 10vw, 2.8rem)",
              fontWeight: 700, lineHeight: 0.88,
              color: tc.titleColor, margin: 0,
            }}>
              Mi
            </h1>
            <h1 style={{
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: "clamp(1.7rem, 8.5vw, 2.4rem)",
              fontWeight: 700, lineHeight: 0.92,
              color: tc.titleColor, margin: 0,
            }}>
              Bautismo
            </h1>
          </div>
        </div>

        {/* Names — centered, one per line */}
        <div className="flex flex-col items-center">
          {names.length > 0 ? names.map((name, i) => (
            <p key={i} style={{
              fontFamily: "'Dancing Script', cursive",
              fontSize: "clamp(1.5rem, 6.5vw, 2.2rem)",
              color: C.ink, lineHeight: 1.3, margin: 0,
            }}>
              {name}
            </p>
          )) : (
            <p style={{
              fontFamily: "'Dancing Script', cursive",
              fontSize: "clamp(1.5rem, 6.5vw, 2.2rem)",
              color: C.ink, lineHeight: 1.3, margin: 0,
            }}>
              Programa bautismal
            </p>
          )}
        </div>
      </div>

      {/* Tap hint */}
      <div
        className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none"
        style={{ zIndex: 4 }}
      >
        <p style={{ fontFamily: "'Cinzel', serif", fontSize: "0.72rem",
                    letterSpacing: "0.18em", textTransform: "uppercase",
                    color: tc.accent, opacity: 0.85 }}>
          Toca para abrir
        </p>
        <ChevronRight size={16} style={{ color: tc.accent, opacity: 0.75 }} />
      </div>
    </div>
  );
}

function OrdinanceOpenDivider() {
  return (
    <div className="flex items-center gap-2 my-5">
      <div className="flex-1 border-t" style={{ borderColor: C.inkLight, opacity: 0.25 }} />
      <span
        className="shrink-0 text-center"
        style={{
          fontFamily: "'Cinzel', serif",
          fontSize: "0.7rem",
          letterSpacing: "0.18em",
          color: C.teal,
          textTransform: "uppercase",
        }}
      >
        Realización de la ordenanza
      </span>
      <div className="flex-1 border-t" style={{ borderColor: C.inkLight, opacity: 0.25 }} />
    </div>
  );
}

function OrdinanceCloseDivider() {
  return (
    <div className="my-5">
      <div className="border-t" style={{ borderColor: C.inkLight, opacity: 0.2 }} />
    </div>
  );
}

// ── Program page ──────────────────────────────────────────────────────────────

function ProgramPage({ data }: { data: ServiceData }) {
  const items = sortItems(data.program);
  const names = data.candidates.map((c) => c.nombre);
  const dateParts = parseDateParts(data.serviceAt);

  // Split: pre-ordinance | ordinance | post-ordinance
  const firstOrdIdx = items.findIndex((i) => ORDINANCE_TYPES.has(i.type));
  const lastOrdIdx = [...items].map((i, idx) => ORDINANCE_TYPES.has(i.type) ? idx : -1).filter((x) => x >= 0).at(-1) ?? -1;

  // Format "a 06 de enero de 2024"
  const dateStr = dateParts
    ? `a ${parseInt(dateParts.day, 10)} de ${dateParts.month.toLowerCase()} de ${dateParts.year}`
    : null;

  function renderItem(item: ProgramItem, idx: number) {
    const label = PROGRAM_LABELS[item.type] ?? item.type;
    const isOrd = ORDINANCE_TYPES.has(item.type);

    return (
      <div key={idx}>
        {/* Opening ordinance divider */}
        {idx === firstOrdIdx && firstOrdIdx > 0 && <OrdinanceOpenDivider />}

        <div className="flex items-baseline gap-2 py-1.5">
          <span
            className="shrink-0 uppercase font-semibold"
            style={{
              color: isOrd ? C.teal : C.inkLight,
              fontFamily: "'Cinzel', serif",
              fontSize: "0.65rem",
              letterSpacing: "0.1em",
            }}
          >
            {label}:
          </span>
          <span className="text-sm" style={{ color: C.ink, fontFamily: "'EB Garamond', serif" }}>
            {item.hymn
              ? `#${item.hymn.number}${item.hymn.title ? `, ${item.hymn.title}` : ""}`
              : (item.title || "—")}
          </span>
        </div>

        {/* Closing ordinance divider */}
        {idx === lastOrdIdx && lastOrdIdx < items.length - 1 && <OrdinanceCloseDivider />}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen overflow-y-auto pb-24"
      style={{ background: C.cream, fontFamily: "'EB Garamond', Georgia, serif" }}
    >
      {/* Header */}
      <div
        className="px-6 pt-10 pb-5 text-center border-b"
        style={{ borderColor: C.creamDark }}
      >
        <p
          className="uppercase font-semibold"
          style={{ color: C.teal, fontFamily: "'Cinzel', serif", fontSize: "0.65rem", letterSpacing: "0.2em" }}
        >
          Programa de Servicio Bautismal
        </p>
        {names.length > 0 && dateStr && (
          <p className="mt-1.5 text-xs italic" style={{ color: C.inkLight }}>
            De {joinNames(names)}, realizado en {data.wardName ?? "la congregación"}, {dateStr}
          </p>
        )}
        {data.wardName && (
          <p className="mt-0.5 text-xs" style={{ color: C.inkLight }}>
            {data.wardName}
          </p>
        )}
      </div>

      {/* Items */}
      <div className="px-6 pt-4 max-w-sm mx-auto">
        {items.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: C.inkLight }}>
            El programa no está disponible aún.
          </p>
        ) : (
          items.map((item, i) => renderItem(item, i))
        )}
      </div>
    </div>
  );
}

// ── Hymns page ────────────────────────────────────────────────────────────────

function HymnsPage({ data }: { data: ServiceData }) {
  const hymnItems = sortItems(data.program).filter((i) => i.hymn);

  return (
    <div
      className="min-h-screen overflow-y-auto pb-24"
      style={{ background: C.cream, fontFamily: "'EB Garamond', Georgia, serif" }}
    >
      {/* Header */}
      <div
        className="px-6 pt-10 pb-6 text-center border-b"
        style={{ borderColor: C.creamDark }}
      >
        <p
          className="text-xs tracking-[0.22em] uppercase font-semibold"
          style={{ color: C.teal, fontFamily: "'Cinzel', serif" }}
        >
          Himnos del Servicio Bautismal
        </p>
      </div>

      <div className="px-6 pt-6 max-w-sm mx-auto space-y-5">
        {hymnItems.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: C.inkLight }}>
            No hay himnos en el programa.
          </p>
        ) : (
          hymnItems.map((item, i) => (
            <div key={i} className="border-b pb-5" style={{ borderColor: C.creamDark }}>
              <p
                className="text-xs tracking-[0.12em] uppercase font-semibold mb-1"
                style={{ color: C.teal, fontFamily: "'Cinzel', serif" }}
              >
                {PROGRAM_LABELS[item.type] ?? item.type}
              </p>
              <p className="font-semibold text-base" style={{ color: C.ink }}>
                #{item.hymn!.number}{item.hymn!.title ? ` · ${item.hymn!.title}` : ""}
              </p>
              {item.hymn!.externalUrl && (
                <a
                  href={item.hymn!.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={{ background: C.teal, color: "#fff" }}
                >
                  <Music size={12} />
                  Abrir himno
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
          ))
        )}
        <p className="text-xs text-center pt-2 leading-relaxed" style={{ color: C.inkLight }}>
          Los himnos enlazan a la página oficial de La Iglesia de Jesucristo.
        </p>
      </div>
    </div>
  );
}

// ── Greetings page ────────────────────────────────────────────────────────────

function GreetingsPage({
  data, slug, code, isCatalog,
}: { data: ServiceData; slug: string; code: string; isCatalog: boolean }) {
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");

  function rid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

  const post = useMutation({
    mutationFn: async () => {
      const endpoint = `/api/bautismo/${slug}/posts`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, displayName, message, clientRequestId: rid(), company: "" }),
      });
      if (!res.ok) throw new Error("No se pudo enviar");
      return res.json();
    },
    onSuccess: () => {
      setMessage("");
      setDisplayName("");
      alert("Tu felicitación quedó pendiente de moderación. ¡Gracias!");
    },
  });

  return (
    <div
      className="min-h-screen overflow-y-auto pb-24"
      style={{ background: C.cream, fontFamily: "'EB Garamond', Georgia, serif" }}
    >
      {/* Header */}
      <div
        className="px-6 pt-10 pb-6 text-center border-b"
        style={{ borderColor: C.creamDark }}
      >
        <p
          className="text-xs tracking-[0.22em] uppercase font-semibold"
          style={{ color: C.teal, fontFamily: "'Cinzel', serif" }}
        >
          Felicitaciones
        </p>
      </div>

      <div className="px-6 pt-6 max-w-sm mx-auto space-y-6">
        {/* Send form */}
        <div className="space-y-3">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Tu nombre (opcional)"
            maxLength={40}
            className="border-gray-300 bg-white/70"
          />
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe un mensaje de felicitación..."
            maxLength={240}
            className="border-gray-300 bg-white/70 resize-none min-h-[80px]"
          />
          <Button
            onClick={() => post.mutate()}
            disabled={!message.trim() || post.isPending}
            className="w-full text-white font-medium"
            style={{ background: C.teal }}
          >
            <Send size={14} className="mr-2" />
            {post.isPending ? "Enviando..." : "Enviar felicitación"}
          </Button>
        </div>

        {/* Received greetings */}
        {data.posts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Heart size={13} style={{ color: C.teal }} />
              <p className="text-sm font-semibold" style={{ color: C.ink }}>Recibidas</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {data.posts.map((p) => (
                <div key={p.id} className="bg-white/60 rounded-xl p-3 border" style={{ borderColor: C.creamDark }}>
                  {p.displayName && (
                    <p className="font-semibold text-xs mb-1 truncate" style={{ color: C.ink }}>{p.displayName}</p>
                  )}
                  <p className="text-xs leading-relaxed line-clamp-4" style={{ color: C.inkLight }}>{p.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.posts.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: C.inkLight }}>
            Aún no hay felicitaciones. ¡Sé el primero!
          </p>
        )}
      </div>
    </div>
  );
}

// ── Diptych viewer ────────────────────────────────────────────────────────────

const PAGES = ["cover", "program", "hymns", "greetings"] as const;
type PageId = typeof PAGES[number];

function DiptychViewer({ data, slug, code, isCatalog }: { data: ServiceData; slug: string; code: string; isCatalog: boolean }) {
  const hasHymns = data.program.some((i) => i.hymn);
  const visiblePages: PageId[] = ["cover", "program", ...(hasHymns ? ["hymns" as PageId] : []), "greetings"];

  const [pageIdx, setPageIdx] = useState(0);
  const [anim, setAnim] = useState<"" | "out" | "in" | "out-back" | "in-back">("");
  const [displayIdx, setDisplayIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const navigate = useCallback((dir: "next" | "prev") => {
    if (anim) return;
    if (dir === "next" && pageIdx >= visiblePages.length - 1) return;
    if (dir === "prev" && pageIdx === 0) return;
    const fwd = dir === "next";
    setAnim(fwd ? "out" : "out-back");
    setTimeout(() => {
      setDisplayIdx((i) => i + (fwd ? 1 : -1));
      setPageIdx((i) => i + (fwd ? 1 : -1));
      setAnim(fwd ? "in" : "in-back");
      setTimeout(() => setAnim(""), 300);
    }, 280);
  }, [anim, pageIdx, visiblePages.length]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 50) navigate(dx < 0 ? "next" : "prev");
  };

  const animClass = anim === "out" ? "diptico-out"
    : anim === "in" ? "diptico-in"
    : anim === "out-back" ? "diptico-out-back"
    : anim === "in-back" ? "diptico-in-back"
    : "";

  const currentPage = visiblePages[displayIdx];
  const PAGE_LABELS: Record<PageId, string> = {
    cover: "Portada", program: "Programa", hymns: "Himnos", greetings: "Felicitaciones",
  };

  return (
    <div
      className="relative overflow-hidden"
      style={{ minHeight: "100dvh", touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Page content */}
      <div
        key={displayIdx}
        className={animClass}
        style={{
          willChange: "transform, opacity",
          boxShadow: anim ? "4px 0 24px rgba(0,0,0,0.12), -4px 0 24px rgba(0,0,0,0.08)" : undefined,
        }}
        onClick={() => { if (currentPage === "cover") navigate("next"); }}
      >
        {currentPage === "cover"     && <CoverPage data={data} />}
        {currentPage === "program"   && <ProgramPage data={data} />}
        {currentPage === "hymns"     && <HymnsPage data={data} />}
        {currentPage === "greetings" && <GreetingsPage data={data} slug={slug} code={code} isCatalog={isCatalog} />}
      </div>

      {/* Navigation bar */}
      {displayIdx > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-50"
          style={{
            background: "rgba(247,244,237,0.92)",
            backdropFilter: "blur(8px)",
            borderTop: `1px solid ${C.creamDark}`,
          }}
        >
          <button
            onClick={() => navigate("prev")}
            disabled={pageIdx === 0}
            className="p-2 rounded-full disabled:opacity-25"
            style={{ color: C.teal }}
          >
            <ChevronLeft size={22} />
          </button>

          {/* Page dots with label */}
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs" style={{ color: C.inkLight, fontFamily: "'Cinzel', serif", letterSpacing: "0.1em" }}>
              {PAGE_LABELS[currentPage]}
            </p>
            <div className="flex items-center gap-1.5">
              {visiblePages.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === pageIdx ? 18 : 5,
                    height: 5,
                    background: i === pageIdx ? C.teal : C.creamDark,
                  }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() => navigate("next")}
            disabled={pageIdx >= visiblePages.length - 1}
            className="p-2 rounded-full disabled:opacity-25"
            style={{ color: C.teal }}
          >
            <ChevronRight size={22} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Loading / error states ────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <main
      className="flex items-center justify-center min-h-screen"
      style={{ background: C.cream }}
    >
      <div className="flex flex-col items-center gap-4">
        <DecoSage size={70} />
        <p className="text-sm" style={{ color: C.inkLight, fontFamily: "'EB Garamond', serif" }}>
          Cargando programa...
        </p>
      </div>
    </main>
  );
}

function UnavailableScreen({ title, body }: { title: string; body: string }) {
  return (
    <main
      className="flex items-center justify-center min-h-screen px-8 text-center"
      style={{ background: C.cream }}
    >
      <div className="flex flex-col items-center gap-4 max-w-xs">
        <div className="opacity-30">
          <DecoSage size={90} />
        </div>
        <p
          className="font-semibold tracking-wide"
          style={{ color: C.tealDark, fontFamily: "'Cinzel', serif" }}
        >
          {title}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: C.inkLight, fontFamily: "'EB Garamond', serif" }}>
          {body}
        </p>
      </div>
    </main>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function BaptismPublicPage() {
  // Prevent search engines from indexing public baptism program pages
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const [, paramsBautismo] = useRoute("/bautismo/:slug");
  const slug = paramsBautismo?.slug || "";
  const isCatalog = true;
  const code = "";
  const queryKey = `/api/bautismo/${slug}`;

  const { data, isError, isLoading } = useQuery<ServiceData>({
    queryKey: [queryKey],
    enabled: isCatalog ? Boolean(slug) : Boolean(slug && code),
  });

  if (isLoading) return <LoadingScreen />;

  if (isError || !data) {
    return <UnavailableScreen title="Enlace caducado" body="Este programa ya no está disponible." />;
  }

  if (data.unavailable) {
    const msgs: Record<string, { title: string; body: string }> = {
      pending_logistics: {
        title: "Preparación en curso",
        body: "El programa estará disponible en breve.",
      },
      outside_window: {
        title: "Programa no disponible",
        body: "El programa bautismal solo está disponible el día del servicio.",
      },
      not_approved: {
        title: "Programa no disponible",
        body: "El programa aún no ha sido aprobado.",
      },
    };
    const msg = msgs[data.unavailable] ?? { title: "No disponible", body: "" };
    return <UnavailableScreen title={msg.title} body={msg.body} />;
  }

  return <DiptychViewer data={data} slug={slug} code={code} isCatalog={isCatalog} />;
}
