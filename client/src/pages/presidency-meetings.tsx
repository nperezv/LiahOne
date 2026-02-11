import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { useRoute, useLocation } from "wouter";
import {
  Plus,
  Target,
  Download,
  Trash2,
  CalendarDays,
  BookOpen,
  FileText,
  PlayCircle,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { usePresidencyMeetings, useCreatePresidencyMeeting, useOrganizations } from "@/hooks/use-api";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const meetingSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  agenda: z.string().optional(),
  notes: z.string().optional(),
});

type MeetingFormValues = z.infer<typeof meetingSchema>;

function CircularGauge({
  value,
  label,
  subtitle,
  gradientId,
}: {
  value: number;
  label: string;
  subtitle: string;
  gradientId: string;
}) {
  const size = 180;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;

  return (
    <div className="relative mx-auto flex w-full max-w-[220px] items-center justify-center" data-testid={`gauge-${gradientId}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-sm">
        <defs>
          <linearGradient id={`${gradientId}-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--chart-4))" />
            <stop offset="45%" stopColor="hsl(var(--chart-1))" />
            <stop offset="100%" stopColor="hsl(var(--chart-2))" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId}-gradient)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: "spring", stiffness: 80, damping: 16 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-4xl font-bold leading-none">{Math.round(value)}%</p>
        <p className="mt-2 text-sm font-medium text-foreground/90">{label}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

