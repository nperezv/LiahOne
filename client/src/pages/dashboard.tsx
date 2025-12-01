import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  DollarSign,
  UserCheck,
  Target,
  Cake,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStats } from "@/hooks/use-api";
import { useLocation } from "wouter";

interface DashboardStats {
  pendingAssignments: number;
  upcomingInterviews: number;
  budgetRequests: {
    pending: number;
    approved: number;
    total: number;
  };
  goals: {
    completed: number;
    total: number;
    percentage: number;
  };
  organizationGoals?: {
    items: Array<{
      id: string;
      title: string;
      description?: string;
      currentValue: number;
      targetValue: number;
      percentage: number;
    }>;
    completed: number;
    total: number;
    percentage: number;
  };
  upcomingBirthdays: Array<{ name: string; date: string }>;
  organizationHealth: Array<{
    name: string;
    status: "healthy" | "warning" | "critical";
  }>;
  upcomingActivities: Array<{ title: string; date: string; location: string }>;
  userRole?: string;
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const [, setLocation] = useLocation();

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

  const getHealthColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-500";
      case "warning":
        return "bg-yellow-500";
      case "critical":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "warning":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "critical":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {(data.userRole === "presidente_organizacion" || data.userRole === "consejero_organizacion" || data.userRole === "secretario_organizacion")
            ? "Métricas de tu organización" 
            : "Vista general de las actividades y métricas del barrio"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Asignaciones Pendientes */}
        <Card 
          className="hover-elevate cursor-pointer" 
          onClick={() => setLocation("/assignments")}
          data-testid="card-assignments"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold">
              Asignaciones Pendientes
            </CardTitle>
            <Calendar className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-pending-assignments">
              {data.pendingAssignments}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tareas asignadas sin completar
            </p>
          </CardContent>
        </Card>

        {/* Entrevistas Próximas */}
        <Card 
          className="hover-elevate cursor-pointer" 
          onClick={() => setLocation("/interviews")}
          data-testid="card-interviews"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold">
              {(data.userRole === "presidente_organizacion" || data.userRole === "consejero_organizacion" || data.userRole === "secretario_organizacion")
                ? "Solicitudes de Entrevista"
                : "Entrevistas Próximas"}
            </CardTitle>
            <UserCheck className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-upcoming-interviews">
              {data.upcomingInterviews}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(data.userRole === "presidente_organizacion" || data.userRole === "consejero_organizacion" || data.userRole === "secretario_organizacion")
                ? "Solicitudes pendientes al Obispado"
                : "En los próximos 7 días"}
            </p>
          </CardContent>
        </Card>

        {/* Solicitudes de Presupuesto */}
        <Card 
          className="hover-elevate cursor-pointer" 
          onClick={() => setLocation("/budget")}
          data-testid="card-budget"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold">
              Solicitudes de Presupuesto
            </CardTitle>
            <DollarSign className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold" data-testid="text-budget-pending">
                {data.budgetRequests.pending}
              </div>
              <span className="text-xs text-muted-foreground">
                / {data.budgetRequests.total} total
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                {data.budgetRequests.approved} aprobadas
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Progreso de Metas del Barrio */}
        <Card 
          className="hover-elevate cursor-pointer" 
          onClick={() => setLocation("/goals")}
          data-testid="card-goals"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold">
              Progreso de Metas del Barrio
            </CardTitle>
            <Target className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="text-3xl font-bold" data-testid="text-goals-progress">
                {data.goals.percentage}%
              </div>
              <span className="text-xs text-muted-foreground">
                {data.goals.completed} / {data.goals.total} completadas
              </span>
            </div>
            <Progress value={data.goals.percentage} className="h-2" />
          </CardContent>
        </Card>

        {/* Cumpleaños Próximos */}
        <Card 
          className="hover-elevate cursor-pointer" 
          onClick={() => setLocation("/birthdays")}
          data-testid="card-birthdays"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold">
              Cumpleaños Próximos
            </CardTitle>
            <Cake className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.upcomingBirthdays.length > 0 ? (
                data.upcomingBirthdays.map((birthday, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-sm"
                    data-testid={`birthday-item-${idx}`}
                  >
                    <span className="font-medium">{birthday.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {birthday.date}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay cumpleaños próximos
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Salud de Organizaciones - Solo para Obispado */}
        {data.userRole !== "presidente_organizacion" && data.userRole !== "consejero_organizacion" && data.userRole !== "secretario_organizacion" && (
          <Card 
            className="hover-elevate cursor-pointer" 
            onClick={() => setLocation("/reports")}
            data-testid="card-health"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-lg font-semibold">
                Salud de Organizaciones
              </CardTitle>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.organizationHealth.length > 0 ? (
                  data.organizationHealth.map((org, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-sm"
                      data-testid={`org-health-${idx}`}
                    >
                      <span className="font-medium">{org.name}</span>
                      <div className="flex items-center gap-1">
                        {getHealthIcon(org.status)}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Todas las organizaciones están funcionando correctamente
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metas de la Organización - Solo para miembros de organización */}
        {(data.userRole === "presidente_organizacion" || data.userRole === "consejero_organizacion" || data.userRole === "secretario_organizacion") && data.organizationGoals !== undefined && (
          <Card 
            className="hover-elevate cursor-pointer" 
            onClick={() => setLocation("/goals?tab=organizacion")}
            data-testid="card-org-goals"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-lg font-semibold">
                Metas de la Organización
              </CardTitle>
              <Target className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2 mb-3">
                <div className="text-3xl font-bold" data-testid="text-org-goals-percentage">
                  {data.organizationGoals.percentage}%
                </div>
                <span className="text-xs text-muted-foreground" data-testid="text-org-goals-completed">
                  {data.organizationGoals.completed} / {data.organizationGoals.total} completadas
                </span>
              </div>
              <Progress value={data.organizationGoals.percentage} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* Próximas Actividades */}
        <Card 
          className="lg:col-span-2 hover-elevate cursor-pointer" 
          onClick={() => setLocation("/activities")}
          data-testid="card-activities"
        >
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Próximas Actividades
            </CardTitle>
            <CardDescription>
              Eventos y actividades programadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.upcomingActivities.length > 0 ? (
                data.upcomingActivities.map((activity, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                    data-testid={`activity-item-${idx}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{activity.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {activity.location}
                      </span>
                    </div>
                    <Badge variant="outline">{activity.date}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay actividades programadas
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
