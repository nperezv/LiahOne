import { Fragment, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CheckCircle2, Clock, Download, Edit, ArrowLeft, Archive, XCircle } from "lucide-react";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAssignments, useCreateAssignment, useUpdateAssignment, useUsers } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { exportAssignments } from "@/lib/export";
import { useLocation, useSearch } from "wouter";

const assignmentSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  assignedTo: z.string().min(1, "La persona es requerida"),
  dueDate: z.string().min(1, "La fecha de vencimiento es requerida"),
  status: z.enum(["pendiente", "en_proceso", "completada", "cancelada", "archivada"]),
});

type AssignmentFormValues = z.infer<typeof assignmentSchema>;


const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }

  navigate(path);
};

export default function Assignments() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const origin = searchParams.get("from");
  const originOrgSlug = searchParams.get("orgSlug");
  const shouldAutoOpenCreate = searchParams.get("create") === "1";
  const canGoBackToManagement = origin === "presidency-manage" && Boolean(originOrgSlug);
  const { data: assignments = [], isLoading } = useAssignments();
  const { data: users = [] } = useUsers();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [detailsAssignment, setDetailsAssignment] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (shouldAutoOpenCreate) {
      setIsDialogOpen(true);
    }
  }, [shouldAutoOpenCreate]);

  const createMutation = useCreateAssignment();
  const updateMutation = useUpdateAssignment();


  // Assignments are already filtered by backend according to role/organization visibility.
  const isObispado = ["obispo", "consejero_obispo", "secretario"].includes(user?.role || "");
  const isObispo = user?.role === "obispo";
  const isArchivedAssignment = (assignment: any) =>
    assignment.status === "archivada" || ["completada", "cancelada"].includes(assignment.status);

  const filteredAssignments = useMemo(() =>
    assignments.filter((a: any) =>
      showArchived
        ? isArchivedAssignment(a)
        : ["pendiente", "en_proceso"].includes(a.status)
    ),
    [assignments, showArchived]
  );


  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: "",
      description: "",
      assignedTo: "",
      dueDate: "",
      status: "pendiente",
    },
  });
  const editForm = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: "",
      description: "",
      assignedTo: "",
      dueDate: "",
      status: "pendiente",
    },
  });

  const onSubmit = (data: AssignmentFormValues) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
      },
    });
  };

  const updateStatus = (id: string, status: string) => {
    if (status === "cancelada") {
      const reason = window.prompt("Indica el motivo de cancelación:");
      if (!reason || !reason.trim()) {
        return;
      }

      updateMutation.mutate({
        id,
        status,
        cancellationReason: reason.trim(),
      });
      return;
    }

    updateMutation.mutate({
      id,
      status,
      ...(cancellationReason ? { cancellationReason } : {}),
    });
  };

  const startEdit = (assignment: any) => {
    setEditingAssignment(assignment);
    editForm.reset({
      title: assignment.title || "",
      description: assignment.description || "",
      assignedTo: assignment.assignedTo || "",
      dueDate: assignment.dueDate ? new Date(assignment.dueDate).toISOString().split("T")[0] : "",
      status: assignment.status || "pendiente",
    });
    setIsEditOpen(true);
  };

  const openDetails = (assignment: any) => {
    setDetailsAssignment(assignment);
    setIsDetailsOpen(true);
  };

  const closeDetails = () => {
    setIsDetailsOpen(false);
    setDetailsAssignment(null);
  };

  const onEdit = (data: AssignmentFormValues) => {
    if (!editingAssignment) return;

    const payload: Record<string, any> = {
      id: editingAssignment.id,
      ...data,
    };

    if (data.status === "cancelada") {
      const reason = window.prompt("Indica el motivo de cancelación:");
      if (!reason || !reason.trim()) {
        return;
      }
      payload.cancellationReason = reason.trim();
    }

    updateMutation.mutate(
      payload,
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setEditingAssignment(null);
        },
      }
    );
  };

  const pendingAssignments = filteredAssignments.filter((a: any) => a.status === "pendiente");
  const inProgressAssignments = filteredAssignments.filter((a: any) => a.status === "en_proceso");
  const completedAssignments = filteredAssignments.filter((a: any) => a.resolution === "completada" || a.status === "completada");
  const archivedAssignments = assignments.filter((a: any) => isArchivedAssignment(a));
  const isAutoCompleteAssignment = (assignment: any) =>
    assignment.relatedTo?.startsWith("budget:") &&
    assignment.title === "Adjuntar comprobantes de gasto";
  const canEditAssignment = (assignment: any) =>
    isObispado || assignment.assignedBy === user?.id || assignment.assignedTo === user?.id;
  const canCompleteAssignment = (assignment: any) => {
    if (["archivada", "completada", "cancelada"].includes(assignment.status)) return false;
    if (isAutoCompleteAssignment(assignment)) return false;
    if (assignment.relatedTo?.startsWith("interview:") && !isObispado) return false;
    return isObispado || assignment.assignedTo === user?.id;
  };
  const canCancelAssignment = (assignment: any) => {
    if (["archivada", "completada", "cancelada"].includes(assignment.status)) return false;
    return isObispo || assignment.assignedBy === user?.id;
  };
  const getResolutionLabel = (assignment: any) => {
    const resolution = assignment?.resolution;
    if (resolution === "completada") return "Completada";
    if (resolution === "cancelada") return "Cancelada";
    return "Sin definir";
  };
  const renderAssignmentActions = (assignment: any) => (
    <div className="flex items-center gap-2">
      {canEditAssignment(assignment) ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            startEdit(assignment);
          }}
        >
          <Edit className="h-3 w-3 lg:mr-1" />
          <span className="sr-only lg:not-sr-only">Editar</span>
        </Button>
      ) : null}
      {canCompleteAssignment(assignment) ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            updateStatus(assignment.id, "completada");
          }}
          data-testid={`button-complete-${assignment.id}`}
        >
          <CheckCircle2 className="h-3 w-3 lg:mr-1" />
          <span className="sr-only lg:not-sr-only">Completar</span>
        </Button>
      ) : null}
      {canCancelAssignment(assignment) ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            updateStatus(assignment.id, "cancelada");
          }}
          data-testid={`button-cancel-assignment-${assignment.id}`}
        >
          <XCircle className="h-3 w-3 lg:mr-1" />
          <span className="sr-only lg:not-sr-only">Cancelar</span>
        </Button>
      ) : null}
      {["completada", "archivada"].indexOf(assignment.status) === -1 && isAutoCompleteAssignment(assignment) && (
        <p className="text-xs text-muted-foreground">
          Se completará automáticamente al adjuntar comprobantes.
        </p>
      )}
    </div>
  );

  const getStatusBadge = (assignment: any) => {
    const status = assignment?.status;
    const resolution = assignment?.resolution;
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      pendiente: { variant: "outline", label: "Pendiente" },
      en_proceso: { variant: "default", label: "En Proceso" },
      completada: { variant: "secondary", label: "Completada" },
      cancelada: { variant: "outline", label: "Cancelada" },
      archivada: { variant: "secondary", label: "Archivada" },
    };

    const config = variants[status] || variants.pendiente;

    return (
      <Badge variant={config.variant} className="flex items-center w-fit">
        {config.label}
      </Badge>
    );
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
          <h1 className="text-2xl font-bold mb-2">Asignaciones</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona las asignaciones del barrio
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          {canGoBackToManagement ? (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => navigateWithTransition(setLocation, `/presidency/${originOrgSlug}/manage`)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => setShowArchived((prev) => !prev)}
            data-testid="button-toggle-archived-assignments"
          >
            <Archive className="h-4 w-4 lg:mr-2" />
            <span>{showArchived ? "Ocultar archivadas" : "Ver archivadas"}</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => exportAssignments(assignments)}
            data-testid="button-export-assignments"
          >
            <Download className="h-4 w-4 lg:mr-2" />
            <span className="sr-only lg:not-sr-only">Exportar</span>
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-assignment">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Asignación
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Crear Nueva Asignación</DialogTitle>
                <DialogDescription>
                  Asigna una tarea a un miembro de la comunidad
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
                            placeholder="Preparar discurso para sacramental"
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
                            placeholder="Detalles de la asignación"
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
                      name="assignedTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Asignado a</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-assigned-to">
                                <SelectValue placeholder="Seleccionar persona" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {users.map((u: any) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name}
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
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha de Vencimiento</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-due-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-status">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pendiente">Pendiente</SelectItem>
                            <SelectItem value="en_proceso">En Proceso</SelectItem>
                            <SelectItem value="completada">Completada</SelectItem>
                        <SelectItem value="cancelada">Cancelada</SelectItem>
                        <SelectItem value="archivada">Archivada</SelectItem>
                          </SelectContent>
                        </Select>
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
                      {createMutation.isPending ? "Creando..." : "Crear Asignación"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-assignments">
              {pendingAssignments.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              asignaciones sin iniciar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Proceso</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-in-progress-assignments">
              {inProgressAssignments.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              asignaciones en desarrollo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completadas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-assignments">
              {completedAssignments.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              asignaciones finalizadas
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{showArchived ? "Asignaciones archivadas" : "Asignaciones activas"}</CardTitle>
          <CardDescription>
            {showArchived ? archivedAssignments.length : filteredAssignments.length} asignaciones {showArchived ? "archivadas" : "activas"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Asignado a</TableHead>
                  <TableHead>Asignado por</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Resolución</TableHead>
                  {!showArchived ? <TableHead>Acciones</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.length > 0 ? (
                  filteredAssignments.map((assignment: any) => (
                    <TableRow
                      key={assignment.id}
                      data-testid={`row-assignment-${assignment.id}`}
                      className="cursor-pointer"
                      onClick={() => openDetails(assignment)}
                    >
                      <TableCell className="font-medium">{assignment.title}</TableCell>
                      <TableCell>{assignment.personName || "Sin asignar"}</TableCell>
                      <TableCell>{assignment.assignerName || "Desconocido"}</TableCell>
                      <TableCell>
                        {assignment.dueDate
                          ? new Date(assignment.dueDate).toLocaleDateString("es-ES", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "Sin fecha"}
                      </TableCell>
                      <TableCell>{getStatusBadge(assignment)}</TableCell>
                      <TableCell>{showArchived ? getResolutionLabel(assignment) : "—"}</TableCell>
                      {!showArchived ? (
                      <TableCell>
                        {renderAssignmentActions(assignment)}
                      </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={!showArchived ? 7 : 6} className="text-center text-muted-foreground">
                      No hay asignaciones
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalles de la asignación</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="assignedTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asignado a</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map((user: any) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.fullName || user.name || user.email}
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
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha límite</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pendiente">Pendiente</SelectItem>
                        <SelectItem value="en_proceso">En proceso</SelectItem>
                        <SelectItem value="completada">Completada</SelectItem>
                        {isObispo || editingAssignment?.assignedBy === user?.id ? (
                          <SelectItem value="cancelada">Cancelada</SelectItem>
                        ) : null}
                        {isObispado ? <SelectItem value="archivada">Archivada</SelectItem> : null}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cerrar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) {
            setDetailsAssignment(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalles de la asignación</DialogTitle>
            <DialogDescription>
              Información en modo lectura.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div>
              <span className="font-medium">Título:</span>{" "}
              {detailsAssignment?.title || "Sin título"}
            </div>
            <div>
              <span className="font-medium">Descripción:</span>{" "}
              {detailsAssignment?.description || "Sin descripción"}
            </div>
            <div>
              <span className="font-medium">Asignado a:</span>{" "}
              {detailsAssignment?.personName || "Sin asignar"}
            </div>
            <div>
              <span className="font-medium">Asignado por:</span>{" "}
              {detailsAssignment?.assignerName || "Desconocido"}
            </div>
            <div>
              <span className="font-medium">Vencimiento:</span>{" "}
              {detailsAssignment?.dueDate
                ? new Date(detailsAssignment.dueDate).toLocaleDateString("es-ES", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "Sin fecha"}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Estado:</span>
              {detailsAssignment?.status ? getStatusBadge(detailsAssignment) : "Pendiente"}
            </div>
            <div>
              <span className="font-medium">Tipo de resolución:</span>{" "}
              {getResolutionLabel(detailsAssignment)}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={closeDetails}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
