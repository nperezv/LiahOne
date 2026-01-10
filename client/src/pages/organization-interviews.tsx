import { useMemo, useState } from "react";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  useOrganizationInterviews,
  useCreateOrganizationInterview,
  useUpdateOrganizationInterview,
  useDeleteOrganizationInterview,
  useUsers,
} from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/error-utils";
import { exportInterviews } from "@/lib/export";

/* =========================
   Schema
========================= */
const interviewSchema = z.object({
  personName: z.string().min(1, "El nombre es requerido"),
  date: z.string().min(1, "La fecha es requerida"),
  type: z.string().min(1, "El tipo es requerido"),
  interviewerId: z.string().min(1, "El entrevistador es requerido"),
  urgent: z.boolean().default(false),
  notes: z.string().optional(),
});

type InterviewFormValues = z.infer<typeof interviewSchema>;

/* =========================
   Helpers (idénticos a Obispado)
========================= */
function formatInterviewType(type: string) {
  const map: Record<string, string> = {
    ministracion: "Ministración",
    autosuficiencia: "Autosuficiencia",
    consuelo: "Consuelo",
    seguimiento: "Seguimiento",
    otro: "Otro",
  };
  return map[type] ?? type;
}

const getStatusBadge = (status: string) => {
  const map: Record<
    string,
    { label: string; variant: "default" | "outline" | "secondary" }
  > = {
    programada: { label: "Pendiente", variant: "outline" },
    completada: { label: "Completada", variant: "default" },
    archivada: { label: "Archivada", variant: "secondary" },
  };

  const cfg = map[status] ?? map.programada;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

const getPriorityBadge = (urgent: boolean) =>
  urgent ? (
    <Badge variant="destructive" className="flex items-center w-fit">
      <AlertCircle className="h-3 w-3 mr-1" />
      Urgente
    </Badge>
  ) : (
    <Badge variant="outline">Normal</Badge>
  );

/* =========================
   Page
========================= */
export default function OrganizationInterviewsPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: interviews = [], isLoading } =
    useOrganizationInterviews();
  const { data: users = [] } = useUsers();

  const createMutation = useCreateOrganizationInterview();
  const updateMutation = useUpdateOrganizationInterview();
  const deleteMutation = useDeleteOrganizationInterview();

  const canManage =
    user?.role === "presidente_organizacion" ||
    user?.role === "consejero_organizacion" ||
    user?.role === "secretario_organizacion";

  const canDelete = user?.role === "presidente_organizacion";

  const interviewers = useMemo(() => {
    if (!user?.organizationId) return [];
    return users.filter(
      (u: any) =>
        u.organizationId === user.organizationId &&
        (u.role === "presidente_organizacion" ||
          u.role === "consejero_organizacion")
    );
  }, [users, user?.organizationId]);

  const userById = useMemo(() => {
    const map = new Map<string, any>();
    users.forEach((u: any) => map.set(u.id, u));
    return map;
  }, [users]);

  const filteredInterviews = useMemo(() => {
    return interviews
      .filter((i: any) =>
        showArchived
          ? i.status === "archivada"
          : i.status !== "archivada"
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      );
  }, [interviews, showArchived]);
  
  const pending = filteredInterviews.filter(
    (i: any) => i.status === "programada"
  );
  const completed = filteredInterviews.filter(
    (i: any) => i.status === "completada"
  );

  const form = useForm<InterviewFormValues>({
    resolver: zodResolver(interviewSchema),
    defaultValues: {
      personName: "",
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

  /* =========================
     Handlers
  ========================= */
  const handleToggleCompleted = (interview: any, checked: boolean) => {
    if (!checked || interview.status !== "programada") return;

    updateMutation.mutate({
      id: interview.id,
      status: "completada",
    });
  };

  const handleArchive = (id: string) => {
    updateMutation.mutate({ id, status: "archivada" });
  };

  const handleEditClick = (interview: any) => {
    setEditingInterview(interview);
    editForm.reset({
      personName: interview.personName,
      date: interview.date?.split(".")[0] ?? "",
      type: interview.type,
      interviewerId: interview.interviewerId,
      urgent: !!interview.urgent,
      notes: interview.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const onEditSubmit = (data: InterviewFormValues) => {
    if (!editingInterview) return;

    updateMutation.mutate(
      {
        id: editingInterview.id,
        personName: data.personName,
        date: data.date,
        type: data.type,
        interviewerId: data.interviewerId,
        urgent: data.urgent,
        notes: data.notes || "",
      },
      {
        onSuccess: () => {
          toast({
            title: "Entrevista actualizada",
            description: "Los cambios se han guardado correctamente.",
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

  /* =========================
     UI
  ========================= */
  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Entrevistas de Organización
          </h1>
          <p className="text-muted-foreground">
            Gestión de entrevistas de la organización
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => exportInterviews(interviews)}
          >
            <Download className="h-4 w-4 lg:mr-2" />
            <span className="sr-only lg:not-sr-only">Exportar</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowArchived(v => !v)}
          >
            {showArchived ? "Ocultar archivadas" : "Ver archivadas"}
          </Button>

          {canManage && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Entrevista
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Programar Entrevista</DialogTitle>
                  <DialogDescription>
                    Registra una entrevista de la organización
                  </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(data =>
                      createMutation.mutate(data, {
                        onSuccess: () => {
                          toast({ title: "Entrevista creada" });
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
                      })
                    )}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="personName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Persona</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ministracion">
                                  Ministración
                                </SelectItem>
                                <SelectItem value="autosuficiencia">
                                  Autosuficiencia
                                </SelectItem>
                                <SelectItem value="consuelo">
                                  Consuelo
                                </SelectItem>
                                <SelectItem value="seguimiento">
                                  Seguimiento
                                </SelectItem>
                                <SelectItem value="otro">Otro</SelectItem>
                              </SelectContent>
                            </Select>
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent>
                              {interviewers.map((i: any) => (
                                <SelectItem key={i.id} value={i.id}>
                                  {i.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="urgent"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <FormLabel>Urgente</FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notas</FormLabel>
                          <Textarea {...field} />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => setIsDialogOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit">Guardar</Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex justify-between">
            <CardTitle className="text-sm">Pendientes</CardTitle>
            <CalendarIcon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pending.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex justify-between">
            <CardTitle className="text-sm">Completadas</CardTitle>
            <CheckCircle2 className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completed.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Entrevistas</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Entrevistador</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredInterviews.map((interview: any) => (
                <TableRow key={interview.id}>
                  <TableCell>{interview.personName}</TableCell>
                  <TableCell>
                    {formatInterviewType(interview.type)}
                  </TableCell>
                  <TableCell>
                    {userById.get(interview.interviewerId)?.name}
                  </TableCell>
                  <TableCell>
                    {new Date(interview.date).toLocaleDateString("es-ES", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    {getPriorityBadge(!!interview.urgent)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(interview.status)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {interview.status === "programada" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => handleToggleCompleted(interview, true)}
                        >
                          <CheckCircle2 className="h-4 w-4 lg:mr-1" />
                          <span className="sr-only lg:not-sr-only">Completar</span>
                        </Button>
                      )}

                      {interview.status === "completada" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => handleArchive(interview.id)}
                        >
                          <Archive className="h-4 w-4 mr-1" />
                          Archivar
                        </Button>
                      )}

                      {canManage &&
                        interview.status !== "completada" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="whitespace-nowrap"
                            onClick={() =>
                              handleEditClick(interview)
                            }
                          >
                            <Edit className="h-4 w-4 lg:mr-1" />
                            <span className="sr-only lg:not-sr-only">Editar</span>
                          </Button>
                        )}

                      {canDelete &&
                        interview.status !== "completada" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="whitespace-nowrap"
                            onClick={() =>
                              deleteMutation.mutate(interview.id)
                            }
                          >
                            <Trash2 className="h-4 w-4 lg:mr-1" />
                            <span className="sr-only lg:not-sr-only">Eliminar</span>
                          </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {filteredInterviews.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground"
                  >
                    No hay entrevistas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Entrevista</DialogTitle>
            <DialogDescription>
              Modifica los detalles de la entrevista
            </DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(onEditSubmit)}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="personName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Persona</FormLabel>
                    <Input {...field} />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={editForm.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha</FormLabel>
                      <Input type="datetime-local" {...field} />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ministracion">
                            Ministración
                          </SelectItem>
                          <SelectItem value="autosuficiencia">
                            Autosuficiencia
                          </SelectItem>
                          <SelectItem value="consuelo">
                            Consuelo
                          </SelectItem>
                          <SelectItem value="seguimiento">
                            Seguimiento
                          </SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {interviewers.map((i: any) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="urgent"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <FormLabel>Urgente</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <Textarea {...field} />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
