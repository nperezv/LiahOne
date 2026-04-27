import { useEffect, useRef, useState } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { CalendarDays, MapPin, ChevronRight } from "lucide-react";

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

const TYPE_COLORS: Record<string, string> = {
  servicio_bautismal: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  deportiva: "bg-green-500/20 text-green-300 border-green-500/30",
  capacitacion: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  fiesta: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  hermanamiento: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  otro: "bg-amber-500/20 text-amber-300 border-amber-500/30",
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
    day: d.toLocaleDateString("es-ES", { day: "2-digit" }),
    month: d.toLocaleDateString("es-ES", { month: "short" }).toUpperCase(),
    weekday: d.toLocaleDateString("es-ES", { weekday: "long" }),
    time: d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    fullDate: d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }),
  };
}

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday
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
      { threshold: 0.1 }
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
      <RevealSection delay={delay}>
        <div className="group h-full rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] hover:bg-blue-500/[0.08] hover:border-blue-500/35 transition-all duration-300 p-5 flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-blue-500/15 border border-blue-500/25 group-hover:bg-blue-500/25 transition-colors">
              <span className="text-xl font-bold text-blue-300 leading-none">{day}</span>
              <span className="text-[10px] font-semibold text-blue-300/70 uppercase tracking-wider mt-0.5">{month}</span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 mb-2 bg-blue-500/20 text-blue-300 border-blue-500/30">
                🕊️ Bautismo
              </span>
              <h3 className="font-semibold text-white/90 text-sm leading-snug">{joinNames(svc.candidates)}</h3>
              <div className="flex items-center gap-1 mt-1.5 text-white/40 text-xs">
                <CalendarDays className="h-3 w-3 shrink-0" />
                <span className="capitalize">{weekday} · {time}</span>
              </div>
              {svc.locationName && (
                <div className="flex items-center gap-1 mt-1 text-white/40 text-xs">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{svc.locationName}</span>
                </div>
              )}
            </div>
          </div>
          {svc.withinWindow && svc.stableUrl && (
            <a href={svc.stableUrl} className="flex items-center justify-center gap-2 text-xs font-semibold text-white bg-blue-600/70 hover:bg-blue-600 border border-blue-500/40 rounded-xl px-4 py-2.5 transition-all hover:scale-[1.02] active:scale-95">
              Ver Programa <ChevronRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </RevealSection>
    );
  }

  const activity = item.activity!;
  return (
    <RevealSection delay={delay}>
      <div className="group h-full rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-[#C9A227]/25 transition-all duration-300 p-5 flex gap-4 cursor-default">
        <div className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-[#C9A227]/12 border border-[#C9A227]/20 group-hover:bg-[#C9A227]/20 transition-colors">
          <span className="text-xl font-bold text-[#C9A227] leading-none">{day}</span>
          <span className="text-[10px] font-semibold text-[#C9A227]/70 uppercase tracking-wider mt-0.5">{month}</span>
        </div>
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 mb-2 ${TYPE_COLORS[activity.type] ?? TYPE_COLORS.otro}`}>
            {TYPE_LABELS[activity.type] ?? "Actividad"}
          </span>
          <h3 className="font-semibold text-white/90 text-sm leading-snug">{activity.title}</h3>
          <div className="flex items-center gap-1 mt-1.5 text-white/40 text-xs">
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span className="capitalize">{weekday} · {time}</span>
          </div>
          {activity.location && (
            <div className="flex items-center gap-1 mt-1 text-white/40 text-xs">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{activity.location}</span>
            </div>
          )}
        </div>
      </div>
    </RevealSection>
  );
}

function EmptyWeek() {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-10 text-center">
      <CalendarDays className="h-8 w-8 text-white/20 mx-auto mb-3" />
      <p className="text-white/35 text-sm">No hay actividades programadas esta semana.</p>
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
  // Strip "Barrio " prefix for display since we'll prefix it ourselves
  const shortWardName = wardName.replace(/^[Bb]arrio\s+/i, "") || wardName;
  const showBarrioPrefix = !/^[Bb]arrio\b/i.test(wardName);

  // Merge and sort all activities
  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const allItems: MixedActivity[] = [
    ...baptismServices.map(b => ({ id: b.id, date: b.serviceAt, isBaptism: true, baptism: b })),
    ...activities.map(a => ({ id: a.id, date: a.date, isBaptism: false, activity: a })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const thisWeek = allItems.filter(a => {
    const d = new Date(a.date);
    return d >= weekStart && d <= weekEnd;
  });
  const upcoming = allItems.filter(a => new Date(a.date) > weekEnd);

  return (
    <div className="min-h-screen bg-[#080808] text-white overflow-x-hidden">
      {/* Noise texture */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')]" />
      <div className="landing-glow pointer-events-none fixed top-0 left-1/2 w-[800px] h-[480px] rounded-full blur-[140px]" style={{ background: "radial-gradient(ellipse, #C9A227 0%, transparent 70%)" }} />
      <div className="pointer-events-none fixed bottom-0 right-0 w-[500px] h-[400px] rounded-full blur-[120px] opacity-[0.04]" style={{ background: "radial-gradient(ellipse, #C9A227 0%, transparent 70%)" }} />

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="landing-fade-up flex items-center gap-2.5" style={{ animationDelay: "0ms" }}>
          <img src="/icons/compass.svg" alt="" className="h-9 w-9 opacity-80" />
          <span className="font-semibold text-base text-white/70 tracking-tight">
            {showBarrioPrefix ? `Barrio ${shortWardName}` : wardName}
          </span>
        </div>
        <div className="landing-fade-up" style={{ animationDelay: "80ms" }}>
          <Link href="/login">
            <button className="text-xs text-white/35 hover:text-white/70 transition-colors px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20">
              Acceso líderes
            </button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 pt-16 pb-20 px-6 text-center max-w-4xl mx-auto">
        {stakeName && (
          <div
            className="landing-fade-up inline-flex items-center gap-2 bg-[#C9A227]/10 border border-[#C9A227]/20 rounded-full px-4 py-1.5 text-xs text-[#C9A227]/80 mb-8 uppercase tracking-widest font-semibold"
            style={{ animationDelay: "120ms" }}
          >
            {stakeName}
          </div>
        )}

        <h1 className="tracking-tight leading-[1.05] mb-5">
          {showBarrioPrefix && (
            <span className="landing-fade-up block text-2xl md:text-3xl font-medium text-white/40 mb-1" style={{ animationDelay: "200ms" }}>
              Barrio
            </span>
          )}
          <span className="landing-fade-up landing-gradient-text block text-5xl md:text-7xl font-bold" style={{ animationDelay: "280ms" }}>
            {shortWardName}
          </span>
        </h1>

        <p className="landing-fade-up text-base text-white/40 max-w-lg mx-auto leading-relaxed" style={{ animationDelay: "380ms" }}>
          Bienvenidos. Aquí encontrarás las actividades y eventos de nuestra comunidad.
        </p>
      </section>

      {/* Divider */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 mb-16">
        <div className="h-px bg-gradient-to-r from-transparent via-[#C9A227]/30 to-transparent" />
      </div>

      {/* Esta semana */}
      <section className="relative z-10 px-6 max-w-6xl mx-auto mb-20">
        <RevealSection className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A227] mb-1">Esta semana</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            En el Barrio {shortWardName}
          </h2>
        </RevealSection>

        {loadingActivities ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2].map((i) => <div key={i} className="h-44 rounded-2xl border border-white/8 bg-white/[0.03] animate-pulse" />)}
          </div>
        ) : thisWeek.length === 0 ? (
          <RevealSection><EmptyWeek /></RevealSection>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {thisWeek.map((item, i) => <ActivityCard key={item.id} item={item} delay={i * 80} />)}
          </div>
        )}
      </section>

      {/* Próximas actividades */}
      {!loadingActivities && upcoming.length > 0 && (
        <section className="relative z-10 px-6 max-w-6xl mx-auto mb-24">
          <RevealSection className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A227] mb-1">Próximamente</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Actividades del mes</h2>
          </RevealSection>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map((item, i) => <ActivityCard key={item.id} item={item} delay={i * 60} />)}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/8 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-30">
            <img src="/icons/compass.svg" alt="" className="h-5 w-5" />
            <span className="text-xs text-white/60">
              {showBarrioPrefix ? `Barrio ${shortWardName}` : wardName}
              {stakeName ? ` · ${stakeName}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/request-access">
              <button className="text-xs text-white/25 hover:text-white/50 transition-colors">
                Solicitar acceso
              </button>
            </Link>
            <Link href="/login">
              <button className="text-xs text-white/25 hover:text-white/50 transition-colors">
                Acceso líderes →
              </button>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
