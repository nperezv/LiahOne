import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Calendar as CalendarIcon, AlertCircle, CheckCircle2, Download, Edit } from "lucide-react";
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
import { useInterviews, useCreateInterview, useCompleteInterview, useUsers, useDeleteInterview, useUpdateInterview } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { exportInterviews } from "@/lib/export";

const interviewSchema = z.object({
  personName: z.string().min(1, "El nombre es requerido"),
  date: z.string().min(1, "La fecha es requerida"),
  type: z.string().min(1, "El tipo es requerido"),
  interviewerId: z.string().min(1, "El entrevistador es requerido"),
  urgent: z.boolean().default(false),
  notes: z.string().optional(),
});

type InterviewFormValues = z.infer<typeof interviewSchema>;

export default function InterviewsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<any>(null);
  
  const { user } = useAuth();
  const { data: interviews = [], isLoading } = useInterviews();
  const { data: users = [] } = useUsers();
  const createMutation = useCreateInterview();
  const updateMutation = useUpdateInterview();
  const completeMutation = useCompleteInterview();
  const deleteMutation = useDeleteInterview();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const isObispado = user?.role === "obispo" || user?.role === "consejero_obispo" || user?.role === "secretario";
  const canManage = isObispado || isOrgMember;
  const canCancel = isObispado;
  
  const interviewers = users.filter((u: any) => 
    u.role === "obispo" || u.role === "consejero_obispo"
  );

  const organizationMembers = users.filter((u: any) => 
    u.role === "presidente_organizacion" || u.role === "consejero_organizacion" || u.role === "secretario_organizacion" || u.role === "secretario"
  );

  // Filter interviews based on role
  const filteredInterviews = isOrgMember
    ? interviews.filter((i: any) => i.assignedBy === user?.id || i.assignedToId === user?.id)
    : interviews;

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

  const editForm = useForm<InterviewFormValues>({
    resolver: zodResolver(interviewSchema),
  });

  const onSubmit = (data: InterviewFormValues) => {
    createMutation.mutate({
      ...data,
      status: "programada",
      notes: data.notes || "",
    }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
      },
    });
  };

  const onEditSubmit = (data: InterviewFormValues) => {
    if (!editingInterview) return;
    updateMutation.mutate({
      id: editingInterview.id,
      ...data,
      notes: data.notes || "",
    }, {
      onSuccess: () => {
        setIsEditDialogOpen(false);
        setEditingInterview(null);
        editForm.reset();
      },
    });
  };

  const handleEditClick = (interview: any) => {
    setEditingInterview(interview);
    editForm.reset({
      personName: interview.personName,
      date: interview.date.split(".")[0],
      type: interview.type,
      interviewerId: interview.interviewerId,
      urgent: interview.urgent || false,
      notes: interview.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleComplete = (interviewId: string) => {
    completeMutation.mutate(interviewId);
  };

  const handleCancel = (interviewId: string) => {
    if (window.confirm("¿Está seguro de que desea cancelar esta entrevista?")) {
      deleteMutation.mutate(interviewId);
    }
  };

  const getStatusBadge = (status: string, urgent: boolean) => {
    if (urgent) {
      return (
        <Badge variant="destructive" className="flex items-center w-fit">
          <AlertCircle className="h-3 w-3 mr-1" />
          Urgente
        </Badge>
      );
    }

    const variants: Record<string, { variant: "default" | "secondary" | "outline", label: string }> = {
      programada: { variant: "outline", label: "Programada" },
      completada: { variant: "default", label: "Completada" },
      cancelada: { variant: "secondary", label: "Cancelada" },
    };

    const config = variants[status] || variants.programada;

    return (
      <Badge variant={config.variant} className="flex items-center w-fit">
        {config.label}
      </Badge>
    );
  };

  const upcomingInterviews = filteredInterviews.filter((i: any) => i.status === "programada");
  const completedInterviews = filteredInterviews.filter((i: any) => i.status === "completada");

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
          <h1 className="text-2xl font-bold mb-2">Entrevistas</h1>
          <p className="text-sm text-muted-foreground">
            {isOrgMember 
              ? "Solicita entrevistas con el Obispado"
              : "Programa y gestiona las entrevistas del barrio"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => exportInterviews(interviews)}
            data-testid="button-export-interviews"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
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
                  {isOrgMember 
                    ? "Solicita una entrevista con el Obispado"
                    : "Asigna una entrevista a un miembro del barrio"}
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
                            <Input
                              placeholder="Juan Pérez"
                              {...field}
                              disabled={true}
                              data-testid="input-person-name"
                            />
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
                                .filter(u => u.name.toLowerCase().includes(field.value.toLowerCase()))
                                .map((u) => (
                                  <div
                                    key={u.id}
                                    onClick={() => field.onChange(u.name)}
                                    className="px-3 py-2 cursor-pointer hover:bg-accent hover-elevate transition-colors"
                                    data-testid={`option-person-${u.id}`}
                                  >
                                    <div className="font-medium">{u.name}</div>
                                    <div className="text-xs text-muted-foreground capitalize">
                                      {u.role === "presidente_organizacion" && "Presidente de Organización"}
                                      {u.role === "secretario_organizacion" && "Secretario de Organización"}
                                      {u.role === "consejero_organizacion" && "Consejero de Organización"}
                                      {u.role === "secretario" && "Secretario"}
                                    </div>
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
                            {interviewers.map((interviewer: any) => (
                              <SelectItem key={interviewer.id} value={interviewer.id}>
                                {interviewer.name}
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
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-urgent"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Marcar como urgente
                          </FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Las entrevistas urgentes se mostrarán con prioridad
                          </p>
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
                          <Textarea
                            placeholder="Notas adicionales sobre la entrevista"
                            {...field}
                            data-testid="textarea-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                      {createMutation.isPending ? "Programando..." : "Programar"}
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
            <CardTitle className="text-sm font-medium">Próximas Entrevistas</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-upcoming-interviews">
              {upcomingInterviews.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pendientes de realizar
            </p>
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
            <p className="text-xs text-muted-foreground mt-1">
              Este año
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isOrgMember ? "Mis Solicitudes de Entrevista" : "Entrevistas Programadas"}</CardTitle>
          <CardDescription>
            {isOrgMember 
              ? "Tus solicitudes de entrevista con el Obispado"
              : "Todas las entrevistas del barrio"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                {(canManage || canCancel) && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInterviews.length > 0 ? (
                filteredInterviews.map((interview: any) => (
                  <TableRow key={interview.id} data-testid={`row-interview-${interview.id}`}>
                    <TableCell className="font-medium">{interview.personName}</TableCell>
                    <TableCell className="text-sm">{interview.type}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(interview.date).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>{getStatusBadge(interview.status, interview.urgent)}</TableCell>
                    {(canManage || canCancel) && (
                      <TableCell>
                        <div className="flex gap-2">
                          {isObispado && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditClick(interview)}
                              data-testid={`button-edit-${interview.id}`}
                              disabled={updateMutation.isPending}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                          )}
                          {isObispado && interview.status === "programada" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleComplete(interview.id)}
                              data-testid={`button-complete-${interview.id}`}
                              disabled={completeMutation.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Completar
                            </Button>
                          )}
                          {canCancel && interview.status !== "completada" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleCancel(interview.id)}
                              data-testid={`button-cancel-interview-${interview.id}`}
                              disabled={deleteMutation.isPending}
                            >
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={(canManage || canCancel) ? 5 : 4} className="text-center py-8 text-muted-foreground">
                    {isOrgMember ? "No hay solicitudes de entrevista" : "No hay entrevistas programadas"}
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
            <DialogDescription>
              Modifica los detalles de la entrevista
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="personName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la Persona</FormLabel>
                    <div className="space-y-2">
                      <FormControl>
                        <Input
                          placeholder="Escribe un nombre o selecciona de la lista"
                          {...field}
                          data-testid="input-edit-person-name"
                        />
                      </FormControl>
                      <div className="border rounded-md max-h-40 overflow-y-auto">
                        {organizationMembers
                          .filter(u => u.name.toLowerCase().includes(field.value.toLowerCase()))
                          .map((u) => (
                            <div
                              key={u.id}
                              onClick={() => field.onChange(u.name)}
                              className="px-3 py-2 cursor-pointer hover:bg-accent hover-elevate transition-colors"
                              data-testid={`option-edit-person-${u.id}`}
                            >
                              <div className="font-medium">{u.name}</div>
                              <div className="text-xs text-muted-foreground capitalize">
                                {u.role === "presidente_organizacion" && "Presidente de Organización"}
                                {u.role === "secretario_organizacion" && "Secretario de Organización"}
                                {u.role === "consejero_organizacion" && "Consejero de Organización"}
                                {u.role === "secretario" && "Secretario"}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
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
                        {interviewers.map((interviewer: any) => (
                          <SelectItem key={interviewer.id} value={interviewer.id}>
                            {interviewer.name}
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
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-edit-urgent"
                      />
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
                      <Textarea
                        placeholder="Notas adicionales..."
                        {...field}
                        data-testid="textarea-edit-notes"
                      />
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
