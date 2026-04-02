import { useEffect, useRef, useState } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { CalendarDays, MapPin, ChevronRight, Sparkles, Users, Shield, Bell } from "lucide-react";

interface PublicActivity {
  id: string;
  title: string;
  description?: string;
  date: string;
  location?: string;
  type: string;
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return {
    day: d.toLocaleDateString("es-ES", { day: "2-digit" }),
    month: d.toLocaleDateString("es-ES", { month: "short" }).toUpperCase(),
    weekday: d.toLocaleDateString("es-ES", { weekday: "long" }),
    time: d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  };
}

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("is-visible"); observer.unobserve(el); } },
      { threshold: 0.12 }
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

export default function WelcomePage() {
  const { isAuthenticated } = useAuth();
  const [activities, setActivities] = useState<PublicActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  useEffect(() => {
    fetch("/api/public/activities")
      .then((r) => r.json())
      .then((data) => setActivities(Array.isArray(data) ? data : []))
      .catch(() => setActivities([]))
      .finally(() => setLoadingActivities(false));
  }, []);

  if (isAuthenticated) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white overflow-x-hidden">
      {/* Noise texture */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.03] bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')]" />

      {/* Animated radial glow */}
      <div
        className="landing-glow pointer-events-none fixed top-0 left-1/2 w-[800px] h-[480px] rounded-full blur-[140px]"
        style={{ background: "radial-gradient(ellipse, #C9A227 0%, transparent 70%)" }}
      />
      {/* Secondary glow bottom-right */}
      <div
        className="pointer-events-none fixed bottom-0 right-0 w-[500px] h-[400px] rounded-full blur-[120px] opacity-[0.04]"
        style={{ background: "radial-gradient(ellipse, #C9A227 0%, transparent 70%)" }}
      />

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="landing-fade-up flex items-center gap-2.5" style={{ animationDelay: "0ms" }}>
          <img src="/icons/compass.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold text-[15px] tracking-tight text-white/90">Liahonapp</span>
        </div>
        <div className="landing-fade-up flex items-center gap-3" style={{ animationDelay: "80ms" }}>
          <Link href="/login">
            <button className="text-sm text-white/60 hover:text-white transition-colors px-3 py-1.5">
              Iniciar sesión
            </button>
          </Link>
          <Link href="/request-access">
            <button className="text-sm bg-[#C9A227] hover:bg-[#D4AF37] text-black font-semibold px-4 py-1.5 rounded-full transition-all hover:scale-105 active:scale-95">
              Solicitar acceso
            </button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 pt-20 pb-16 px-6 text-center max-w-4xl mx-auto">
        <div
          className="landing-fade-up inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-white/60 mb-8"
          style={{ animationDelay: "150ms" }}
        >
          <Sparkles className="h-3 w-3 text-[#C9A227]" />
          Gestión integral del barrio
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
          <span
            className="landing-fade-up block text-white"
            style={{ animationDelay: "260ms" }}
          >
            Tu barrio,
          </span>
          <span
            className="landing-fade-up landing-gradient-text block"
            style={{ animationDelay: "360ms" }}
          >
            organizado.
          </span>
        </h1>

        <p
          className="landing-fade-up text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed"
          style={{ animationDelay: "460ms" }}
        >
          Herramienta de gestión para líderes de barrio. Reuniones, asignaciones,
          actividades, bienestar y mucho más en un solo lugar.
        </p>

        <div
          className="landing-fade-up flex flex-col sm:flex-row items-center justify-center gap-3"
          style={{ animationDelay: "560ms" }}
        >
          <Link href="/login">
            <button className="group flex items-center gap-2 bg-white text-black font-semibold px-6 py-3 rounded-full hover:bg-white/90 transition-all hover:scale-105 active:scale-95 text-sm shadow-lg shadow-white/10">
              Tengo cuenta
              <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>
          <Link href="/request-access">
            <button className="flex items-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white font-medium px-6 py-3 rounded-full transition-all hover:scale-105 active:scale-95 text-sm">
              Solicitar acceso
            </button>
          </Link>
        </div>
      </section>

      {/* Divider glow line */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 mb-16">
        <div className="h-px bg-gradient-to-r from-transparent via-[#C9A227]/30 to-transparent" />
      </div>

      {/* Features grid */}
      <section className="relative z-10 py-4 px-6 max-w-6xl mx-auto">
        <RevealSection className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A227] mb-2">Por qué Liahonapp</p>
          <h2 className="text-3xl font-bold text-white">Todo lo que necesitas</h2>
        </RevealSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: Users,
              title: "Liderazgo unificado",
              desc: "Obispado, organizaciones y misional en una sola plataforma.",
              delay: 0,
            },
            {
              icon: Bell,
              title: "Notificaciones en tiempo real",
              desc: "Push, email y avisos automáticos para cada evento importante.",
              delay: 100,
            },
            {
              icon: Shield,
              title: "Acceso por roles",
              desc: "Cada miembro ve solo lo que necesita según su llamamiento.",
              delay: 200,
            },
          ].map(({ icon: Icon, title, desc, delay }) => (
            <RevealSection key={title} delay={delay}>
              <div className="group h-full rounded-2xl border border-white/8 bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-[#C9A227]/20 transition-all duration-300 cursor-default">
                <div className="h-10 w-10 rounded-xl bg-[#C9A227]/12 border border-[#C9A227]/20 flex items-center justify-center mb-4 group-hover:bg-[#C9A227]/20 group-hover:scale-110 transition-all duration-300">
                  <Icon className="text-[#C9A227]" style={{ height: "18px", width: "18px" }} />
                </div>
                <h3 className="font-semibold text-white/90 mb-1.5">{title}</h3>
                <p className="text-sm text-white/45 leading-relaxed">{desc}</p>
              </div>
            </RevealSection>
          ))}
        </div>
      </section>

      {/* Activities */}
      <section className="relative z-10 py-20 px-6 max-w-6xl mx-auto">
        <RevealSection className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A227] mb-2">Próximamente</p>
            <h2 className="text-3xl font-bold text-white">Actividades del barrio</h2>
          </div>
        </RevealSection>

        {loadingActivities ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-2xl border border-white/8 bg-white/[0.03] animate-pulse" />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <RevealSection>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-12 text-center">
              <CalendarDays className="h-10 w-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">No hay actividades programadas próximamente.</p>
            </div>
          </RevealSection>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activities.map((activity, i) => {
              const { day, month, weekday, time } = formatDate(activity.date);
              return (
                <RevealSection key={activity.id} delay={i * 80}>
                  <div className="group h-full rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-[#C9A227]/25 transition-all duration-300 p-5 flex gap-4 cursor-default">
                    {/* Date badge */}
                    <div className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-[#C9A227]/12 border border-[#C9A227]/20 group-hover:bg-[#C9A227]/20 transition-colors">
                      <span className="text-xl font-bold text-[#C9A227] leading-none">{day}</span>
                      <span className="text-[10px] font-semibold text-[#C9A227]/70 uppercase tracking-wider mt-0.5">{month}</span>
                    </div>
                    {/* Info */}
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
            })}
          </div>
        )}
      </section>

      {/* Footer CTA */}
      <section className="relative z-10 py-24 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <RevealSection>
            <img src="/icons/compass.svg" alt="" className="landing-compass-float h-14 w-14 mx-auto mb-6 opacity-75" />
            <h2 className="text-4xl font-bold text-white mb-3">¿Formas parte del liderazgo?</h2>
            <p className="text-white/45 text-sm mb-8">Solicita acceso a tu administrador o inicia sesión si ya tienes cuenta.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/login">
                <button className="group flex items-center gap-2 bg-[#C9A227] hover:bg-[#D4AF37] text-black font-semibold px-7 py-3.5 rounded-full transition-all hover:scale-105 active:scale-95 text-sm shadow-lg shadow-[#C9A227]/20">
                  Iniciar sesión
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
              <Link href="/request-access">
                <button className="text-sm text-white/50 hover:text-white transition-colors px-4 py-3.5">
                  Solicitar acceso →
                </button>
              </Link>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/8 py-6 px-6 text-center">
        <p className="text-white/25 text-xs">© {new Date().getFullYear()} Liahonapp · Gestión de barrio</p>
      </footer>
    </div>
  );
}
