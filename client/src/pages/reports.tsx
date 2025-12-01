import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Calendar, TrendingUp, DollarSign, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

interface ReportData {
  period: string;
  meetingsByType: Array<{ type: string; count: number }>;
  budgetByStatus: Array<{ status: string; count: number; amount: number }>;
  budgetByOrganization: Array<{ org: string; approved: number; pending: number; total: number }>;
  interviewsByMonth: Array<{ month: string; completed: number; pending: number }>;
  activitiesByOrganization: Array<{ org: string; count: number }>;
  totalMetrics: {
    totalMeetings: number;
    totalBudget: number;
    totalInterviews: number;
    totalActivities: number;
  };
}

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function ReportsPage() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState<"meetings" | "budget" | "interviews" | "activities">("meetings");
  const [periodMonths, setPeriodMonths] = useState("3");
  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const [organizationFilter, setOrganizationFilter] = useState<string>(
    isOrgMember ? user?.organizationId || "all" : "all"
  );

  const { data: reports, isLoading } = useQuery({
    queryKey: ["/api/reports", { period: periodMonths, org: organizationFilter }],
  });

  const data = reports as ReportData | undefined;

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const metrics = data?.totalMetrics || {
    totalMeetings: 0,
    totalBudget: 0,
    totalInterviews: 0,
    totalActivities: 0,
  };

  const metricCards = [
    { label: "Reuniones", value: metrics.totalMeetings, icon: Calendar, color: "bg-blue-50" },
    { label: "Presupuesto Total", value: `$${(metrics.totalBudget / 1000).toFixed(1)}k`, icon: DollarSign, color: "bg-green-50" },
    { label: "Entrevistas", value: metrics.totalInterviews, icon: Users, color: "bg-purple-50" },
    { label: "Actividades", value: metrics.totalActivities, icon: TrendingUp, color: "bg-orange-50" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Reportes e Históricos</h1>
        <p className="text-muted-foreground">Análisis detallado con filtros avanzados y métricas</p>
      </div>

      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm mb-2 block font-medium">Período</label>
              <Select value={periodMonths} onValueChange={setPeriodMonths}>
                <SelectTrigger data-testid="select-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Último mes</SelectItem>
                  <SelectItem value="3">Últimos 3 meses</SelectItem>
                  <SelectItem value="6">Últimos 6 meses</SelectItem>
                  <SelectItem value="12">Último año</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm mb-2 block font-medium">Organización</label>
              <Select value={organizationFilter} onValueChange={setOrganizationFilter}>
                <SelectTrigger data-testid="select-org">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="hombres-jovenes">Hombres Jóvenes</SelectItem>
                  <SelectItem value="mujeres-jovenes">Mujeres Jóvenes</SelectItem>
                  <SelectItem value="sociedad-socorro">Sociedad de Socorro</SelectItem>
                  <SelectItem value="primaria">Primaria</SelectItem>
                  <SelectItem value="escuela-dominical">Escuela Dominical</SelectItem>
                  <SelectItem value="jas">JAS</SelectItem>
                  <SelectItem value="cuorum-elderes">Cuórum de Élderes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm mb-2 block font-medium">Tipo de Reporte</label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as any)}>
                <SelectTrigger data-testid="select-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meetings">Reuniones</SelectItem>
                  <SelectItem value="budget">Presupuestos</SelectItem>
                  <SelectItem value="interviews">Entrevistas</SelectItem>
                  <SelectItem value="activities">Actividades</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {metricCards.map((card, idx) => (
          <Card key={idx} className={card.color}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">{card.label}</p>
                  <p className="text-2xl font-bold">{card.value}</p>
                </div>
                <card.icon className="h-10 w-10 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Report Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {reportType === "meetings" && data?.meetingsByType && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Reuniones por Tipo</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.meetingsByType}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Distribución de Reuniones</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.meetingsByType}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {data.meetingsByType.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {reportType === "budget" && data?.budgetByStatus && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Presupuestos por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.budgetByStatus}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Presupuestos por Organización</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.budgetByOrganization.map((org, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                      <span className="text-sm font-medium">{org.org}</span>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">
                          {org.approved} Aprobados
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          ${org.total}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {reportType === "interviews" && data?.interviewsByMonth && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Entrevistas por Mes</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.interviewsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" fill="#10b981" name="Completadas" />
                  <Bar dataKey="pending" fill="#f59e0b" name="Pendientes" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {reportType === "activities" && data?.activitiesByOrganization && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Actividades por Organización</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.activitiesByOrganization}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="org" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Export Options */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Opciones de Exportación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" data-testid="button-export-pdf">
              Exportar como PDF
            </Button>
            <Button variant="outline" data-testid="button-export-excel">
              Exportar como Excel
            </Button>
            <Button variant="outline" data-testid="button-export-csv">
              Descargar CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
