import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Cake, CalendarDays, Check, ClipboardList, FileText, HandCoins, Target, UserCheck, Users, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats, useDashboardStats, useOrganizations } from "@/hooks/use-api";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

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
        <circle cx={size / 2} cy={size / 2} r={radius} className="text-muted/30" stroke="currentColor" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="text-emerald-500"
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-semibold">{progress}%</span>
        <span className="text-[10px] text-muted-foreground">progreso</span>
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
    <Card className="hover-elevate cursor-pointer" onClick={onClick}>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </div>
        <p className="text-sm">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: organizations = [] } = useOrganizations();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <Skeleton className="mb-2 h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
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
    <div className="space-y-6 px-4 py-6 sm:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{isBishopric ? "Dashboard" : roleDashboardTitle[userRole] ?? "Dashboard"}</h1>
        <p className="text-sm text-muted-foreground">
          {getGreeting(new Date())}
          {user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </p>
      </div>

      <Card className="overflow-hidden bg-gradient-to-br from-amber-50 via-amber-100 to-amber-200 dark:from-amber-900/60 dark:via-amber-800/50 dark:to-amber-700/40">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 text-amber-700 shadow-sm dark:bg-white/10 dark:text-amber-200">
              <CalendarDays className="h-4 w-4" />
            </span>
            <CardTitle className="text-lg font-semibold">{isBishopric ? "Hoy en el barrio" : "Resumen de tu rol"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm text-amber-900/80 dark:text-amber-100/80">
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {data.upcomingInterviews} entrevistas esta semana
            </li>
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {data.upcomingActivities.length} actividad próxima
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              {data.pendingAssignments > 0 ? `${data.pendingAssignments} tareas pendientes` : "Todo lo demás al día"}
            </li>
          </ul>
          <Button className="w-full rounded-full bg-primary/90 text-primary-foreground hover:bg-primary" onClick={() => setLocation("/calendar")}>
            Ver agenda
          </Button>
        </CardContent>
      </Card>

      {isBishopric ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/goals")}>
              <CardContent className="flex items-center justify-between gap-4 pt-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Target className="h-5 w-5 text-primary" />
                    Progreso de metas de barrio
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>{data.goals.completed} de {data.goals.total} metas</p>
                    <p>{data.goals.percentage}% de avance</p>
                  </div>
                </div>
                <ProgressRing value={data.goals.percentage} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <QuickCard title="Presupuesto" subtitle={`${data.budgetRequests.pending} pendientes`} icon={Wallet} onClick={() => setLocation("/budget")} />
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
              <h2 className="text-base font-semibold">Cumpleaños</h2>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/birthdays")}>Ver todo</Button>
            </div>
            <Card>
              <CardContent className="space-y-3 pt-6">
                {birthdaysPreview.length > 0 ? (
                  birthdaysPreview.map((birthday, idx) => (
                    <div key={`${birthday.name}-${idx}`} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm" data-testid={`birthday-item-${idx}`}>
                      <div className="flex items-center gap-2">
                        <Cake className="h-4 w-4 text-primary" />
                        <p className="font-medium">{birthday.name}</p>
                      </div>
                      <Badge variant="outline">{birthday.date}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No hay cumpleaños registrados</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : isOrgRole ? (
        <div className="space-y-4">
          <QuickCard title="Mi organización" subtitle={organization?.name ?? "Panel de presidencia"} icon={Users} onClick={() => setLocation(organizationHref)} />

          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-muted/10 no-hover-interaction-elevate">
              <CardContent className="space-y-2 pt-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Semáforo semanal</p>
                  <div className={`inline-flex items-center gap-1 rounded-full border border-current/30 bg-current/10 px-2 py-0.5 text-[11px] ${organizationSemaphore.textClass}`}>
                    <span className={`h-2 w-2 rounded-full ${organizationSemaphore.dotClass}`} />
                    {organizationSemaphore.label}
                  </div>
                </div>
                <p className="text-lg font-semibold">Carga controlada</p>
                <p className="text-xs text-muted-foreground">{data.pendingAssignments} pendientes · {data.upcomingInterviews} entrevistas</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/interviews")}>
              <CardContent className="space-y-2 pt-5">
                <p className="text-xs font-semibold text-muted-foreground">Siguiente mejor acción</p>
                <p className="text-base font-semibold leading-tight">Solicitar entrevista con el Obispado</p>
                <p className="text-xs text-muted-foreground">{data.upcomingInterviews} entrevistas por coordinar</p>
                <Button className="h-8 w-full rounded-full" size="sm">
                  Ir ahora <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/leadership")}>
            <CardContent className="flex items-center justify-between gap-3 pt-5">
              <div>
                <p className="text-sm font-semibold">Liderazgo</p>
                <p className="text-xs text-muted-foreground">Ver líderes y organizaciones del barrio</p>
              </div>
              <Users className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
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
