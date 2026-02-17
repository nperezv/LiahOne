import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle2,
  Check,
  ChevronLeft,
  Download,
  Edit,
  Archive,
  Trash2,
  ArrowLeft,
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
import { Switch } from "@/components/ui/switch";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
  useOrganizations,
  useOrganizationMembers,
} from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/error-utils";
import { exportInterviews } from "@/lib/export";
import { normalizeMemberName } from "@/lib/utils";

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
    inicial: "Inicial",
    recomendacion: "Recomendación para el templo",
    otra: "Otra",
  };
  return map[type] ?? type;
}

const interviewTypeOptions = [
  { value: "inicial", label: "Inicial" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "autosuficiencia", label: "Autosuficiencia" },
  { value: "ministracion", label: "Ministración" },
  { value: "consuelo", label: "Consuelo" },
  { value: "otra", label: "Otra" },
];

const formatDateTimeForInput = (value?: string | Date | null) => {
  if (!value) return "";
  const build = (date: Date) => {
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed);
    if (!hasTimezone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 16);
    }
    return build(new Date(trimmed));
  }

  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) return "";
  return build(asDate);
};

const formatDateTimeForApi = (value?: string | Date | null) => {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
      const asDate = new Date(trimmed);
      if (Number.isNaN(asDate.getTime())) return trimmed.slice(0, 16);
      return asDate.toISOString();
    }
    const asDate = new Date(trimmed);
    if (Number.isNaN(asDate.getTime())) return trimmed;
    return asDate.toISOString();
  }
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) return "";
  return asDate.toISOString();
};

const formatDateTimeLabel = (value?: string) => {
  if (!value) return "Seleccionar fecha y hora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const splitDateTimeValue = (value?: string) => {
  const formatted = formatDateTimeForInput(value);
  if (!formatted) return { date: "", time: "" };
  const [date, time] = formatted.split("T");
  return { date, time };
};

const getStatusBadge = (status: string) => {
  const map: Record<
    string,
    { label: string; variant: "default" | "outline" | "secondary" | "destructive" }
  > = {
    programada: { label: "Pendiente", variant: "outline" },
    completada: { label: "Completada", variant: "default" },
    cancelada: { label: "Cancelada", variant: "destructive" },
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

const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }

  navigate(path);
};

