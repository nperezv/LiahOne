import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Check, Users, Target, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats, useDashboardStats } from "@/hooks/use-api";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

const clampProgress = (value: number) => Math.min(100, Math.max(0, value));

const getGreeting = (date: Date) => {
  const hour = date.getHours();
  if (hour < 12) {
    return "Buenos días";
  }
  if (hour < 19) {
    return "Buenas tardes";
  }
  return "Buenas noches";
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="text-muted/30"
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
        />
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

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

  return (
    <div className="space-y-6 px-4 py-6 sm:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {getGreeting(new Date())}{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </p>
      </div>

      <Card className="overflow-hidden bg-gradient-to-br from-amber-50 via-amber-100 to-amber-200 dark:from-amber-900/60 dark:via-amber-800/50 dark:to-amber-700/40">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 text-amber-700 shadow-sm dark:bg-white/10 dark:text-amber-200">
              <CalendarDays className="h-4 w-4" />
            </span>
            <CardTitle className="text-lg font-semibold">Hoy en el barrio</CardTitle>
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
              Todo lo demás al día
            </li>
          </ul>
          <Button
            className="w-full rounded-full bg-primary/90 text-primary-foreground hover:bg-primary"
            onClick={() => setLocation("/calendar")}
          >
            Ver agenda
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/leadership")}>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Users className="h-5 w-5 text-primary" />
                Personas
              </div>
              <div className="space-y-1 text-sm">
                <p>{data.upcomingInterviews} entrevistas</p>
                <p>{data.upcomingBirthdays.length} cumpleaños</p>
              </div>
            </div>
            <ProgressRing value={data.goals.percentage} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/budget")}>
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Wallet className="h-4 w-4 text-primary" />
                Presup.
              </div>
              <p className="text-sm">
                {data.budgetRequests.pending} pendientes
              </p>
            </CardContent>
          </Card>
          <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/assignments")}>
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Target className="h-4 w-4 text-primary" />
                Tareas
              </div>
              <p className="text-sm">
                {data.pendingAssignments > 0
                  ? `${data.pendingAssignments} pendientes`
                  : "Todo hecho 🎉"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Próximas actividades</h2>
          <Button variant="ghost" size="sm" onClick={() => setLocation("/activities")}>
            Ver todas
          </Button>
        </div>
        <Card>
          <CardContent className="space-y-3 pt-6">
            {data.upcomingActivities.length > 0 ? (
              data.upcomingActivities.map((activity, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm"
                  data-testid={`activity-item-${idx}`}
                >
                  <div className="space-y-1">
                    <p className="font-medium">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">{activity.location}</p>
                  </div>
                  <Badge variant="outline">{activity.date}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay actividades programadas
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
