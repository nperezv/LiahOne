import { useMemo, useState } from "react";
import { endOfMonth, endOfQuarter, endOfWeek, startOfMonth, startOfQuarter, startOfWeek } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle2,
  Download,
  Edit,
  Archive,
  Trash2,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

import {
  useInterviews,
  useCreateInterview,
  useCompleteInterview,
  useUsers,
  useDeleteInterview,
  useUpdateInterview,
} from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/error-utils";
import { generateInterviewAgendaPDF } from "@/lib/pdf-utils";

/**
 * Estado (backend):
 * - programada (la mostramos como "Pendiente")
 * - completada
 * - cancelada (si lo usas)
 * - archivada (recomendado para ocultar completadas)
 */
const interviewSchema = z.object({
  personName: z.string().min(1, "El nombre es requerido"),
  date: z.string().min(1, "La fecha es requerida"),
  type: z.string().min(1, "El tipo es requerido"),
  interviewerId: z.string().min(1, "El entrevistador es requerido"),
  urgent: z.boolean().default(false),
  notes: z.string().optional(),
});

type InterviewFormValues = z.infer<typeof interviewSchema>;

function formatInterviewType(type: string) {
  const map: Record<string, string> = {
    recomendacion_templo: "Recomendación del Templo",
    llamamiento: "Llamamiento",
    anual: "Entrevista Anual",
    orientacion: "Orientación",
    otra: "Otra",
  };
  return map[type] ?? type;
}

function formatRole(role: string) {
  const map: Record<string, string> = {
    obispo: "Obispo",
    consejero_obispo: "Consejero",
    secretario_ejecutivo: "Secretario Ejecutivo",
  };
  return map[role] ?? role;
}

const formatDateTimeForInput = (value?: string | Date | null) => {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 16);
    }
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatDateTimeForApi = (value?: string | Date | null) => {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const asDate = new Date(trimmed);
    if (Number.isNaN(asDate.getTime())) return trimmed;
    return asDate.toISOString();
  }
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString();
};

