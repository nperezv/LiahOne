import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Cake, CalendarDays, ClipboardList, FileText, HandCoins, Target, UserCheck, Users, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats, useDashboardStats, useOrganizations } from "@/hooks/use-api";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { GlassCard } from "@/components/ui/glass-card";
import { IconBadge } from "@/components/ui/icon-badge";

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
    return { label: "verde", dotClass: "bg-emerald-500", textClass: "text-emerald-400" };
  }
  if (workload <= 3) {
    return { label: "amarillo", dotClass: "bg-amber-400", textClass: "text-amber-400" };
  }
  return { label: "rojo", dotClass: "bg-rose-400", textClass: "text-rose-400" };
};

const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }
  navigate(path);
};

function ProgressRing({ value }: { value: number }) {
  const size = 72;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = clampProgress(value);
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex h-[72px] w-[72px] items-center justify-center">
      <svg width={size} height={size} className="rotate-[-90deg]">
        <defs>
          <linearGradient id="dashboard-ring" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} className="text-slate-300 dark:text-white/10" stroke="currentColor" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#dashboard-ring)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{progress}%</span>
        <span className="text-[10px] tracking-[0.06em] text-slate-500 dark:text-white/40">META</span>
      </div>
    </div>
  );
}

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
    <GlassCard className="cursor-pointer" onClick={onClick}>
      <div className="space-y-3 p-4">
        <IconBadge>
          <Icon className="h-4 w-4 text-white" />
        </IconBadge>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
          <p className="text-xs text-slate-500 dark:text-white/40">{subtitle}</p>
        </div>
      </div>
    </GlassCard>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: organizations = [] } = useOrganizations();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 dark:bg-[#060608]">
        <div className="mb-6">
          <Skeleton className="mb-2 h-8 w-64 bg-slate-200 dark:bg-white/10" />
          <Skeleton className="h-4 w-96 bg-slate-200 dark:bg-white/10" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <GlassCard key={i}>
              <div className="space-y-3 p-6">
                <Skeleton className="h-6 w-32 bg-slate-200 dark:bg-white/10" />
                <Skeleton className="h-20 w-full bg-slate-200 dark:bg-white/10" />
              </div>
            </GlassCard>
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
  const isBishopric = ["obispo", "consejero_obispo"].includes(userRole);
  const isOrgRole = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(userRole);

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
  const organizationHref = organization?.type ? `/presidency/${orgSlugMap[organization.type] ?? organization.type.replace(/_/g, "-")}` : "/leadership";
  const organizationSemaphore = getOrganizationSemaphore(data.pendingAssignments, data.upcomingInterviews);

  const roleDashboardTitle: Record<string, string> = {
    secretario: "Panel de Secretaría",
    secretario_ejecutivo: "Panel Ejecutivo",
    secretario_financiero: "Panel Financiero",
    presidente_organizacion: "Panel de Organización",
    secretario_organizacion: "Panel de Organización",
    consejero_organizacion: "Panel de Organización",
  };

  const weeklyLoad = data.pendingAssignments + data.upcomingInterviews;
  const weeklyLoadStatus = weeklyLoad <= 2 ? { label: "Verde", tone: "text-emerald-500", dot: "bg-emerald-500", detail: "Carga controlada" } : weeklyLoad <= 5
    ? { label: "Ámbar", tone: "text-amber-500", dot: "bg-amber-500", detail: "Atención media" }
    : { label: "Rojo", tone: "text-rose-500", dot: "bg-rose-500", detail: "Semana exigente" };

  const nextBestAction = data.pendingAssignments > 0
    ? { title: "Cerrar pendientes", description: `Te falta cerrar ${data.pendingAssignments} asignaciones`, href: "/assignments" }
    : data.upcomingInterviews > 0
      ? { title: "Preparar entrevistas", description: `${data.upcomingInterviews} entrevistas por coordinar`, href: "/interviews" }
      : { title: "Planificar semana", description: "Todo al día, define la próxima prioridad", href: "/calendar" };

  const weatherAdvice = data.upcomingActivities.length > 0
    ? "Clima: revisa lluvia si hay actividades al aire libre"
    : "Clima: oculto por ahora (sin impacto en agenda de hoy)";
  return (
    <div className="min-h-screen bg-slate-50 space-y-6 px-4 py-6 text-slate-900 dark:bg-[#060608] dark:text-[#f0f0f8] sm:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{isBishopric ? "Dashboard" : roleDashboardTitle[userRole] ?? "Dashboard"}</h1>
        <p className="text-sm text-slate-500 dark:text-white/45">
          {getGreeting(new Date())}
          {user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </p>
        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${weeklyLoadStatus.tone}`}>
          <span className={`h-2 w-2 rounded-full ${weeklyLoadStatus.dot}`} />
          <span>{weeklyLoadStatus.label}</span>
          <span className="font-normal text-slate-500 dark:text-white/45">· {weeklyLoadStatus.detail}</span>
        </div>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <IconBadge>
              <CalendarDays className="h-4 w-4 text-white" />
            </IconBadge>
            <h2 className="text-base font-bold">{isBishopric ? "Hoy en el barrio" : "Resumen de tu rol"}</h2>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-lg font-extrabold text-violet-400">{data.upcomingInterviews}</p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-white/35">Entrevistas</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-lg font-extrabold text-indigo-400">{data.pendingAssignments}</p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-white/35">Pendientes</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-lg font-extrabold text-sky-400">{data.upcomingActivities.length}</p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-white/35">Actividades</p>
            </div>
          </div>

          <Button className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-[0_6px_24px_rgba(99,102,241,0.35)] hover:from-violet-500 hover:to-indigo-500" onClick={() => setLocation("/calendar")}>
            Ver agenda completa
          </Button>
        </div>
      </GlassCard>

      {isBishopric ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <GlassCard className="cursor-pointer" onClick={() => setLocation("/goals")}>
              <div className="flex items-center justify-between gap-4 p-5">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.07em] text-slate-500 dark:text-white/40">Metas</p>
                  <p className="text-2xl font-extrabold">{data.goals.completed}<span className="text-sm font-medium text-slate-500 dark:text-white/30">/{data.goals.total}</span></p>
                  <p className="text-xs text-slate-500 dark:text-white/45">{data.goals.percentage}% de avance</p>
                </div>
                <ProgressRing value={data.goals.percentage} />
              </div>
            </GlassCard>

            <div className="grid grid-cols-2 gap-4">
              <QuickCard title="Presupuesto" subtitle={`${data.budgetRequests.pending} solicitudes`} icon={Wallet} onClick={() => setLocation("/budget")} />
              <QuickCard
                title="Tareas"
                subtitle={data.pendingAssignments > 0 ? `${data.pendingAssignments} pendientes` : "Todo hecho 🎉"}
                icon={Target}
                onClick={() => setLocation("/assignments")}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Cumpleaños próximos 🎂</h2>
              <Button variant="ghost" size="sm" className="text-violet-600 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300" onClick={() => setLocation("/birthdays")}>Ver todo</Button>
            </div>
            <GlassCard>
              <div className="space-y-1 p-3">
                {birthdaysPreview.length > 0 ? (
                  birthdaysPreview.map((birthday, idx) => (
                    <div key={`${birthday.name}-${idx}`} className="flex items-center justify-between rounded-xl px-2 py-2 text-sm" data-testid={`birthday-item-${idx}`}>
                      <div className="flex items-center gap-2">
                        <IconBadge tone="violet" className="h-8 w-8 rounded-lg">
                          <span className="text-xs font-bold text-white">{birthday.name.charAt(0)}</span>
                        </IconBadge>
                        <p className="font-medium text-slate-900 dark:text-white">{birthday.name}</p>
                      </div>
                      <Badge className="border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">{birthday.date}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="p-3 text-sm text-slate-500 dark:text-white/45">No hay cumpleaños registrados</p>
                )}
              </div>
            </GlassCard>
          </div>
        </>
      ) : isOrgRole ? (
        <div className="space-y-4">
          <QuickCard title="Mi organización" subtitle={organization?.name ?? "Panel de presidencia"} icon={Users} onClick={() => navigateWithTransition(setLocation, organizationHref)} />

          <div className="grid grid-cols-2 gap-3">
            <GlassCard className="no-hover-interaction-elevate">
              <div className="space-y-2 p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-white/45">Semáforo semanal</p>
                  <div className={`inline-flex items-center gap-1 rounded-full border border-current/30 bg-current/10 px-2 py-0.5 text-[11px] ${organizationSemaphore.textClass}`}>
                    <span className={`h-2 w-2 rounded-full ${organizationSemaphore.dotClass}`} />
                    {organizationSemaphore.label}
                  </div>
                </div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">Carga controlada</p>
                <p className="text-xs text-slate-500 dark:text-white/45">{data.pendingAssignments} pendientes · {data.upcomingInterviews} entrevistas</p>
              </div>
            </GlassCard>

            <GlassCard className="cursor-pointer" onClick={() => navigateWithTransition(setLocation, "/interviews?from=org-dashboard")}>
              <div className="space-y-2 p-5">
                <p className="text-xs font-semibold text-slate-500 dark:text-white/45">Siguiente mejor acción</p>
                <p className="text-base font-semibold leading-tight text-slate-900 dark:text-white">Solicitar entrevista con el Obispado</p>
                <p className="text-xs text-slate-500 dark:text-white/45">{data.upcomingInterviews} entrevistas por coordinar</p>
                <Button className="h-8 w-full rounded-full bg-gradient-to-r from-violet-600/90 to-indigo-600/90 hover:from-violet-600 hover:to-indigo-600" size="sm">
                  Ir ahora <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </GlassCard>
          </div>

          <GlassCard className="cursor-pointer" onClick={() => navigateWithTransition(setLocation, "/leadership?from=org-dashboard")}>
            <div className="flex items-center justify-between gap-3 p-5">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Liderazgo</p>
                <p className="text-xs text-slate-500 dark:text-white/45">Ver líderes y organizaciones del barrio</p>
              </div>
              <IconBadge tone="blue">
                <Users className="h-5 w-5 text-white" />
              </IconBadge>
            </div>
          </GlassCard>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
