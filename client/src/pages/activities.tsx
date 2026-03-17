import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CalendarDays, MapPin, Users, Download, Trash2, ChevronDown, ChevronRight, CheckSquare, Square } from "lucide-react";
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
  otro: "Otro",
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
  type: z.enum(["servicio_bautismal", "deportiva", "capacitacion", "fiesta", "hermanamiento", "otro"]),
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
}: {
  items: ChecklistItem[];
  activityId: string;
  canEdit: boolean;
}) {
  const updateMutation = useUpdateActivityChecklistItem();

  const toggle = (item: ChecklistItem) => {
    if (!canEdit) return;
    updateMutation.mutate({ activityId, itemId: item.id, data: { completed: !item.completed } });
  };

  const completed = items.filter((i) => i.completed).length;

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

export default function ActivitiesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);

  const { user } = useAuth();
  const { data: activities = [], isLoading } = useActivities();
  const { data: organizations = [] } = useOrganizations();
  const createMutation = useCreateActivity();
  const deleteMutation = useDeleteActivity();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const canManage =
    user?.role === "obispo" ||
    user?.role === "consejero_obispo" ||
    user?.role === "secretario" ||
    user?.role === "secretario_ejecutivo" ||
    user?.role === "lider_actividades" ||
    isOrgMember;
  const canDelete = user?.role === "obispo" || user?.role === "consejero_obispo" || isOrgMember;

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
          <CardDescription>Actividades programadas y realizadas — haz clic en una fila para ver el checklist</CardDescription>
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
                        <TableCell className="font-medium">{activity.title}</TableCell>
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
                          <Badge variant={statusVariant as any}>{statusLabel}</Badge>
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
                      {isExpanded && activity.checklistItems && activity.checklistItems.length > 0 && (
                        <TableRow key={`${activity.id}-checklist`}>
                          <TableCell colSpan={colSpan} className="bg-muted/30 px-8 py-4">
                            <ChecklistPanel
                              items={activity.checklistItems}
                              activityId={activity.id}
                              canEdit={canManage}
                            />
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
