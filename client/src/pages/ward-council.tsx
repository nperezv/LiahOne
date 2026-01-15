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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
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
  useOrganizations,
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
  presider: z.string().optional(),
  director: z.string().optional(),
  openingPrayer: z.string().optional(),
  openingHymn: z.string().optional(),
  closingPrayerBy: z.string().optional(),
  hasSpiritualThought: z.boolean().optional(),
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
  bishopNotes: z.string().optional(),
});

type CouncilDetailsFormValues = z.infer<typeof councilDetailsSchema>;

const statusLabels: Record<string, string> = {
  completada: "Completada",
  en_proceso: "En proceso",
  pendiente: "Pendiente",
};

const formatDateForInput = (value?: string | Date | null) => {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

function renderLeaderOptions(
  groups: { id: string; name: string; members: any[] }[],
  useIdValue: boolean
) {
  return groups.map((group) => (
    <SelectGroup key={group.id}>
      <SelectLabel className="rounded-md bg-muted px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
        {group.name}
      </SelectLabel>
      {group.members.map((member: any) => {
        const label = member.fullName || member.name || member.email;
        const value = useIdValue ? member.id : label;
        return (
          <SelectItem key={member.id} value={value}>
            {label}
          </SelectItem>
        );
      })}
    </SelectGroup>
  ));
}

function CouncilDetailsForm({
  council,
  canManage,
  onAutoSave,
  onFinalize,
  isUpdating,
  leaderGroups,
  leaderLookup,
}: {
  council: any;
  canManage: boolean;
  onAutoSave: (data: CouncilDetailsFormValues) => void;
  onFinalize: () => void;
  isUpdating: boolean;
  leaderGroups: { name: string; members: any[] }[];
  leaderLookup: Map<string, any>;
}) {
  const form = useForm<CouncilDetailsFormValues>({
    resolver: zodResolver(councilDetailsSchema),
    defaultValues: {
      ministryNotes: council.ministryNotes || "",
      salvationWorkNotes: council.salvationWorkNotes || "",
      wardActivitiesNotes: council.wardActivitiesNotes || "",
      newAssignmentsNotes: council.newAssignmentsNotes || "",
      newAssignments: (council.newAssignments || []).map((assignment: any) => ({
        ...assignment,
        dueDate: formatDateForInput(assignment?.dueDate),
      })),
      finalSummaryNotes: council.finalSummaryNotes || "",
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
  const isEditable = council.status === "en_progreso" && canManage && Boolean(council.startedAt);

  useEffect(() => {
    form.reset({
      ministryNotes: council.ministryNotes || "",
      salvationWorkNotes: council.salvationWorkNotes || "",
      wardActivitiesNotes: council.wardActivitiesNotes || "",
      newAssignmentsNotes: council.newAssignmentsNotes || "",
      newAssignments: (council.newAssignments || []).map((assignment: any) => ({
        ...assignment,
        dueDate: formatDateForInput(assignment?.dueDate),
      })),
      finalSummaryNotes: council.finalSummaryNotes || "",
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
    }, 300000);

    return () => window.clearTimeout(timeout);
  }, [isEditable, onAutoSave, watchedValues]);

  return (
    <CardContent className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Inicio: {council.startedAt ? new Date(council.startedAt).toLocaleTimeString("es-ES") : "-"}</span>
        <span>Fin: {council.endedAt ? new Date(council.endedAt).toLocaleTimeString("es-ES") : "-"}</span>
      </div>
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <span>Preside: {council.presider || "-"}</span>
          <span>Dirige: {council.director || "-"}</span>
          <span>Oración de apertura: {council.openingPrayer || "-"}</span>
          <span>Oración final: {council.closingPrayerBy || council.closingPrayer || "-"}</span>
          <span>Pensamiento espiritual: {council.spiritualThoughtBy || "-"}</span>
          <span>Himno: {council.openingHymn || "-"}</span>
        </div>
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
                          const selected = leaderLookup.get(value);
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
                          {renderLeaderOptions(leaderGroups, true)}
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
  const { data: organizations = [] } = useOrganizations();
  const createMutation = useCreateWardCouncil();
  const updateMutation = useUpdateWardCouncil();
  const deleteMutation = useDeleteWardCouncil();
  const createAssignmentMutation = useCreateAssignment();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCouncil, setEditingCouncil] = useState<any>(null);
  const [detailsCouncil, setDetailsCouncil] = useState<any>(null);
  const [, setEditLeaderOrganizationFilter] = useState("all");
  const leaderGroups = (() => {
    const leaderRoles = new Set([
      "obispo",
      "consejero_obispo",
      "secretario",
      "secretario_ejecutivo",
      "secretario_financiero",
      "presidente_organizacion",
      "consejero_organizacion",
      "secretario_organizacion",
    ]);
    const secretaryRoles = new Set([
      "secretario",
      "secretario_ejecutivo",
      "secretario_financiero",
    ]);
    const orgLookup = new Map(
      organizations.map((org: any) => [org.id, org.name || org.type])
    );
    const grouped = new Map<string, { name: string; members: any[] }>();

    users
      .filter((user: any) => leaderRoles.has(user.role))
      .forEach((user: any) => {
        const isSecretary = secretaryRoles.has(user.role);
        const rawOrgName = user.organizationId
          ? orgLookup.get(user.organizationId) || "Organización"
          : "Obispado";
        const isBishopric = !isSecretary && rawOrgName.toLowerCase() === "obispado";
        const orgId = isSecretary
          ? "secretarios_barrio"
          : isBishopric
          ? "obispado"
          : user.organizationId ?? "obispado";
        const orgName = isSecretary
          ? "Secretarios de barrio"
          : isBishopric
          ? "Obispado"
          : rawOrgName;
        if (!grouped.has(orgId)) {
          grouped.set(orgId, { name: orgName, members: [] });
        }
        grouped.get(orgId)?.members.push(user);
      });

    return Array.from(grouped.entries()).map(([id, group]) => ({
      id,
      name: group.name,
      members: group.members.sort((a, b) =>
        (a.fullName || a.name || "").localeCompare(b.fullName || b.name || "")
      ),
    }));
  })();
  const leaderLookup = new Map(
    leaderGroups.flatMap((group) => group.members.map((member: any) => [member.id, member]))
  );

  /* =========================
     Forms
  ========================= */

  const createForm = useForm<CouncilFormValues>({
    resolver: zodResolver(councilSchema),
    defaultValues: {
      date: "",
      presider: "",
      director: "",
      openingPrayer: "",
      openingHymn: "",
      closingPrayerBy: "",
      hasSpiritualThought: false,
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
    const { hasSpiritualThought, ...payload } = data;
    createMutation.mutate(
      {
        ...payload,
        previousAssignments: data.previousAssignments || [],
        adjustmentsNotes: data.adjustmentsNotes || "",
        presider: data.presider || "",
        director: data.director || "",
        openingPrayer: data.openingPrayer || "",
        openingHymn: data.openingHymn || "",
        closingPrayerBy: data.closingPrayerBy || "",
        spiritualThought: "",
        spiritualThoughtBy: hasSpiritualThought ? data.spiritualThoughtBy || "" : "",
        spiritualThoughtTopic: "",
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
    const { hasSpiritualThought, ...payload } = data;

    updateMutation.mutate(
      {
        id: editingCouncil.id,
        data: {
          ...payload,
          previousAssignments: data.previousAssignments || [],
          adjustmentsNotes: data.adjustmentsNotes || "",
          presider: data.presider || "",
          director: data.director || "",
          openingPrayer: data.openingPrayer || "",
          openingHymn: data.openingHymn || "",
          closingPrayerBy: data.closingPrayerBy || "",
          spiritualThought: "",
          spiritualThoughtBy: hasSpiritualThought ? data.spiritualThoughtBy || "" : "",
          spiritualThoughtTopic: "",
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
    setEditLeaderOrganizationFilter("all");
    editForm.reset({
      date: formatDateForInput(council.date),
      presider: council.presider || "",
      director: council.director || "",
      openingPrayer: council.openingPrayer || "",
      openingHymn: council.openingHymn || "",
      closingPrayerBy: council.closingPrayerBy || "",
      hasSpiritualThought: Boolean(council.spiritualThoughtBy),
      spiritualThought: "",
      spiritualThoughtBy: council.spiritualThoughtBy || "",
      spiritualThoughtTopic: "",
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
        dueDate: formatDateForInput(assignment?.dueDate),
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

  const createLeaderOptions = renderLeaderOptions(leaderGroups, false);
  const editLeaderOptions = renderLeaderOptions(leaderGroups, false);

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
            <Download className="h-4 w-4 lg:mr-2" />
            <span className="sr-only lg:not-sr-only">Exportar</span>
          </Button>

          {canManage && (
            <Dialog
              open={isCreateOpen}
              onOpenChange={(open) => {
                setIsCreateOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Consejo
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Crear Consejo de Barrio</DialogTitle>
                  <DialogDescription>
                    Programa una nueva reunión
                  </DialogDescription>
                </DialogHeader>
              
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
              
                    {/* Fecha */}
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
              
                    {/* Preside */}
                    <FormField
                      control={createForm.control}
                      name="presider"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preside</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona un líder" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>{createLeaderOptions}</SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
              
                    {/* Dirige */}
                    <FormField
                      control={createForm.control}
                      name="director"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dirige</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona un líder" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>{createLeaderOptions}</SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
              
                    {/* Oración inicial */}
                    <FormField
                      control={createForm.control}
                      name="openingPrayer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Oración inicial</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona un líder" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>{createLeaderOptions}</SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
              
                    {/* Himno */}
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
              
                    {/* Pensamiento espiritual */}
                    <FormField
                      control={createForm.control}
                      name="hasSpiritualThought"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox
                              checked={Boolean(field.value)}
                              onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-medium">
                            Pensamiento espiritual
                          </FormLabel>
                        </FormItem>
                      )}
                    />
              
                    {createForm.watch("hasSpiritualThought") && (
                      <>
                        <FormField
                          control={createForm.control}
                          name="spiritualThoughtBy"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Asignado a:</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un líder" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>{createLeaderOptions}</SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </>
                    )}
              
                    {/* Oración final */}
                    <FormField
                      control={createForm.control}
                      name="closingPrayerBy"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Oración final</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona un líder" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>{createLeaderOptions}</SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
              
                    {/* Revisión compromisos anteriores */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            Revisión de compromisos anteriores
                          </p>
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
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Asignación</FormLabel>
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
              
                          <FormField
                            control={createForm.control}
                            name={`previousAssignments.${index}.responsible`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Responsable</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecciona un líder" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>{createLeaderOptions}</SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
              
                          <FormField
                            control={createForm.control}
                            name={`previousAssignments.${index}.status`}
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
                            render={({ field }) => (
                              <FormItem className="md:col-span-3">
                                <FormLabel>Observaciones clave</FormLabel>
                                <FormControl>
                                  <Textarea {...field} />
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
              
                    {/* Ajustes */}
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
              
                    {/* Botones */}
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
          <Card key={c.id} className="overflow-hidden">
            <CardHeader className="space-y-3">
                  
              {/* Título + acciones */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  
                {/* Título */}
                <div>
                  <CardTitle className="text-lg sm:text-xl leading-snug">
                    Consejo –{" "}
                    <span className="sm:hidden">
                      {new Date(c.date).toLocaleDateString("es-ES")}
                    </span>
                    <span className="hidden sm:inline">
                      {new Date(c.date).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </CardTitle>
                </div>
                  
                {/* Acciones */}
                <div className="flex flex-wrap gap-2 justify-end sm:flex-nowrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateWardCouncilPDF(c)}
                  >
                    <Download className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                  
                  {canManage && (
                    <>
                      {c.status === "programado" && (
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
                          <Play className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Iniciar</span>
                        </Button>
                      )}
          
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(c)}
                      >
                        <Edit className="h-4 w-4 lg:mr-1" />
                        <span className="sr-only lg:not-sr-only">Editar</span>
                      </Button>
                  
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeCouncil(c.id)}
                      >
                        <Trash2 className="h-4 w-4 lg:mr-1" />
                        <span className="sr-only lg:not-sr-only">Eliminar</span>
                      </Button>
                    </>
                  )}
          
                  {c.status === "finalizado" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDetailsCouncil(c)}
                    >
                      Ver detalles
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Descripción */}
              <CardDescription className="text-sm text-muted-foreground">
                <div className="grid gap-1 sm:grid-cols-2">
                  <span>
                    <strong>Estado:</strong>{" "}
                    {c.status === "en_progreso"
                      ? "En progreso"
                      : c.status === "finalizado"
                      ? "Finalizado"
                      : "Programado"}
                  </span>
                  
                  <span>
                    <strong>Preside:</strong> {c.presider || "-"}
                  </span>
                  
                  <span>
                    <strong>Dirige:</strong> {c.director || "-"}
                  </span>
                  
                  <span>
                    <strong>Oración inicial:</strong> {c.openingPrayer || "-"}
                  </span>
                  
                  <span>
                    <strong>Oración final:</strong> {c.closingPrayerBy || "-"}
                  </span>
                  
                  {Array.isArray(c.previousAssignments) && (
                    <span>
                      <strong>Compromisos anteriores:</strong>{" "}
                      {c.previousAssignments.length}
                    </span>
                  )}
          
                  {Array.isArray(c.newAssignments) && (
                    <span>
                      <strong>Nuevas asignaciones:</strong>{" "}
                      {c.newAssignments.length}
                    </span>
                  )}
                </div>
              </CardDescription>
              
            </CardHeader>
              
            {/* Detalles en progreso */}
            {c.status === "en_progreso" && (
              <CouncilDetailsForm
                council={{ ...c, status: c.status }}
                canManage={canManage}
                isUpdating={updateMutation.isPending}
                leaderGroups={leaderGroups}
                leaderLookup={leaderLookup}
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
      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Consejo de Barrio</DialogTitle>
            <DialogDescription>
              Actualiza la información del consejo programado.
            </DialogDescription>
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
                name="presider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preside</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un líder" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>{editLeaderOptions}</SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="director"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirige</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un líder" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>{editLeaderOptions}</SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="openingPrayer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Oración inicial</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                        <SelectValue placeholder="Selecciona un líder" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>{editLeaderOptions}</SelectContent>
                  </Select>
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
                name="hasSpiritualThought"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <Checkbox
                        checked={Boolean(field.value)}
                        onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-medium">Pensamiento espiritual</FormLabel>
                  </FormItem>
                )}
              />

              {editForm.watch("hasSpiritualThought") && (
                <>
                  <FormField
                    control={editForm.control}
                    name="spiritualThoughtBy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Asignado a:</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un líder" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>{editLeaderOptions}</SelectContent>
                  </Select>
                </FormItem>
              )}
              />

                </>
              )}

              <FormField
                control={editForm.control}
                name="closingPrayerBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Oración final</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                        <SelectValue placeholder="Selecciona un líder" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>{editLeaderOptions}</SelectContent>
                  </Select>
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
                          <Select value={inputField.value} onValueChange={inputField.onChange}>
                            <FormControl>
                              <SelectTrigger>
                          <SelectValue placeholder="Selecciona un líder" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>{editLeaderOptions}</SelectContent>
                    </Select>
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

      <Dialog open={!!detailsCouncil} onOpenChange={() => setDetailsCouncil(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Consejo</DialogTitle>
            <DialogDescription>
              Revisa las notas y asignaciones del consejo.
            </DialogDescription>
          </DialogHeader>
          {detailsCouncil && (
            <CouncilDetailsForm
              council={{ ...detailsCouncil, status: detailsCouncil.status || "finalizado" }}
              canManage={false}
              isUpdating={false}
              leaderGroups={leaderGroups}
              leaderLookup={leaderLookup}
              onAutoSave={() => undefined}
              onFinalize={() => undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
