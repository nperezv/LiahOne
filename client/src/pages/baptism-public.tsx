import { useState, useRef, useCallback, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ExternalLink, Music, ChevronLeft, ChevronRight, Heart, Send } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

type Candidate = { nombre: string; sexo: string | null; fechaNacimiento: string | null };
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

// ── Theme engine ─────────────────────────────────────────────────────────────

type ThemeKey = "nino" | "nina" | "joven_varon" | "joven_mujer" | "adulto" | "adulta";

function calcAge(fn: string | null): number | null {
  if (!fn) return null;
  const b = new Date(fn.split(/[T ]/)[0] + "T12:00:00");
  if (isNaN(b.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}

function detectTheme(candidates: Candidate[]): ThemeKey {
  const c = candidates[0];
  if (!c) return "adulto";
  const age = calcAge(c.fechaNacimiento);
  const f = c.sexo === "F";
  if (age !== null && age < 12) return f ? "nina" : "nino";
  if (age !== null && age < 18) return f ? "joven_mujer" : "joven_varon";
  return f ? "adulta" : "adulto";
}

const THEMES: Record<ThemeKey, {
  coverFrom: string; coverTo: string; pageBg: string;
  accent: string; accentText: string; dotActive: string;
  titleFont: string; label: string;
}> = {
  nino: {
    coverFrom: "#38bdf8", coverTo: "#0ea5e9",
    pageBg: "linear-gradient(135deg,#e0f2fe 0%,#bae6fd 100%)",
    accent: "#0284c7", accentText: "#fff", dotActive: "#0284c7",
    titleFont: "'Outfit', sans-serif", label: "Mi Bautismo",
  },
  nina: {
    coverFrom: "#f472b6", coverTo: "#ec4899",
    pageBg: "linear-gradient(135deg,#fce7f3 0%,#fbcfe8 100%)",
    accent: "#db2777", accentText: "#fff", dotActive: "#db2777",
    titleFont: "'Outfit', sans-serif", label: "Mi Bautismo",
  },
  joven_varon: {
    coverFrom: "#14b8a6", coverTo: "#059669",
    pageBg: "linear-gradient(135deg,#f0fdf4 0%,#ccfbf1 100%)",
    accent: "#0d9488", accentText: "#fff", dotActive: "#0d9488",
    titleFont: "'Outfit', sans-serif", label: "Mi Bautismo",
  },
  joven_mujer: {
    coverFrom: "#a78bfa", coverTo: "#7c3aed",
    pageBg: "linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)",
    accent: "#7c3aed", accentText: "#fff", dotActive: "#7c3aed",
    titleFont: "'Outfit', sans-serif", label: "Mi Bautismo",
  },
  adulto: {
    coverFrom: "#475569", coverTo: "#1e3a5f",
    pageBg: "linear-gradient(135deg,#f1f5f9 0%,#dbeafe 100%)",
    accent: "#1e40af", accentText: "#fff", dotActive: "#1e40af",
    titleFont: "'Outfit', sans-serif", label: "Mi Bautismo",
  },
  adulta: {
    coverFrom: "#a855f7", coverTo: "#be185d",
    pageBg: "linear-gradient(135deg,#fdf4ff 0%,#fce7f3 100%)",
    accent: "#9333ea", accentText: "#fff", dotActive: "#9333ea",
    titleFont: "'Outfit', sans-serif", label: "Mi Bautismo",
  },
};

// ── SVG illustrations ─────────────────────────────────────────────────────────

function DoveIllustration({ color = "#fff", size = 80 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="42" rx="22" ry="14" fill={color} fillOpacity="0.18" />
      <path d="M40 18 C28 18 18 28 18 40 C18 52 28 62 40 62 C52 62 62 52 62 40 C62 28 52 18 40 18Z" fill={color} fillOpacity="0.08" />
      <path d="M38 38 C30 32 20 34 16 40 C14 44 18 50 24 48 L38 42Z" fill={color} fillOpacity="0.7" />
      <path d="M38 38 L54 26 C58 22 64 24 62 30 C60 34 54 36 48 36 L38 42Z" fill={color} fillOpacity="0.9" />
      <path d="M38 42 L34 52 C32 56 36 60 40 58 C44 56 44 50 42 46Z" fill={color} fillOpacity="0.75" />
      <circle cx="56" cy="27" r="2" fill={color} fillOpacity="0.5" />
      <path d="M20 36 L14 32" stroke={color} strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

function WaveDecoration({ color = "#fff" }: { color?: string }) {
  return (
    <svg viewBox="0 0 400 60" width="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <path d="M0,30 C60,50 120,10 180,30 C240,50 300,10 360,30 C380,36 392,40 400,38 L400,60 L0,60Z"
        fill={color} fillOpacity="0.15" />
      <path d="M0,40 C80,20 160,55 240,35 C300,20 360,45 400,30 L400,60 L0,60Z"
        fill={color} fillOpacity="0.1" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateEs(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(d);
}

function joinNames(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

const PROGRAM_LABELS: Record<string, string> = {
  oracion_apertura: "Oración de apertura",
  oracion_cierre: "Oración de cierre",
  himno_apertura: "Himno de apertura",
  himno_cierre: "Himno de cierre",
  discurso: "Discurso",
  bautismo: "Bautismo",
  confirmacion: "Confirmación",
  musica_especial: "Música especial",
  presentacion: "Presentación",
  himno: "Himno",
  otro: "Otro",
};

// ── Page components ───────────────────────────────────────────────────────────

function CoverPage({ data, theme }: { data: ServiceData; theme: ReturnType<typeof detectTheme> }) {
  const t = THEMES[theme];
  const names = data.candidates.map((c) => c.nombre);
  const dateStr = formatDateEs(data.serviceAt);

  return (
    <div
      className="relative flex flex-col items-center justify-between overflow-hidden select-none"
      style={{
        minHeight: "100dvh",
        background: `linear-gradient(160deg, ${t.coverFrom} 0%, ${t.coverTo} 100%)`,
        fontFamily: t.titleFont,
      }}
    >
      {/* Top decoration */}
      <div className="w-full pt-12 flex flex-col items-center gap-2 z-10 px-6">
        <div className="text-white/60 text-xs tracking-[0.2em] uppercase font-medium">
          {data.wardName ?? ""}
        </div>
        <DoveIllustration color="#fff" size={72} />
        <div className="text-white/80 text-sm tracking-[0.15em] uppercase font-medium mt-1">
          {t.label}
        </div>
      </div>

      {/* Center — names */}
      <div className="flex flex-col items-center gap-3 px-8 z-10 text-center">
        <h1
          className="text-white font-bold leading-tight"
          style={{ fontSize: names.length === 1 && names[0].length < 14 ? "2.4rem" : "1.8rem" }}
        >
          {joinNames(names) || "Programa bautismal"}
        </h1>
        {dateStr && (
          <p className="text-white/80 text-sm capitalize">{dateStr}</p>
        )}
      </div>

      {/* Bottom wave + hint */}
      <div className="w-full z-10">
        <WaveDecoration color="#fff" />
        <div
          className="pb-8 pt-2 flex flex-col items-center gap-1"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <div className="text-white/70 text-xs tracking-widest uppercase">Toca para abrir</div>
          <ChevronRight className="text-white/60" size={18} />
        </div>
      </div>
    </div>
  );
}

function ProgramPage({ data, theme }: { data: ServiceData; theme: ThemeKey }) {
  const t = THEMES[theme];
  const items = data.program;

  return (
    <div
      className="min-h-screen overflow-y-auto px-5 py-8"
      style={{ background: t.pageBg, fontFamily: t.titleFont }}
    >
      <div className="max-w-sm mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-1 h-6 rounded-full" style={{ background: t.accent }} />
          <h2 className="font-bold text-lg text-gray-800">Programa</h2>
        </div>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div
              key={i}
              className="bg-white/80 rounded-2xl px-4 py-3 shadow-sm flex items-start gap-3"
            >
              {item.hymn ? (
                <Music size={16} className="mt-0.5 shrink-0" style={{ color: t.accent }} />
              ) : (
                <div
                  className="w-4 h-4 rounded-full mt-0.5 shrink-0"
                  style={{ background: t.accent, opacity: 0.3 }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 uppercase tracking-wide leading-none mb-0.5">
                  {PROGRAM_LABELS[item.type] ?? item.type}
                </p>
                <p className="text-sm font-medium text-gray-800 truncate">
                  {item.title || "—"}
                </p>
                {item.hymn && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Himno #{item.hymn.number}{item.hymn.title ? ` · ${item.hymn.title}` : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">El programa no está disponible aún.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function HymnsPage({ data, theme }: { data: ServiceData; theme: ThemeKey }) {
  const t = THEMES[theme];
  const hymnItems = data.program.filter((i) => i.hymn);

  return (
    <div
      className="min-h-screen overflow-y-auto px-5 py-8"
      style={{ background: t.pageBg, fontFamily: t.titleFont }}
    >
      <div className="max-w-sm mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-1 h-6 rounded-full" style={{ background: t.accent }} />
          <h2 className="font-bold text-lg text-gray-800">Himnos</h2>
        </div>
        {hymnItems.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No hay himnos en el programa.</p>
        ) : (
          <div className="space-y-4">
            {hymnItems.map((item, i) => (
              <div key={i} className="bg-white/80 rounded-2xl px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                      {PROGRAM_LABELS[item.type] ?? item.type}
                    </p>
                    <p className="font-semibold text-gray-800">
                      #{item.hymn!.number}{item.hymn!.title ? ` · ${item.hymn!.title}` : ""}
                    </p>
                    {item.title && item.title !== item.hymn!.title && (
                      <p className="text-xs text-gray-500 mt-0.5">{item.title}</p>
                    )}
                  </div>
                  {item.hymn!.externalUrl && (
                    <a
                      href={item.hymn!.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl text-white"
                      style={{ background: t.accent }}
                    >
                      <Music size={13} />
                      Abrir himno
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400 text-center pt-2 leading-relaxed">
              Los himnos enlazan a la página oficial de La Iglesia de Jesucristo de los Santos de los Últimos Días.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function GreetingsPage({
  data, slug, code, isCatalog, theme,
}: {
  data: ServiceData; slug: string; code: string; isCatalog: boolean; theme: ThemeKey;
}) {
  const t = THEMES[theme];
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");

  function rid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

  const post = useMutation({
    mutationFn: async () => {
      const endpoint = isCatalog ? `/bautismo/${slug}/posts` : `/b/${slug}/posts`;
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
      className="min-h-screen overflow-y-auto px-5 py-8"
      style={{ background: t.pageBg, fontFamily: t.titleFont }}
    >
      <div className="max-w-sm mx-auto space-y-6">
        {/* Send greeting */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 rounded-full" style={{ background: t.accent }} />
            <h2 className="font-bold text-lg text-gray-800">Enviar felicitación</h2>
          </div>
          <div className="bg-white/80 rounded-2xl p-4 shadow-sm space-y-3">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tu nombre (opcional)"
              maxLength={40}
              className="bg-white border-gray-200"
            />
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribe un mensaje de felicitación..."
              maxLength={240}
              className="bg-white border-gray-200 resize-none min-h-[80px]"
            />
            <Button
              onClick={() => post.mutate()}
              disabled={!message.trim() || post.isPending}
              className="w-full text-white"
              style={{ background: t.accent }}
            >
              <Send size={14} className="mr-2" />
              {post.isPending ? "Enviando..." : "Enviar felicitación"}
            </Button>
          </div>
        </div>

        {/* Received greetings */}
        {data.posts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Heart size={14} style={{ color: t.accent }} />
              <h2 className="font-semibold text-gray-700">Felicitaciones</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {data.posts.map((p) => (
                <div key={p.id} className="bg-white/80 rounded-2xl p-3 shadow-sm">
                  <p className="font-semibold text-xs text-gray-700 truncate">{p.displayName}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-4">{p.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.posts.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
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
  const theme = detectTheme(data.candidates);
  const t = THEMES[theme];
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

    const isForward = dir === "next";
    setAnim(isForward ? "out" : "out-back");

    setTimeout(() => {
      setDisplayIdx((i) => i + (isForward ? 1 : -1));
      setPageIdx((i) => i + (isForward ? 1 : -1));
      setAnim(isForward ? "in" : "in-back");
      setTimeout(() => setAnim(""), 340);
    }, 320);
  }, [anim, pageIdx, visiblePages.length]);

  // Touch/swipe
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
        style={{ willChange: "transform, opacity" }}
        onClick={() => { if (currentPage === "cover") navigate("next"); }}
      >
        {currentPage === "cover" && <CoverPage data={data} theme={theme} />}
        {currentPage === "program" && <ProgramPage data={data} theme={theme} />}
        {currentPage === "hymns" && <HymnsPage data={data} theme={theme} />}
        {currentPage === "greetings" && <GreetingsPage data={data} slug={slug} code={code} isCatalog={isCatalog} theme={theme} />}
      </div>

      {/* Navigation bar (all pages except cover) */}
      {displayIdx > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-50"
          style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)", borderTop: "1px solid rgba(0,0,0,0.06)" }}
        >
          <button
            onClick={() => navigate("prev")}
            disabled={pageIdx === 0}
            className="p-2 rounded-full disabled:opacity-30"
            style={{ color: t.accent }}
          >
            <ChevronLeft size={22} />
          </button>

          {/* Dots */}
          <div className="flex items-center gap-2">
            {visiblePages.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === pageIdx ? 20 : 6,
                  height: 6,
                  background: i === pageIdx ? t.dotActive : "#d1d5db",
                }}
              />
            ))}
          </div>

          <button
            onClick={() => navigate("next")}
            disabled={pageIdx >= visiblePages.length - 1}
            className="p-2 rounded-full disabled:opacity-30"
            style={{ color: t.accent }}
          >
            <ChevronRight size={22} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BaptismPublicPage() {
  const [matchB, paramsB] = useRoute("/b/:slug");
  const [, paramsBautismo] = useRoute("/bautismo/:slug");
  const isCatalog = !matchB;
  const slug = paramsB?.slug || paramsBautismo?.slug || "";
  const code = isCatalog ? "" : (new URLSearchParams(window.location.search).get("c") || "");
  const queryKey = isCatalog ? `/bautismo/${slug}` : `/b/${slug}?c=${code}`;

  const { data, isError, isLoading } = useQuery<ServiceData>({
    queryKey: [queryKey],
    enabled: isCatalog ? Boolean(slug) : Boolean(slug && code),
  });

  if (isLoading) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50">
        <div className="flex flex-col items-center gap-3">
          <DoveIllustration color="#6366f1" size={48} />
          <p className="text-sm text-gray-400">Cargando programa...</p>
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center px-6">
          <p className="text-2xl mb-2">🕊️</p>
          <p className="font-medium text-gray-700">Enlace caducado</p>
          <p className="text-sm text-gray-400 mt-1">Este programa ya no está disponible.</p>
        </div>
      </main>
    );
  }

  if (data.unavailable) {
    const msgs: Record<string, { title: string; body: string }> = {
      pending_logistics: {
        title: "Preparación en curso",
        body: "Aún está pendiente la preparación logística del servicio. El programa estará disponible en breve.",
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
    return (
      <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50">
        <div className="text-center px-6 max-w-xs">
          <DoveIllustration color="#6366f1" size={48} />
          <p className="font-semibold text-gray-700 mt-4">{msg.title}</p>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">{msg.body}</p>
        </div>
      </main>
    );
  }

  return <DiptychViewer data={data} slug={slug} code={code} isCatalog={isCatalog} />;
}
