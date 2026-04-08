import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CalendarDays, MapPin, Users, ArrowLeft, Clock, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

// ── CSS injected once ─────────────────────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes aurora-1 {
    0%,100% { transform: translate(0%,0%) scale(1); }
    33%     { transform: translate(6%,-10%) scale(1.1); }
    66%     { transform: translate(-5%,7%) scale(0.93); }
  }
  @keyframes aurora-2 {
    0%,100% { transform: translate(0%,0%) scale(1); }
    40%     { transform: translate(-8%,5%) scale(1.08); }
    70%     { transform: translate(9%,-7%) scale(0.95); }
  }
  @keyframes aurora-3 {
    0%,100% { transform: translate(0%,0%) scale(1); }
    50%     { transform: translate(5%,8%) scale(1.12); }
  }
  @keyframes scroll-hint {
    0%,100% { transform: translateY(0); opacity: .5; }
    50%     { transform: translateY(7px); opacity: 1; }
  }
  .pub-aurora-1 { animation: aurora-1 18s ease-in-out infinite; }
  .pub-aurora-2 { animation: aurora-2 22s ease-in-out infinite; }
  .pub-aurora-3 { animation: aurora-3 26s ease-in-out infinite; }
  .pub-scroll-hint { animation: scroll-hint 2s ease-in-out infinite; }

  .pub-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    transition: transform .28s ease, box-shadow .28s ease,
                border-color .28s ease, background .28s ease;
    cursor: pointer;
  }
  .pub-card:hover {
    transform: translateY(-6px) scale(1.01);
    background: rgba(255,255,255,0.08);
    border-color: rgba(139,92,246,0.45);
    box-shadow: 0 24px 64px rgba(139,92,246,0.18), 0 8px 24px rgba(0,0,0,0.5);
  }
  .pub-pill {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .pub-detail-chip {
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
  }
`;

function useInjectStyles() {
  useEffect(() => {
    const id = "pub-activities-styles";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = GLOBAL_STYLES;
      document.head.appendChild(el);
    }
    return () => {
      // keep alive during page visit — removed on unmount only if no other instance
    };
  }, []);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function parseDateParts(dateStr: string) {
  // PostgreSQL returns timestamps without Z suffix — normalize to UTC
  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(dateStr)
    ? dateStr
    : dateStr.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  // Use UTC values so the time matches what was entered (stored as UTC)
  const utcH = d.getUTCHours();
  const utcM = d.getUTCMinutes();
  const timeStr = `${String(utcH).padStart(2, "0")}:${String(utcM).padStart(2, "0")}`;
  return {
    weekday: d.toLocaleDateString("es-ES", { weekday: "long", timeZone: "UTC" }),
    day:     String(d.getUTCDate()).padStart(2, "0"),
    month:   d.toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).replace(".", "").toUpperCase(),
    year:    d.getUTCFullYear(),
    time:    timeStr,
    full:    d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

const ACCENT_COLORS = [
  "#8b5cf6", // violet
  "#60a5fa", // blue
  "#f472b6", // pink
  "#34d399", // emerald
  "#fb923c", // orange
  "#a78bfa", // purple-light
];

// ── Background aurora ─────────────────────────────────────────────────────────
function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      {/* base gradient */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(135deg, #080612 0%, #0d0a1f 50%, #060a18 100%)" }}
      />
      {/* blob 1 — violet */}
      <div
        className="pub-aurora-1 absolute"
        style={{
          top: "-15%", left: "-10%",
          width: "60vw", height: "60vw",
          maxWidth: 700, maxHeight: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.22) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      {/* blob 2 — blue */}
      <div
        className="pub-aurora-2 absolute"
        style={{
          bottom: "5%", right: "-15%",
          width: "55vw", height: "55vw",
          maxWidth: 650, maxHeight: 650,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(96,165,250,0.18) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      {/* blob 3 — pink accent */}
      <div
        className="pub-aurora-3 absolute"
        style={{
          top: "40%", left: "40%",
          width: "40vw", height: "40vw",
          maxWidth: 500, maxHeight: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(244,114,182,0.1) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
      {/* noise grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />
    </div>
  );
}

// ── Activity card (lobby) ─────────────────────────────────────────────────────
function ActivityCard({ act, index }: { act: any; index: number }) {
  const dp = parseDateParts(act.date);
  const accentColor = ACCENT_COLORS[index % ACCENT_COLORS.length];

  return (
    <motion.a
      href={`/actividades/${act.slug}`}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="pub-card block rounded-2xl overflow-hidden no-underline"
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {/* Flyer or gradient hero */}
      {act.flyer_url ? (
        <div className="relative overflow-hidden" style={{ height: 200 }}>
          {/* Blurred background fill so no letterboxing looks ugly */}
          <img
            src={act.flyer_url}
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "blur(18px)", transform: "scale(1.15)", opacity: 0.55 }}
          />
          {/* Actual flyer fully visible */}
          <img
            src={act.flyer_url}
            alt={act.title}
            className="relative w-full h-full object-contain"
            style={{ transition: "transform .4s ease" }}
            onMouseEnter={(e) => ((e.target as HTMLImageElement).style.transform = "scale(1.04)")}
            onMouseLeave={(e) => ((e.target as HTMLImageElement).style.transform = "scale(1)")}
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(8,6,18,0.65) 0%, transparent 60%)" }}
          />
          {/* Date badge over image */}
          <div
            className="absolute top-3 right-3 pub-pill rounded-xl px-3 py-2 text-center"
            style={{ minWidth: 52 }}
          >
            <p className="text-white font-bold leading-none" style={{ fontSize: 22 }}>{dp.day}</p>
            <p className="font-semibold leading-none mt-0.5" style={{ fontSize: 11, color: accentColor }}>{dp.month}</p>
          </div>
        </div>
      ) : (
        <div
          className="relative flex items-end p-4"
          style={{
            height: 100,
            background: `linear-gradient(135deg, ${accentColor}22 0%, ${accentColor}08 100%)`,
            borderBottom: `1px solid ${accentColor}22`,
          }}
        >
          <div
            className="pub-pill rounded-xl px-3 py-2 text-center ml-auto"
            style={{ minWidth: 52 }}
          >
            <p className="text-white font-bold leading-none" style={{ fontSize: 22 }}>{dp.day}</p>
            <p className="font-semibold leading-none mt-0.5" style={{ fontSize: 11, color: accentColor }}>{dp.month}</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4" style={{ paddingTop: act.flyer_url ? 12 : 16 }}>
        {/* top accent line */}
        <div style={{ width: 32, height: 3, borderRadius: 2, background: accentColor, marginBottom: 10 }} />

        {act.organization_name && (
          <p
            className="font-semibold uppercase tracking-widest mb-1"
            style={{ fontSize: 10, color: accentColor }}
          >
            {act.organization_name}
          </p>
        )}

        <h2 className="font-bold leading-snug text-white" style={{ fontSize: 18 }}>
          {act.title}
        </h2>

        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2" style={{ color: "rgba(248,250,252,0.55)", fontSize: 13 }}>
            <CalendarDays style={{ width: 14, height: 14, flexShrink: 0, color: accentColor }} />
            <span className="capitalize">{dp.weekday} · {dp.time}</span>
          </div>
          {act.location && (
            <div className="flex items-center gap-2" style={{ color: "rgba(248,250,252,0.55)", fontSize: 13 }}>
              <MapPin style={{ width: 14, height: 14, flexShrink: 0, color: accentColor }} />
              <span>{act.location}</span>
            </div>
          )}
          {act.asistencia_esperada && (
            <div className="flex items-center gap-2" style={{ color: "rgba(248,250,252,0.55)", fontSize: 13 }}>
              <Users style={{ width: 14, height: 14, flexShrink: 0, color: accentColor }} />
              <span>{act.asistencia_esperada} personas</span>
            </div>
          )}
        </div>

        {/* CTA arrow */}
        <div
          className="flex items-center justify-end mt-4"
          style={{ color: accentColor, fontSize: 13, fontWeight: 600 }}
        >
          <span>Ver detalles</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ml-1" style={{ transition: "transform .2s ease" }}>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </motion.a>
  );
}

// ── Lobby — /actividades ──────────────────────────────────────────────────────
export function ActivitiesLobby() {
  useInjectStyles();

  const [showPast, setShowPast] = useState(false);

  const { data, isLoading } = useQuery<{ activities: any[]; wardName: string | null }>({
    queryKey: ["/api/actividades", showPast ? "past" : "upcoming"],
    queryFn: async () => {
      const res = await fetch(showPast ? "/api/actividades?past=1" : "/api/actividades");
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    staleTime: 60_000,
  });

  const activities = data?.activities ?? [];
  const wardName = data?.wardName ?? null;
  const count = activities.length;

  return (
    <div
      className="relative min-h-screen"
      style={{ fontFamily: "'Outfit', sans-serif", color: "#f8fafc", overflowX: "hidden" }}
    >
      <AuroraBackground />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div
        className="relative flex flex-col items-center justify-center text-center px-6"
        style={{ minHeight: "100svh", paddingTop: 80, paddingBottom: 80, zIndex: 1 }}
      >
        {/* top pill */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="pub-pill rounded-full px-4 py-2 mb-8 flex items-center gap-2"
          style={{ fontSize: 13, color: "rgba(248,250,252,0.75)" }}
        >
          <span
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#34d399",
              boxShadow: "0 0 8px #34d399",
              display: "inline-block",
              animation: "scroll-hint 2s ease-in-out infinite",
            }}
          />
          {wardName ?? "Barrio"}
        </motion.div>

        {/* heading */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1
            className="font-extrabold leading-none tracking-tight"
            style={{ fontSize: "clamp(3rem, 10vw, 6.5rem)", letterSpacing: "-0.03em" }}
          >
            <span
              style={{
                background: "linear-gradient(135deg, #fff 30%, rgba(139,92,246,0.85) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Actividades
            </span>
          </h1>
        </motion.div>

        {/* subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 max-w-md"
          style={{ fontSize: 18, color: "rgba(248,250,252,0.55)", lineHeight: 1.6 }}
        >
          {isLoading
            ? (showPast ? "Cargando actividades pasadas…" : "Cargando próximas actividades…")
            : count > 0
            ? showPast
              ? `${count} ${count === 1 ? "actividad pasada" : "actividades pasadas"}`
              : `${count} ${count === 1 ? "actividad próxima" : "actividades próximas"} abiertas a la comunidad`
            : showPast ? "No hay actividades pasadas registradas" : "Las próximas actividades aparecerán aquí"}
        </motion.p>

        {/* upcoming / past toggle */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 flex items-center gap-1 pub-pill rounded-full p-1"
          style={{ fontSize: 13 }}
        >
          <button
            type="button"
            onClick={() => setShowPast(false)}
            style={{
              padding: "6px 18px",
              borderRadius: 999,
              fontWeight: showPast ? 400 : 600,
              color: showPast ? "rgba(248,250,252,0.5)" : "#fff",
              background: showPast ? "transparent" : "rgba(139,92,246,0.35)",
              border: "none",
              cursor: "pointer",
              transition: "all .2s",
            }}
          >
            Próximas
          </button>
          <button
            type="button"
            onClick={() => setShowPast(true)}
            style={{
              padding: "6px 18px",
              borderRadius: 999,
              fontWeight: showPast ? 600 : 400,
              color: showPast ? "#fff" : "rgba(248,250,252,0.5)",
              background: showPast ? "rgba(139,92,246,0.35)" : "transparent",
              border: "none",
              cursor: "pointer",
              transition: "all .2s",
            }}
          >
            Pasadas
          </button>
        </motion.div>

        {/* scroll cue */}
        {!isLoading && count > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="pub-scroll-hint absolute"
            style={{ bottom: 36, left: "50%", transform: "translateX(-50%)" }}
          >
            <ChevronDown style={{ width: 28, height: 28, color: "rgba(248,250,252,0.35)" }} />
          </motion.div>
        )}
      </div>

      {/* ── Cards grid ───────────────────────────────────────── */}
      <div className="relative" style={{ zIndex: 1, paddingBottom: 80 }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    height: 320,
                    opacity: 1 - i * 0.2,
                  }}
                >
                  <div
                    style={{
                      height: 200,
                      background: "rgba(255,255,255,0.06)",
                    }}
                  />
                  <div className="p-4 space-y-3">
                    <div style={{ height: 12, width: "40%", borderRadius: 6, background: "rgba(255,255,255,0.08)" }} />
                    <div style={{ height: 18, width: "75%", borderRadius: 6, background: "rgba(255,255,255,0.08)" }} />
                    <div style={{ height: 12, width: "55%", borderRadius: 6, background: "rgba(255,255,255,0.06)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : count === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center text-center py-24"
            >
              <div
                className="rounded-full flex items-center justify-center mb-6"
                style={{
                  width: 80, height: 80,
                  background: "rgba(139,92,246,0.12)",
                  border: "1px solid rgba(139,92,246,0.25)",
                }}
              >
                <CalendarDays style={{ width: 36, height: 36, color: "#8b5cf6" }} />
              </div>
              <p className="font-bold text-white" style={{ fontSize: 22 }}>Sin actividades próximas</p>
              <p style={{ color: "rgba(248,250,252,0.45)", marginTop: 8, maxWidth: 320 }}>
                No hay actividades publicadas en este momento. ¡Vuelve pronto!
              </p>
            </motion.div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {activities!.map((act, i) => (
                <ActivityCard key={act.id} act={act} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* bottom fade */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0"
        style={{
          height: 120,
          background: "linear-gradient(to top, #080612 0%, transparent 100%)",
          zIndex: 2,
        }}
      />
    </div>
  );
}

// ── Detail — /actividades/:slug ───────────────────────────────────────────────
export function ActivityPublicDetail() {
  useInjectStyles();
  const { slug } = useParams<{ slug: string }>();
  const [imgLoaded, setImgLoaded] = useState(false);

  const { data: act, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/actividades", slug],
    queryFn: async () => {
      const res = await fetch(`/api/actividades/${slug}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: Boolean(slug),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#080612", fontFamily: "'Outfit', sans-serif" }}
      >
        <AuroraBackground />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative text-center"
          style={{ zIndex: 1 }}
        >
          <div
            style={{
              width: 48, height: 48, borderRadius: "50%",
              border: "3px solid rgba(139,92,246,0.3)",
              borderTop: "3px solid #8b5cf6",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "rgba(248,250,252,0.5)", fontSize: 14 }}>Cargando actividad…</p>
        </motion.div>
      </div>
    );
  }

  if (isError || !act) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-center px-6"
        style={{ background: "#080612", fontFamily: "'Outfit', sans-serif", color: "#f8fafc" }}
      >
        <AuroraBackground />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative"
          style={{ zIndex: 1 }}
        >
          <p className="font-bold" style={{ fontSize: 24 }}>Actividad no encontrada</p>
          <p style={{ color: "rgba(248,250,252,0.5)", marginTop: 8 }}>
            El enlace puede haber expirado o la actividad fue cancelada.
          </p>
          <a
            href="/actividades"
            className="inline-flex items-center gap-2 mt-8 pub-pill rounded-full px-5 py-2.5"
            style={{ color: "#8b5cf6", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            Ver todas las actividades
          </a>
        </motion.div>
      </div>
    );
  }

  const dp = parseDateParts(act.date);

  return (
    <div
      className="relative min-h-screen"
      style={{ fontFamily: "'Outfit', sans-serif", color: "#f8fafc", background: "#080612", overflowX: "hidden" }}
    >
      <AuroraBackground />

      {/* back button — always visible */}
      <motion.a
        href="/actividades"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="pub-pill fixed rounded-full flex items-center gap-2"
        style={{
          top: 20, left: 20, zIndex: 50,
          padding: "10px 16px",
          color: "rgba(248,250,252,0.85)",
          fontSize: 14, fontWeight: 600,
          textDecoration: "none",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        <span>Actividades</span>
      </motion.a>

      {/* ── Hero ─────────────────────────────────────────────── */}
      {act.flyer_url ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="relative w-full"
          style={{ zIndex: 1, paddingTop: 72 }}
        >
          <div className="max-w-2xl mx-auto px-4">
            <div
              className="relative rounded-3xl overflow-hidden"
              style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
            >
              <img
                src={act.flyer_url}
                alt={act.title}
                onLoad={() => setImgLoaded(true)}
                className="w-full object-contain"
                style={{
                  maxHeight: 480,
                  opacity: imgLoaded ? 1 : 0,
                  transition: "opacity .4s ease",
                  background: "rgba(255,255,255,0.04)",
                }}
              />
              {!imgLoaded && (
                <div style={{ height: 360, background: "rgba(255,255,255,0.04)" }} />
              )}
            </div>
          </div>
        </motion.div>
      ) : (
        <div
          className="relative flex items-end"
          style={{
            minHeight: 280, zIndex: 1,
            paddingTop: 80, paddingBottom: 48,
            background: "linear-gradient(160deg, rgba(139,92,246,0.18) 0%, transparent 60%)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="max-w-2xl mx-auto px-6 w-full">
            {act.organization_name && (
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="font-semibold uppercase tracking-widest mb-3"
                style={{ fontSize: 11, color: "#8b5cf6" }}
              >
                {act.organization_name}
              </motion.p>
            )}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="font-extrabold leading-none tracking-tight"
              style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", letterSpacing: "-0.02em" }}
            >
              {act.title}
            </motion.h1>
          </div>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative max-w-2xl mx-auto px-4 pb-24"
        style={{ zIndex: 1, paddingTop: 36 }}
      >
        {/* title (shown below flyer if flyer exists) */}
        {act.flyer_url && (
          <div className="mb-6">
            {act.organization_name && (
              <p
                className="font-semibold uppercase tracking-widest mb-2"
                style={{ fontSize: 11, color: "#8b5cf6" }}
              >
                {act.organization_name}
              </p>
            )}
            <h1
              className="font-extrabold leading-tight tracking-tight"
              style={{ fontSize: "clamp(1.75rem, 5vw, 2.75rem)", letterSpacing: "-0.02em" }}
            >
              {act.title}
            </h1>
          </div>
        )}

        {/* date + meta chips */}
        <div className="flex flex-wrap gap-3 mb-8">
          {/* date chip — prominent */}
          <div
            className="pub-detail-chip rounded-2xl px-4 py-3 flex items-center gap-3"
          >
            <div
              className="rounded-xl flex items-center justify-center shrink-0"
              style={{ width: 44, height: 44, background: "rgba(139,92,246,0.15)" }}
            >
              <p className="font-extrabold leading-none text-white" style={{ fontSize: 20 }}>{dp.day}</p>
            </div>
            <div>
              <p className="font-semibold" style={{ fontSize: 13, color: "#8b5cf6" }}>
                {dp.month} {dp.year}
              </p>
              <p className="capitalize" style={{ fontSize: 12, color: "rgba(248,250,252,0.5)", marginTop: 1 }}>
                {dp.weekday}
              </p>
            </div>
          </div>

          {/* time chip */}
          <div className="pub-detail-chip rounded-2xl px-4 py-3 flex items-center gap-2.5">
            <Clock style={{ width: 18, height: 18, color: "#60a5fa", flexShrink: 0 }} />
            <span className="font-semibold" style={{ fontSize: 15 }}>{dp.time}</span>
          </div>

          {act.location && (
            <div className="pub-detail-chip rounded-2xl px-4 py-3 flex items-center gap-2.5">
              <MapPin style={{ width: 18, height: 18, color: "#34d399", flexShrink: 0 }} />
              <span style={{ fontSize: 14 }}>{act.location}</span>
            </div>
          )}

          {act.asistencia_esperada && (
            <div className="pub-detail-chip rounded-2xl px-4 py-3 flex items-center gap-2.5">
              <Users style={{ width: 18, height: 18, color: "#fb923c", flexShrink: 0 }} />
              <span style={{ fontSize: 14 }}>Hasta {act.asistencia_esperada} personas</span>
            </div>
          )}
        </div>

        {/* divider */}
        {(act.description || act.objetivo) && (
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 32 }} />
        )}

        {/* description */}
        {act.description && (
          <div className="mb-8">
            <p
              className="font-semibold uppercase tracking-widest mb-3"
              style={{ fontSize: 11, color: "rgba(248,250,252,0.4)" }}
            >
              Descripción
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "rgba(248,250,252,0.75)" }}>
              {act.description}
            </p>
          </div>
        )}

        {/* objetivo */}
        {act.objetivo && (
          <div
            className="rounded-2xl p-5"
            style={{
              background: "rgba(139,92,246,0.08)",
              border: "1px solid rgba(139,92,246,0.2)",
            }}
          >
            <p
              className="font-semibold uppercase tracking-widest mb-2"
              style={{ fontSize: 11, color: "#8b5cf6" }}
            >
              Objetivo
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(248,250,252,0.75)" }}>
              {act.objetivo}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
