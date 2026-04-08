import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CalendarDays, MapPin, Users, Download, Trash2, ChevronDown, ChevronRight, CheckSquare, Square, Globe, Send, CheckCircle2, XCircle, Upload, Image, LayoutList } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
import { useActivities, useCreateActivity, useOrganizations, useDeleteActivity, useUpdateActivityChecklistItem } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { exportActivities } from "@/lib/export";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  servicio_bautismal: "Servicio Bautismal",
  deportiva: "Deportiva",
  capacitacion: "Capacitación",
  fiesta: "Fiesta",
  hermanamiento: "Hermanamiento",
  actividad_org: "Actividad de Org.",
  otro: "Otro",
};

const APPROVAL_STATUS_CONFIG: Record<string, { label: string; variant: string; icon: React.ReactNode }> = {
  draft:          { label: "Borrador",       variant: "secondary", icon: null },
  submitted:      { label: "En revisión",    variant: "default",   icon: <Send className="h-3 w-3" /> },
  approved:       { label: "Aprobada",       variant: "default",   icon: <CheckCircle2 className="h-3 w-3 text-green-600" /> },
  needs_revision: { label: "Requiere rev.",  variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  cancelled:      { label: "Cancelada",      variant: "destructive", icon: null },
};

const CHECKLIST_SECTIONS: Record<string, { label: string; color: string; roles: string[] }> = {
  programa:     { label: "Programa",     color: "text-blue-700 dark:text-blue-400",   roles: ["presidente_organizacion","consejero_organizacion","secretario_organizacion","obispo","consejero_obispo"] },
  coordinacion: { label: "Coordinación", color: "text-violet-700 dark:text-violet-400", roles: ["presidente_organizacion","consejero_organizacion","secretario_organizacion","obispo","consejero_obispo"] },
  logistica:    { label: "Logística",    color: "text-amber-700 dark:text-amber-400", roles: ["lider_actividades","obispo","consejero_obispo"] },
};

const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  en_preparacion: "En Preparación",
  listo: "Listo",
  realizado: "Realizado",
};

const activitySchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  date: z.string().min(1, "La fecha es requerida"),
  location: z.string().optional(),
  organizationId: z.string().optional(),
  type: z.enum(["servicio_bautismal", "deportiva", "capacitacion", "fiesta", "hermanamiento", "actividad_org", "otro"]),
  isPublic: z.boolean().default(false),
});

type ActivityFormValues = z.infer<typeof activitySchema>;

interface ChecklistItem {
  id: string;
  activityId: string;
  itemKey: string;
  label: string;
  completed: boolean;
  completedBy?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  sortOrder: number;
}

