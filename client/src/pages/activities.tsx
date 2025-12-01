import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CalendarDays, MapPin, Users, Download, Trash2 } from "lucide-react";
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
import { useActivities, useCreateActivity, useOrganizations, useDeleteActivity } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { exportActivities } from "@/lib/export";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const activitySchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  date: z.string().min(1, "La fecha es requerida"),
  location: z.string().optional(),
  organizationId: z.string().optional(),
});

type ActivityFormValues = z.infer<typeof activitySchema>;

export default function ActivitiesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { user } = useAuth();
  const { data: activities = [], isLoading } = useActivities();
  const { data: organizations = [] } = useOrganizations();
  const createMutation = useCreateActivity();
  const deleteMutation = useDeleteActivity();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const canManage = user?.role === "obispo" || user?.role === "consejero_obispo" || user?.role === "secretario" || isOrgMember;
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
    },
  });

  const onSubmit = (data: ActivityFormValues) => {
    // For organization members, auto-set their organization ID
    const organizationId = isOrgMember ? user?.organizationId : (data.organizationId || undefined);
    
    createMutation.mutate({
      title: data.title,
      description: data.description || "",
      date: data.date,
      location: data.location || "",
      organizationId: organizationId,
      responsiblePerson: user?.name || "Sin asignar",
    }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
      },
    });
  };

  const handleDelete = (activityId: string) => {
    if (window.confirm("¿Está seguro de que desea eliminar esta actividad?")) {
      deleteMutation.mutate(activityId);
    }
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Actividades</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona las actividades del barrio
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => exportActivities(filteredActivities)}
            data-testid="button-export-activities"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
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
                <DialogDescription>
                  Programa una actividad para el barrio o una organización
                </DialogDescription>
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
                          <Input
                            placeholder="Noche de hogar especial"
                            {...field}
                            data-testid="input-title"
                          />
                        </FormControl>
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
                          <Textarea
                            placeholder="Detalles de la actividad"
                            {...field}
                            data-testid="textarea-description"
                          />
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
                            <Input
                              placeholder="Capilla del barrio"
                              {...field}
                              data-testid="input-location"
                            />
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      data-testid="button-cancel"
                    >
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
            <p className="text-xs text-muted-foreground mt-1">
              Planificadas
            </p>
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
            <p className="text-xs text-muted-foreground mt-1">
              Este año
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas las Actividades</CardTitle>
          <CardDescription>
            Actividades programadas y realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Organización</TableHead>
                <TableHead>Estado</TableHead>
                {canDelete && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.length > 0 ? (
                activities.map((activity: any) => {
                  const isPast = new Date(activity.date) < new Date();
                  return (
                    <TableRow key={activity.id} data-testid={`row-activity-${activity.id}`}>
                      <TableCell className="font-medium">{activity.title}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(activity.date).toLocaleDateString("es-ES", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {activity.location || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {activity.responsiblePerson}
                      </TableCell>
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
                        <Badge variant={isPast ? "secondary" : "default"}>
                          {isPast ? "Realizada" : "Próxima"}
                        </Badge>
                      </TableCell>
                      {canDelete && (
                        <TableCell>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(activity.id)}
                            data-testid={`button-delete-activity-${activity.id}`}
                            disabled={deleteMutation.isPending}
                          >
                            Eliminar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={canDelete ? 7 : 6} className="text-center py-8 text-muted-foreground">
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