export default function InterviewsPage() {
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportRange, setExportRange] = useState<"week" | "month" | "quarter">("week");
  const [exportInterviewerId, setExportInterviewerId] = useState("all");

  const { user } = useAuth();
  const { data: interviews = [], isLoading } = useInterviews();
  const { data: users = [] } = useUsers();

  const createMutation = useCreateInterview();
  const updateMutation = useUpdateInterview();
  const completeMutation = useCompleteInterview();
  const deleteMutation = useDeleteInterview();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(
    user?.role || ""
  );

  const isObispado =
    user?.role === "obispo" || user?.role === "consejero_obispo" || user?.role === "secretario_ejecutivo";

  const canManage = isObispado || isOrgMember;
  const canCancel = user?.role === "obispo"; // si quieres solo obispo cancela/borra

  const interviewers = useMemo(
    () => users.filter((u: any) => u.role === "obispo" || u.role === "consejero_obispo"),
    [users]
  );

  const organizationMembers = useMemo(
    () =>
      users.filter(
        (u: any) =>
          u.role === "presidente_organizacion" ||
          u.role === "consejero_organizacion" ||
          u.role === "secretario_organizacion" ||
          u.role === "secretario"
      ),
    [users]
  );

  const userById = useMemo(() => {
    const m = new Map<string, any>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  // ✅ Filtrado por rol (si es org member)
  const filteredInterviewsRaw = isOrgMember
    ? interviews.filter((i: any) => i.assignedBy === user?.id || i.assignedToId === user?.id)
    : interviews;

  // ✅ Ocultar archivadas por defecto
  const filteredInterviews = useMemo(() => {
    return filteredInterviewsRaw
      .filter((i: any) =>
        showArchived
          ? i.status === "archivada"
          : i.status !== "archivada"
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      );
  }, [filteredInterviewsRaw, showArchived]);
  // ✅ Métricas (sobre no-archivadas)
  const pendingInterviews = filteredInterviews.filter((i: any) => i.status === "programada");
  const completedInterviews = filteredInterviews.filter((i: any) => i.status === "completada");

  // ✅ Form create
  const form = useForm<InterviewFormValues>({
    resolver: zodResolver(interviewSchema),
    defaultValues: {
      personName: isOrgMember ? user?.name || "" : "",
      date: "",
      type: "",
      interviewerId: "",
      urgent: false,
      notes: "",
    },
  });

  // ✅ Form edit
  const editForm = useForm<InterviewFormValues>({
    resolver: zodResolver(interviewSchema),
  });

  const onSubmit = (data: InterviewFormValues) => {
    createMutation.mutate(
      {
        ...data,
        date: formatDateTimeForApi(data.date),
        status: "programada", // ✅ en UI la llamamos Pendiente
        notes: data.notes || "",
      },
      {
        onSuccess: () => {
          toast({
            title: "Entrevista creada",
            description: "Se ha registrado la entrevista correctamente.",
          });
          setIsDialogOpen(false);
          form.reset();
        },
        onError: (error) => {
          toast({
            title: "Error",
            description: getApiErrorMessage(
              error,
              "No se pudo crear la entrevista."
            ),
            variant: "destructive",
          });
        },
      }
    );
  };

  const onEditSubmit = (data: InterviewFormValues) => {
    if (!editingInterview) return;
  
    updateMutation.mutate(
      {
        id: editingInterview.id,
        personName: data.personName,
        date: formatDateTimeForApi(data.date),
        type: data.type,
        interviewerId: data.interviewerId,
        urgent: data.urgent,
        notes: data.notes || "",
      },
      {
        onSuccess: () => {
          toast({
            title: "Entrevista actualizada",
            description: "Los cambios se han guardado.",
          });
          setIsEditDialogOpen(false);
          setEditingInterview(null);
          editForm.reset();
        },
        onError: (error) => {
          toast({
            title: "Error",
            description: getApiErrorMessage(
              error,
              "No se pudo actualizar la entrevista."
            ),
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleEditClick = (interview: any) => {
    setEditingInterview(interview);
    editForm.reset({
      personName: interview.personName,
      date: formatDateTimeForInput(interview.date),
      type: interview.type,
      interviewerId: interview.interviewerId,
      urgent: !!interview.urgent,
      notes: interview.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  // ✅ Estado badge (SOLO estado, sin urgent)
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      programada: { variant: "outline", label: "Pendiente" },
      completada: { variant: "default", label: "Completada" },
      archivada: { variant: "secondary", label: "Archivada" },
      cancelada: { variant: "secondary", label: "Cancelada" },
    };

    const config = variants[status] || variants.programada;

    return (
      <Badge variant={config.variant} className="flex items-center w-fit">
        {config.label}
      </Badge>
    );
  };

  // ✅ Prioridad badge (separado)
  const getPriorityBadge = (urgent: boolean) => {
    return urgent ? (
      <Badge variant="destructive" className="flex items-center w-fit">
        <AlertCircle className="h-3 w-3 mr-1" />
        Urgente
      </Badge>
    ) : (
      <Badge variant="outline" className="flex items-center w-fit">
        Normal
      </Badge>
    );
  };
  const handleToggleCompleted = (interview: any, checked: boolean) => {
    if (checked && interview.status === "programada") {
      updateMutation.mutate(
        {
          id: interview.id,
          data: { status: "completada" },
        },
        {
          onSuccess: () => {
            toast({
              title: "Entrevista completada",
              description: "Marcada como completada.",
            });
          },
          onError: () => {
            toast({
              title: "Error",
              description: "No se pudo completar la entrevista.",
              variant: "destructive",
            });
          },
        }
      );
    }
  };
  const handleArchive = (interviewId: string) => {
    updateMutation.mutate(
      { id: interviewId, status: "archivada" },
      {
        onSuccess: () => {
          toast({
            title: "Archivada",
            description: "La entrevista ha sido archivada y ya no aparece en la lista.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "No se pudo archivar (¿backend no acepta status=archivada?).",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleCancelDelete = (interviewId: string) => {
    if (!window.confirm("¿Está seguro de que desea eliminar esta entrevista?")) return;
    deleteMutation.mutate(interviewId, {
      onSuccess: () =>
        toast({ title: "Eliminada", description: "La entrevista se ha eliminado." }),
      onError: () =>
        toast({ title: "Error", description: "No se pudo eliminar.", variant: "destructive" }),
    });
  };

  const handleExportPdf = async () => {
    const now = new Date();
    const range = exportRange;
    const startDate =
      range === "month"
        ? startOfMonth(now)
        : range === "quarter"
          ? startOfQuarter(now)
          : startOfWeek(now);
    const endDate =
      range === "month"
        ? endOfMonth(now)
        : range === "quarter"
          ? endOfQuarter(now)
          : endOfWeek(now);

    const baseInterviews = filteredInterviewsRaw.filter((interview: any) => interview.status === "programada");
    const rangeInterviews = baseInterviews.filter((interview: any) => {
      const interviewDate = new Date(interview.date);
      return interviewDate >= startDate && interviewDate <= endDate;
    });

    const finalInterviews = exportInterviewerId === "all"
      ? rangeInterviews
      : rangeInterviews.filter((interview: any) => interview.interviewerId === exportInterviewerId);

    const interviewerLabel =
      exportInterviewerId === "all"
        ? "Todos"
        : userById.get(exportInterviewerId)?.name || "—";

    await generateInterviewAgendaPDF(
      finalInterviews.map((interview: any) => ({
        ...interview,
        interviewerName: userById.get(interview.interviewerId)?.name || "—",
      })),
      {
        startDate,
        endDate,
        interviewerLabel,
      }
    );

    setIsExportDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Entrevistas</h1>
          <p className="text-sm text-muted-foreground">
            {isOrgMember ? "Solicita entrevistas con el Obispado" : "Programa y gestiona las entrevistas del barrio"}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-export-interviews">
                <Download className="h-4 w-4 lg:mr-2" />
                <span className="sr-only lg:not-sr-only">Exportar PDF</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Exportar agenda</DialogTitle>
                <DialogDescription>
                  Selecciona el periodo y entrevistador para generar el PDF.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Periodo</Label>
                  <Select value={exportRange} onValueChange={(value) => setExportRange(value as "week" | "month" | "quarter")}>
                    <SelectTrigger data-testid="select-export-range">
                      <SelectValue placeholder="Seleccionar periodo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">Semana actual</SelectItem>
                      <SelectItem value="month">Mes actual</SelectItem>
                      <SelectItem value="quarter">Trimestre actual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Entrevistador</Label>
                  <Select value={exportInterviewerId} onValueChange={setExportInterviewerId}>
                    <SelectTrigger data-testid="select-export-interviewer">
                      <SelectValue placeholder="Seleccionar entrevistador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {interviewers.map((interviewer: any) => (
                        <SelectItem key={interviewer.id} value={interviewer.id}>
                          {interviewer.name} ({formatRole(interviewer.role)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleExportPdf} data-testid="button-export-pdf-confirm">
                    Generar PDF
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            onClick={() => setShowArchived(v => !v)}
            title={showArchived ? "Ocultar archivadas" : "Mostrar archivadas"}
          >
            {showArchived ? "Ocultar archivadas" : "Ver archivadas"}
          </Button>

          {canManage && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-schedule-interview">
                  <Plus className="h-4 w-4 mr-2" />
                  Programar Entrevista
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{isOrgMember ? "Solicitar Entrevista" : "Programar Nueva Entrevista"}</DialogTitle>
                  <DialogDescription>
                    {isOrgMember ? "Solicita una entrevista con el Obispado" : "Asigna una entrevista a un miembro del barrio"}
                  </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="personName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre de la Persona</FormLabel>
                          {isOrgMember ? (
                            <FormControl>
                              <Input placeholder="Nombre Apllido" {...field} disabled={true} data-testid="input-person-name" />
                            </FormControl>
                          ) : (
                            <div className="space-y-2">
                              <FormControl>
                                <Input
                                  placeholder="Escribe un nombre o selecciona de la lista"
                                  {...field}
                                  data-testid="input-person-name"
                                />
                              </FormControl>
                              <div className="border rounded-md max-h-40 overflow-y-auto">
                                {organizationMembers
                                  .filter((u: any) =>
                                    u.name.toLowerCase().includes(field.value.toLowerCase())
                                  )
                                  .map((u: any) => (
                                    <div
                                      key={u.id}
                                      onClick={() => field.onChange(u.name)}
                                      className="px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                                      data-testid={`option-person-${u.id}`}
                                    >
                                      <div className="font-medium">{u.name}</div>
                                      <div className="text-xs text-muted-foreground capitalize">{formatRole(u.role)}</div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha y Hora</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} data-testid="input-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo de Entrevista</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-type">
                                  <SelectValue placeholder="Seleccionar tipo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="recomendacion_templo">Recomendación del Templo</SelectItem>
                                <SelectItem value="llamamiento">Llamamiento</SelectItem>
                                <SelectItem value="anual">Entrevista Anual</SelectItem>
                                <SelectItem value="orientacion">Orientación</SelectItem>
                                <SelectItem value="otra">Otra</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="interviewerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Entrevistador</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-interviewer">
                                <SelectValue placeholder="Seleccionar entrevistador" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {interviewers.map((i: any) => (
                                <SelectItem key={i.id} value={i.id}>
                                  {i.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="urgent"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-urgent" />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Marcar como urgente</FormLabel>
                            <p className="text-sm text-muted-foreground">La prioridad es independiente del estado.</p>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notas (Opcional)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Notas adicionales sobre la entrevista" {...field} data-testid="textarea-notes" />
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
                        {createMutation.isPending ? "Guardando..." : "Guardar"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-upcoming-interviews">
              {pendingInterviews.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Por realizar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completadas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-interviews">
              {completedInterviews.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Aún sin archivar</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isOrgMember ? "Mis Solicitudes de Entrevista" : "Entrevistas"}</CardTitle>
          <CardDescription>
            {isOrgMember ? "Tus solicitudes de entrevista con el Obispado" : "Entrevistas del barrio"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Entrevistador</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Estado</TableHead>
                {(canManage || canCancel) && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredInterviews.length > 0 ? (
                filteredInterviews.map((interview: any) => {
                  const interviewer = userById.get(interview.interviewerId);
                  const isCompleted = interview.status === "completada";
                  const isPending = interview.status === "programada";

                  return (
                    <TableRow key={interview.id} data-testid={`row-interview-${interview.id}`}>
                      <TableCell className="font-medium">{interview.personName}</TableCell>
                      <TableCell className="text-sm">{formatInterviewType(interview.type)}</TableCell>
                      <TableCell className="text-sm">
                        {interviewer?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(interview.date).toLocaleDateString("es-ES", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>{getPriorityBadge(!!interview.urgent)}</TableCell>
                      <TableCell>{getStatusBadge(interview.status)}</TableCell>

                      {(canManage || canCancel) && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {/* ✅ Botón para completar (solo pendientes) */}
                            {isObispado && isPending && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateMutation.mutate({
                                    id: interview.id,
                                    status: "completada",
                                  })
                                }
                                disabled={updateMutation.isPending}
                                title="Completar"
                              >
                                <CheckCircle2 className="h-4 w-4 lg:mr-1" />
                                <span className="sr-only lg:not-sr-only">Completar</span>
                              </Button>
                            )}

                            {/* ✅ Si está completada: SOLO archivar */}
                            {isObispado && isCompleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleArchive(interview.id)}
                                disabled={updateMutation.isPending}
                                title="Archivar (ocultar de la lista)"
                              >
                                <Archive className="h-4 w-4 mr-1" />
                                Archivar
                              </Button>
                            )}

                            {/* ✅ Editar solo si NO está completada */}
                            {isObispado && !isCompleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditClick(interview)}
                                disabled={updateMutation.isPending}
                                data-testid={`button-edit-${interview.id}`}
                              >
                                <Edit className="h-4 w-4 lg:mr-1" />
                                <span className="sr-only lg:not-sr-only">Editar</span>
                              </Button>
                            )}

                            {/* ✅ Eliminar / Cancelar solo obispo (opcional) y solo si NO completada */}
                            {canCancel && !isCompleted && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleCancelDelete(interview.id)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 lg:mr-1" />
                                <span className="sr-only lg:not-sr-only">Eliminar</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={(canManage || canCancel) ? 7 : 6} className="text-center py-8 text-muted-foreground">
                    {isOrgMember ? "No hay solicitudes de entrevista" : "No hay entrevistas"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Interview Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Entrevista</DialogTitle>
            <DialogDescription>Modifica los detalles de la entrevista</DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="personName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la Persona</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre" {...field} data-testid="input-edit-person-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha y Hora</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} data-testid="input-edit-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Entrevista</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-type">
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="recomendacion_templo">Recomendación del Templo</SelectItem>
                          <SelectItem value="llamamiento">Llamamiento</SelectItem>
                          <SelectItem value="anual">Entrevista Anual</SelectItem>
                          <SelectItem value="orientacion">Orientación</SelectItem>
                          <SelectItem value="otra">Otra</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={editForm.control}
                name="interviewerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Entrevistador</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-interviewer">
                          <SelectValue placeholder="Seleccionar entrevistador" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {interviewers.map((i: any) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="urgent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-edit-urgent" />
                    </FormControl>
                    <FormLabel>Urgente</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Notas..." {...field} data-testid="textarea-edit-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingInterview(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-interview">
                  Guardar Cambios
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
