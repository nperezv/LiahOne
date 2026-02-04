import { useEffect, useMemo, useState } from "react";
import { endOfMonth, endOfQuarter, endOfWeek, startOfMonth, startOfQuarter, startOfWeek } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle2,
  Check,
  Search,
  ChevronLeft,
  Download,
  Edit,
  Archive,
  Trash2,
  Copy,
  Send,
  Mail,
} from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { useLocation, useSearch } from "wouter";

import {
  useInterviews,
  useCreateInterview,
  useCompleteInterview,
  useMembers,
  useUsers,
  useDeleteInterview,
  useUpdateInterview,
} from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/error-utils";
import { generateInterviewAgendaPDF } from "@/lib/pdf-utils";

/**
 * Estado (backend):
 * - programada (la mostramos como "Pendiente")
 * - completada
 * - cancelada (si lo usas)
 * - archivada (recomendado para ocultar completadas)
 */
const interviewSchema = z.object({
  personName: z.string().min(1, "El nombre es requerido"),
  memberId: z.string().optional().or(z.literal("")),
  date: z.string().min(1, "La fecha es requerida"),
  type: z.string().min(1, "El tipo es requerido"),
  interviewerId: z.string().min(1, "El entrevistador es requerido"),
  urgent: z.boolean().default(false),
  notes: z.string().optional(),
});

type InterviewFormValues = z.infer<typeof interviewSchema>;

function formatInterviewType(type: string) {
  const map: Record<string, string> = {
    recomendacion_templo: "Recomendación del Templo",
    llamamiento: "Llamamiento",
    anual: "Entrevista Anual",
    orientacion: "Orientación",
    otra: "Otra",
    inicial: "Inicial",
    seguimiento: "Seguimiento",
    recomendacion: "Recomendación",
  };
  return map[type] ?? type;
}

function formatRole(role: string) {
  const map: Record<string, string> = {
    obispo: "Obispo",
    consejero_obispo: "Consejero",
    secretario_ejecutivo: "Secretario Ejecutivo",
  };
  return map[role] ?? role;
}

const interviewMessageTemplates = [
  {
    id: "confirmacion",
    label: "Confirmación de entrevista",
    build: (data: {
      name: string;
      interviewerName?: string;
      dateLabel: string;
      timeLabel: string;
    }) =>
      [
        `Hola ${data.name},`,
        `Tu entrevista con ${data.interviewerName ?? "el obispado"} está programada para el ${data.dateLabel} a las ${data.timeLabel}.`,
        "Si necesitas cambiar la hora, por favor avísanos con anticipación.",
      ].join("\n"),
  },
  {
    id: "recordatorio",
    label: "Recordatorio",
    build: (data: {
      name: string;
      interviewerName?: string;
      dateLabel: string;
      timeLabel: string;
    }) =>
      [
        `Hola ${data.name},`,
        `Este es un recordatorio de tu entrevista con ${data.interviewerName ?? "el obispado"} el ${data.dateLabel} a las ${data.timeLabel}.`,
        "¡Te esperamos!",
      ].join("\n"),
  },
  {
    id: "seguimiento",
    label: "Seguimiento",
    build: (data: {
      name: string;
      interviewerName?: string;
      dateLabel: string;
      timeLabel: string;
    }) =>
      [
        `Hola ${data.name},`,
        `Gracias por coordinar tu entrevista con ${data.interviewerName ?? "el obispado"} para el ${data.dateLabel} a las ${data.timeLabel}.`,
        "Si hay algo que debamos preparar, háznoslo saber.",
      ].join("\n"),
  },
];

