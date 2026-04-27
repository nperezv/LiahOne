import { useEffect, useRef, useState } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { CalendarDays, MapPin, ChevronRight, ChevronDown } from "lucide-react";

interface PublicActivity {
  id: string;
  title: string;
  description?: string;
  date: string;
  location?: string;
  type: string;
}

interface PublicBaptismService {
  id: string;
  serviceAt: string;
  locationName: string;
  locationAddress?: string;
  candidates: string[];
  stableUrl: string | null;
  withinWindow: boolean;
}

interface WardInfo {
  wardName: string | null;
  stakeName: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  servicio_bautismal: "Bautismo",
  deportiva: "Deporte",
  capacitacion: "Capacitación",
  fiesta: "Fiesta",
  hermanamiento: "Hermanamiento",
  otro: "Actividad",
};

const TYPE_COLORS: Record<string, { pill: string; border: string; accent: string }> = {
  servicio_bautismal: { pill: "bg-blue-500/15 text-blue-300 border-blue-500/25", border: "border-l-blue-500/50", accent: "#3b82f6" },
  deportiva:          { pill: "bg-green-500/15 text-green-300 border-green-500/25", border: "border-l-green-500/50", accent: "#22c55e" },
  capacitacion:       { pill: "bg-purple-500/15 text-purple-300 border-purple-500/25", border: "border-l-purple-500/50", accent: "#a855f7" },
  fiesta:             { pill: "bg-pink-500/15 text-pink-300 border-pink-500/25", border: "border-l-pink-500/50", accent: "#ec4899" },
  hermanamiento:      { pill: "bg-orange-500/15 text-orange-300 border-orange-500/25", border: "border-l-orange-500/50", accent: "#f97316" },
  otro:               { pill: "bg-amber-500/15 text-amber-300 border-amber-500/25", border: "border-l-amber-500/50", accent: "#f59e0b" },
};

const TYPE_ART: Record<string, string> = {
  servicio_bautismal: "/backgrounds/solemne-bautismo.svg",
  deportiva:          "/backgrounds/energetico-deportes.svg",
  capacitacion:       "/backgrounds/espiritual-conferencia.svg",
  fiesta:             "/backgrounds/festivo-fiesta.svg",
  hermanamiento:      "/backgrounds/calido-hermanamiento.svg",
  otro:               "/backgrounds/calido-raices.svg",
};

