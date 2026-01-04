import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Download, Edit, Trash2, Play, CheckCircle2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

import {
  useWardCouncils,
  useCreateWardCouncil,
  useUpdateWardCouncil,
  useDeleteWardCouncil,
  useCreateAssignment,
  useUsers,
} from "@/hooks/use-api";

import { useAuth } from "@/lib/auth";
import { generateWardCouncilPDF } from "@/lib/pdf-utils";
import { exportWardCouncils } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";

/* =========================
   Schema
========================= */

const councilSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  openingPrayer: z.string().optional(),
  openingHymn: z.string().optional(),
  spiritualThought: z.string().optional(),
  spiritualThoughtBy: z.string().optional(),
  spiritualThoughtTopic: z.string().optional(),
  previousAssignments: z
    .array(
      z.object({
        assignment: z.string().min(1, "La asignación es requerida"),
        responsible: z.string().min(1, "El responsable es requerido"),
        status: z.enum(["completada", "en_proceso", "pendiente"]),
        notes: z.string().optional(),
      })
    )
    .optional(),
  adjustmentsNotes: z.string().optional(),
});

type CouncilFormValues = z.infer<typeof councilSchema>;

const councilDetailsSchema = z.object({
  ministryNotes: z.string().optional(),
  salvationWorkNotes: z.string().optional(),
  wardActivitiesNotes: z.string().optional(),
  newAssignmentsNotes: z.string().optional(),
  newAssignments: z
    .array(
      z.object({
        title: z.string().min(1, "La asignación es requerida"),
        assignedTo: z.string().optional(),
        assignedToName: z.string().optional(),
        dueDate: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  finalSummaryNotes: z.string().optional(),
  closingPrayer: z.string().optional(),
  closingPrayerBy: z.string().optional(),
  bishopNotes: z.string().optional(),
});

type CouncilDetailsFormValues = z.infer<typeof councilDetailsSchema>;

const statusLabels: Record<string, string> = {
  completada: "Completada",
  en_proceso: "En proceso",
  pendiente: "Pendiente",
};

function CouncilDetailsForm({
  council,
  canManage,
  onAutoSave,
  onFinalize,
  isUpdating,
  users,
}: {
  council: any;
  canManage: boolean;
  onAutoSave: (data: CouncilDetailsFormValues) => void;
  onFinalize: () => void;
  isUpdating: boolean;
  users: any[];
}) {
  const form = useForm<CouncilDetailsFormValues>({
    resolver: zodResolver(councilDetailsSchema),
    defaultValues: {
      ministryNotes: council.ministryNotes || "",
      salvationWorkNotes: council.salvationWorkNotes || "",
      wardActivitiesNotes: council.wardActivitiesNotes || "",
      newAssignmentsNotes: council.newAssignmentsNotes || "",
      newAssignments: council.newAssignments || [],
      finalSummaryNotes: council.finalSummaryNotes || "",
      closingPrayer: council.closingPrayer || "",
      closingPrayerBy: council.closingPrayerBy || "",
      bishopNotes: council.bishopNotes || "",
    },
  });
  const newAssignments = useFieldArray({
    control: form.control,
    name: "newAssignments",
  });

  const watchedValues = useWatch({ control: form.control });
  const lastSavedRef = useRef<string>("");
  const initialRenderRef = useRef(true);
  const isEditable = council.status === "en_progreso" && canManage;

  useEffect(() => {
    form.reset({
      ministryNotes: council.ministryNotes || "",
      salvationWorkNotes: council.salvationWorkNotes || "",
      wardActivitiesNotes: council.wardActivitiesNotes || "",
      newAssignmentsNotes: council.newAssignmentsNotes || "",
      newAssignments: council.newAssignments || [],
      finalSummaryNotes: council.finalSummaryNotes || "",
      closingPrayer: council.closingPrayer || "",
      closingPrayerBy: council.closingPrayerBy || "",
      bishopNotes: council.bishopNotes || "",
    });
    lastSavedRef.current = "";
    initialRenderRef.current = true;
  }, [council, form]);

  useEffect(() => {
    if (!isEditable) return;
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      return;
    }
    const payload = JSON.stringify(watchedValues ?? {});
    if (payload === lastSavedRef.current) return;

    const timeout = window.setTimeout(() => {
      lastSavedRef.current = payload;
      onAutoSave(watchedValues ?? {});
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [isEditable, onAutoSave, watchedValues]);

  return (
    <CardContent className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Inicio: {council.startedAt ? new Date(council.startedAt).toLocaleTimeString("es-ES") : "-"}</span>
        <span>Fin: {council.endedAt ? new Date(council.endedAt).toLocaleTimeString("es-ES") : "-"}</span>
      </div>

      <Form {...form}>
        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            control={form.control}
            name="ministryNotes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Personas y familias (ministración y necesidades)</FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={!isEditable} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="salvationWorkNotes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Obra de Salvación y Exaltación</FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={!isEditable} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="wardActivitiesNotes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Actividades del barrio</FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={!isEditable} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newAssignmentsNotes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Nuevas asignaciones</FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={!isEditable} />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Asignaciones del consejo</p>
                <p className="text-xs text-muted-foreground">
                  Se crearán como asignaciones reales al finalizar el consejo.
                </p>
              </div>
              {isEditable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    newAssignments.append({
                      title: "",
                      assignedTo: "",
                      assignedToName: "",
                      dueDate: "",
                      notes: "",
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar
                </Button>
              )}
            </div>

            {newAssignments.fields.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No hay nuevas asignaciones registradas.
              </p>
            )}

            {newAssignments.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-4">
                <FormField
                  control={form.control}
                  name={`newAssignments.${index}.title`}
                  render={({ field: inputField }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Asignación</FormLabel>
                      <FormControl>
                        <Input {...inputField} disabled={!isEditable} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`newAssignments.${index}.assignedTo`}
                  render={({ field: inputField }) => (
                    <FormItem>
                      <FormLabel>Responsable</FormLabel>
                      <Select
                        value={inputField.value}
                        onValueChange={(value) => {
                          inputField.onChange(value);
                          const selected = users.find((user) => user.id === value);
                          form.setValue(
                            `newAssignments.${index}.assignedToName`,
                            selected?.fullName || selected?.name || selected?.email || ""
                          );
                        }}
                        disabled={!isEditable}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.fullName || user.name || user.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`newAssignments.${index}.dueDate`}
                  render={({ field: inputField }) => (
                    <FormItem>
                      <FormLabel>Fecha límite</FormLabel>
                      <FormControl>
                        <Input type="date" {...inputField} disabled={!isEditable} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`newAssignments.${index}.notes`}
                  render={({ field: inputField }) => (
                    <FormItem className="md:col-span-3">
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea {...inputField} disabled={!isEditable} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {isEditable && (
                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => newAssignments.remove(index)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Quitar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <FormField
            control={form.control}
            name="finalSummaryNotes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Resumen final del consejo</FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={!isEditable} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="closingPrayer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Oración final</FormLabel>
                <FormControl>
                  <Input {...field} disabled={!isEditable} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="closingPrayerBy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quién ofrece la oración</FormLabel>
                <FormControl>
                  <Input {...field} disabled={!isEditable} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bishopNotes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Notas del obispo/secretario</FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={!isEditable} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {canManage && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onFinalize}
              disabled={council.status !== "en_progreso" || isUpdating}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Finalizar consejo de barrio
            </Button>
          </div>
        )}
      </Form>
    </CardContent>
  );
}

/* =========================
   Component
========================= */

export default function WardCouncilPage() {
  const { user } = useAuth();

  const canManage =
    user?.role === "obispo" ||
    user?.role === "consejero_obispo" ||
    user?.role === "secretario" ||
    user?.role === "secretario_ejecutivo";

  const { data: councils = [], isLoading } = useWardCouncils();
  const { data: users = [] } = useUsers();
  const createMutation = useCreateWardCouncil();
  const updateMutation = useUpdateWardCouncil();
  const deleteMutation = useDeleteWardCouncil();
  const createAssignmentMutation = useCreateAssignment();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCouncil, setEditingCouncil] = useState<any>(null);

  /* =========================
     Forms
  ========================= */

  const createForm = useForm<CouncilFormValues>({
    resolver: zodResolver(councilSchema),
    defaultValues: {
      date: "",
      openingPrayer: "",
      openingHymn: "",
      spiritualThought: "",
      spiritualThoughtBy: "",
      spiritualThoughtTopic: "",
      previousAssignments: [],
      adjustmentsNotes: "",
    },
  });

  const editForm = useForm<CouncilFormValues>({
    resolver: zodResolver(councilSchema),
  });
  const createAssignments = useFieldArray({
    control: createForm.control,
    name: "previousAssignments",
  });
  const editAssignments = useFieldArray({
    control: editForm.control,
    name: "previousAssignments",
  });

  /* =========================
     Handlers
  ========================= */

  const onCreate = (data: CouncilFormValues) => {
    createMutation.mutate(
      {
        ...data,
        previousAssignments: data.previousAssignments || [],
        adjustmentsNotes: data.adjustmentsNotes || "",
        openingPrayer: data.openingPrayer || "",
        openingHymn: data.openingHymn || "",
        spiritualThought: data.spiritualThought || "",
        spiritualThoughtBy: data.spiritualThoughtBy || "",
        spiritualThoughtTopic: data.spiritualThoughtTopic || "",
        attendance: [],
        agreements: [],
      },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          createForm.reset();
        },
      }
    );
  };

  const onEdit = (data: CouncilFormValues) => {
    if (!editingCouncil) return;

    updateMutation.mutate(
      {
        id: editingCouncil.id,
        data: {
          ...data,
          previousAssignments: data.previousAssignments || [],
          adjustmentsNotes: data.adjustmentsNotes || "",
          openingPrayer: data.openingPrayer || "",
          openingHymn: data.openingHymn || "",
          spiritualThought: data.spiritualThought || "",
          spiritualThoughtBy: data.spiritualThoughtBy || "",
          spiritualThoughtTopic: data.spiritualThoughtTopic || "",
        },
      },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setEditingCouncil(null);
          editForm.reset();
        },
      }
    );
  };

  const startEdit = (council: any) => {
    setEditingCouncil(council);
    editForm.reset({
      date: council.date,
      openingPrayer: council.openingPrayer || "",
      openingHymn: council.openingHymn || "",
      spiritualThought: council.spiritualThought || "",
      spiritualThoughtBy: council.spiritualThoughtBy || "",
      spiritualThoughtTopic: council.spiritualThoughtTopic || "",
      previousAssignments: (council.previousAssignments || []).map((assignment: any) => ({
        assignment: assignment?.assignment || "",
        responsible: assignment?.responsible || "",
        status: assignment?.status || "pendiente",
        notes: assignment?.notes || "",
      })),
      newAssignments: (council.newAssignments || []).map((assignment: any) => ({
        title: assignment?.title || "",
        assignedTo: assignment?.assignedTo || "",
        assignedToName: assignment?.assignedToName || "",
        dueDate: assignment?.dueDate ? new Date(assignment.dueDate).toISOString().split("T")[0] : "",
        notes: assignment?.notes || "",
      })),
      adjustmentsNotes: council.adjustmentsNotes || "",
    });
    setIsEditOpen(true);
  };

  const finalizeCouncil = async (council: any) => {
    if (council.status !== "en_progreso") return;

    const draftAssignments = Array.isArray(council.newAssignments)
      ? council.newAssignments.filter(
          (assignment: any) => assignment?.title && assignment?.assignedTo
        )
      : [];
    const existingIds = Array.isArray(council.assignmentIds) ? council.assignmentIds : [];

    try {
      const createdAssignments = await Promise.all(
        draftAssignments.map((assignment: any) =>
          createAssignmentMutation.mutateAsync({
            title: assignment.title,
            description: assignment.notes || "",
            assignedTo: assignment.assignedTo || undefined,
            dueDate: assignment.dueDate || undefined,
            status: "pendiente",
            relatedTo: council.id,
            silent: true,
          })
        )
      );

      const createdIds = createdAssignments.map((assignment: any) => assignment.id);

      updateMutation.mutate({
        id: council.id,
        data: {
          status: "finalizado",
          endedAt: new Date(),
          assignmentIds: [...existingIds, ...createdIds],
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    } catch (error) {
      toast({
        title: "Error al finalizar",
        description: "No se pudieron crear todas las asignaciones. Intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  const removeCouncil = (id: string) => {
    if (!confirm("¿Eliminar este consejo de barrio?")) return;
    deleteMutation.mutate(id);
  };

  /* =========================
     Loading
  ========================= */

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  /* =========================
     Render
  ========================= */

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold">Consejo de Barrio</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona la agenda y el seguimiento del consejo
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          <Button variant="outline" onClick={() => exportWardCouncils(councils)}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>

          {canManage && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Consejo
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Crear Consejo de Barrio</DialogTitle>
                  <DialogDescription>
                    Programa una nueva reunión
                  </DialogDescription>
                </DialogHeader>

                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="openingPrayer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Oración inicial</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="openingHymn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Himno (opcional)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="spiritualThought"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pensamiento espiritual</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="spiritualThoughtBy"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quién comparte</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="spiritualThoughtTopic"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tema / Escritura</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Revisión de compromisos anteriores</p>
                          <p className="text-xs text-muted-foreground">
                            Seguimiento breve y enfocado en acción.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            createAssignments.append({
                              assignment: "",
                              responsible: "",
                              status: "pendiente",
                              notes: "",
                            })
                          }
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Agregar
                        </Button>
                      </div>

                      {createAssignments.fields.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No hay asignaciones previas registradas.
                        </p>
                      )}

                      {createAssignments.fields.map((field, index) => (
                        <div key={field.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-4">
                          <FormField
                            control={createForm.control}
                            name={`previousAssignments.${index}.assignment`}
                            render={({ field: inputField }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Asignación</FormLabel>
                                <FormControl>
                                  <Input {...inputField} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={createForm.control}
                            name={`previousAssignments.${index}.responsible`}
                            render={({ field: inputField }) => (
                              <FormItem>
                                <FormLabel>Responsable</FormLabel>
                                <FormControl>
                                  <Input {...inputField} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={createForm.control}
                            name={`previousAssignments.${index}.status`}
                            render={({ field: inputField }) => (
                              <FormItem>
                                <FormLabel>Estado</FormLabel>
                                <Select value={inputField.value} onValueChange={inputField.onChange}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecciona" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {Object.entries(statusLabels).map(([value, label]) => (
                                      <SelectItem key={value} value={value}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={createForm.control}
                            name={`previousAssignments.${index}.notes`}
                            render={({ field: inputField }) => (
                              <FormItem className="md:col-span-3">
                                <FormLabel>Observaciones clave</FormLabel>
                                <FormControl>
                                  <Textarea {...inputField} />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <div className="flex items-end justify-end">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => createAssignments.remove(index)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Quitar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <FormField
                      control={createForm.control}
                      name="adjustmentsNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ajustes o decisiones necesarias</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreateOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending}>
                        Crear
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Councils */}
      {councils.length ? (
        councils.map((c: any) => {
          const councilStatus = c.status || "programado";
          return (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>
                    Consejo –{" "}
                    {new Date(c.date).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </CardTitle>

                  <CardDescription className="mt-2 space-y-1 whitespace-pre-wrap">
                    <span className="block">
                      Estado:{" "}
                      {councilStatus === "en_progreso"
                        ? "En progreso"
                        : councilStatus === "finalizado"
                          ? "Finalizado"
                          : "Programado"}
                    </span>
                    {(c.openingPrayer || c.spiritualThought) && (
                      <span className="block">
                        Apertura: {c.openingPrayer || "-"}{" "}
                        {c.spiritualThought ? `• ${c.spiritualThought}` : ""}
                      </span>
                    )}
                  {Array.isArray(c.previousAssignments) && c.previousAssignments.length > 0 && (
                    <span className="block">
                      Compromisos anteriores: {c.previousAssignments.length}
                    </span>
                  )}
                  {Array.isArray(c.newAssignments) && c.newAssignments.length > 0 && (
                    <span className="block">Nuevas asignaciones: {c.newAssignments.length}</span>
                  )}
                </CardDescription>
              </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateWardCouncilPDF(c)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>

                  {canManage && (
                    <>
                      {councilStatus === "programado" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            updateMutation.mutate({
                              id: c.id,
                              data: { status: "en_progreso", startedAt: new Date() },
                            })
                          }
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Inicio del consejo de barrio
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(c)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeCouncil(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>

            {councilStatus !== "programado" && (
              <CouncilDetailsForm
                council={{ ...c, status: councilStatus }}
                canManage={canManage}
                isUpdating={updateMutation.isPending}
                users={users}
                onAutoSave={(data) =>
                  updateMutation.mutate({
                    id: c.id,
                    data,
                    silent: true,
                  })
                }
                onFinalize={() => finalizeCouncil(c)}
              />
            )}
          </Card>
        );
        })
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay consejos programados
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Consejo de Barrio</DialogTitle>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="openingPrayer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Oración inicial</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="openingHymn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Himno (opcional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="spiritualThought"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pensamiento espiritual</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="spiritualThoughtBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quién comparte</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="spiritualThoughtTopic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tema / Escritura</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Revisión de compromisos anteriores</p>
                    <p className="text-xs text-muted-foreground">
                      Seguimiento breve y enfocado en acción.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      editAssignments.append({
                        assignment: "",
                        responsible: "",
                        status: "pendiente",
                        notes: "",
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar
                  </Button>
                </div>

                {editAssignments.fields.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No hay asignaciones previas registradas.
                  </p>
                )}

                {editAssignments.fields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-4">
                    <FormField
                      control={editForm.control}
                      name={`previousAssignments.${index}.assignment`}
                      render={({ field: inputField }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Asignación</FormLabel>
                          <FormControl>
                            <Input {...inputField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name={`previousAssignments.${index}.responsible`}
                      render={({ field: inputField }) => (
                        <FormItem>
                          <FormLabel>Responsable</FormLabel>
                          <FormControl>
                            <Input {...inputField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name={`previousAssignments.${index}.status`}
                      render={({ field: inputField }) => (
                        <FormItem>
                          <FormLabel>Estado</FormLabel>
                          <Select value={inputField.value} onValueChange={inputField.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(statusLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name={`previousAssignments.${index}.notes`}
                      render={({ field: inputField }) => (
                        <FormItem className="md:col-span-3">
                          <FormLabel>Observaciones clave</FormLabel>
                          <FormControl>
                            <Textarea {...inputField} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="flex items-end justify-end">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => editAssignments.remove(index)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Quitar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <FormField
                control={editForm.control}
                name="adjustmentsNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ajustes o decisiones necesarias</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  Guardar
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