const interviewTypeOptions = [
  { value: "inicial", label: "Inicial" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "recomendacion", label: "Recomendación" },
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

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

export default function InterviewsPage() {
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInterview, setEditingInterview] = useState<any>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportRange, setExportRange] = useState<"week" | "month" | "quarter">("week");
  const [exportInterviewerId, setExportInterviewerId] = useState("all");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsInterview, setDetailsInterview] = useState<any>(null);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);
  const [messageTemplateId, setMessageTemplateId] = useState("confirmacion");
  const [messageText, setMessageText] = useState("");
  const [messageContact, setMessageContact] = useState<{
    name: string;
    phone?: string | null;
    email?: string | null;
    interviewerName?: string;
    dateLabel: string;
    timeLabel: string;
  } | null>(null);
  const [selectedLeader, setSelectedLeader] = useState<any>(null);
  const [prefillHandled, setPrefillHandled] = useState(false);
  const [step, setStep] = useState(1);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [interviewerSheetOpen, setInterviewerSheetOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState({ date: "", time: "" });
  const [leaderQuery, setLeaderQuery] = useState("");
  const [editDateSheetOpen, setEditDateSheetOpen] = useState(false);
  const [editTypeSheetOpen, setEditTypeSheetOpen] = useState(false);
  const [editInterviewerSheetOpen, setEditInterviewerSheetOpen] = useState(false);
  const [editDateDraft, setEditDateDraft] = useState({ date: "", time: "" });

  const { user } = useAuth();
  const { data: interviews = [], isLoading } = useInterviews();
  const { data: users = [] } = useUsers();
  const canUseDirectory = [
    "obispo",
    "consejero_obispo",
    "secretario",
    "secretario_ejecutivo",
    "secretario_financiero",
  ].includes(user?.role || "");
  const { data: members = [], isLoading: isMembersLoading } = useMembers({
    enabled: canUseDirectory,
  });
  const [personSource, setPersonSource] = useState<"directory" | "leader" | "manual">(
    canUseDirectory ? "directory" : "leader"
  );
  const [memberQuery, setMemberQuery] = useState("");

  const createMutation = useCreateInterview();
  const updateMutation = useUpdateInterview();
  const completeMutation = useCompleteInterview();
  const deleteMutation = useDeleteInterview();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(
    user?.role || ""
  );

  const isObispado =
    user?.role === "obispo" || user?.role === "consejero_obispo" || user?.role === "secretario_ejecutivo";

  const canManage = isObispado || isOrgMember;
  const canCancel = user?.role === "obispo"; // si quieres solo obispo cancela/borra

  const interviewers = useMemo(
    () => users.filter((u: any) => u.role === "obispo" || u.role === "consejero_obispo"),
    [users]
  );

  const organizationMembers = useMemo(
    () =>
      users.filter(
        (u: any) =>
          u.role === "presidente_organizacion" ||
          u.role === "consejero_organizacion" ||
          u.role === "secretario_organizacion" ||
          u.role === "secretario"
      ),
    [users]
  );

  const filteredMembers = useMemo(() => {
    const normalized = memberQuery.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) => {
      const haystack = [
        member.nameSurename,
        member.phone ?? "",
        member.email ?? "",
        member.organizationName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [memberQuery, members]);

  const userById = useMemo(() => {
    const m = new Map<string, any>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const buildInterviewMessage = (payload: {
    name: string;
    interviewerName?: string;
    dateLabel: string;
    timeLabel: string;
  }) => {
    const template = interviewMessageTemplates.find((item) => item.id === messageTemplateId)
      ?? interviewMessageTemplates[0];
    return template.build(payload);
  };

  const formatInterviewDateLabels = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return { dateLabel: value, timeLabel: "" };
    }
    return {
      dateLabel: date.toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      }),
      timeLabel: date.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    };
  };

  useEffect(() => {
    if (!messageContact) return;
    const nextMessage = buildInterviewMessage(messageContact);
    setMessageText(nextMessage);
  }, [messageContact, messageTemplateId]);

  // ✅ Filtrado por rol (si es org member)
  const filteredInterviewsRaw = isOrgMember
    ? interviews.filter((i: any) => i.assignedBy === user?.id || i.assignedToId === user?.id)
    : interviews;

  // ✅ Ocultar archivadas por defecto
  const filteredInterviews = useMemo(() => {
    return filteredInterviewsRaw
      .filter((i: any) =>
        showArchived
          ? i.status === "archivada"
          : i.status !== "archivada"
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      );
  }, [filteredInterviewsRaw, showArchived]);
  // ✅ Métricas (sobre no-archivadas)
  const pendingInterviews = filteredInterviews.filter((i: any) => i.status === "programada");
  const completedInterviews = filteredInterviews.filter((i: any) => i.status === "completada");

  // ✅ Form create
  const form = useForm<InterviewFormValues>({
    resolver: zodResolver(interviewSchema),
    defaultValues: {
      personName: isOrgMember ? user?.name || "" : "",
      memberId: "",
      date: "",
      type: "",
      interviewerId: "",
      urgent: false,
      notes: "",
    },
  });

  // ✅ Form edit
  const editForm = useForm<InterviewFormValues>({
    resolver: zodResolver(interviewSchema),
  });

  const selectedMemberId = form.watch("memberId");
  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId),
    [members, selectedMemberId]
  );
  const editMemberId = editForm.watch("memberId");
  const whatsappDigits = messageContact?.phone ? messageContact.phone.replace(/\D/g, "") : "";
  const personDisplayName = form.watch("personName");

  const resetWizard = () => {
    setStep(1);
    setDateSheetOpen(false);
    setTypeSheetOpen(false);
    setInterviewerSheetOpen(false);
    setDateDraft({ date: "", time: "" });
    setMemberQuery("");
    setLeaderQuery("");
    setSelectedLeader(null);
    setPersonSource(canUseDirectory ? "directory" : "leader");
    form.reset({
      personName: isOrgMember ? user?.name || "" : "",
      memberId: "",
      date: "",
      type: "",
      interviewerId: "",
      urgent: false,
      notes: "",
    });
  };

  const handleStepAdvance = async () => {
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

  const handleStepAdvance = async () => {
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

  useEffect(() => {
    if (prefillHandled || !search) return;
    const params = new URLSearchParams(search);
    const memberIdParam = params.get("memberId");
    if (!memberIdParam || members.length === 0) return;

    const member = members.find((item) => item.id === memberIdParam);
    if (!member) return;

    setPersonSource("directory");
    form.setValue("memberId", member.id, { shouldDirty: true });
    form.setValue("personName", member.nameSurename, { shouldDirty: true });
    setMemberQuery("");
    setSelectedLeader(null);
    setStep(2);
    setIsDialogOpen(true);
    setPrefillHandled(true);
    setLocation("/interviews");
  }, [prefillHandled, search, members, form, setLocation]);

  const onSubmit = (data: InterviewFormValues) => {
    createMutation.mutate(
      {
        ...data,
        date: formatDateTimeForApi(data.date),
        status: "programada", // ✅ en UI la llamamos Pendiente
        notes: data.notes || "",
        memberId: data.memberId || undefined,
      },
      {
        onSuccess: () => {
          const interviewerName = userById.get(data.interviewerId)?.name ?? "Obispado";
          const { dateLabel, timeLabel } = formatInterviewDateLabels(data.date);
          const contact =
            selectedMember
              ? {
                  name: selectedMember.nameSurename,
                  phone: selectedMember.phone,
                  email: selectedMember.email,
                }
              : selectedLeader
                ? {
                    name: selectedLeader.name,
                    phone: selectedLeader.phone,
                    email: selectedLeader.email,
                  }
                : {
                    name: data.personName,
                    phone: undefined,
                    email: undefined,
                  };

          if (contact.phone || contact.email) {
            const nextMessage = interviewMessageTemplates[0].build({
              name: contact.name,
              interviewerName,
              dateLabel,
              timeLabel,
            });
            setMessageTemplateId(interviewMessageTemplates[0].id);
            setMessageText(nextMessage);
            setMessageContact({
              ...contact,
              interviewerName,
              dateLabel,
              timeLabel,
            });
            setIsMessageDialogOpen(true);
          }
          toast({
            title: "Entrevista creada",
            description: "Se ha registrado la entrevista correctamente.",
          });
          setIsDialogOpen(false);
          form.reset();
          setSelectedLeader(null);
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
    );
  };

  const onEditSubmit = (data: InterviewFormValues) => {
    if (!editingInterview) return;
  
    updateMutation.mutate(
      {
        id: editingInterview.id,
        personName: data.personName,
        date: formatDateTimeForApi(data.date),
        type: data.type,
        interviewerId: data.interviewerId,
        urgent: data.urgent,
        notes: data.notes || "",
        memberId: data.memberId || null,
      },
      {
        onSuccess: () => {
          toast({
            title: "Entrevista actualizada",
            description: "Los cambios se han guardado.",
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

  const handleEditClick = (interview: any) => {
    setEditingInterview(interview);
    editForm.reset({
      personName: interview.personName,
      memberId: interview.memberId ?? "",
      date: formatDateTimeForInput(interview.date),
      type: interview.type,
      interviewerId: interview.interviewerId,
      urgent: !!interview.urgent,
      notes: interview.notes || "",
    });
    setEditDateDraft(splitDateTimeValue(interview.date));
    setIsEditDialogOpen(true);
  };

  const handleOpenDetails = (interview: any) => {
    setDetailsInterview(interview);
    setIsDetailsOpen(true);
  };

  // ✅ Estado badge (SOLO estado, sin urgent)
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      programada: { variant: "outline", label: "Pendiente" },
      completada: { variant: "default", label: "Completada" },
      archivada: { variant: "secondary", label: "Archivada" },
      cancelada: { variant: "secondary", label: "Cancelada" },
    };

    const config = variants[status] || variants.programada;

    return (
      <Badge variant={config.variant} className="flex items-center w-fit">
        {config.label}
      </Badge>
    );
  };

  // ✅ Prioridad badge (separado)
  const getPriorityBadge = (urgent: boolean) => {
    return urgent ? (
      <Badge variant="destructive" className="flex items-center w-fit">
        <AlertCircle className="h-3 w-3 mr-1" />
        Urgente
      </Badge>
    ) : (
      <Badge variant="outline" className="flex items-center w-fit">
        Normal
      </Badge>
    );
  };
  const handleToggleCompleted = (interview: any, checked: boolean) => {
    if (checked && interview.status === "programada") {
      updateMutation.mutate(
        {
          id: interview.id,
          data: { status: "completada" },
        },
        {
          onSuccess: () => {
            toast({
              title: "Entrevista completada",
              description: "Marcada como completada.",
            });
          },
          onError: () => {
            toast({
              title: "Error",
              description: "No se pudo completar la entrevista.",
              variant: "destructive",
            });
          },
        }
      );
    }
  };
  const handleArchive = (interviewId: string) => {
    updateMutation.mutate(
      { id: interviewId, status: "archivada" },
      {
        onSuccess: () => {
          toast({
            title: "Archivada",
            description: "La entrevista ha sido archivada y ya no aparece en la lista.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "No se pudo archivar (¿backend no acepta status=archivada?).",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleCancelDelete = (interviewId: string) => {
    if (!window.confirm("¿Está seguro de que desea eliminar esta entrevista?")) return;
    deleteMutation.mutate(interviewId, {
      onSuccess: () =>
        toast({ title: "Eliminada", description: "La entrevista se ha eliminado." }),
      onError: () =>
        toast({ title: "Error", description: "No se pudo eliminar.", variant: "destructive" }),
    });
  };

  const handleExportPdf = async () => {
    const now = new Date();
    const range = exportRange;
    const startDate =
      range === "month"
        ? startOfMonth(now)
        : range === "quarter"
          ? startOfQuarter(now)
          : startOfWeek(now);
    const endDate =
      range === "month"
        ? endOfMonth(now)
        : range === "quarter"
          ? endOfQuarter(now)
          : endOfWeek(now);

    const baseInterviews = filteredInterviewsRaw.filter((interview: any) => interview.status === "programada");
    const rangeInterviews = baseInterviews.filter((interview: any) => {
      const interviewDate = new Date(interview.date);
      return interviewDate >= startDate && interviewDate <= endDate;
    });

    const finalInterviews = exportInterviewerId === "all"
      ? rangeInterviews
      : rangeInterviews.filter((interview: any) => interview.interviewerId === exportInterviewerId);

    const interviewerLabel =
      exportInterviewerId === "all"
        ? "Todos"
        : userById.get(exportInterviewerId)?.name || "—";

    await generateInterviewAgendaPDF(
      finalInterviews.map((interview: any) => ({
        ...interview,
        interviewerName: userById.get(interview.interviewerId)?.name || "—",
      })),
      {
        startDate,
        endDate,
        interviewerLabel,
      }
    );

    setIsExportDialogOpen(false);
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
          <h1 className="text-2xl font-bold mb-2">Entrevistas</h1>
          <p className="text-sm text-muted-foreground">
            {isOrgMember ? "Solicita entrevistas con el Obispado" : "Programa y gestiona las entrevistas del barrio"}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-export-interviews">
                <Download className="h-4 w-4 lg:mr-2" />
                <span className="sr-only lg:not-sr-only">Exportar PDF</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Exportar agenda</DialogTitle>
                <DialogDescription>
                  Selecciona el periodo y entrevistador para generar el PDF.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Periodo</Label>
                  <Select value={exportRange} onValueChange={(value) => setExportRange(value as "week" | "month" | "quarter")}>
                    <SelectTrigger data-testid="select-export-range">
                      <SelectValue placeholder="Seleccionar periodo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">Semana actual</SelectItem>
                      <SelectItem value="month">Mes actual</SelectItem>
                      <SelectItem value="quarter">Trimestre actual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Entrevistador</Label>
                  <Select value={exportInterviewerId} onValueChange={setExportInterviewerId}>
                    <SelectTrigger data-testid="select-export-interviewer">
                      <SelectValue placeholder="Seleccionar entrevistador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {interviewers.map((interviewer: any) => (
                        <SelectItem key={interviewer.id} value={interviewer.id}>
                          {interviewer.name} ({formatRole(interviewer.role)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleExportPdf} data-testid="button-export-pdf-confirm">
                    Generar PDF
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            onClick={() => setShowArchived(v => !v)}
            title={showArchived ? "Ocultar archivadas" : "Mostrar archivadas"}
          >
            {showArchived ? "Ocultar archivadas" : "Ver archivadas"}
          </Button>

          {canManage && (
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  resetWizard();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button data-testid="button-schedule-interview">
                  <Plus className="h-4 w-4 mr-2" />
                  Programar Entrevista
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
                            ? `Entrevista con ${personDisplayName || "—"}`
                            : "Detalles"}
                      </DialogTitle>
                      <DialogDescription className="sr-only">
                        {isOrgMember ? "Solicita una entrevista con el Obispado" : "Asigna una entrevista a un miembro del barrio"}
                      </DialogDescription>
                    </div>
                    <span className="w-12" />
                  </div>
                </DialogHeader>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-h-[75vh] flex-col">
                    <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
                      {step === 1 && (
                        <FormField
                          control={form.control}
                          name="personName"
                          render={({ field }) => (
                            <FormItem className="space-y-4">
                              <FormLabel className="text-base">¿A quién deseas entrevistar?</FormLabel>
                              {isOrgMember ? (
                                <FormControl>
                                  <Input
                                    placeholder="Nombre Apellido"
                                    {...field}
                                    disabled
                                    data-testid="input-person-name"
                                    className="rounded-2xl bg-background/80"
                                  />
                                </FormControl>
                              ) : (
                                <div className="space-y-4 rounded-3xl bg-muted/20 p-4 shadow-sm">
                                  <div className="space-y-2">
                                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fuente</Label>
                                    <ToggleGroup
                                      type="single"
                                      value={personSource}
                                      onValueChange={(value) => {
                                        if (!value) return;
                                        const nextValue = value as "directory" | "leader" | "manual";
                                        setPersonSource(nextValue);
                                        form.setValue("memberId", "");
                                        form.setValue("personName", "");
                                        setSelectedLeader(null);
                                        setLeaderQuery("");
                                        if (nextValue !== "directory") {
                                          setMemberQuery("");
                                        }
                                      }}
                                      className="w-full rounded-full bg-muted/40 p-1"
                                    >
                                      <ToggleGroupItem
                                        value="directory"
                                        className={`flex-1 rounded-full text-xs sm:text-sm ${!canUseDirectory ? "pointer-events-none opacity-40" : ""}`}
                                      >
                                        Directorio
                                      </ToggleGroupItem>
                                      <ToggleGroupItem value="leader" className="flex-1 rounded-full text-xs sm:text-sm">
                                        Líderes
                                      </ToggleGroupItem>
                                      <ToggleGroupItem value="manual" className="flex-1 rounded-full text-xs sm:text-sm">
                                        Otros
                                      </ToggleGroupItem>
                                    </ToggleGroup>
                                  </div>

                                  {personSource === "directory" && canUseDirectory ? (
                                    <div className="space-y-3">
                                      <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                          placeholder="Buscar"
                                          value={memberQuery}
                                          onChange={(event) => setMemberQuery(event.target.value)}
                                          data-testid="input-member-search"
                                          className="rounded-2xl bg-background/80 pl-9"
                                        />
                                      </div>
                                      {selectedMember && (
                                        <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm">
                                          Seleccionado: <strong>{selectedMember.nameSurename}</strong>
                                        </div>
                                      )}
                                      <div className="max-h-64 space-y-2 overflow-y-auto">
                                        {isMembersLoading ? (
                                          <div className="rounded-2xl bg-background/80 px-4 py-3 text-sm text-muted-foreground">Cargando miembros...</div>
                                        ) : filteredMembers.length > 0 ? (
                                          filteredMembers.map((member) => (
                                            <button
                                              type="button"
                                              key={member.id}
                                              onClick={() => {
                                                form.setValue("memberId", member.id, {
                                                  shouldDirty: true,
                                                  shouldValidate: true,
                                                });
                                                field.onChange(member.nameSurename);
                                                setSelectedLeader(null);
                                              }}
                                              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-background/80 px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/40"
                                              data-testid={`option-member-${member.id}`}
                                            >
                                              <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9">
                                                  <AvatarFallback>{getInitials(member.nameSurename)}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                  <div className="font-medium">{member.nameSurename}</div>
                                                  <div className="text-xs text-muted-foreground">
                                                    {member.organizationName ?? "Sin organización"}
                                                  </div>
                                                </div>
                                              </div>
                                              {selectedMemberId === member.id ? (
                                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
                                                  <Check className="h-4 w-4" />
                                                </span>
                                              ) : (
                                                <span className="text-xs text-muted-foreground">›</span>
                                              )}
                                            </button>
                                          ))
                                        ) : (
                                          <div className="rounded-2xl bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                                            No hay miembros con ese filtro.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : personSource === "leader" ? (
                                    <div className="space-y-3">
                                      <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                          placeholder="Buscar"
                                          value={leaderQuery}
                                          onChange={(event) => setLeaderQuery(event.target.value)}
                                          className="rounded-2xl bg-background/80 pl-9"
                                        />
                                      </div>
                                      <div className="max-h-56 space-y-2 overflow-y-auto">
                                        {organizationMembers
                                          .filter((u: any) =>
                                            u.name.toLowerCase().includes(leaderQuery.toLowerCase())
                                          )
                                          .map((u: any) => (
                                            <button
                                              type="button"
                                              key={u.id}
                                              onClick={() => {
                                                field.onChange(u.name);
                                                setSelectedLeader(u);
                                                form.setValue("memberId", "");
                                              }}
                                              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-background/80 px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/40"
                                              data-testid={`option-person-${u.id}`}
                                            >
                                              <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9">
                                                  <AvatarFallback>{getInitials(u.name)}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                  <div className="font-medium">{u.name}</div>
                                                  <div className="text-xs text-muted-foreground capitalize">
                                                    {formatRole(u.role)}
                                                  </div>
                                                </div>
                                              </div>
                                              {selectedLeader?.id === u.id ? (
                                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
                                                  <Check className="h-4 w-4" />
                                                </span>
                                              ) : (
                                                <span className="text-xs text-muted-foreground">›</span>
                                              )}
                                            </button>
                                          ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <FormControl>
                                      <Input
                                        placeholder="Escribe el nombre"
                                        {...field}
                                        data-testid="input-person-name"
                                        className="rounded-2xl bg-background/80"
                                      />
                                    </FormControl>
                                  )}
                                </div>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {step === 2 && (
                        <div className="space-y-6">
                          <div className="rounded-3xl bg-background/80 px-4 py-4 shadow-sm">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback>{getInitials(personDisplayName || "?" )}</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{personDisplayName || "—"}</div>
                                <div className="text-xs text-muted-foreground">
                                  {selectedMember?.organizationName
                                    ?? (selectedLeader ? formatRole(selectedLeader.role) : "Sin organización")}
                                </div>
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
                                    data-testid="input-date"
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
                                        <Label>Fecha</Label>
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
                                        <Label>Hora (24h)</Label>
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
                                    data-testid="select-type"
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
                            render={({ field }) => {
                              const selectedInterviewer = interviewers.find((item: any) => item.id === field.value);
                              return (
                                <FormItem className="space-y-3">
                                  <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">Entrevistador</FormLabel>
                                  <FormControl>
                                    <button
                                      type="button"
                                      onClick={() => setInterviewerSheetOpen(true)}
                                      className="flex w-full items-center justify-between rounded-3xl bg-background/80 px-4 py-4 text-left shadow-sm"
                                      data-testid="select-interviewer"
                                    >
                                      <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9">
                                          <AvatarFallback>{selectedInterviewer ? getInitials(selectedInterviewer.name) : "?"}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <div className="text-sm text-muted-foreground">Entrevistador</div>
                                          <div className={`text-base ${field.value ? "text-foreground" : "text-muted-foreground"}`}>
                                            {selectedInterviewer?.name ?? "Seleccionar entrevistador"}
                                          </div>
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
                            );
                          }}
                        />

                          <FormField
                            control={form.control}
                            name="urgent"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between rounded-3xl bg-background/80 p-4 shadow-sm">
                                <div className="space-y-1">
                                  <FormLabel className="text-base">Urgente</FormLabel>
                                  <p className="text-xs text-muted-foreground">Se muestra con prioridad.</p>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-urgent"
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
                                    placeholder="Notas adicionales sobre la entrevista"
                                    {...field}
                                    data-testid="textarea-notes"
                                    className="min-h-[140px] rounded-3xl bg-background/80"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      <FormField
                        control={form.control}
                        name="memberId"
                        render={({ field }) => (
                          <FormItem className="hidden">
                            <FormControl>
                              <Input type="hidden" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="sticky bottom-0 border-t border-border/20 bg-background/90 px-5 py-4 backdrop-blur">
                      <div className="flex items-center justify-between gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full rounded-full"
                          onClick={() => {
                            resetWizard();
                            setIsDialogOpen(false);
                          }}
                          data-testid="button-cancel"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type={step === 3 ? "submit" : "button"}
                          onClick={step === 3 ? undefined : handleStepAdvance}
                          data-testid="button-submit"
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

          <Dialog
            open={isMessageDialogOpen}
            onOpenChange={(open) => {
              setIsMessageDialogOpen(open);
              if (!open) {
                setMessageContact(null);
                setMessageText("");
                setMessageTemplateId("confirmacion");
              }
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Enviar mensaje por WhatsApp</DialogTitle>
                <DialogDescription>
                  Selecciona una plantilla y envía el mensaje al entrevistado.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Plantilla</Label>
                  <Select value={messageTemplateId} onValueChange={setMessageTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una plantilla" />
                    </SelectTrigger>
                    <SelectContent>
                      {interviewMessageTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mensaje</Label>
                  <Textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    rows={6}
                  />
                </div>
                {messageContact && (
                  <div className="rounded-md border border-dashed border-border/60 p-3 text-sm">
                    <strong>{messageContact.name}</strong>
                    <div className="text-xs text-muted-foreground">
                      {messageContact.phone ? `WhatsApp: ${messageContact.phone}` : "Sin teléfono"}
                      {messageContact.email ? ` · Email: ${messageContact.email}` : ""}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsMessageDialogOpen(false)}>
                    Cerrar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!messageText) return;
                      await navigator.clipboard.writeText(messageText);
                      toast({ title: "Mensaje copiado" });
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar
                  </Button>
                  {messageContact?.email && (
                    <Button
                      variant="outline"
                      asChild
                    >
                      <a
                        href={`mailto:${messageContact.email}?subject=${encodeURIComponent("Entrevista programada")}&body=${encodeURIComponent(messageText)}`}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Email
                      </a>
                    </Button>
                  )}
                  {messageContact?.phone && whatsappDigits && (
                    <Button
                      asChild
                    >
                      <a
                        href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(messageText)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-upcoming-interviews">
              {pendingInterviews.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Por realizar</p>
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
            <p className="text-xs text-muted-foreground mt-1">Aún sin archivar</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isOrgMember ? "Mis Solicitudes de Entrevista" : "Entrevistas"}</CardTitle>
          <CardDescription>
            {isOrgMember ? "Tus solicitudes de entrevista con el Obispado" : "Entrevistas del barrio"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Entrevistador</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Estado</TableHead>
                {(canManage || canCancel) && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredInterviews.length > 0 ? (
                filteredInterviews.map((interview: any) => {
                  const interviewer = userById.get(interview.interviewerId);
                  const isCompleted = interview.status === "completada";
                  const isPending = interview.status === "programada";

                  return (
                    <TableRow
                      key={interview.id}
                      data-testid={`row-interview-${interview.id}`}
                      className="cursor-pointer"
                      onClick={() => handleOpenDetails(interview)}
                    >
                      <TableCell className="font-medium">{interview.personName}</TableCell>
                      <TableCell className="text-sm">{formatInterviewType(interview.type)}</TableCell>
                      <TableCell className="text-sm">
                        {interviewer?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(interview.date).toLocaleDateString("es-ES", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>{getPriorityBadge(!!interview.urgent)}</TableCell>
                      <TableCell>{getStatusBadge(interview.status)}</TableCell>

                      {(canManage || canCancel) && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {/* ✅ Botón para completar (solo pendientes) */}
                            {isObispado && isPending && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateMutation.mutate({
                                    id: interview.id,
                                    status: "completada",
                                  });
                                }}
                                disabled={updateMutation.isPending}
                                title="Completar"
                              >
                                <CheckCircle2 className="h-4 w-4 lg:mr-1" />
                                <span className="sr-only lg:not-sr-only">Completar</span>
                              </Button>
                            )}

                            {/* ✅ Si está completada: SOLO archivar */}
                            {isObispado && isCompleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleArchive(interview.id);
                                }}
                                disabled={updateMutation.isPending}
                                title="Archivar (ocultar de la lista)"
                              >
                                <Archive className="h-4 w-4 mr-1" />
                                Archivar
                              </Button>
                            )}

                            {/* ✅ Editar solo si NO está completada */}
                            {isObispado && !isCompleted && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleEditClick(interview);
                                }}
                                disabled={updateMutation.isPending}
                                data-testid={`button-edit-${interview.id}`}
                              >
                                <Edit className="h-4 w-4 lg:mr-1" />
                                <span className="sr-only lg:not-sr-only">Editar</span>
                              </Button>
                            )}

                            {/* ✅ Eliminar / Cancelar solo obispo (opcional) y solo si NO completada */}
                            {canCancel && !isCompleted && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleCancelDelete(interview.id);
                                }}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 lg:mr-1" />
                                <span className="sr-only lg:not-sr-only">Eliminar</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={(canManage || canCancel) ? 7 : 6} className="text-center py-8 text-muted-foreground">
                    {isOrgMember ? "No hay solicitudes de entrevista" : "No hay entrevistas"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) {
            setDetailsInterview(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalles de la entrevista</DialogTitle>
            <DialogDescription>Información en modo lectura.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div>
              <span className="font-medium">Persona:</span>{" "}
              {detailsInterview?.personName || "Sin nombre"}
            </div>
            <div>
              <span className="font-medium">Tipo:</span>{" "}
              {detailsInterview?.type ? formatInterviewType(detailsInterview.type) : "Sin tipo"}
            </div>
            <div>
              <span className="font-medium">Entrevistador:</span>{" "}
              {detailsInterview?.interviewerId
                ? userById.get(detailsInterview.interviewerId)?.name ?? "Sin entrevistador"
                : "Sin entrevistador"}
            </div>
            <div>
              <span className="font-medium">Fecha:</span>{" "}
              {detailsInterview?.date
                ? new Date(detailsInterview.date).toLocaleDateString("es-ES", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Sin fecha"}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Prioridad:</span>
              {detailsInterview ? getPriorityBadge(!!detailsInterview.urgent) : "Normal"}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Estado:</span>
              {detailsInterview?.status ? getStatusBadge(detailsInterview.status) : "Pendiente"}
            </div>
            <div>
              <span className="font-medium">Notas:</span>{" "}
              {detailsInterview?.notes?.trim() || "Sin notas"}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Interview Dialog */}
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
            <DialogDescription>Modifica los detalles de la entrevista</DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="personName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la Persona</FormLabel>
                    {editMemberId ? (
                      <div className="space-y-2">
                        <FormControl>
                          <Input placeholder="Nombre" {...field} disabled data-testid="input-edit-person-name" />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => editForm.setValue("memberId", "")}
                        >
                          Desvincular y editar manualmente
                        </Button>
                      </div>
                    ) : (
                      <FormControl>
                        <Input placeholder="Nombre" {...field} data-testid="input-edit-person-name" />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="memberId"
                render={({ field }) => (
                  <FormItem className="hidden">
                    <FormControl>
                      <Input type="hidden" {...field} />
                    </FormControl>
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
                        <button
                          type="button"
                          onClick={() => {
                            setEditDateDraft(splitDateTimeValue(field.value));
                            setEditDateSheetOpen(true);
                          }}
                          className="flex w-full items-center justify-between rounded-2xl bg-background/80 px-4 py-3 text-left text-sm"
                          data-testid="input-edit-date"
                        >
                          <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                            {formatDateTimeLabel(field.value)}
                          </span>
                          <CalendarIcon className="h-4 w-4" />
                        </button>
                      </FormControl>
                      <Drawer open={editDateSheetOpen} onOpenChange={setEditDateSheetOpen}>
                        <DrawerContent className="rounded-t-2xl bg-background/95 backdrop-blur">
                          <DrawerHeader>
                            <DrawerTitle>Seleccionar fecha y hora</DrawerTitle>
                          </DrawerHeader>
                          <div className="space-y-4 px-4 pb-6">
                            <div className="space-y-2">
                              <Label>Fecha</Label>
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
                              <Label>Hora (24h)</Label>
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
                      <FormControl>
                        <button
                          type="button"
                          onClick={() => setEditTypeSheetOpen(true)}
                          className="flex w-full items-center justify-between rounded-2xl bg-background/80 px-4 py-3 text-left text-sm"
                          data-testid="select-edit-type"
                        >
                          <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                            {field.value ? formatInterviewType(field.value) : "Seleccionar tipo"}
                          </span>
                          <span className="text-xs text-muted-foreground">›</span>
                        </button>
                      </FormControl>
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
                    <FormControl>
                      <button
                        type="button"
                        onClick={() => setEditInterviewerSheetOpen(true)}
                        className="flex w-full items-center justify-between rounded-2xl bg-background/80 px-4 py-3 text-left text-sm"
                        data-testid="select-edit-interviewer"
                      >
                        <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                          {field.value
                            ? interviewers.find((item: any) => item.id === field.value)?.name ?? "Seleccionar"
                            : "Seleccionar entrevistador"}
                        </span>
                        <span className="text-xs text-muted-foreground">›</span>
                      </button>
                    </FormControl>
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
                    <FormMessage />
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
                        data-testid="checkbox-edit-urgent"
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
                    <FormLabel>Notas (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Notas..."
                        {...field}
                        data-testid="textarea-edit-notes"
                        className="min-h-[120px] rounded-2xl bg-background/80"
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
