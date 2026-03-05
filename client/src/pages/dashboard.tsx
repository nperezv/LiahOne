import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Cake, CalendarDays, Check, ClipboardList, FileText, HandCoins, Target, UserCheck, Users, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats, useDashboardStats, useOrganizations } from "@/hooks/use-api";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { IconBadge } from "@/components/ui/icon-badge";
import { useState, useEffect } from "react";

// ── Helpers ────────────────────────────────────────────────
const clampProgress = (value: number) => Math.min(100, Math.max(0, value));

const getGreeting = (date: Date) => {
  const hour = date.getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
};

const getOrganizationSemaphore = (pendingAssignments: number, upcomingInterviews: number) => {
  const workload = pendingAssignments + upcomingInterviews;
  if (workload <= 1) {
    return { label: "verde", dotClass: "bg-emerald-500", textClass: "text-emerald-600 dark:text-emerald-400" };
  }
  if (workload <= 3) {
    return { label: "amarillo", dotClass: "bg-amber-500", textClass: "text-amber-600 dark:text-amber-400" };
  }
  return { label: "rojo", dotClass: "bg-rose-500", textClass: "text-rose-600 dark:text-rose-400" };
};

const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }
  navigate(path);
};

// ── Floating Card ──────────────────────────────────────────
// Negro puro top-left → gris oscuro bottom-right, sin bordes, efecto flotante
function FloatCard({
  children,
  className = "",
  onClick,
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov && onClick
          ? "linear-gradient(135deg, #0d0d10 0%, #0d0d10 55%, #222226 100%)"
          : "linear-gradient(135deg, #0d0d10 0%, #0d0d10 55%, #1e1e22 100%)",
        border: "none",
        borderRadius: 20,
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.28s cubic-bezier(.4,0,.2,1)",
        transform: hov && onClick ? "translateY(-4px) scale(1.01)" : "none",
        boxShadow: hov && onClick
          ? "0 16px 48px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.5)"
          : "0 8px 28px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Semáforo semanal ───────────────────────────────────────
function SemDot({ load }: { load: number }) {
  const s = load <= 1
    ? { color: "#10b981", label: "Verde", detail: "Carga controlada" }
    : load <= 3
      ? { color: "#f59e0b", label: "Ámbar", detail: "Atención media" }
      : { color: "#f43f5e", label: "Rojo", detail: "Semana exigente" };
  return (
    <>
      {/* keyframe definido inline una sola vez */}
      <style>{`@keyframes semPulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: s.color,
          boxShadow: `0 0 8px ${s.color}`,
          animation: "semPulse 2s infinite",
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>{s.label}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>· {s.detail}</span>
      </div>
    </>
  );
}

// ── Stat Pill ──────────────────────────────────────────────
function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      borderRadius: 12,
      padding: "10px 14px",
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

// ── Progress Ring ──────────────────────────────────────────
function ProgressRing({ value }: { value: number }) {
  const size = 72;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = clampProgress(value);
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex h-[72px] w-[72px] items-center justify-center" style={{ flexShrink: 0 }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="url(#ringGrad)" strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-semibold">{progress}%</span>
        <span className="text-[10px] text-muted-foreground">progreso</span>
      </div>
    </div>
  );
}

// ── Quick Card ─────────────────────────────────────────────
function QuickCard({
  title,
  subtitle,
  icon: Icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: any;
  onClick: () => void;
}) {
  return (
    <FloatCard onClick={onClick}>
      <div className="space-y-2 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <IconBadge className="h-8 w-8">
            <Icon className="h-4 w-4 text-zinc-200" />
          </IconBadge>
          {title}
        </div>
        <p className="text-sm">{subtitle}</p>
      </div>
    </FloatCard>
  );
}

// ── Dashboard Page ─────────────────────────────────────────
export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: organizations = [] } = useOrganizations();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <FloatCard key={i}>
              <div className="p-6 pb-0">
                <Skeleton className="h-6 w-32" />
              </div>
              <div className="p-6">
                <Skeleton className="h-20 w-full" />
              </div>
            </FloatCard>
          ))}
        </div>
      </div>
    );
  }

  const defaultStats: DashboardStats = {
    pendingAssignments: 0,
    upcomingInterviews: 0,
    budgetRequests: { pending: 0, approved: 0, total: 0 },
    goals: { completed: 0, total: 0, percentage: 0 },
    upcomingBirthdays: [],
    organizationHealth: [],
    upcomingActivities: [],
  };

  const data = stats || defaultStats;
  const birthdaysPreview = data.upcomingBirthdays.slice(0, 3);
  const userRole = user?.role ?? "";
  const firstName = user?.name?.split(" ")[0] ?? "";
  const isBishopric = ["obispo", "consejero_obispo"].includes(userRole);
  const isOrgRole = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(userRole);
  const load = data.pendingAssignments + data.upcomingInterviews;

  const organization = organizations.find((org: any) => org.id === user?.organizationId);
  const orgSlugMap: Record<string, string> = {
    hombres_jovenes: "hombres-jovenes",
    mujeres_jovenes: "mujeres-jovenes",
    sociedad_socorro: "sociedad-socorro",
    primaria: "primaria",
    escuela_dominical: "escuela-dominical",
    jas: "jas",
    cuorum_elderes: "cuorum-elderes",
  };
  const organizationHref = organization?.type
    ? `/presidency/${orgSlugMap[organization.type] ?? organization.type.replace(/_/g, "-")}`
    : "/leadership";
  const organizationSemaphore = getOrganizationSemaphore(data.pendingAssignments, data.upcomingInterviews);

  const roleDashboardTitle: Record<string, string> = {
    secretario: "Panel de Secretaría",
    secretario_ejecutivo: "Panel Ejecutivo",
    secretario_financiero: "Panel Financiero",
    presidente_organizacion: "Panel de Organización",
    secretario_organizacion: "Panel de Organización",
    consejero_organizacion: "Panel de Organización",
  };

  const nextBestAction = data.pendingAssignments > 0
    ? { title: "Cerrar pendientes", description: `Te falta cerrar ${data.pendingAssignments} asignaciones`, href: "/assignments" }
    : data.upcomingInterviews > 0
      ? { title: "Preparar entrevistas", description: `${data.upcomingInterviews} entrevistas por coordinar`, href: "/interviews" }
      : { title: "Planificar semana", description: "Todo al día, define la próxima prioridad", href: "/calendar" };

  const fadeIn = (delay = 0): React.CSSProperties => ({
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(16px)",
    transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
  });

  return (
    <div className="space-y-6 px-4 py-6 sm:px-8">

      {/* ── Header ── */}
      <div className="space-y-1" style={fadeIn(0)}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {getGreeting(new Date())}{firstName ? `, ${firstName}` : ""} 👋
            </p>
            <h1 className="text-2xl font-semibold">
              {isBishopric ? "Dashboard" : roleDashboardTitle[userRole] ?? "Dashboard"}
            </h1>
          </div>
          {/* Avatar inicial */}
          {user?.name && (
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}>
              {firstName[0]}
            </div>
          )}
        </div>
        {/* Semáforo semanal debajo del saludo */}
        <SemDot load={load} />
      </div>

      {/* ── Hero: Hoy en el barrio / Resumen de tu rol ── */}
      <div style={fadeIn(80)}>
        <FloatCard>
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <IconBadge className="rounded-xl">
                <CalendarDays className="h-4 w-4" />
              </IconBadge>
              <h2 className="text-lg font-semibold">
                {isBishopric ? "Hoy en el barrio" : "Resumen de tu rol"}
              </h2>
            </div>

            {/* Stat pills — lectura de un vistazo */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <StatPill label="Entrevistas" value={data.upcomingInterviews} />
              <StatPill label="Pendientes" value={data.pendingAssignments} />
              <StatPill label="Actividades" value={data.upcomingActivities.length} />
            </div>

            <Button
              className="w-full rounded-full bg-[#007AFF] text-white hover:bg-[#007AFF]/90"
              onClick={() => setLocation("/calendar")}
            >
              Ver agenda
            </Button>
          </div>
        </FloatCard>
      </div>

      {/* ── Bishopric section ── */}
      {isBishopric ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" style={fadeIn(160)}>
            {/* Metas */}
            <FloatCard onClick={() => setLocation("/goals")}>
              <div className="flex items-center justify-between gap-4 p-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <IconBadge>
                      <Target className="h-5 w-5 text-zinc-200" />
                    </IconBadge>
                    Metas de barrio
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>{data.goals.completed} de {data.goals.total} metas</p>
                    <p>{data.goals.percentage}% de avance</p>
                  </div>
                </div>
                <ProgressRing value={data.goals.percentage} />
              </div>
            </FloatCard>

            <div className="grid grid-cols-2 gap-4">
              <QuickCard
                title="Presupuesto"
                subtitle={`${data.budgetRequests.pending} pendientes`}
                icon={Wallet}
                onClick={() => setLocation("/budget")}
              />
              <QuickCard
                title="Tareas"
                subtitle={data.pendingAssignments > 0 ? `${data.pendingAssignments} pendientes` : "Todo hecho 🎉"}
                icon={Target}
                onClick={() => setLocation("/assignments")}
              />
            </div>
          </div>

          {/* Cumpleaños */}
          <div className="space-y-3" style={fadeIn(240)}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Cumpleaños 🎂</h2>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/birthdays")}>Ver todo</Button>
            </div>
            <FloatCard>
              <div className="space-y-1 p-4">
                {birthdaysPreview.length > 0 ? (
                  birthdaysPreview.map((birthday, idx) => (
                    <div
                      key={`${birthday.name}-${idx}`}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                      style={{
                        borderBottom: idx < birthdaysPreview.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      }}
                      data-testid={`birthday-item-${idx}`}
                    >
                      <div className="flex items-center gap-2">
                        <IconBadge className="h-8 w-8">
                          <Cake className="h-4 w-4 text-zinc-200" />
                        </IconBadge>
                        <p className="font-medium">{birthday.name}</p>
                      </div>
                      <Badge variant="outline">{birthday.date}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground px-3 py-2">No hay cumpleaños registrados</p>
                )}
              </div>
            </FloatCard>
          </div>
        </>

      ) : isOrgRole ? (
        /* ── Org role section ── */
        <div className="space-y-4" style={fadeIn(160)}>
          <QuickCard
            title="Mi organización"
            subtitle={organization?.name ?? "Panel de presidencia"}
            icon={Users}
            onClick={() => navigateWithTransition(setLocation, organizationHref)}
          />

          <div className="grid grid-cols-2 gap-3">
            {/* Semáforo org */}
            <FloatCard>
              <div className="space-y-2 p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Semáforo semanal</p>
                  <div className={`inline-flex items-center gap-1 rounded-full border border-current/30 bg-current/10 px-2 py-0.5 text-[11px] ${organizationSemaphore.textClass}`}>
                    <span className={`h-2 w-2 rounded-full ${organizationSemaphore.dotClass}`} />
                    {organizationSemaphore.label}
                  </div>
                </div>
                <p className="text-lg font-semibold">Carga controlada</p>
                <p className="text-xs text-muted-foreground">
                  {data.pendingAssignments} pendientes · {data.upcomingInterviews} entrevistas
                </p>
              </div>
            </FloatCard>

            {/* Siguiente mejor acción */}
            <FloatCard onClick={() => navigateWithTransition(setLocation, "/interviews?from=org-dashboard")}>
              <div className="space-y-2 p-5">
                <p className="text-xs font-semibold text-muted-foreground">Siguiente acción</p>
                <p className="text-base font-semibold leading-tight">Solicitar entrevista con el Obispado</p>
                <p className="text-xs text-muted-foreground">{data.upcomingInterviews} entrevistas por coordinar</p>
                <Button
                  className="h-8 w-full rounded-full bg-gradient-to-r from-violet-600/90 to-indigo-600/90 hover:from-violet-600 hover:to-indigo-600"
                  size="sm"
                >
                  Ir ahora <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </FloatCard>
          </div>

          {/* Liderazgo */}
          <FloatCard onClick={() => navigateWithTransition(setLocation, "/leadership?from=org-dashboard")}>
            <div className="flex items-center justify-between gap-3 p-5">
              <div>
                <p className="text-sm font-semibold">Liderazgo</p>
                <p className="text-xs text-muted-foreground">Ver líderes y organizaciones del barrio</p>
              </div>
              <IconBadge>
                <Users className="h-5 w-5 text-zinc-200" />
              </IconBadge>
            </div>
          </FloatCard>
        </div>

      ) : (
        /* ── Other roles section ── */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" style={fadeIn(160)}>
          {userRole === "secretario" && (
            <>
              <QuickCard title="Secretaría" subtitle="Asistencias y registros" icon={ClipboardList} onClick={() => setLocation("/secretary-dashboard")} />
              <QuickCard title="Consejo de Barrio" subtitle="Revisión semanal" icon={Users} onClick={() => setLocation("/ward-council")} />
              <QuickCard title="Liderazgo" subtitle="Organizaciones del barrio" icon={Users} onClick={() => setLocation("/leadership")} />
            </>
          )}
          {userRole === "secretario_ejecutivo" && (
            <>
              <QuickCard title="Entrevistas" subtitle={`${data.upcomingInterviews} próximas`} icon={UserCheck} onClick={() => setLocation("/interviews")} />
              <QuickCard title="Consejo de Barrio" subtitle="Agenda y acuerdos" icon={Users} onClick={() => setLocation("/ward-council")} />
              <QuickCard title="Reunión sacramental" subtitle="Creación de programa" icon={FileText} onClick={() => setLocation("/sacramental-meeting")} />
            </>
          )}
          {userRole === "secretario_financiero" && (
            <>
              <QuickCard title="Presupuestos" subtitle={`${data.budgetRequests.pending} pendientes`} icon={HandCoins} onClick={() => setLocation("/budget")} />
              <QuickCard title="Reportes" subtitle="Seguimiento financiero" icon={FileText} onClick={() => setLocation("/reports")} />
              <QuickCard title="Calendario" subtitle="Fechas de gestión" icon={CalendarDays} onClick={() => setLocation("/calendar")} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