export default function OrganizationInterviewsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const origin = searchParams.get("from");
  const originOrgSlug = searchParams.get("orgSlug");
  const canGoBackToManagement = origin === "presidency-manage" && Boolean(originOrgSlug);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [step, setStep] = useState(1);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [interviewerSheetOpen, setInterviewerSheetOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState({ date: "", time: "" });
  const [editDateSheetOpen, setEditDateSheetOpen] = useState(false);
  const [editTypeSheetOpen, setEditTypeSheetOpen] = useState(false);
  const [editInterviewerSheetOpen, setEditInterviewerSheetOpen] = useState(false);
  const [editDateDraft, setEditDateDraft] = useState({ date: "", time: "" });
  const [memberQuery, setMemberQuery] = useState("");
  const [editMemberQuery, setEditMemberQuery] = useState("");

  const { data: interviews = [], isLoading } =
    useOrganizationInterviews();
  const { data: users = [] } = useUsers();
  const { data: organizations = [] } = useOrganizations();
  const { data: organizationMembers = [] } = useOrganizationMembers(user?.organizationId, { enabled: Boolean(user?.organizationId) });

  const createMutation = useCreateOrganizationInterview();
  const updateMutation = useUpdateOrganizationInterview();
  const deleteMutation = useDeleteOrganizationInterview();

  const canManage =
    user?.role === "presidente_organizacion" ||
    user?.role === "consejero_organizacion" ||
    user?.role === "secretario_organizacion";

  const organizationType = useMemo(() => {
    if (!user?.organizationId) return undefined;
    return organizations.find((org) => org.id === user.organizationId)?.type;
  }, [organizations, user?.organizationId]);

  const allowedOrganizationTypes = useMemo(
    () => new Set(["cuorum_elderes", "sociedad_socorro"]),
    []
  );

  const isOrgTypeReady = !user?.organizationId || organizations.length > 0;
  const canAccess =
    canManage && organizationType && allowedOrganizationTypes.has(organizationType);
  const canManageOrganization = canAccess;

  useEffect(() => {
    if (user && isOrgTypeReady && !canAccess) {
      navigateWithTransition(setLocation, "/dashboard");
    }
  }, [user, isOrgTypeReady, canAccess, setLocation]);

  const canDelete = canAccess && user?.role === "presidente_organizacion";

  const filteredOrganizationMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return organizationMembers;
    return organizationMembers.filter((member: any) =>
      String(member.nameSurename ?? "").toLowerCase().includes(query)
    );
  }, [memberQuery, organizationMembers]);

  const filteredEditOrganizationMembers = useMemo(() => {
    const query = editMemberQuery.trim().toLowerCase();
    if (!query) return organizationMembers;
    return organizationMembers.filter((member: any) =>
      String(member.nameSurename ?? "").toLowerCase().includes(query)
    );
  }, [editMemberQuery, organizationMembers]);

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
      .filter((i: any) => {
        const isArchived = Boolean(i.archivedAt) || i.status === "completada" || i.status === "cancelada" || i.status === "archivada";
        return showArchived ? isArchived : !isArchived;
      })
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
  const personDisplayName = normalizeMemberName(form.watch("personName"));
  const resolvedDisplayName = personDisplayName || "—";
  const resetTimeoutRef = useRef<number | null>(null);

  const resetWizard = () => {
    setStep(1);
    setDateSheetOpen(false);
    setTypeSheetOpen(false);
    setInterviewerSheetOpen(false);
    setDateDraft({ date: "", time: "" });
    form.reset({
      personName: "",
      date: "",
      type: "",
      interviewerId: "",
      urgent: false,
      notes: "",
    });
    setMemberQuery("");
  };

  useEffect(() => {
    if (isDialogOpen) {
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
      return;
    }
    if (resetTimeoutRef.current) {
      window.clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = window.setTimeout(() => {
      resetWizard();
      resetTimeoutRef.current = null;
    }, 220);
  }, [isDialogOpen]);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!search) return;
    const params = new URLSearchParams(search);
    const memberNameParam = params.get("memberName")?.trim() ?? "";
    const normalizedName = normalizeMemberName(memberNameParam);
    if (!normalizedName) return;

    form.setValue("personName", normalizedName, { shouldDirty: true });
    setStep(2);
    setIsDialogOpen(true);
    navigateWithTransition(setLocation, "/organization-interviews");
  }, [form, search, setLocation]);

  const advanceWizardStep = async () => {
    if (step === 1) {
      const valid = await form.trigger(["personName"]);
      if (!valid) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      const valid = await form.trigger(["date", "type"]);
      if (!valid) return;
      setStep(3);
    }
  };

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

  const handleCancel = (id: string) => {
    const reason = window.prompt("Indica el motivo de la cancelación");
    if (!reason || !reason.trim()) return;
    updateMutation.mutate({ id, status: "cancelada", cancellationReason: reason.trim() });
  };

  const handleEditClick = (interview: any) => {
    setEditingInterview(interview);
    setEditMemberQuery("");
    editForm.reset({
      personName: normalizeMemberName(interview.personName),
      date: formatDateTimeForInput(interview.date),
      type: interview.type,
      interviewerId: interview.interviewerId,
      urgent: !!interview.urgent,
      notes: interview.notes || "",
    });
    setEditDateDraft(splitDateTimeValue(interview.date));
    setIsEditDialogOpen(true);
  };

  const onEditSubmit = (data: InterviewFormValues) => {
    if (!editingInterview) return;

    updateMutation.mutate(
      {
        id: editingInterview.id,
        personName: normalizeMemberName(data.personName),
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

          {canManageOrganization && (
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Entrevista
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-2xl overflow-hidden p-0">
                <DialogHeader className="border-b border-border/20 bg-background/80 px-5 py-4 backdrop-blur">
                  <div className="flex items-center justify-between">
                    {step > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setStep((prev) => Math.max(1, prev - 1))}
                        className="-ml-2 text-primary"
                      >
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Atrás
                      </Button>
                    ) : (
                      <span className="w-12" />
                    )}
                    <div className="text-center">
                      <DialogTitle className="text-base font-semibold">
                        {step === 1
                          ? "Programar entrevista"
                          : step === 2
                            ? `Entrevista con ${resolvedDisplayName}`
                            : "Detalles"}
                      </DialogTitle>
                      <DialogDescription className="sr-only">
                        Registra una entrevista de la organización
                      </DialogDescription>
                    </div>
                    <span className="w-12" />
                  </div>
                </DialogHeader>

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(data =>
                      createMutation.mutate(
                        {
                          ...data,
                          personName: normalizeMemberName(data.personName),
                          date: formatDateTimeForApi(data.date),
                        },
                        {
                          onSuccess: () => {
                            toast({ title: "Entrevista creada" });
                            setIsDialogOpen(false);
                            form.reset();
                            setMemberQuery("");
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
                      )
                    )}
                    className="flex max-h-[75vh] flex-col"
                  >
                    <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
                      {step === 1 && (
                        <FormField
                          control={form.control}
                          name="personName"
                          render={({ field }) => (
                            <FormItem className="space-y-3">
                              <FormLabel className="text-base">¿A quién deseas entrevistar?</FormLabel>
                              <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                                <Input
                                  value={memberQuery}
                                  onChange={(event) => setMemberQuery(event.target.value)}
                                  placeholder="Buscar miembro de la organización"
                                  className="rounded-2xl bg-background/80"
                                />
                                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                  {filteredOrganizationMembers.length > 0 ? (
                                    filteredOrganizationMembers.map((member: any) => {
                                      const normalizedName = normalizeMemberName(member.nameSurename);
                                      const selected = field.value === normalizedName;
                                      return (
                                        <button
                                          type="button"
                                          key={member.id}
                                          onClick={() => field.onChange(normalizedName)}
                                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                                            selected ? "border-primary bg-primary/10" : "border-border/60 bg-background/70 hover:bg-muted/40"
                                          }`}
                                        >
                                          <span>{normalizedName}</span>
                                          {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <p className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground">
                                      No se encontraron miembros para esta organización.
                                    </p>
                                  )}
                                </div>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder="O escribe el nombre manualmente"
                                    className="rounded-2xl bg-background/80"
                                  />
                                </FormControl>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {step === 2 && (
                        <div className="space-y-6">
                          <div className="rounded-3xl bg-background/80 px-4 py-4 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-sm font-medium">
                                {(resolvedDisplayName || "?")
                                  .split(" ")
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((part) => part[0]?.toUpperCase())
                                  .join("")}
                              </div>
                              <div>
                                <div className="font-medium">{resolvedDisplayName}</div>
                                <div className="text-xs text-muted-foreground">Entrevista de organización</div>
                              </div>
                            </div>
                          </div>
                          <FormField
                            control={form.control}
                            name="date"
                            render={({ field }) => (
                              <FormItem className="space-y-3">
                                <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Fecha y hora</FormLabel>
                                <FormControl>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDateDraft(splitDateTimeValue(field.value));
                                      setDateSheetOpen(true);
                                    }}
                                    className="flex w-full items-center justify-between rounded-3xl bg-background/80 px-4 py-4 text-left shadow-sm"
                                  >
                                    <div>
                                      <div className="text-sm text-muted-foreground">Fecha y hora</div>
                                      <div className={`text-base ${field.value ? "text-foreground" : "text-muted-foreground"}`}>
                                        {formatDateTimeLabel(field.value)}
                                      </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">›</span>
                                  </button>
                                </FormControl>
                                <FormMessage />
                                <Drawer open={dateSheetOpen} onOpenChange={setDateSheetOpen}>
                                  <DrawerContent className="rounded-t-2xl bg-background/95 backdrop-blur">
                                    <DrawerHeader>
                                      <DrawerTitle>Seleccionar fecha y hora</DrawerTitle>
                                    </DrawerHeader>
                                    <div className="space-y-4 px-4 pb-6">
                                      <div className="space-y-2">
                                        <FormLabel>Fecha</FormLabel>
                                        <Input
                                          type="date"
                                          value={dateDraft.date}
                                          onChange={(event) =>
                                            setDateDraft((prev) => ({ ...prev, date: event.target.value }))
                                          }
                                          className="rounded-2xl bg-background/80"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <FormLabel>Hora (24h)</FormLabel>
                                        <Input
                                          type="time"
                                          value={dateDraft.time}
                                          onChange={(event) =>
                                            setDateDraft((prev) => ({ ...prev, time: event.target.value }))
                                          }
                                          className="rounded-2xl bg-background/80"
                                        />
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <Button type="button" variant="ghost" onClick={() => setDateSheetOpen(false)}>
                                          Cancelar
                                        </Button>
                                        <Button
                                          type="button"
                                          onClick={() => {
                                            if (dateDraft.date && dateDraft.time) {
                                              field.onChange(`${dateDraft.date}T${dateDraft.time}`);
                                            }
                                            setDateSheetOpen(false);
                                          }}
                                        >
                                          Aceptar
                                        </Button>
                                      </div>
                                    </div>
                                  </DrawerContent>
                                </Drawer>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                              <FormItem className="space-y-3">
                                <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Tipo de entrevista</FormLabel>
                                <FormControl>
                                  <button
                                    type="button"
                                    onClick={() => setTypeSheetOpen(true)}
                                    className="flex w-full items-center justify-between rounded-3xl bg-background/80 px-4 py-4 text-left shadow-sm"
                                  >
                                    <div>
                                      <div className="text-sm text-muted-foreground">Tipo de entrevista</div>
                                      <div className={`text-base ${field.value ? "text-foreground" : "text-muted-foreground"}`}>
                                        {field.value ? formatInterviewType(field.value) : "Seleccionar tipo"}
                                      </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">›</span>
                                  </button>
                                </FormControl>
                                <FormMessage />
                                <Drawer open={typeSheetOpen} onOpenChange={setTypeSheetOpen}>
                                  <DrawerContent className="rounded-t-2xl bg-background/95 backdrop-blur">
                                    <DrawerHeader>
                                      <DrawerTitle>Tipo de entrevista</DrawerTitle>
                                    </DrawerHeader>
                                    <div className="space-y-1 px-4 pb-6">
                                      {interviewTypeOptions.map((option) => (
                                        <button
                                          key={option.value}
                                          type="button"
                                          onClick={() => {
                                            field.onChange(option.value);
                                            setTypeSheetOpen(false);
                                          }}
                                          className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                                        >
                                          <span>{option.label}</span>
                                          {field.value === option.value && <Check className="h-4 w-4" />}
                                        </button>
                                      ))}
                                    </div>
                                  </DrawerContent>
                                </Drawer>
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {step === 3 && (
                        <div className="space-y-6">
                          <FormField
                            control={form.control}
                            name="interviewerId"
                            render={({ field }) => (
                              <FormItem className="space-y-3">
                                <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Entrevistador</FormLabel>
                                <FormControl>
                                  <button
                                    type="button"
                                    onClick={() => setInterviewerSheetOpen(true)}
                                    className="flex w-full items-center justify-between rounded-3xl bg-background/80 px-4 py-4 text-left shadow-sm"
                                  >
                                    <div>
                                      <div className="text-sm text-muted-foreground">Entrevistador</div>
                                      <div className={`text-base ${field.value ? "text-foreground" : "text-muted-foreground"}`}>
                                        {field.value
                                          ? interviewers.find((item: any) => item.id === field.value)?.name ?? "Seleccionar"
                                          : "Seleccionar entrevistador"}
                                      </div>
                                    </div>
                                    <span className="text-xs text-muted-foreground">›</span>
                                  </button>
                                </FormControl>
                                <FormMessage />
                                <Drawer open={interviewerSheetOpen} onOpenChange={setInterviewerSheetOpen}>
                                  <DrawerContent className="rounded-t-2xl bg-background/95 backdrop-blur">
                                    <DrawerHeader>
                                      <DrawerTitle>Entrevistador</DrawerTitle>
                                    </DrawerHeader>
                                    <div className="space-y-1 px-4 pb-6">
                                      {interviewers.map((i: any) => (
                                        <button
                                          key={i.id}
                                          type="button"
                                          onClick={() => {
                                            field.onChange(i.id);
                                            setInterviewerSheetOpen(false);
                                          }}
                                          className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                                        >
                                          <span>{i.name}</span>
                                          {field.value === i.id && <Check className="h-4 w-4" />}
                                        </button>
                                      ))}
                                    </div>
                                  </DrawerContent>
                                </Drawer>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="urgent"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between rounded-3xl bg-background/80 p-4 shadow-sm">
                                <FormLabel className="text-base">Urgente</FormLabel>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-muted"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                              <FormItem className="space-y-3">
                                <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Notas</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    className="min-h-[140px] rounded-3xl bg-background/80"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </div>

                    <div className="sticky bottom-0 border-t border-border/20 bg-background/90 px-5 py-4 backdrop-blur">
                      <div className="flex items-center justify-between gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full rounded-full"
                          onClick={() => {
                            setIsDialogOpen(false);
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type={step === 3 ? "submit" : "button"}
                          onClick={step === 3 ? undefined : advanceWizardStep}
                          disabled={createMutation.isPending}
                          className="w-full rounded-full"
                        >
                          {createMutation.isPending ? "Guardando..." : step === 3 ? "Guardar" : "Siguiente"}
                        </Button>
                      </div>
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
                  <TableCell>{normalizeMemberName(interview.personName)}</TableCell>
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

                      {canManageOrganization && interview.status === "programada" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="whitespace-nowrap"
                          onClick={() => handleCancel(interview.id)}
                        >
                          Cancelar
                        </Button>
                      )}

                      {canManageOrganization &&
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
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingInterview(null);
            setEditDateSheetOpen(false);
            setEditTypeSheetOpen(false);
            setEditInterviewerSheetOpen(false);
          }
        }}
      >
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
                  <FormItem className="space-y-3">
                    <FormLabel>Persona</FormLabel>
                    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                      <Input
                        value={editMemberQuery}
                        onChange={(event) => setEditMemberQuery(event.target.value)}
                        placeholder="Buscar miembro de la organización"
                        className="rounded-2xl bg-background/80"
                      />
                      <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                        {filteredEditOrganizationMembers.length > 0 ? (
                          filteredEditOrganizationMembers.map((member: any) => {
                            const normalizedName = normalizeMemberName(member.nameSurename);
                            const selected = field.value === normalizedName;
                            return (
                              <button
                                type="button"
                                key={member.id}
                                onClick={() => field.onChange(normalizedName)}
                                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                                  selected ? "border-primary bg-primary/10" : "border-border/60 bg-background/70 hover:bg-muted/40"
                                }`}
                              >
                                <span>{normalizedName}</span>
                                {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                              </button>
                            );
                          })
                        ) : (
                          <p className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground">
                            No se encontraron miembros para esta organización.
                          </p>
                        )}
                      </div>
                      <Input {...field} placeholder="O escribe el nombre manualmente" className="rounded-2xl bg-background/80" />
                    </div>
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
                      <button
                        type="button"
                        onClick={() => {
                          setEditDateDraft(splitDateTimeValue(field.value));
                          setEditDateSheetOpen(true);
                        }}
                        className="flex w-full items-center justify-between rounded-2xl bg-background/80 px-4 py-3 text-left text-sm"
                      >
                        <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                          {formatDateTimeLabel(field.value)}
                        </span>
                        <CalendarIcon className="h-4 w-4" />
                      </button>
                      <Drawer open={editDateSheetOpen} onOpenChange={setEditDateSheetOpen}>
                        <DrawerContent className="rounded-t-2xl bg-background/95 backdrop-blur">
                          <DrawerHeader>
                            <DrawerTitle>Seleccionar fecha y hora</DrawerTitle>
                          </DrawerHeader>
                          <div className="space-y-4 px-4 pb-6">
                            <div className="space-y-2">
                              <FormLabel>Fecha</FormLabel>
                              <Input
                                type="date"
                                value={editDateDraft.date}
                                onChange={(event) =>
                                  setEditDateDraft((prev) => ({ ...prev, date: event.target.value }))
                                }
                                className="rounded-2xl bg-background/80"
                              />
                            </div>
                            <div className="space-y-2">
                              <FormLabel>Hora (24h)</FormLabel>
                              <Input
                                type="time"
                                value={editDateDraft.time}
                                onChange={(event) =>
                                  setEditDateDraft((prev) => ({ ...prev, time: event.target.value }))
                                }
                                className="rounded-2xl bg-background/80"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="ghost" onClick={() => setEditDateSheetOpen(false)}>
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                onClick={() => {
                                  if (editDateDraft.date && editDateDraft.time) {
                                    field.onChange(`${editDateDraft.date}T${editDateDraft.time}`);
                                  }
                                  setEditDateSheetOpen(false);
                                }}
                              >
                                Aceptar
                              </Button>
                            </div>
                          </div>
                        </DrawerContent>
                      </Drawer>
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <button
                        type="button"
                        onClick={() => setEditTypeSheetOpen(true)}
                        className="flex w-full items-center justify-between rounded-2xl bg-background/80 px-4 py-3 text-left text-sm"
                      >
                        <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                          {field.value ? formatInterviewType(field.value) : "Seleccionar tipo"}
                        </span>
                        <span className="text-xs text-muted-foreground">›</span>
                      </button>
                      <Drawer open={editTypeSheetOpen} onOpenChange={setEditTypeSheetOpen}>
                        <DrawerContent className="rounded-t-2xl bg-background/95 backdrop-blur">
                          <DrawerHeader>
                            <DrawerTitle>Tipo de entrevista</DrawerTitle>
                          </DrawerHeader>
                          <div className="space-y-1 px-4 pb-6">
                            {interviewTypeOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  field.onChange(option.value);
                                  setEditTypeSheetOpen(false);
                                }}
                                className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                              >
                                <span>{option.label}</span>
                                {field.value === option.value && <Check className="h-4 w-4" />}
                              </button>
                            ))}
                          </div>
                        </DrawerContent>
                      </Drawer>
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
                    <button
                      type="button"
                      onClick={() => setEditInterviewerSheetOpen(true)}
                      className="flex w-full items-center justify-between rounded-2xl bg-background/80 px-4 py-3 text-left text-sm"
                    >
                      <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                        {field.value
                          ? interviewers.find((item: any) => item.id === field.value)?.name ?? "Seleccionar"
                          : "Seleccionar entrevistador"}
                      </span>
                      <span className="text-xs text-muted-foreground">›</span>
                    </button>
                    <Drawer open={editInterviewerSheetOpen} onOpenChange={setEditInterviewerSheetOpen}>
                      <DrawerContent className="rounded-t-2xl bg-background/95 backdrop-blur">
                        <DrawerHeader>
                          <DrawerTitle>Entrevistador</DrawerTitle>
                        </DrawerHeader>
                        <div className="space-y-1 px-4 pb-6">
                          {interviewers.map((i: any) => (
                            <button
                              key={i.id}
                              type="button"
                              onClick={() => {
                                field.onChange(i.id);
                                setEditInterviewerSheetOpen(false);
                              }}
                              className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                            >
                              <span>{i.name}</span>
                              {field.value === i.id && <Check className="h-4 w-4" />}
                            </button>
                          ))}
                        </div>
                      </DrawerContent>
                    </Drawer>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="urgent"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-2xl bg-background/80 p-4">
                    <FormLabel>Urgente</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-muted"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <Textarea
                      {...field}
                      className="min-h-[120px] rounded-2xl bg-background/80"
                    />
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
