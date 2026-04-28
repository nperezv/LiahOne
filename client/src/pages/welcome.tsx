import { useEffect, useRef, useState } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { CalendarDays, MapPin, ChevronRight, ChevronDown, Clock, ExternalLink } from "lucide-react";

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
  meetingCenterName: string | null;
  meetingCenterAddress: string | null;
  sacramentMeetingTime: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  servicio_bautismal: "Bautismo",
  deportiva: "Deporte",
  capacitacion: "Capacitación",
  fiesta: "Fiesta",
  hermanamiento: "Hermanamiento",
  otro: "Actividad",
};

const TYPE_COLORS: Record<string, { pill: string; accent: string }> = {
  servicio_bautismal: { pill: "bg-blue-500/15 text-blue-300 border-blue-500/25",   accent: "#3b82f6" },
  deportiva:          { pill: "bg-green-500/15 text-green-300 border-green-500/25", accent: "#22c55e" },
  capacitacion:       { pill: "bg-purple-500/15 text-purple-300 border-purple-500/25", accent: "#a855f7" },
  fiesta:             { pill: "bg-pink-500/15 text-pink-300 border-pink-500/25",    accent: "#ec4899" },
  hermanamiento:      { pill: "bg-orange-500/15 text-orange-300 border-orange-500/25", accent: "#f97316" },
  otro:               { pill: "bg-amber-500/15 text-amber-300 border-amber-500/25", accent: "#f59e0b" },
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
    day:     d.toLocaleDateString("es-ES", { day: "2-digit", timeZone: "UTC" }),
    month:   d.toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).toUpperCase(),
    weekday: d.toLocaleDateString("es-ES", { weekday: "long", timeZone: "UTC" }),
    time:    `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
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
          <img src="/backgrounds/solemne-bautismo.svg" aria-hidden className="pointer-events-none absolute right-0 top-0 h-full w-44 object-contain opacity-[0.07] group-hover:opacity-[0.12] transition-opacity" />
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
                  <div className="flex items-start gap-1 mt-1 text-white/35 text-xs">
                    <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>{svc.locationName}</span>
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
        <img src={art} aria-hidden className="pointer-events-none absolute right-0 top-0 h-full w-44 object-contain opacity-[0.06] group-hover:opacity-[0.11] transition-opacity" />
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
                <div className="flex items-start gap-1 mt-1 text-white/35 text-xs">
                  <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{activity.location}</span>
                </div>
              )}
            </div>
          </div>
          {activity.description && (
            <p className="text-xs text-white/30 leading-relaxed line-clamp-2">{activity.description}</p>
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

const BELIEFS = [
  {
    icon: "✝️",
    title: "Jesucristo",
    body: "La Expiación de Jesucristo es el centro de nuestra fe. Creemos en la resurrección y en la vida eterna para toda la humanidad.",
  },
  {
    icon: "🏠",
    title: "La familia es eterna",
    body: "El plan de Dios nos permite estar con nuestras familias para siempre a través de ordenanzas sagradas del templo.",
  },
  {
    icon: "📖",
    title: "Escrituras y profetas",
    body: "Creemos en la Biblia y en el Libro de Mormón como palabra de Dios, y que Él sigue guiándonos a través de profetas vivos.",
  },
];

export default function WelcomePage() {
  const { isAuthenticated } = useAuth();
  const [activities, setActivities] = useState<PublicActivity[]>([]);
  const [baptismServices, setBaptismServices] = useState<PublicBaptismService[]>([]);
  const [wardInfo, setWardInfo] = useState<WardInfo>({
    wardName: null, stakeName: null,
    meetingCenterName: null, meetingCenterAddress: null, sacramentMeetingTime: null,
    instagramUrl: null, facebookUrl: null,
  });
  const [loadingActivities, setLoadingActivities] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/public/activities").then((r) => r.json()).catch(() => []),
      fetch("/api/public/baptism-services").then((r) => r.json()).catch(() => []),
      fetch("/api/public/ward-info").then((r) => r.json()).catch(() => ({})),
    ]).then(([acts, baps, info]) => {
      setActivities(Array.isArray(acts) ? acts : []);
      setBaptismServices(Array.isArray(baps) ? baps : []);
      setWardInfo({ wardName: null, stakeName: null, meetingCenterName: null, meetingCenterAddress: null, sacramentMeetingTime: null, instagramUrl: null, facebookUrl: null, ...info });
    }).finally(() => setLoadingActivities(false));
  }, []);

  // SEO — update title and og: tags once ward info loads
  useEffect(() => {
    if (!wardInfo.wardName) return;
    const title = `${wardInfo.wardName} · La Iglesia de Jesucristo`;
    document.title = title;
    const desc = `${wardInfo.wardName} — actividades, reuniones y eventos de nuestra comunidad de fe.`;
    const img = `${window.location.origin}/covenantspathfamily.png`;
    const setMeta = (attr: string, val: string, key = "name") => {
      let el = document.querySelector(`meta[${key}="${attr}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute(key, attr); document.head.appendChild(el); }
      el.content = val;
    };
    setMeta("description", desc);
    setMeta("og:title", title, "property");
    setMeta("og:description", desc, "property");
    setMeta("og:image", img, "property");
    setMeta("og:type", "website", "property");
    setMeta("og:url", window.location.href, "property");
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", desc);
    setMeta("twitter:image", img);
    return () => { document.title = "Gestión Administrativa de Barrio"; };
  }, [wardInfo.wardName]);

  if (isAuthenticated) return <Redirect to="/dashboard" />;

  const wardName = wardInfo.wardName ?? "Barrio";
  const stakeName = wardInfo.stakeName ?? "";
  const shortWardName = wardName.replace(/^[Bb]arrio\s+/i, "") || wardName;
  const showBarrioPrefix = !/^[Bb]arrio\b/i.test(wardName);
  const displayName = showBarrioPrefix ? `Barrio ${shortWardName}` : wardName;

  const meetingTime = wardInfo.sacramentMeetingTime ?? null;
  const meetingAddress = (wardInfo.meetingCenterAddress ?? "").trim();
  const meetingCenterName = (wardInfo.meetingCenterName ?? "").trim();
  const mapsUrl = meetingAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meetingAddress)}` : null;
  const instagramUrl = wardInfo.instagramUrl || null;
  const facebookUrl = wardInfo.facebookUrl || null;

  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const allItems: MixedActivity[] = [
    ...baptismServices.map(b => ({ id: b.id, date: b.serviceAt, isBaptism: true, baptism: b })),
    ...activities.map(a => ({ id: a.id, date: a.date, isBaptism: false, activity: a })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const thisWeek = allItems.filter(a => { const d = new Date(a.date); return d >= weekStart && d <= weekEnd; });
  const upcoming = allItems.filter(a => new Date(a.date) > weekEnd);

  return (
    <div className="min-h-screen bg-[#070709] text-white overflow-x-hidden">

      {/* ── NAV ── */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="landing-fade-up flex items-center gap-2.5" style={{ animationDelay: "0ms" }}>
          <img src="/icons/compass.svg" alt="" className="h-8 w-8 opacity-70" />
          <span className="font-semibold text-sm text-white/60 tracking-tight">{displayName}</span>
        </div>
        <div className="landing-fade-up flex items-center gap-2" style={{ animationDelay: "80ms" }}>
          <Link href="/actividades">
            <button className="text-xs text-white/35 hover:text-white/70 transition-colors px-3.5 py-1.5 rounded-full hover:bg-white/[0.05]">
              Actividades
            </button>
          </Link>
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
          backgroundImage: "linear-gradient(to bottom, rgba(7,7,9,0.42) 0%, rgba(7,7,9,0.70) 55%, rgba(7,7,9,1) 100%), url('/covenantspathfamily.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
        }}
      >
        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 80px 0 120px rgba(7,7,9,0.7), inset -80px 0 120px rgba(7,7,9,0.7)" }} />

        <div className="relative z-10 max-w-3xl mx-auto">
          {/* Big tagline */}
          <h1
            className="landing-fade-up landing-gradient-text font-black leading-[0.95] tracking-tight mb-5"
            style={{
              animationDelay: "160ms",
              fontSize: "clamp(3.5rem, 11vw, 7rem)",
              letterSpacing: "-0.03em",
            }}
          >
            Todos son<br />bienvenidos.
          </h1>

          {/* Ward name — secondary */}
          <p
            className="landing-fade-up font-semibold tracking-[0.16em] uppercase text-white/40 mb-1"
            style={{ animationDelay: "300ms", fontSize: "clamp(0.75rem, 2vw, 1rem)" }}
          >
            {displayName}
          </p>

          {/* Stake name — plain text, no pill */}
          {stakeName && (
            <p
              className="landing-fade-up tracking-[0.10em] uppercase text-white/20 mb-8"
              style={{ animationDelay: "360ms", fontSize: "clamp(0.6rem, 1.4vw, 0.75rem)" }}
            >
              {stakeName}
            </p>
          )}
          {!stakeName && <div className="mb-8" />}

          {/* Meeting button — scrolls to cuando-donde */}
          <div
            className="landing-fade-up flex items-center justify-center"
            style={{ animationDelay: "440ms" }}
          >
            <button
              onClick={() => document.getElementById("cuando-donde")?.scrollIntoView({ behavior: "smooth" })}
              className="group flex items-center gap-2.5 bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/[0.10] hover:border-[#C9A227]/30 rounded-full px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all duration-300 cursor-pointer"
            >
              <CalendarDays className="h-4 w-4 text-[#C9A227]/70 shrink-0 group-hover:text-[#C9A227] transition-colors" />
              <span>
                Cada domingo
                {meetingTime ? ` · ${meetingTime}h` : " — reunión sacramental"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-70 transition-opacity" />
            </button>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-25 animate-bounce">
          <ChevronDown className="h-5 w-5 text-white" />
        </div>
      </section>

      {/* ── ESTA SEMANA ── */}
      <section className="relative z-10 px-6 max-w-6xl mx-auto pt-20 pb-20">
        <RevealSection className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-2">Esta semana</p>
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">En el {displayName}</h2>
            </div>
            <p className="text-sm text-white/25">{new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</p>
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
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      </div>

      {/* ── PRÓXIMAS ACTIVIDADES ── */}
      {!loadingActivities && upcoming.length > 0 && (
        <section className="relative z-10 px-6 max-w-6xl mx-auto pt-20 pb-20">
          <RevealSection className="mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-2">Próximamente</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">Actividades del mes</h2>
          </RevealSection>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {upcoming.map((item, i) => <ActivityCard key={item.id} item={item} delay={i * 60} />)}
          </div>
        </section>
      )}

      {/* ── HORARIOS Y UBICACIÓN ── */}
      {(meetingTime || meetingAddress) && (
        <>
          <div className="max-w-6xl mx-auto px-6">
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
          </div>
          <section id="cuando-donde" className="relative z-10 px-6 max-w-6xl mx-auto pt-20 pb-20">
            <RevealSection className="mb-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-2">Únete a nosotros</p>
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">Cuándo y dónde</h2>
            </RevealSection>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meetingTime && (
                <RevealSection delay={0}>
                  <div className="relative overflow-hidden rounded-2xl border border-[#C9A227]/15 bg-[#C9A227]/[0.04] p-6 flex gap-4">
                    <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-[#C9A227]/12 border border-[#C9A227]/20">
                      <Clock className="h-5 w-5 text-[#C9A227]" />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#C9A227]/70 mb-1">Reunión Sacramental</p>
                      <p className="text-white font-bold text-xl leading-tight">{meetingTime}h</p>
                      <p className="text-white/40 text-sm mt-0.5">Cada domingo</p>
                    </div>
                  </div>
                </RevealSection>
              )}
              {meetingAddress && (
                <RevealSection delay={80}>
                  <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 flex gap-4">
                    <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.10]">
                      <MapPin className="h-5 w-5 text-white/50" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-1">Centro de Reuniones</p>
                      {meetingCenterName && <p className="text-white font-semibold text-sm leading-snug">{meetingCenterName}</p>}
                      <p className="text-white/50 text-sm mt-0.5 leading-snug">{meetingAddress}</p>
                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-3 text-xs text-[#C9A227]/70 hover:text-[#C9A227] transition-colors font-medium"
                        >
                          Ver en Google Maps <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </RevealSection>
              )}
            </div>
          </section>
        </>
      )}

      {/* ── QUIÉNES SOMOS ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      </div>
      <section
        className="relative overflow-hidden mx-4 sm:mx-6 lg:mx-auto max-w-6xl rounded-3xl my-20"
        style={{
          backgroundImage: "linear-gradient(to right, rgba(7,7,9,0.94) 45%, rgba(7,7,9,0.60) 100%), url('/flyer-assets/photos/temple1.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <RevealSection>
          <div className="relative z-10 px-8 md:px-14 py-14 md:py-16 max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-4">Quiénes somos</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-snug mb-5">
              Una congregación de fe<br />en el corazón de Madrid
            </h2>
            <p className="text-sm text-white/50 leading-relaxed">
              Somos el {displayName}, una congregación de La Iglesia de Jesucristo de los Santos de los Últimos Días.
              Creemos en la familia, en el servicio al prójimo y en el evangelio de Jesucristo.
              Todas las personas son bienvenidas, independientemente de su origen o historia.
            </p>
          </div>
        </RevealSection>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070709]/70 via-transparent to-transparent" />
      </section>

      {/* ── QUÉ CREEMOS ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      </div>
      <section className="relative z-10 px-6 max-w-6xl mx-auto pt-20 pb-24">
        <RevealSection className="mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-2">Nuestra fe</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">Qué creemos</h2>
        </RevealSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {BELIEFS.map((b, i) => (
            <RevealSection key={b.title} delay={i * 80}>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 h-full">
                <span className="text-3xl mb-4 block">{b.icon}</span>
                <h3 className="font-bold text-white text-base mb-2">{b.title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{b.body}</p>
              </div>
            </RevealSection>
          ))}
        </div>

        <RevealSection delay={240}>
          <a
            href="https://www.churchofjesuschrist.org/comeuntochrist/es"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#C9A227]/70 hover:text-[#C9A227] transition-colors"
          >
            Conoce más en churchofjesuschrist.org <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </RevealSection>
      </section>

      {/* ── MISIONEROS ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
      </div>
      <section
        className="relative overflow-hidden mx-4 sm:mx-6 lg:mx-auto max-w-6xl rounded-3xl my-20"
        style={{
          backgroundImage: "linear-gradient(to right, rgba(7,7,9,0.93) 45%, rgba(7,7,9,0.55) 100%), url('/covenantspath.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 20%",
        }}
      >
        <RevealSection>
          <div className="relative z-10 px-8 md:px-14 py-14 md:py-16 max-w-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A227] mb-4">¿Tienes preguntas?</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-snug mb-4">
              Los misioneros<br />pueden visitarte
            </h2>
            <p className="text-sm text-white/45 leading-relaxed mb-8">
              Si quieres aprender más sobre nuestra fe, el Libro de Mormón o simplemente conocernos,
              nuestros misioneros estarán encantados de reunirse contigo sin ningún compromiso.
            </p>
            <Link href="/request-access">
              <button className="inline-flex items-center gap-2 bg-[#C9A227] hover:bg-[#d4ac2c] text-[#070709] font-semibold text-sm px-6 py-3 rounded-full transition-all hover:scale-[1.03] active:scale-95">
                Solicitar una visita
                <ChevronRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
        </RevealSection>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070709]/60 via-transparent to-transparent" />
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-white/[0.06] pt-10 pb-8 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Top row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-2.5 opacity-40">
              <img src="/icons/compass.svg" alt="" className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold text-white leading-none">{displayName}</p>
                {stakeName && <p className="text-[10px] text-white/50 mt-0.5 tracking-wide">{stakeName}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {/* Social icons */}
              {instagramUrl && (
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                  className="text-white/20 hover:text-white/60 transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                  </svg>
                </a>
              )}
              {facebookUrl && (
                <a href={facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                  className="text-white/20 hover:text-white/60 transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
              )}
              <Link href="/actividades">
                <button className="text-xs text-white/25 hover:text-white/55 transition-colors">Actividades</button>
              </Link>
              <a
                href="https://www.churchofjesuschrist.org/comeuntochrist/es"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/25 hover:text-white/55 transition-colors"
              >
                La Iglesia
              </a>
              <Link href="/request-access">
                <button className="text-xs text-white/25 hover:text-white/55 transition-colors">Solicitar acceso</button>
              </Link>
              <Link href="/login">
                <button className="text-xs text-white/25 hover:text-white/55 transition-colors">Acceso líderes →</button>
              </Link>
            </div>
          </div>

          {/* Bottom row — copyright + legal */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-white/[0.05]">
            <p className="text-[11px] text-white/15">
              © {new Date().getFullYear()} {displayName}
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://www.churchofjesuschrist.org/legal/privacy-notice?lang=spa"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-white/15 hover:text-white/35 transition-colors"
              >
                Política de privacidad
              </a>
              <span className="text-white/10 text-[11px]">·</span>
              <p className="text-[11px] text-white/15">Cookies técnicas necesarias</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