function joinNames(names: string[]): string {
  if (!names.length) return "Candidato";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return {
    day: d.toLocaleDateString("es-ES", { day: "2-digit", timeZone: "UTC" }),
    month: d.toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).toUpperCase(),
    weekday: d.toLocaleDateString("es-ES", { weekday: "long", timeZone: "UTC" }),
    time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("is-visible"); observer.unobserve(el); } },
      { threshold: 0.08 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function RevealSection({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={`landing-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

type MixedActivity = { id: string; date: string; isBaptism: boolean; activity?: PublicActivity; baptism?: PublicBaptismService };

function ActivityCard({ item, delay }: { item: MixedActivity; delay: number }) {
  const { day, month, weekday, time } = formatDate(item.date);

  if (item.isBaptism && item.baptism) {
    const svc = item.baptism;
    return (
      <RevealSection delay={delay} className="h-full">
        <div className="group relative h-full overflow-hidden rounded-2xl border border-blue-500/20 bg-[#0a0f1e] hover:border-blue-500/40 transition-all duration-300 flex flex-col">
          {/* Art */}
          <img src="/backgrounds/solemne-bautismo.svg" aria-hidden className="pointer-events-none absolute right-0 top-0 h-full w-44 object-contain opacity-[0.07] group-hover:opacity-[0.12] transition-opacity" />
          {/* Top accent */}
          <div className="h-0.5 w-full bg-gradient-to-r from-blue-500/60 to-transparent" />
          <div className="relative flex flex-col gap-3 p-5 flex-1">
            <div className="flex items-start gap-4">
              <div className="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/20">
                <span className="text-lg font-bold text-blue-300 leading-none">{day}</span>
                <span className="text-[9px] font-bold text-blue-300/60 uppercase tracking-wider mt-0.5">{month}</span>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 mb-2 bg-blue-500/15 text-blue-300 border-blue-500/25">
                  🕊️ Bautismo
                </span>
                <h3 className="font-semibold text-white/90 text-sm leading-snug">{joinNames(svc.candidates)}</h3>
                <p className="mt-1.5 text-white/40 text-xs capitalize">{weekday} · {time}</p>
                {svc.locationName && (
                  <div className="flex items-center gap-1 mt-1 text-white/35 text-xs">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{svc.locationName}</span>
                  </div>
                )}
              </div>
            </div>
            {svc.withinWindow && svc.stableUrl && (
              <a href={svc.stableUrl} className="mt-auto flex items-center justify-center gap-2 text-xs font-semibold text-white bg-blue-600/60 hover:bg-blue-600/80 border border-blue-500/30 rounded-xl px-4 py-2.5 transition-all hover:scale-[1.02] active:scale-95">
                Ver Programa <ChevronRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </RevealSection>
    );
  }

  const activity = item.activity!;
  const colors = TYPE_COLORS[activity.type] ?? TYPE_COLORS.otro;
  const art = TYPE_ART[activity.type] ?? TYPE_ART.otro;

  return (
    <RevealSection delay={delay} className="h-full">
      <div className="group relative h-full overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.045] hover:border-white/[0.14] transition-all duration-300 flex flex-col">
        {/* SVG art */}
        <img src={art} aria-hidden className="pointer-events-none absolute right-0 top-0 h-full w-44 object-contain opacity-[0.06] group-hover:opacity-[0.11] transition-opacity" />
        {/* Top accent line */}
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(to right, ${colors.accent}99, transparent)` }} />
        <div className="relative flex flex-col gap-3 p-5 flex-1">
          <div className="flex items-start gap-4">
            <div className="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border" style={{ background: `${colors.accent}18`, borderColor: `${colors.accent}30` }}>
              <span className="text-lg font-bold leading-none" style={{ color: colors.accent }}>{day}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: `${colors.accent}99` }}>{month}</span>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 mb-2 ${colors.pill}`}>
                {TYPE_LABELS[activity.type] ?? "Actividad"}
              </span>
              <h3 className="font-semibold text-white/90 text-sm leading-snug">{activity.title}</h3>
              <div className="flex items-center gap-1 mt-1.5 text-white/40 text-xs">
                <CalendarDays className="h-3 w-3 shrink-0" />
                <span className="capitalize">{weekday} · {time}</span>
              </div>
              {activity.location && (
                <div className="flex items-center gap-1 mt-1 text-white/35 text-xs">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{activity.location}</span>
                </div>
              )}
            </div>
          </div>
          {activity.description && (
            <p className="text-xs text-white/30 leading-relaxed line-clamp-2 mt-1">{activity.description}</p>
          )}
        </div>
      </div>
    </RevealSection>
  );
}

function SkeletonCard() {
  return <div className="h-40 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />;
}

function EmptyWeek() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-12 text-center">
      <CalendarDays className="h-9 w-9 text-white/15 mx-auto mb-3" />
      <p className="text-white/30 text-sm">Sin actividades programadas esta semana.</p>
    </div>
  );
}

export default function WelcomePage() {
  const { isAuthenticated } = useAuth();
  const [activities, setActivities] = useState<PublicActivity[]>([]);
  const [baptismServices, setBaptismServices] = useState<PublicBaptismService[]>([]);
  const [wardInfo, setWardInfo] = useState<WardInfo>({ wardName: null, stakeName: null });
  const [loadingActivities, setLoadingActivities] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/public/activities").then((r) => r.json()).catch(() => []),
      fetch("/api/public/baptism-services").then((r) => r.json()).catch(() => []),
      fetch("/api/public/ward-info").then((r) => r.json()).catch(() => ({ wardName: null, stakeName: null })),
    ]).then(([acts, baps, info]) => {
      setActivities(Array.isArray(acts) ? acts : []);
      setBaptismServices(Array.isArray(baps) ? baps : []);
      setWardInfo(info ?? { wardName: null, stakeName: null });
    }).finally(() => setLoadingActivities(false));
  }, []);

  if (isAuthenticated) return <Redirect to="/dashboard" />;

  const wardName = wardInfo.wardName ?? "Barrio";
  const stakeName = wardInfo.stakeName ?? "";
  const shortWardName = wardName.replace(/^[Bb]arrio\s+/i, "") || wardName;
  const showBarrioPrefix = !/^[Bb]arrio\b/i.test(wardName);
  const displayName = showBarrioPrefix ? `Barrio ${shortWardName}` : wardName;

  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const allItems: MixedActivity[] = [
    ...baptismServices.map(b => ({ id: b.id, date: b.serviceAt, isBaptism: true, baptism: b })),
    ...activities.map(a => ({ id: a.id, date: a.date, isBaptism: false, activity: a })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const thisWeek = allItems.filter(a => { const d = new Date(a.date); return d >= weekStart && d <= weekEnd; });
  const upcoming = allItems.filter(a => new Date(a.date) > weekEnd);

  // Next Sunday
  const now = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysUntilSunday);
  const sundayLabel = nextSunday.toLocaleDateString("es-ES", { day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-[#070709] text-white overflow-x-hidden">

      {/* ── NAV ── */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="landing-fade-up flex items-center gap-2.5" style={{ animationDelay: "0ms" }}>
          <img src="/icons/compass.svg" alt="" className="h-8 w-8 opacity-70" />
          <span className="font-semibold text-sm text-white/60 tracking-tight">{displayName}</span>
        </div>
        <div className="landing-fade-up" style={{ animationDelay: "80ms" }}>
          <Link href="/login">
            <button className="text-xs text-white/40 hover:text-white/80 transition-colors px-3.5 py-1.5 rounded-full border border-white/[0.12] hover:border-white/25 backdrop-blur-sm">
              Acceso líderes
            </button>
          </Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section
        className="relative flex flex-col items-center justify-center text-center min-h-[92vh] px-6"
        style={{
          backgroundImage: "linear-gradient(to bottom, rgba(7,7,9,0.45) 0%, rgba(7,7,9,0.72) 55%, rgba(7,7,9,1) 100%), url('/covenantspathfamily.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
        }}
      >
        {/* Subtle vignette edges */}
        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 80px 0 120px rgba(7,7,9,0.7), inset -80px 0 120px rgba(7,7,9,0.7)" }} />

        <div className="relative z-10 max-w-3xl mx-auto">
          {stakeName && (
            <div
              className="landing-fade-up inline-flex items-center gap-2 bg-[#C9A227]/10 border border-[#C9A227]/25 backdrop-blur-sm rounded-full px-4 py-1.5 text-xs text-[#C9A227]/80 mb-8 uppercase tracking-widest font-semibold"
              style={{ animationDelay: "100ms" }}
            >
              {stakeName}
            </div>
          )}

          <h1 className="tracking-tight leading-none mb-6">
            {showBarrioPrefix && (
              <span
                className="landing-fade-up block text-xl md:text-2xl font-light text-white/50 mb-2 tracking-[0.18em] uppercase"
                style={{ animationDelay: "180ms" }}
              >
                Barrio
              </span>
            )}
            <span
              className="landing-fade-up landing-gradient-text block text-6xl md:text-8xl font-black"
              style={{ animationDelay: "260ms" }}
            >
              {shortWardName}
            </span>
          </h1>

          <p
            className="landing-fade-up text-base md:text-lg text-white/50 max-w-md mx-auto leading-relaxed font-light"
            style={{ animationDelay: "360ms" }}
          >
            Una comunidad de fe donde todos son bienvenidos.
          </p>

          {/* Sunday pill */}
          <div
            className="landing-fade-up flex flex-col sm:flex-row items-center justify-center gap-3 mt-10"
            style={{ animationDelay: "460ms" }}
          >
            <div className="flex items-center gap-2.5 bg-white/[0.06] backdrop-blur-sm border border-white/[0.1] rounded-full px-5 py-2.5 text-sm text-white/70">
              <CalendarDays className="h-4 w-4 text-[#C9A227]/80 shrink-0" />
              <span>Cada domingo — reunión sacramental</span>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-30 animate-bounce">
          <ChevronDown className="h-5 w-5 text-white" />
        </div>
      </section>

      {/* ── ESTA SEMANA ── */}
      <section className="relative z-10 px-6 max-w-6xl mx-auto pt-20 pb-20">
        <RevealSection className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-2">Esta semana</p>
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                En el {displayName}
              </h2>
            </div>
            <p className="text-sm text-white/30">
              {new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
            </p>
          </div>
        </RevealSection>

        {loadingActivities ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : thisWeek.length === 0 ? (
          <RevealSection><EmptyWeek /></RevealSection>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {thisWeek.map((item, i) => <ActivityCard key={item.id} item={item} delay={i * 80} />)}
          </div>
        )}
      </section>

      {/* ── DIVIDER ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      </div>

      {/* ── PRÓXIMAS ACTIVIDADES ── */}
      {!loadingActivities && upcoming.length > 0 && (
        <section className="relative z-10 px-6 max-w-6xl mx-auto pt-20 pb-24">
          <RevealSection className="mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-2">Próximamente</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">Actividades del mes</h2>
          </RevealSection>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {upcoming.map((item, i) => <ActivityCard key={item.id} item={item} delay={i * 60} />)}
          </div>
        </section>
      )}

      {/* ── COMMUNITY BANNER ── */}
      <RevealSection>
        <section
          className="relative overflow-hidden mx-4 sm:mx-6 lg:mx-auto max-w-6xl rounded-3xl mb-20"
          style={{
            backgroundImage: "linear-gradient(to right, rgba(7,7,9,0.92) 40%, rgba(7,7,9,0.55) 100%), url('/flyer-assets/photos/temple1.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="relative z-10 px-8 md:px-14 py-14 md:py-16 max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-4">La Iglesia de Jesucristo</p>
            <h3 className="text-2xl md:text-3xl font-bold text-white leading-snug mb-4">
              Construyendo familias eternas
            </h3>
            <p className="text-sm text-white/45 leading-relaxed">
              Somos parte de La Iglesia de Jesucristo de los Santos de los Últimos Días.
              Creemos en la familia, el servicio y el evangelio de Jesucristo.
            </p>
          </div>
          {/* Gradient fade to right for image bleed */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070709]/80 via-transparent to-transparent" />
        </section>
      </RevealSection>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-25">
            <img src="/icons/compass.svg" alt="" className="h-4 w-4" />
            <span className="text-xs text-white/60">
              {displayName}{stakeName ? ` · ${stakeName}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/request-access">
              <button className="text-xs text-white/20 hover:text-white/50 transition-colors">Solicitar acceso</button>
            </Link>
            <Link href="/login">
              <button className="text-xs text-white/20 hover:text-white/50 transition-colors">Acceso líderes →</button>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
