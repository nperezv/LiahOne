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
  tealLight: "#6a9c9e",
  sage:      "#7a9e8c",
  sageMid:   "#5a8270",
  ink:       "#2c3e35",
  inkLight:  "#5a6e65",
  gold:      "#b8955a",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Candidate = { nombre: string };
type ProgramItem = {
  type: string; title: string | null; order: number;
  hymn: { number: number | null; title: string | null; externalUrl: string | null } | null;
};
type Post = { id: string; displayName: string; message: string };
type ServiceData = {
  program: ProgramItem[]; posts: Post[]; expiresAtMadrid: string;
  candidates: Candidate[]; serviceAt: string | null; wardName: string | null;
  unavailable?: "not_approved" | "outside_window" | "pending_logistics";
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

function BotanicalCorner({
  pos = "tl", size = 140, opacity = 1,
}: { pos?: "tl" | "tr" | "bl" | "br"; size?: number; opacity?: number }) {
  const sx = pos === "tr" || pos === "br" ? -1 : 1;
  const sy = pos === "bl" || pos === "br" ? -1 : 1;

  return (
    <svg
      width={size} height={size} viewBox="0 0 140 140" fill="none"
      style={{ opacity, transform: `scale(${sx},${sy})`, transformOrigin: "center" }}
    >
      {/* main stem */}
      <path d="M8,132 Q38,90 78,52 Q95,34 115,18" stroke={C.sageMid} strokeWidth="1.2" strokeOpacity="0.55" fill="none" />
      {/* secondary stem */}
      <path d="M8,132 Q28,100 55,85" stroke={C.sageMid} strokeWidth="0.9" strokeOpacity="0.4" fill="none" />
      {/* leaf 1 big */}
      <path d="M18,118 Q42,95 55,105 Q36,88 18,118Z" fill={C.sage} fillOpacity="0.30" />
      {/* leaf 2 */}
      <path d="M35,100 Q58,78 68,90 Q52,73 35,100Z" fill={C.sageMid} fillOpacity="0.28" />
      {/* leaf 3 */}
      <path d="M54,80 Q75,60 84,72 Q70,56 54,80Z" fill={C.sage} fillOpacity="0.32" />
      {/* leaf 4 */}
      <path d="M72,60 Q90,42 98,54 Q86,39 72,60Z" fill={C.sageMid} fillOpacity="0.27" />
      {/* leaf 5 small top */}
      <path d="M90,42 Q104,28 110,38 Q100,25 90,42Z" fill={C.sage} fillOpacity="0.22" />
      {/* side sprig 1 */}
      <path d="M38,98 Q48,82 60,84 Q46,76 38,98Z" fill={C.teal} fillOpacity="0.14" />
      {/* side sprig 2 */}
      <path d="M22,112 Q32,95 48,100 Q34,90 22,112Z" fill={C.teal} fillOpacity="0.12" />
      {/* berry dots */}
      <circle cx="60" cy="112" r="2.5" fill={C.sage} fillOpacity="0.35" />
      <circle cx="68" cy="118" r="1.8" fill={C.sage} fillOpacity="0.28" />
      <circle cx="55" cy="120" r="1.5" fill={C.sageMid} fillOpacity="0.3" />
    </svg>
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
          fontSize: "0.55rem",
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

function WatermarkCross() {
  return (
    <svg width="80" height="96" viewBox="0 0 80 96" fill="none" style={{ opacity: 0.08 }}>
      <rect x="33" y="0" width="14" height="96" rx="7" fill={C.tealDark} />
      <rect x="0" y="22" width="80" height="14" rx="7" fill={C.tealDark} />
    </svg>
  );
}

// ── Cover page ────────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: ServiceData }) {
  const names = data.candidates.map((c) => c.nombre);
  const dateParts = parseDateParts(data.serviceAt);

  return (
    <div
      className="relative flex flex-col items-center overflow-hidden select-none"
      style={{
        minHeight: "100dvh",
        background: C.cream,
        fontFamily: "'EB Garamond', Georgia, serif",
      }}
    >
      {/* Top botanical corners */}
      <div className="absolute top-0 left-0 pointer-events-none">
        <BotanicalCorner pos="tl" size={150} opacity={0.85} />
      </div>
      <div className="absolute top-0 right-0 pointer-events-none">
        <BotanicalCorner pos="tr" size={150} opacity={0.85} />
      </div>

      {/* Ward name at very top */}
      <div className="relative z-10 mt-8 px-6 text-center">
        <p
          className="tracking-[0.22em] uppercase text-xs font-medium"
          style={{ color: C.teal, fontFamily: "'Cinzel', Georgia, serif" }}
        >
          {data.wardName ?? "\u00a0"}
        </p>
      </div>

      {/* Cross watermark + main title block */}
      <div className="relative z-10 flex flex-col items-center mt-8 px-6 gap-3">
        <div className="absolute inset-0 flex items-center justify-center">
          <WatermarkCross />
        </div>
        <h1
          className="relative text-center font-bold leading-none tracking-wide"
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: "clamp(2rem, 8vw, 2.8rem)",
            color: C.tealDark,
            letterSpacing: "0.06em",
          }}
        >
          Mi Bautismo
        </h1>

        {/* Thin gold rule */}
        <div className="w-24 border-t" style={{ borderColor: C.gold, opacity: 0.6 }} />
      </div>

      {/* Candidate name(s) */}
      <div className="relative z-10 flex flex-col items-center mt-6 px-8 text-center gap-1">
        <p
          style={{
            fontFamily: "'Dancing Script', cursive",
            fontSize: "clamp(1.5rem, 6vw, 2.1rem)",
            color: C.ink,
            lineHeight: 1.3,
          }}
        >
          {joinNames(names) || "Programa bautismal"}
        </p>
      </div>

      {/* Date */}
      {dateParts && (
        <div className="relative z-10 flex items-center gap-3 mt-6">
          <span
            className="text-xs tracking-[0.18em] uppercase"
            style={{ color: C.inkLight, fontFamily: "'Cinzel', Georgia, serif" }}
          >
            {dateParts.month}
          </span>
          <span className="text-lg font-semibold" style={{ color: C.teal, fontFamily: "'Cinzel', serif" }}>
            {dateParts.day}
          </span>
          <span
            className="text-xs tracking-[0.18em]"
            style={{ color: C.inkLight, fontFamily: "'Cinzel', Georgia, serif" }}
          >
            {dateParts.year}
          </span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom botanical corners */}
      <div className="absolute bottom-0 left-0 pointer-events-none">
        <BotanicalCorner pos="bl" size={150} opacity={0.75} />
      </div>
      <div className="absolute bottom-0 right-0 pointer-events-none">
        <BotanicalCorner pos="br" size={150} opacity={0.75} />
      </div>

      {/* Tap hint */}
      <div
        className="relative z-10 mb-8 flex flex-col items-center gap-1"
      >
        <p className="text-xs tracking-[0.15em] uppercase" style={{ color: C.tealLight }}>
          Toca para abrir
        </p>
        <ChevronRight size={16} style={{ color: C.tealLight }} />
      </div>
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
        <BotanicalCorner pos="tl" size={80} opacity={0.5} />
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
          <BotanicalCorner pos="tl" size={100} />
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
