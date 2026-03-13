import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Download, Edit, Trash2, Play, CheckCircle2, ChevronDown, CalendarDays, UserRound, Save, Loader2, Clock, AlertCircle } from "lucide-react";

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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import {
  useWardCouncils,
  useCreateWardCouncil,
  useUpdateWardCouncil,
  useDeleteWardCouncil,
  useCreateAssignment,
  useUsers,
  useOrganizations,
  useMembers,
  usePendingAssignmentsByArea,
} from "@/hooks/use-api";

import { useAuth } from "@/lib/auth";
import { generateWardCouncilPDF } from "@/lib/pdf-utils";
import { exportWardCouncils } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";

/* =========================
   MemberAutocomplete
========================= */

type MemberOption = { value: string };

const filterMemberOptions = (options: MemberOption[], query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.value.toLowerCase().includes(q));
};

function MemberAutocomplete({
  value,
  options,
  placeholder,
  onChange,
  onBlur,
  disabled,
}: {
  value: string;
  options: MemberOption[];
  placeholder?: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => filterMemberOptions(options, value), [options, value]);
  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); onBlur?.(); }}
      />
      {open && !disabled && value.trim().length > 0 && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg text-sm">
          {filtered.slice(0, 15).map((o) => (
            <li
              key={o.value}
              className="px-3 py-2 cursor-pointer hover:bg-accent truncate"
              onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); }}
            >
              {o.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================
   Schema
========================= */

const councilSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  time: z.string().optional(),
  location: z.string().optional(),
  presider: z.string().optional(),
  director: z.string().optional(),
  openingPrayer: z.string().optional(),
  closingPrayerBy: z.string().optional(),
  hasSpiritualThought: z.boolean().optional(),
  spiritualThoughtBy: z.string().optional(),
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
});

type CouncilFormValues = z.infer<typeof councilSchema>;

const areaPersonSchema = z.object({
  name: z.string().min(1, "Requerido"),
  situation: z.string().min(1, "Requerido"),
  responsibleId: z.string().min(1, "Requerido"),
  responsibleName: z.string().optional(),
  dueDate: z.string().optional(),
});