export default function PresidencyMeetingsPage() {
  const { user } = useAuth();
  const [, params] = useRoute("/presidency/:org");
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | undefined>();

  const { data: organizations = [] } = useOrganizations();
  const { data: meetings = [], isLoading } = usePresidencyMeetings(organizationId);
  const createMutation = useCreatePresidencyMeeting(organizationId);
  const { toast } = useToast();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const isObispado = user?.role === "obispo" || user?.role === "consejero_obispo";
  const canCreate = !isOrgMember || organizationId === user?.organizationId;
  const canDelete = isObispado || isOrgMember;

  const organizationSlugs: Record<string, string> = {
    "hombres-jovenes": "hombres_jovenes",
    "mujeres-jovenes": "mujeres_jovenes",
    "sociedad-socorro": "sociedad_socorro",
    primaria: "primaria",
    "escuela-dominical": "escuela_dominical",
    jas: "jas",
    "cuorum-elderes": "cuorum_elderes",
  };

  const organizationNames: Record<string, string> = {
    "hombres-jovenes": "Cuórum del Sacerdocio Aarónico",
    "mujeres-jovenes": "Mujeres Jóvenes",
    "sociedad-socorro": "Sociedad de Socorro",
    primaria: "Primaria",
    "escuela-dominical": "Escuela Dominical",
    jas: "JAS",
    "cuorum-elderes": "Cuórum de Élderes",
  };

  useEffect(() => {
    if (params?.org && organizations.length > 0) {
      const slug = organizationSlugs[params.org];
      const org = organizations.find((o: any) => o.type === slug);
      setOrganizationId(org?.id);
    }
  }, [params?.org, organizations]);

  const orgName = params?.org ? organizationNames[params.org] || params.org : "Presidencia";
  const isLeadershipOnly = params?.org === "jas";
  const pageTitle = isLeadershipOnly ? `Liderazgo de ${orgName}` : `Presidencia de ${orgName}`;
  const meetingTitle = isLeadershipOnly ? "REUNIÓN DE LIDERAZGO" : "REUNIÓN DE PRESIDENCIA";

  const dashboardStats = useMemo(() => {
    const totalMeetings = meetings.length;
    const meetingsWithDetails = meetings.filter((meeting: any) => meeting.agenda || meeting.notes).length;
    const detailRate = totalMeetings > 0 ? (meetingsWithDetails / totalMeetings) * 100 : 0;
    const month = new Date().getMonth();
    const currentMonthMeetings = meetings.filter(
      (meeting: any) => new Date(meeting.date).getMonth() === month
    ).length;
    const budgetUsage = Math.min(100, totalMeetings * 12 + currentMonthMeetings * 8);

    return {
      totalMeetings,
      meetingsWithDetails,
      detailRate,
      currentMonthMeetings,
      budgetUsage,
    };
  }, [meetings]);

  const handleExportMeetingPDF = (meeting: any) => {
    const meetingDate = new Date(meeting.date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const content = `${meetingTitle} - ${orgName.toUpperCase()}

Fecha: ${meetingDate}

AGENDA:
${meeting.agenda || "No hay agenda registrada"}

NOTAS:
${meeting.notes || "No hay notas registradas"}

---
Documento generado desde Liahonaap - Sistema Administrativo de Barrio`;

    const element = document.createElement("a");
    const file = new Blob([content], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `reunion_${orgName.replace(/\s+/g, "_").toLowerCase()}_${new Date(meeting.date).getTime()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      date: "",
      agenda: "",
      notes: "",
    },
  });

  const onSubmit = (data: MeetingFormValues) => {
    if (!organizationId) return;

    createMutation.mutate(
      {
        ...data,
        organizationId,
        agenda: data.agenda || "",
        agreements: [],
        assignments: [],
        notes: data.notes || "",
      },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
          form.reset();
        },
      }
    );
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      await apiRequest("DELETE", `/api/presidency-meetings/${meetingId}`, {});

      queryClient.invalidateQueries({ queryKey: ["/api/presidency-meetings", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });

      toast({
        title: "Reunión eliminada",
        description: "La reunión de presidencia ha sido eliminada exitosamente.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la reunión",
        variant: "destructive",
      });
    }
  };

  if (isLoading || !organizationId) {
    return (
      <div className="p-4 md:p-8">
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:space-y-8 md:p-6 xl:p-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        className="rounded-3xl border border-border/70 bg-card/85 p-5 shadow-sm backdrop-blur md:p-7"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Panel de Presidencia</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{pageTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Administración y guía de la organización</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setLocation("/goals")} data-testid="button-org-goals">
              <Target className="mr-2 h-4 w-4" />
              Metas
            </Button>
            {canCreate && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-meeting">
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva reunión
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Crear reunión de presidencia</DialogTitle>
                    <DialogDescription>Registra la reunión de presidencia de {orgName}</DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="agenda"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Agenda (opcional)</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Puntos a tratar en la reunión" {...field} data-testid="textarea-agenda" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notas (opcional)</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Notas de la reunión" {...field} data-testid="textarea-notes" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                          Cancelar
                        </Button>
                        <Button type="submit" data-testid="button-submit" disabled={createMutation.isPending}>
                          {createMutation.isPending ? "Creando..." : "Crear reunión"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
            <CardDescription>Actividad de presidencia</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Reuniones totales</p>
              <p className="text-2xl font-semibold">{dashboardStats.totalMeetings}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Este mes</p>
              <p className="text-2xl font-semibold">{dashboardStats.currentMonthMeetings}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Con detalles</p>
              <p className="text-2xl font-semibold">{dashboardStats.meetingsWithDetails}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/95 shadow-sm lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Metas cumplidas</CardTitle>
            <CardDescription>Calidad de registro y seguimiento</CardDescription>
          </CardHeader>
          <CardContent>
            <CircularGauge
              value={dashboardStats.detailRate}
              label="Metas cumplidas"
              subtitle={`${dashboardStats.meetingsWithDetails} de ${Math.max(1, dashboardStats.totalMeetings)} reuniones`}
              gradientId="goals"
            />
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/95 shadow-sm lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Presupuesto de presidencia</CardTitle>
            <CardDescription>Estimación de uso por actividad anual</CardDescription>
          </CardHeader>
          <CardContent>
            <CircularGauge
              value={dashboardStats.budgetUsage}
              label="Uso estimado"
              subtitle="Ritmo anual de planificación"
              gradientId="budget"
            />
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Materiales</span>
                <span className="font-medium">40%</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-full w-[40%] rounded-full bg-gradient-to-r from-chart-2 to-chart-1" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Actividades</span>
                <span className="font-medium">35%</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-full w-[35%] rounded-full bg-gradient-to-r from-chart-1 to-chart-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm xl:col-span-8">
          <CardHeader>
            <CardTitle>Historial de reuniones</CardTitle>
            <CardDescription>Notas y acuerdos por fecha</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {meetings.length > 0 ? (
              meetings.map((meeting: any) => (
                <motion.div
                  key={meeting.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                  className="rounded-2xl border border-border/70 bg-background/80 p-4"
                  data-testid={`card-meeting-${meeting.id}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Reunión — {new Date(meeting.date).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary" className="rounded-full">
                          <CalendarDays className="mr-1 h-3 w-3" />
                          Registro
                        </Badge>
                        {meeting.agenda && <Badge className="rounded-full bg-chart-2/20 text-foreground">Agenda</Badge>}
                        {meeting.notes && <Badge className="rounded-full bg-chart-1/20 text-foreground">Notas</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExportMeetingPDF(meeting)}
                        data-testid={`button-export-pdf-${meeting.id}`}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Informe
                      </Button>
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteMeeting(meeting.id)}
                          data-testid={`button-delete-meeting-${meeting.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {meeting.agenda && (
                    <div className="mt-4" data-testid={`meeting-agenda-${meeting.id}`}>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda</h4>
                      <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">{meeting.agenda}</p>
                    </div>
                  )}

                  {meeting.notes && (
                    <div className="mt-3" data-testid={`meeting-notes-${meeting.id}`}>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Apuntes</h4>
                      <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">{meeting.notes}</p>
                    </div>
                  )}

                  {!meeting.agenda && !meeting.notes && (
                    <p className="py-3 text-center text-sm text-muted-foreground">No hay detalles de esta reunión</p>
                  )}
                </motion.div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-muted-foreground">
                No hay reuniones programadas para esta presidencia
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm xl:col-span-4">
          <CardHeader>
            <CardTitle>Recursos</CardTitle>
            <CardDescription>Acceso rápido para presidencias</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="rounded-2xl border border-border/70 bg-background/80 p-3 text-left">
                <BookOpen className="mb-2 h-5 w-5 text-chart-1" />
                <p className="text-sm font-medium">Manuales</p>
              </button>
              <button type="button" className="rounded-2xl border border-border/70 bg-background/80 p-3 text-left">
                <FileText className="mb-2 h-5 w-5 text-chart-2" />
                <p className="text-sm font-medium">Plantillas</p>
              </button>
              <button type="button" className="rounded-2xl border border-border/70 bg-background/80 p-3 text-left">
                <PlayCircle className="mb-2 h-5 w-5 text-chart-4" />
                <p className="text-sm font-medium">Capacitación</p>
              </button>
              <button type="button" onClick={() => setLocation("/budget")} className="rounded-2xl border border-border/70 bg-background/80 p-3 text-left">
                <Wallet className="mb-2 h-5 w-5 text-chart-3" />
                <p className="text-sm font-medium">Presupuesto</p>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