function ChecklistPanel({
  items,
  activityId,
  canEdit,
  isOrgActivity,
  userRole,
}: {
  items: ChecklistItem[];
  activityId: string;
  canEdit: boolean;
  isOrgActivity?: boolean;
  userRole?: string;
}) {
  const updateMutation = useUpdateActivityChecklistItem();

  const toggle = (item: ChecklistItem, sectionRoles?: string[]) => {
    if (!canEdit) return;
    if (isOrgActivity && sectionRoles && userRole && !sectionRoles.includes(userRole) &&
        !["obispo","consejero_obispo"].includes(userRole ?? "")) return;
    updateMutation.mutate({ activityId, itemId: item.id, data: { completed: !item.completed } });
  };

  const completed = items.filter((i) => i.completed).length;

  if (!isOrgActivity) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium mb-3">
          Checklist de preparación — {completed}/{items.length} completados
        </p>
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-2 text-sm cursor-pointer group ${canEdit ? "hover:text-foreground" : ""}`}
            onClick={() => toggle(item)}
          >
            {item.completed ? (
              <CheckSquare className="h-4 w-4 text-green-600 shrink-0" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className={item.completed ? "line-through text-muted-foreground" : ""}>{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  // Sectioned checklist for actividad_org
  const sections = ["programa", "coordinacion", "logistica"] as const;
  const bySection: Record<string, ChecklistItem[]> = { programa: [], coordinacion: [], logistica: [] };
  for (const item of items) {
    const key = item.itemKey.startsWith("prog_") ? "programa"
      : item.itemKey.startsWith("coord_") ? "coordinacion"
      : item.itemKey.startsWith("log_") ? "logistica"
      : "programa";
    bySection[key].push(item);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground font-medium">
        Checklist — {completed}/{items.length} completados
      </p>
      {sections.map((sec) => {
        const cfg = CHECKLIST_SECTIONS[sec];
        const secItems = bySection[sec] ?? [];
        if (!secItems.length) return null;
        const canEditSection = ["obispo","consejero_obispo"].includes(userRole ?? "") ||
          cfg.roles.includes(userRole ?? "");
        return (
          <div key={sec}>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${cfg.color}`}>{cfg.label}</p>
            <div className="space-y-1.5 ml-1">
              {secItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 text-sm ${canEditSection ? "cursor-pointer hover:text-foreground" : "opacity-60"}`}
                  onClick={() => canEditSection && toggle(item, cfg.roles)}
                >
                  {item.completed ? (
                    <CheckSquare className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={item.completed ? "line-through text-muted-foreground" : ""}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FlyerUpload({ activityId, flyerUrl, canUpload }: { activityId: string; flyerUrl?: string | null; canUpload: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("flyer", file);
      const res = await fetch(`/api/activities/${activityId}/flyer`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "Flyer subido correctamente" });
    } catch {
      toast({ title: "Error al subir flyer", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {flyerUrl ? (
        <a href={flyerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
          <Image className="h-4 w-4" /> Ver flyer
        </a>
      ) : (
        <span className="text-sm text-muted-foreground italic">Sin flyer</span>
      )}
      {canUpload && (
        <>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            {uploading ? "Subiendo..." : flyerUrl ? "Cambiar flyer" : "Subir flyer"}
          </Button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
        </>
      )}
    </div>
  );
}

function ApprovalActions({
  activity,
  userRole,
  orgId,
}: {
  activity: any;
  userRole?: string;
  orgId?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectComment, setRejectComment] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);

  const isObispado = ["obispo", "consejero_obispo", "secretario_ejecutivo"].includes(userRole ?? "");
  const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(userRole ?? "");
  const belongsToOrg = activity.organizationId === orgId;

  const submitMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/activities/${activity.id}/submit`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/activities"] }); toast({ title: "Actividad enviada para aprobación" }); },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });
  const approveMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/activities/${activity.id}/approve`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/activities"] }); toast({ title: "Actividad aprobada" }); },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });
  const rejectMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/activities/${activity.id}/reject`, { comment: rejectComment }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/activities"] }); setRejectOpen(false); toast({ title: "Actividad devuelta para revisión" }); },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const canSubmit = (isOrgMember && belongsToOrg) || isObispado;
  const status = activity.approvalStatus;

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
      {canSubmit && (status === "draft" || status === "needs_revision") && (
        <Button size="sm" variant="outline" onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
          <Send className="h-3.5 w-3.5 mr-1" />
          {submitMut.isPending ? "Enviando..." : "Enviar al obispo"}
        </Button>
      )}
      {isObispado && status === "submitted" && (
        <>
          <Button size="sm" className="border-green-500 text-green-700" variant="outline" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {approveMut.isPending ? "Aprobando..." : "Aprobar"}
          </Button>
          <Button size="sm" variant="outline" className="border-red-400 text-red-700" onClick={() => setRejectOpen(true)}>
            <XCircle className="h-3.5 w-3.5 mr-1" /> Rechazar
          </Button>
        </>
      )}
      {status === "approved" && activity.slug && (
        <a href={`/actividades/${activity.slug}`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline">
            <Globe className="h-3.5 w-3.5 mr-1" /> Ver página pública
          </Button>
        </a>
      )}
      {activity.approvalComment && (
        <p className="w-full text-xs text-red-600 mt-1">Comentario: {activity.approvalComment}</p>
      )}

      {rejectOpen && (
        <div className="w-full space-y-2 mt-2">
          <input
            className="w-full border rounded px-3 py-1.5 text-sm"
            placeholder="Motivo del rechazo (opcional)"
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}>
              {rejectMut.isPending ? "Rechazando..." : "Confirmar rechazo"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejectOpen(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActivitiesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);

  const { user } = useAuth();
  const { data: activities = [], isLoading } = useActivities();
  const { data: organizations = [] } = useOrganizations();
  const createMutation = useCreateActivity();
  const deleteMutation = useDeleteActivity();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const isObispado = user?.role === "obispo" || user?.role === "consejero_obispo";
  const isLiderActividades = user?.role === "lider_actividades";
  const canManage =
    isObispado ||
    user?.role === "secretario" ||
    user?.role === "secretario_ejecutivo" ||
    isLiderActividades ||
    isOrgMember;
  const canDelete = isObispado || isOrgMember;

  // Per-activity: only owning org, lider_actividades, and bishopric see the checklist
  const canSeeChecklist = (activity: any) =>
    isObispado ||
    isLiderActividades ||
    (isOrgMember && activity.organizationId === user?.organizationId);

  const canEditChecklist = (activity: any) =>
    isObispado ||
    isLiderActividades ||
    (isOrgMember && activity.organizationId === user?.organizationId);

  // Filter activities based on user role
  const filteredActivities = isOrgMember
    ? activities.filter((a: any) => a.organizationId === user?.organizationId)
    : activities;

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      location: "",
      organizationId: isOrgMember ? user?.organizationId || "" : "",
      type: "otro",
      isPublic: false,
    },
  });

  const onSubmit = (data: ActivityFormValues) => {
    const organizationId = isOrgMember ? user?.organizationId : data.organizationId || undefined;

    createMutation.mutate(
      {
        title: data.title,
        description: data.description || "",
        date: data.date,
        location: data.location || "",
        organizationId: organizationId,
        type: data.type,
        isPublic: data.isPublic,
        responsiblePerson: user?.name || "Sin asignar",
      },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
          form.reset();
        },
      },
    );
  };

  const handleDelete = (activityId: string) => {
    if (window.confirm("¿Está seguro de que desea eliminar esta actividad?")) {
      deleteMutation.mutate(activityId);
    }
  };

  const toggleExpand = (activityId: string) => {
    setExpandedActivityId((prev) => (prev === activityId ? null : activityId));
  };

  const upcomingActivities = filteredActivities.filter((a: any) => new Date(a.date) >= new Date());
  const pastActivities = filteredActivities.filter((a: any) => new Date(a.date) < new Date());

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const colSpan = canDelete ? 8 : 7;

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Actividades</h1>
          <p className="text-sm text-muted-foreground">Gestiona las actividades del barrio</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          <Button
            variant="outline"
            onClick={() => exportActivities(filteredActivities)}
            data-testid="button-export-activities"
          >
            <Download className="h-4 w-4 lg:mr-2" />
            <span className="sr-only lg:not-sr-only">Exportar</span>
          </Button>
          {canManage && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-activity">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Actividad
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Crear Nueva Actividad</DialogTitle>
                  <DialogDescription>Programa una actividad para el barrio o una organización</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Título</FormLabel>
                          <FormControl>
                            <Input placeholder="Noche de hogar especial" {...field} data-testid="input-title" />
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
                          <FormLabel>Tipo de Actividad</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-type">
                                <SelectValue placeholder="Selecciona el tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
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
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción (Opcional)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Detalles de la actividad" {...field} data-testid="textarea-description" />
                          </FormControl>
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
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ubicación (Opcional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Capilla del barrio" {...field} data-testid="input-location" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {!isOrgMember && (
                      <FormField
                        control={form.control}
                        name="organizationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organización (Opcional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-organization">
                                  <SelectValue placeholder="Barrio completo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {organizations.map((org: any) => (
                                  <SelectItem key={org.id} value={org.id}>
                                    {org.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="isPublic"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3 rounded-lg border p-3">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 accent-primary"
                              id="is-public-checkbox"
                            />
                          </FormControl>
                          <div className="space-y-0.5">
                            <FormLabel htmlFor="is-public-checkbox" className="flex items-center gap-1.5 cursor-pointer font-medium">
                              <Globe className="h-4 w-4 text-muted-foreground" />
                              Publicar en la landing pública
                            </FormLabel>
                            <p className="text-xs text-muted-foreground">Visible para cualquier persona que visite la página principal</p>
                          </div>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                        Cancelar
                      </Button>
                      <Button type="submit" data-testid="button-submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "Creando..." : "Crear Actividad"}
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
            <CardTitle className="text-sm font-medium">Próximas Actividades</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-upcoming-activities">
              {upcomingActivities.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Planificadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Realizadas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-past-activities">
              {pastActivities.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Este año</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas las Actividades</CardTitle>
          <CardDescription>Actividades programadas y realizadas — haz clic en una fila para ver los detalles</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6"></TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Organización</TableHead>
                <TableHead>Estado</TableHead>
                {canDelete && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredActivities.length > 0 ? (
                filteredActivities.map((activity: any) => {
                  const isPast = new Date(activity.date) < new Date();
                  const isExpanded = expandedActivityId === activity.id;
                  const statusLabel = activity.status ? ACTIVITY_STATUS_LABELS[activity.status] : isPast ? "Realizada" : "Próxima";
                  const statusVariant = activity.status === "realizado" || isPast ? "secondary" : activity.status === "listo" ? "default" : "outline";

                  const showChecklist = canSeeChecklist(activity);
                  const canEdit = canEditChecklist(activity);

                  const isOrgActivity = activity.type === "actividad_org";
                  const approvalCfg = APPROVAL_STATUS_CONFIG[activity.approvalStatus ?? "draft"];
                  const canUploadFlyer = isOrgActivity && (
                    isObispado ||
                    (isOrgMember && activity.organizationId === user?.organizationId) ||
                    (isLiderActividades && activity.organizationId === user?.organizationId)
                  );

                  return (
                    <>
                      <TableRow
                        key={activity.id}
                        data-testid={`row-activity-${activity.id}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(activity.id)}
                      >
                        <TableCell className="pr-0">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            {activity.title}
                            {isOrgActivity && activity.quarterlyPlanItemId && (
                              <Badge variant="outline" className="text-[10px] gap-1 border-violet-400 text-violet-700">
                                <LayoutList className="h-2.5 w-2.5" /> Plan Trimestral
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {ACTIVITY_TYPE_LABELS[activity.type] || activity.type || "Otro"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(activity.date).toLocaleDateString("es-ES", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-sm">{activity.location || "-"}</TableCell>
                        <TableCell>
                          {activity.organizationId ? (
                            <Badge variant="outline">
                              {organizations.find((o: any) => o.id === activity.organizationId)?.name || "Organización"}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Barrio</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isOrgActivity && approvalCfg ? (
                            <Badge variant={approvalCfg.variant as any} className="gap-1">
                              {approvalCfg.icon}{approvalCfg.label}
                            </Badge>
                          ) : (
                            <Badge variant={statusVariant as any}>{statusLabel}</Badge>
                          )}
                        </TableCell>
                        {canDelete && (
                          <TableCell>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(activity.id);
                              }}
                              data-testid={`button-delete-activity-${activity.id}`}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 lg:mr-1" />
                              <span className="sr-only lg:not-sr-only">Eliminar</span>
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${activity.id}-detail`}>
                          <TableCell colSpan={colSpan} className="bg-muted/30 px-8 py-4">
                            <div className="space-y-4">
                              {activity.description && (
                                <p className="text-sm text-muted-foreground">{activity.description}</p>
                              )}
                              {isOrgActivity && (
                                <FlyerUpload
                                  activityId={activity.id}
                                  flyerUrl={activity.flyerUrl}
                                  canUpload={canUploadFlyer}
                                />
                              )}
                              {showChecklist && activity.checklistItems && activity.checklistItems.length > 0 && (
                                <ChecklistPanel
                                  items={activity.checklistItems}
                                  activityId={activity.id}
                                  canEdit={canEdit}
                                  isOrgActivity={isOrgActivity}
                                  userRole={user?.role}
                                />
                              )}
                              {isOrgActivity && (
                                <ApprovalActions
                                  activity={activity}
                                  userRole={user?.role}
                                  orgId={user?.organizationId}
                                />
                              )}
                              {!showChecklist && !activity.description && (
                                <p className="text-sm text-muted-foreground italic">Sin detalles adicionales</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                    No hay actividades programadas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