const councilDetailsSchema = z.object({
  // §29.2.5 — 4 áreas del Manual General: personas discutidas
  livingGospelPersons: z.array(areaPersonSchema).optional(),
  careForOthersPersons: z.array(areaPersonSchema).optional(),
  missionaryPersons: z.array(areaPersonSchema).optional(),
  familyHistoryPersons: z.array(areaPersonSchema).optional(),
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
  additionalNotes: z.string().optional(),
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

const formatTimeForInput = (value?: string | Date | null) => {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
};

const formatTimeForDisplay = (value?: string | Date | null) => {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const combineDateTime = (date: string, time?: string) => {
  if (!date) return "";
  if (time?.trim()) {
    return `${date}T${time}`;
  }
  return date;
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
  onFinalize: (data: CouncilDetailsFormValues) => void;
  isUpdating: boolean;
  leaderGroups: { name: string; members: any[] }[];
  leaderLookup: Map<string, any>;
}) {
  const { data: members = [] } = useMembers();
  const memberOptions = useMemo(
    () => Array.from(new Set(members.map((m: any) => m.nameSurename).filter(Boolean))).map((v) => ({ value: v as string })),
    [members]
  );
  const { data: pendingByArea = {} } = usePendingAssignmentsByArea();

  const form = useForm<CouncilDetailsFormValues>({
    resolver: zodResolver(councilDetailsSchema),
    defaultValues: {
      livingGospelPersons: council.livingGospelPersons || [],
      careForOthersPersons: council.careForOthersPersons || [],
      missionaryPersons: council.missionaryPersons || [],
      familyHistoryPersons: council.familyHistoryPersons || [],
      newAssignments: (council.newAssignments || []).map((assignment: any) => ({
        ...assignment,
        dueDate: formatDateForInput(assignment?.dueDate),
      })),
      additionalNotes: council.additionalNotes || "",
      finalSummaryNotes: council.finalSummaryNotes || "",
      bishopNotes: council.bishopNotes || "",
    },
  });
  const newAssignments = useFieldArray({ control: form.control, name: "newAssignments" });
  const livingGospelPersonsField = useFieldArray({ control: form.control, name: "livingGospelPersons" });
  const careForOthersPersonsField = useFieldArray({ control: form.control, name: "careForOthersPersons" });
  const missionaryPersonsField = useFieldArray({ control: form.control, name: "missionaryPersons" });
  const familyHistoryPersonsField = useFieldArray({ control: form.control, name: "familyHistoryPersons" });

  const [expandedAssignments, setExpandedAssignments] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => ({
    livingGospelPersons: (council.livingGospelPersons?.length ?? 0) > 0,
    careForOthersPersons: (council.careForOthersPersons?.length ?? 0) > 0,
    missionaryPersons: (council.missionaryPersons?.length ?? 0) > 0,
    familyHistoryPersons: (council.familyHistoryPersons?.length ?? 0) > 0,
  }));
  const [isManuallySaving, setIsManuallySaving] = useState(false);
  const [lastManualSave, setLastManualSave] = useState<Date | null>(null);

  const watchedValues = useWatch({ control: form.control });
  const lastSavedRef = useRef<string>("");
  const initialRenderRef = useRef(true);
  const councilIdRef = useRef<string>(council.id);
  const statusRef = useRef<string>(council.status);
  const isEditable = council.status === "en_progreso" && canManage && Boolean(council.startedAt);

  // Only reset the form when switching to a different council (id changed) or
  // when the council status changes — NOT on every refetch after auto-save.
  useEffect(() => {
    const idChanged = councilIdRef.current !== council.id;
    const statusChanged = statusRef.current !== council.status;
    if (!idChanged && !statusChanged) return;
    councilIdRef.current = council.id;
    statusRef.current = council.status;
    form.reset({
      livingGospelPersons: council.livingGospelPersons || [],
      careForOthersPersons: council.careForOthersPersons || [],
      missionaryPersons: council.missionaryPersons || [],
      familyHistoryPersons: council.familyHistoryPersons || [],
      newAssignments: (council.newAssignments || []).map((assignment: any) => ({
        ...assignment,
        dueDate: formatDateForInput(assignment?.dueDate),
      })),
      additionalNotes: council.additionalNotes || "",
      finalSummaryNotes: council.finalSummaryNotes || "",
      bishopNotes: council.bishopNotes || "",
    });
    setExpandedSections({
      livingGospelPersons: (council.livingGospelPersons?.length ?? 0) > 0,
      careForOthersPersons: (council.careForOthersPersons?.length ?? 0) > 0,
      missionaryPersons: (council.missionaryPersons?.length ?? 0) > 0,
      familyHistoryPersons: (council.familyHistoryPersons?.length ?? 0) > 0,
    });
    lastSavedRef.current = "";
    initialRenderRef.current = true;
  }, [council, form]);

  useEffect(() => {
    setExpandedAssignments((current) => {
      const next: Record<string, boolean> = {};
      newAssignments.fields.forEach((item, index) => {
        next[item.id] = current[item.id] ?? index === 0;
      });
      return next;
    });
  }, [newAssignments.fields]);

  // Auto-save every 30 seconds — includes newAssignments in the payload.
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
    }, 30000); // 30 seconds

    return () => window.clearTimeout(timeout);
  }, [isEditable, onAutoSave, watchedValues]);

  const handleManualSave = () => {
    if (!isEditable) return;
    setIsManuallySaving(true);
    const values = form.getValues();
    lastSavedRef.current = JSON.stringify(values);
    onAutoSave(values);
    setTimeout(() => {
      setIsManuallySaving(false);
      setLastManualSave(new Date());
    }, 1000);
  };

  const filteredNewAssignments = (watchedValues?.newAssignments ?? []).filter(
    (a: any) => a?.title || a?.assignedTo || a?.dueDate || a?.notes
  );

  return (
    <CardContent className="space-y-6">
      {/* Meeting time info */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Inicio: {council.startedAt ? new Date(council.startedAt).toLocaleTimeString("es-ES") : "-"}</span>
        <span>Fin: {council.endedAt ? new Date(council.endedAt).toLocaleTimeString("es-ES") : "-"}</span>
      </div>

      {/* Meeting info header with labeled badges */}
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { label: "Preside", value: council.presider },
            { label: "Dirige", value: council.director },
            { label: "Oración de apertura", value: council.openingPrayer },
            { label: "Oración final", value: council.closingPrayerBy || council.closingPrayer },
            { label: "Pensamiento espiritual", value: council.spiritualThoughtBy },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <span className="truncate font-medium">{value || "-"}</span>
            </div>
          ))}
        </div>
      </div>

      <Form {...form}>
        <div className="space-y-8">

          {/* 4 áreas §29.2.5 — personas discutidas */}
          {([
            {
              key: "livingGospelPersons" as const,
              fieldArray: livingGospelPersonsField,
              areaKey: "livingGospel",
              number: 1,
              title: "Vivir el Evangelio",
              description: "Fe, ordenanzas, convenios y actividad de miembros",
              situationPlaceholder: "Ej: Inactivo hace 3 meses, pendiente de bautismo...",
            },
            {
              key: "careForOthersPersons" as const,
              fieldArray: careForOthersPersonsField,
              areaKey: "careForOthers",
              number: 2,
              title: "Cuidar de los necesitados",
              description: "Ministerio, bienestar y familias que necesitan atención",
              situationPlaceholder: "Ej: Necesidad económica, visitas ministeriales pendientes...",
            },
            {
              key: "missionaryPersons" as const,
              fieldArray: missionaryPersonsField,
              areaKey: "missionary",
              number: 3,
              title: "Invitar a todos",
              description: "Investigadores, referencias de miembros y miembros nuevos",
              situationPlaceholder: "Ej: Investigador en lección 3, referencia de la Hna. García...",
            },
            {
              key: "familyHistoryPersons" as const,
              fieldArray: familyHistoryPersonsField,
              areaKey: "familyHistory",
              number: 4,
              title: "Unir familias para la eternidad",
              description: "Templo, historia familiar y preparación de ordenanzas",
              situationPlaceholder: "Ej: Listo para el templo, nombres de familia para ordenanzas...",
            },
          ]).map(({ key, fieldArray, areaKey, number, title, description, situationPlaceholder }) => {
            const pending = (pendingByArea as Record<string, any[]>)[areaKey] ?? [];
            return (
            <Collapsible
              key={key}
              open={Boolean(expandedSections[key])}
              onOpenChange={(open) =>
                setExpandedSections((prev) => ({ ...prev, [key]: open }))
              }
            >
              <div className="rounded-xl border border-border/60 bg-card/40">
                <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/30" type="button">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pending.length > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <Clock className="h-3 w-3" />
                        {pending.length}
                      </span>
                    )}
                    {fieldArray.fields.length > 0 && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {fieldArray.fields.length} persona{fieldArray.fields.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandedSections[key] ? "rotate-180" : ""}`}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-4">

                    {/* Seguimiento: asignaciones pendientes de consejos anteriores */}
                    {pending.length > 0 && (
                      <div className="space-y-2">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          Seguimiento — asignaciones pendientes
                        </p>
                        {pending.map((a: any) => (
                          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800/40 dark:bg-amber-900/10">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                            <span className="shrink-0 text-muted-foreground">{a.assignedToName || a.assignedTo}</span>
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-medium ${
                              a.status === "en_proceso"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}>
                              {a.status === "en_proceso" ? "En proceso" : "Pendiente"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Personas a discutir hoy */}
                    {fieldArray.fields.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Personas a discutir hoy</p>
                        {fieldArray.fields.map((field, index) => (
                          <div key={field.id} className="rounded-lg border border-border/60 bg-background p-3 space-y-2">
                            <div className="grid gap-2 sm:grid-cols-2">
                              {/* Nombre del miembro */}
                              <FormField
                                control={form.control}
                                name={`${key}.${index}.name` as any}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">Miembro / Familia</FormLabel>
                                    <FormControl>
                                      <MemberAutocomplete
                                        value={f.value as string}
                                        options={memberOptions}
                                        placeholder="Nombre del miembro"
                                        onChange={f.onChange}
                                        onBlur={f.onBlur}
                                        disabled={!isEditable}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              {/* Situación */}
                              <FormField
                                control={form.control}
                                name={`${key}.${index}.situation` as any}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">Situación</FormLabel>
                                    <FormControl>
                                      <Input
                                        {...f}
                                        disabled={!isEditable}
                                        placeholder={isEditable ? situationPlaceholder : ""}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {/* Responsable */}
                              <FormField
                                control={form.control}
                                name={`${key}.${index}.responsibleId` as any}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">Responsable</FormLabel>
                                    <Select
                                      value={f.value as string}
                                      onValueChange={(val) => {
                                        f.onChange(val);
                                        const selected = leaderLookup.get(val);
                                        form.setValue(
                                          `${key}.${index}.responsibleName` as any,
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
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              {/* Fecha de seguimiento */}
                              <FormField
                                control={form.control}
                                name={`${key}.${index}.dueDate` as any}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">Seguimiento</FormLabel>
                                    <FormControl>
                                      <Input type="date" {...f} disabled={!isEditable} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                            {isEditable && (
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive h-7 px-2"
                                  onClick={() => fieldArray.remove(index)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Quitar
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {fieldArray.fields.length === 0 && pending.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        {isEditable ? "Sin personas agregadas todavía." : "No se discutieron personas en esta área."}
                      </p>
                    )}

                    {isEditable && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full border-dashed"
                        onClick={() => fieldArray.append({ name: "", situation: "", responsibleId: "", responsibleName: "", dueDate: "" })}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Agregar persona
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
            );
          })}

          {/* Sección 5: Nuevas asignaciones del consejo */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                5
              </span>
              <h3 className="text-sm font-semibold">Nuevas asignaciones del consejo</h3>
            </div>
            <p className="pl-8 text-xs text-muted-foreground">
              Se crearán como asignaciones reales al finalizar el consejo.
            </p>

            {newAssignments.fields.length === 0 ? (
              <div className="pl-8">
                {isEditable ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed py-6 text-base"
                    onClick={() => {
                      const newId = newAssignments.fields.length;
                      newAssignments.append({
                        title: "",
                        assignedTo: "",
                        assignedToName: "",
                        dueDate: "",
                        notes: "",
                      });
                      // auto-expand the newly added assignment on next render
                      setTimeout(() => {
                        setExpandedAssignments((current) => {
                          const keys = Object.keys(current);
                          if (keys.length > 0) {
                            const lastKey = keys[keys.length - 1];
                            return { ...current, [lastKey]: true };
                          }
                          return current;
                        });
                      }, 50);
                    }}
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Agregar primera asignación
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">No hay nuevas asignaciones registradas.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3 pl-8">
                {newAssignments.fields.map((field, index) => {
                  const assignmentTitle = form.watch(`newAssignments.${index}.title`) || `Asignación ${index + 1}`;
                  const assignedToName = form.watch(`newAssignments.${index}.assignedToName`) || "Sin responsable";
                  const dueDate = form.watch(`newAssignments.${index}.dueDate`);
                  const dueDateLabel = dueDate
                    ? new Date(`${dueDate}T00:00:00`).toLocaleDateString("es-ES")
                    : "Sin fecha";

                  return (
                    <Collapsible
                      key={field.id}
                      open={Boolean(expandedAssignments[field.id])}
                      onOpenChange={(open) =>
                        setExpandedAssignments((current) => ({
                          ...current,
                          [field.id]: open,
                        }))
                      }
                    >
                      <div className="rounded-xl border border-border/60 bg-card/60 p-3 shadow-sm">
                        <CollapsibleTrigger
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition hover:bg-muted/40"
                          type="button"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-semibold">{assignmentTitle}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <UserRound className="h-3.5 w-3.5" />
                                {assignedToName}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {dueDateLabel}
                              </span>
                            </div>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 transition-transform ${expandedAssignments[field.id] ? "rotate-180" : ""}`}
                          />
                        </CollapsibleTrigger>

                        <CollapsibleContent className="pt-3">
                          <div className="space-y-3">
                            {/* Title on its own row */}
                            <FormField
                              control={form.control}
                              name={`newAssignments.${index}.title`}
                              render={({ field: inputField }) => (
                                <FormItem>
                                  <FormLabel>Asignación</FormLabel>
                                  <FormControl>
                                    <Input {...inputField} disabled={!isEditable} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Responsible + date on the same row */}
                            <div className="grid gap-3 sm:grid-cols-2">
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
                            </div>

                            {/* Notes below */}
                            <FormField
                              control={form.control}
                              name={`newAssignments.${index}.notes`}
                              render={({ field: inputField }) => (
                                <FormItem>
                                  <FormLabel>Notas</FormLabel>
                                  <FormControl>
                                    <Textarea {...inputField} disabled={!isEditable} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            {isEditable && (
                              <div className="flex justify-end">
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
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}

                {isEditable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      newAssignments.append({
                        title: "",
                        assignedTo: "",
                        assignedToName: "",
                        dueDate: "",
                        notes: "",
                      });
                      setTimeout(() => {
                        setExpandedAssignments((current) => {
                          const keys = Object.keys(current);
                          if (keys.length > 0) {
                            const lastKey = keys[keys.length - 1];
                            return { ...current, [lastKey]: true };
                          }
                          return current;
                        });
                      }, 50);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar asignación
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Sección 6: Resumen y notas finales */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                6
              </span>
              <h3 className="text-sm font-semibold">Resumen y notas finales</h3>
            </div>
            <p className="pl-8 text-xs text-muted-foreground">Acuerdos del consejo y notas del obispo/secretario</p>

            <div className="space-y-4 pl-8">
              <FormField
                control={form.control}
                name="finalSummaryNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resumen final del consejo</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        disabled={!isEditable}
                        placeholder={isEditable ? "Resumen de los acuerdos y decisiones del consejo..." : ""}
                        className="min-h-[80px]"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bishopNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas del obispo/secretario</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        disabled={!isEditable}
                        placeholder={isEditable ? "Notas privadas del obispo o secretario..." : ""}
                        className="min-h-[80px]"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="additionalNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas adicionales del acta</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        disabled={!isEditable}
                        placeholder={isEditable ? "Información adicional a incluir en el acta del consejo..." : ""}
                        className="min-h-[80px]"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>

        {/* Save progress + Finalize */}
        {canManage && (
          <div className="space-y-3 border-t pt-4">
            {/* Manual save row */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {lastManualSave
                  ? `Guardado: ${lastManualSave.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
                  : "Sin guardar aún"}
              </div>
              {isEditable && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleManualSave}
                  disabled={isManuallySaving}
                >
                  {isManuallySaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar progreso
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Finalize row */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {filteredNewAssignments.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Se crearán asignaciones automáticas de las personas discutidas más {filteredNewAssignments.length} asignación{filteredNewAssignments.length !== 1 ? "es" : ""} manual{filteredNewAssignments.length !== 1 ? "es" : ""}.
                </p>
              )}
              <div className="flex justify-end sm:ml-auto">
                <Button
                  type="button"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => onFinalize(form.getValues())}
                  disabled={council.status !== "en_progreso" || isUpdating}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Finalizar consejo
                  {filteredNewAssignments.length > 0 &&
                    ` · Crear ${filteredNewAssignments.length} asignación${filteredNewAssignments.length !== 1 ? "es" : ""}`}
                </Button>
              </div>
            </div>
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
      time: "",
      location: "",
      presider: "",
      director: "",
      openingPrayer: "",
      closingPrayerBy: "",
      hasSpiritualThought: false,
      spiritualThoughtBy: "",
      previousAssignments: [],
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
    const { hasSpiritualThought, time, ...payload } = data;
    const dateTime = combineDateTime(data.date, data.time);
    createMutation.mutate(
      {
        ...payload,
        date: dateTime,
        previousAssignments: data.previousAssignments || [],
        location: data.location || "",
        presider: data.presider || "",
        director: data.director || "",
        openingPrayer: data.openingPrayer || "",
        closingPrayerBy: data.closingPrayerBy || "",
        spiritualThoughtBy: hasSpiritualThought ? data.spiritualThoughtBy || "" : "",
        attendance: [],
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
    const { hasSpiritualThought, time, ...payload } = data;
    const dateTime = combineDateTime(data.date, data.time);

    updateMutation.mutate(
      {
        id: editingCouncil.id,
        data: {
          ...payload,
          date: dateTime,
          previousAssignments: data.previousAssignments || [],
          location: data.location || "",
          presider: data.presider || "",
          director: data.director || "",
          openingPrayer: data.openingPrayer || "",
          closingPrayerBy: data.closingPrayerBy || "",
          spiritualThoughtBy: hasSpiritualThought ? data.spiritualThoughtBy || "" : "",
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
      time: formatTimeForInput(council.date),
      location: council.location || "",
      presider: council.presider || "",
      director: council.director || "",
      openingPrayer: council.openingPrayer || "",
      closingPrayerBy: council.closingPrayerBy || "",
      hasSpiritualThought: Boolean(council.spiritualThoughtBy),
      spiritualThoughtBy: council.spiritualThoughtBy || "",
      previousAssignments: (council.previousAssignments || []).map((assignment: any) => ({
        assignment: assignment?.assignment || "",
        responsible: assignment?.responsible || "",
        status: assignment?.status || "pendiente",
        notes: assignment?.notes || "",
      })),
    });
    setIsEditOpen(true);
  };

  const finalizeCouncil = async (council: any, latestData?: CouncilDetailsFormValues) => {
    if (council.status !== "en_progreso") return;

    // Manual newAssignments (additional, non-area)
    const sourceAssignments = Array.isArray(latestData?.newAssignments)
      ? latestData.newAssignments
      : Array.isArray(council.newAssignments)
      ? council.newAssignments
      : [];

    const normalizedAssignments = sourceAssignments.map((assignment: any) => ({
      title: assignment?.title?.trim() || "",
      assignedTo: assignment?.assignedTo || "",
      assignedToName: assignment?.assignedToName || "",
      dueDate: assignment?.dueDate || "",
      notes: assignment?.notes || "",
    }));

    const touchedAssignments = normalizedAssignments.filter(
      (assignment: any) =>
        assignment.title || assignment.assignedTo || assignment.dueDate || assignment.notes
    );

    const invalidAssignments = touchedAssignments.filter(
      (assignment: any) => !assignment.title || !assignment.assignedTo || !assignment.dueDate
    );

    if (invalidAssignments.length > 0) {
      toast({
        title: "Faltan datos en asignaciones",
        description:
          "Cada asignación debe incluir título, responsable y fecha límite antes de finalizar.",
        variant: "destructive",
      });
      return;
    }

    // Area persons → assignments (auto-generated from the 4 §29.2.5 areas)
    const areaPersonsMap: { key: string; area: string }[] = [
      { key: "livingGospelPersons", area: "livingGospel" },
      { key: "careForOthersPersons", area: "careForOthers" },
      { key: "missionaryPersons", area: "missionary" },
      { key: "familyHistoryPersons", area: "familyHistory" },
    ];
    const areaAssignments = areaPersonsMap.flatMap(({ key, area }) => {
      const persons = (latestData as any)?.[key] || (council as any)[key] || [];
      return (persons as any[])
        .filter((p: any) => p.name && p.responsibleId)
        .map((p: any) => ({
          title: `Atender a ${p.name}${p.situation ? `: ${p.situation}` : ""}`,
          assignedTo: p.responsibleId,
          dueDate: p.dueDate || "",
          area,
        }));
    });

    const existingIds = Array.isArray(council.assignmentIds) ? council.assignmentIds : [];

    try {
      if (latestData) {
        await updateMutation.mutateAsync({
          id: council.id,
          data: { ...latestData, newAssignments: normalizedAssignments },
          silent: true,
        });
      }

      // Create all assignments (area + manual)
      const allToCreate = [
        ...areaAssignments.map((a) => ({
          title: a.title,
          assignedTo: a.assignedTo,
          dueDate: a.dueDate,
          area: a.area,
          relatedTo: council.id,
          status: "pendiente" as const,
          silent: true,
        })),
        ...touchedAssignments.map((a: any) => ({
          title: a.title,
          description: a.notes || "",
          assignedTo: a.assignedTo,
          dueDate: a.dueDate,
          relatedTo: council.id,
          status: "pendiente" as const,
          silent: true,
        })),
      ];

      const createdAssignments = await Promise.all(
        allToCreate.map((data) => createAssignmentMutation.mutateAsync(data))
      );

      const createdIds = createdAssignments.map((a: any) => a.id);

      await updateMutation.mutateAsync({
        id: council.id,
        data: {
          status: "finalizado",
          endedAt: new Date(),
          assignmentIds: [...existingIds, ...createdIds],
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/pending-by-area"] });
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

                    <FormField
                      control={createForm.control}
                      name="time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hora</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lugar</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Ej. Salón de consejeros" />
                          </FormControl>
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
                    <strong>Hora:</strong> {formatTimeForDisplay(c.date)}
                  </span>

                  <span>
                    <strong>Lugar:</strong> {c.location || "-"}
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
                onFinalize={(data) => finalizeCouncil(c, data)}
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
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lugar</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ej. Salón de consejeros" />
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
