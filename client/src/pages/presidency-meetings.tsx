import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { useRoute, useLocation } from "wouter";
import {
  Plus,
  Download,
  Trash2,
  CalendarDays,
  BookOpen,
  FileText,
  PlayCircle,
  Wallet,
  Upload,
  Users,
  Phone,
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
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import {
  usePresidencyMeetings,
  useCreatePresidencyMeeting,
  useCreateBudgetRequest,
  useOrganizations,
  useBudgetRequests,
  useOrganizationBudgets,
  useMembers,
  useActivities,
  useGoals,
  useOrganizationAttendanceByOrg,
  usePresidencyResources,
} from "@/hooks/use-api";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/auth-tokens";

const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }

  navigate(path);
};

const meetingSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  agenda: z.string().optional(),
  notes: z.string().optional(),
  agreementsText: z.string().optional(),
});

const budgetRequestSchema = z.object({
  description: z.string().min(1, "La descripción es requerida"),
  amount: z.string().min(1, "El monto es requerido"),
  category: z.enum(["actividades", "materiales", "otros"]),
  requestType: z.enum(["reembolso", "pago_adelantado"]),
  notes: z.string().optional(),
  receiptFile: z
    .instanceof(File)
    .optional()
    .refine((file) => !file || isAllowedDocument(file), {
      message: "Adjunta un archivo .jpg, .doc, .docx o .pdf válido.",
    }),
  activityPlanFile: z
    .instanceof(File)
    .optional()
    .refine((file) => !file || isAllowedDocument(file), {
      message: "Adjunta un archivo .jpg, .doc, .docx o .pdf válido.",
    }),
}).superRefine((data, ctx) => {
  if (data.requestType === "reembolso" && !data.receiptFile) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["receiptFile"],
      message: "Adjunta el comprobante para solicitudes de reembolso.",
    });
  }

  if (data.requestType === "reembolso" && !data.activityPlanFile) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["activityPlanFile"],
      message: "Adjunta la solicitud de gastos para solicitudes de reembolso.",
    });
  }

  if (data.requestType === "pago_adelantado" && !data.activityPlanFile) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["activityPlanFile"],
      message: "Adjunta la solicitud de gasto para pagos por adelantado.",
    });
  }
});

type MeetingFormValues = z.infer<typeof meetingSchema>;
const allowedDocumentExtensions = [".jpg", ".jpeg", ".pdf", ".doc", ".docx"];

const isAllowedDocument = (file: File) => {
  const fileName = file.name.toLowerCase();
  return allowedDocumentExtensions.some((ext) => fileName.endsWith(ext));
};

type BudgetRequestFormValues = z.infer<typeof budgetRequestSchema>;

function CircularGauge({
  value,
  label,
  subtitle,
  gradientId,
  gradientStops,
  segments,
}: {
  value: number;
  label: string;
  subtitle: string;
  gradientId: string;
  gradientStops?: [string, string, string];
  segments?: Array<{ value: number; color: string }>;
}) {
  const size = 180;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweepAngle = 300;
  const arcLength = (sweepAngle / 360) * circumference;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = arcLength - (clamped / 100) * arcLength;

  const [startColor, middleColor, endColor] = gradientStops ?? ["hsl(var(--chart-4))", "hsl(var(--chart-1))", "hsl(var(--chart-2))"];
  let consumedLength = 0;

  return (
    <div className="relative mx-auto flex w-full max-w-[220px] items-center justify-center" data-testid={`gauge-${gradientId}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-sm">
        <defs>
          <linearGradient id={`${gradientId}-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={startColor} />
            <stop offset="45%" stopColor={middleColor} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted) / 0.5)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform={`rotate(120 ${size / 2} ${size / 2})`}
        />
        {segments && segments.length > 0 ? (
          segments
            .filter((segment) => Number(segment.value) > 0)
            .map((segment, index) => {
              const segmentLength = (Math.min(100, Math.max(0, Number(segment.value))) / 100) * arcLength;
              const currentOffset = -consumedLength;
              consumedLength += segmentLength;

              return (
                <circle
                  key={`${gradientId}-segment-${index}`}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${segmentLength} ${circumference}`}
                  strokeDashoffset={currentOffset}
                  transform={`rotate(120 ${size / 2} ${size / 2})`}
                />
              );
            })
        ) : (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId}-gradient)`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset: offset }}
            transition={{ type: "spring", stiffness: 90, damping: 18 }}
            transform={`rotate(120 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[2.2rem] font-bold leading-none text-foreground">{label}</p>
        <p className="mt-1 text-sm font-medium text-foreground/90">{subtitle}</p>
      </div>
    </div>
  );
}

function getSundaysForMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const sundays: Date[] = [];
  const cursor = new Date(year, month, 1);
  const offset = (7 - cursor.getDay()) % 7;
  cursor.setDate(cursor.getDate() + offset);

  while (cursor.getMonth() === month) {
    sundays.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }

  return sundays;
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function PresidencyMeetingsPage() {
  const { user } = useAuth();
  const [, params] = useRoute("/presidency/:org");
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBudgetRequestDialogOpen, setIsBudgetRequestDialogOpen] = useState(false);
  const [isBudgetMovementsDialogOpen, setIsBudgetMovementsDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [isResourcesModalOpen, setIsResourcesModalOpen] = useState(false);
  const [selectedResourcesCategory, setSelectedResourcesCategory] = useState<"manuales" | "plantillas" | "capacitacion">("manuales");
  const [organizationId, setOrganizationId] = useState<string | undefined>();
  const [goalSlideIndex, setGoalSlideIndex] = useState(0);
  const [budgetSlideIndex, setBudgetSlideIndex] = useState(0);
  const goalDragStartX = React.useRef<number | null>(null);
  const budgetDragStartX = React.useRef<number | null>(null);

  const { data: organizations = [] } = useOrganizations();
  const { data: meetings = [], isLoading } = usePresidencyMeetings(organizationId);
  const { data: budgetRequests = [] } = useBudgetRequests();
  const { data: goals = [] } = useGoals();
  const { data: organizationBudgets = [] } = useOrganizationBudgets(organizationId ?? "");
  const { data: members = [] } = useMembers({ enabled: Boolean(organizationId) });
  const { data: activities = [] } = useActivities();
  const { data: sectionResources = [], isLoading: isLoadingSectionResources } = usePresidencyResources({
    organizationId,
    category: selectedResourcesCategory,
  });

  const strictSectionResources = useMemo(
    () => sectionResources.filter((resource: any) => resource.category === selectedResourcesCategory),
    [sectionResources, selectedResourcesCategory]
  );
  const organizationMembers = useMemo(
    () => (members as any[]).filter((member: any) => member.organizationId === organizationId),
    [members, organizationId]
  );
  const { data: attendance = [] } = useOrganizationAttendanceByOrg(organizationId);
  const createMutation = useCreatePresidencyMeeting(organizationId);
  const createBudgetRequestMutation = useCreateBudgetRequest();
  const { toast } = useToast();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const isObispado = user?.role === "obispo" || user?.role === "consejero_obispo";
  const canCreate = !isOrgMember || organizationId === user?.organizationId;
  const canDelete = isObispado || isOrgMember;

  const organizationSlugs: Record<string, string> = {
    "hombres-jovenes": "hombres_jovenes",
    "mujeres-jovenes": "mujeres_jovenes",
    "sociedad-socorro": "sociedad_socorro",
    primaria: "primaria",
    "escuela-dominical": "escuela_dominical",
    jas: "jas",
    "cuorum-elderes": "cuorum_elderes",
  };

  const organizationNames: Record<string, string> = {
    "hombres-jovenes": "Cuórum del Sacerdocio Aarónico",
    "mujeres-jovenes": "Mujeres Jóvenes",
    "sociedad-socorro": "Sociedad de Socorro",
    primaria: "Primaria",
    "escuela-dominical": "Escuela Dominical",
    jas: "JAS",
    "cuorum-elderes": "Cuórum de Élderes",
  };


  const resourcesCategoryLabels: Record<"manuales" | "plantillas" | "capacitacion", string> = {
    manuales: "Manuales",
    plantillas: "Plantillas",
    capacitacion: "Capacitación",
  };

  const openResourcesModal = (category: "manuales" | "plantillas" | "capacitacion") => {
    setSelectedResourcesCategory(category);
    setIsResourcesModalOpen(true);
  };

  useEffect(() => {
    if (params?.org && organizations.length > 0) {
      const slug = organizationSlugs[params.org];
      const org = organizations.find((o: any) => o.type === slug);
      setOrganizationId(org?.id);
    }
  }, [params?.org, organizations]);

  const orgName = params?.org ? organizationNames[params.org] || params.org : "Presidencia";
  const isLeadershipOnly = params?.org === "jas";
  const pageTitle = isLeadershipOnly ? `Liderazgo de ${orgName}` : `Presidencia de ${orgName}`;
  const meetingTitle = isLeadershipOnly ? "REUNIÓN DE LIDERAZGO" : "REUNIÓN DE PRESIDENCIA";

  const currentDate = new Date();
  const sundaysInMonth = useMemo(() => getSundaysForMonth(currentDate), [currentDate.getMonth(), currentDate.getFullYear()]);

  const dashboardStats = useMemo(() => {
    const organizationGoals = (goals as any[]).filter((goal: any) => goal.organizationId === organizationId);
    const goalsWithPercentage = organizationGoals.map((goal: any) => {
      const target = Number(goal.targetValue ?? 0);
      const current = Number(goal.currentValue ?? 0);
      const percentage = target > 0 ? Math.min(100, (current / target) * 100) : 0;
      return { ...goal, percentage, target, current };
    });

    const completedGoals = goalsWithPercentage.filter((goal: any) => goal.percentage >= 100).length;
    const goalProgress = goalsWithPercentage.length > 0
      ? goalsWithPercentage.reduce((sum: number, goal: any) => sum + goal.percentage, 0) / goalsWithPercentage.length
      : 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    const currentOrgBudget = (organizationBudgets as any[]).find(
      (budget: any) => budget.year === currentYear && budget.quarter === currentQuarter
    );
    const assignedBudget = Number(currentOrgBudget?.amount ?? 0);

    const approvedRequests = (budgetRequests as any[]).filter(
      (request: any) =>
        request.organizationId === organizationId &&
        (request.status === "aprobado" || request.status === "completado")
    );

    const spentBudget = approvedRequests.reduce((sum: number, request: any) => sum + Number(request.amount ?? 0), 0);
    const budgetUsage = assignedBudget > 0 ? Math.min(100, (spentBudget / assignedBudget) * 100) : 0;

    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    const monthMeetings = meetings.filter((meeting: any) => {
      const meetingDate = new Date(meeting.date);
      return meetingDate >= monthStart && meetingDate <= monthEnd;
    }).length;

    const weeksInMonth = sundaysInMonth.length || 4;

    const monthlyActivities = (activities as any[]).filter((activity: any) => {
      if (activity.organizationId !== organizationId) return false;
      const activityDate = new Date(activity.date);
      return activityDate >= monthStart && activityDate <= monthEnd;
    }).length;

    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-`;
    const attendanceInMonth = (attendance as any[]).filter((entry: any) => {
      const key = typeof entry.weekKey === "string"
        ? entry.weekKey
        : String(entry.weekStartDate ?? "").slice(0, 10);
      return key.startsWith(monthPrefix);
    });

    const totalAttendanceInMonth = attendanceInMonth.reduce((sum: number, entry: any) => sum + Number(entry.attendeesCount ?? 0), 0);
    const reportedWeekKeys = new Set(attendanceInMonth.map((entry: any) => String(entry.weekKey ?? String(entry.weekStartDate ?? "").slice(0, 10))));
    const reportedWeeks = reportedWeekKeys.size;
    const todayIso = formatLocalDateKey(now);
    const elapsedWeeks = sundaysInMonth.filter((sunday) => formatLocalDateKey(sunday) <= todayIso).length;
    const averageWeeklyAttendance = elapsedWeeks > 0 ? totalAttendanceInMonth / elapsedWeeks : 0;
    const monthlyAttendancePercent = organizationMembers.length > 0
      ? Math.min(100, (averageWeeklyAttendance / organizationMembers.length) * 100)
      : 0;
    const reportedElapsedWeeks = sundaysInMonth
      .map((sunday) => formatLocalDateKey(sunday))
      .filter((iso) => iso <= todayIso && reportedWeekKeys.has(iso)).length;
    const attendanceLoadPercent = Math.min(100, (reportedElapsedWeeks / Math.max(1, elapsedWeeks)) * 100);
    const monthMeetingProgress = Math.min(100, (monthMeetings / Math.max(1, weeksInMonth)) * 100);

    const byCategory = approvedRequests.reduce(
      (acc: { actividades: number; materiales: number; otros: number }, request: any) => {
        const category: "actividades" | "materiales" | "otros" = request.category === "actividades" || request.category === "materiales"
          ? request.category
          : "otros";
        acc[category] += Number(request.amount ?? 0);
        return acc;
      },
      { actividades: 0, materiales: 0, otros: 0 }
    );

    const latestMeeting = [...meetings]
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const budgetSlides = [
      {
        key: "materiales",
        title: "Materiales",
        amount: byCategory.materiales,
        percentage: assignedBudget > 0 ? Math.min(100, (byCategory.materiales / assignedBudget) * 100) : 0,
        gradientStops: ["hsl(var(--chart-2))", "hsl(var(--chart-1))", "hsl(var(--chart-4))"] as [string, string, string],
      },
      {
        key: "actividades",
        title: "Actividades",
        amount: byCategory.actividades,
        percentage: assignedBudget > 0 ? Math.min(100, (byCategory.actividades / assignedBudget) * 100) : 0,
        gradientStops: ["hsl(var(--chart-4))", "hsl(var(--chart-1))", "hsl(var(--chart-5))"] as [string, string, string],
      },
      {
        key: "otros",
        title: "Otros",
        amount: byCategory.otros,
        percentage: assignedBudget > 0 ? Math.min(100, (byCategory.otros / assignedBudget) * 100) : 0,
        gradientStops: ["hsl(var(--chart-3))", "hsl(var(--chart-5))", "hsl(var(--chart-2))"] as [string, string, string],
      },
    ];

    return {
      goalsWithPercentage,
      completedGoals,
      goalProgress,
      budgetUsage,
      assignedBudget,
      spentBudget,
      availableBudget: Math.max(0, assignedBudget - spentBudget),
      byCategory,
      membersCount: organizationMembers.length,
      monthlyActivities,
      monthMeetings,
      weeksInMonth,
      monthlyAttendancePercent,
      averageWeeklyAttendance,
      reportedWeeks,
      reportedElapsedWeeks,
      elapsedWeeks,
      attendanceLoadPercent,
      monthMeetingProgress,
      latestMeeting,
      budgetSlides,
    };
  }, [activities, attendance, budgetRequests, goals, meetings, members, organizationBudgets, organizationId, sundaysInMonth.length]);

  useEffect(() => {
    const maxGoalSlide = dashboardStats.goalsWithPercentage.length;
    if (goalSlideIndex > maxGoalSlide) {
      setGoalSlideIndex(maxGoalSlide);
    }
  }, [dashboardStats.goalsWithPercentage.length, goalSlideIndex]);

  const handleExportMeetingPDF = (meeting: any) => {
    const meetingDate = new Date(meeting.date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const agreementsText = Array.isArray(meeting.agreements) && meeting.agreements.length > 0
      ? meeting.agreements.map((a: any, i: number) => `${i + 1}. ${a.description}`).join("\n")
      : "No hay acuerdos registrados";

    const content = `${meetingTitle} - ${orgName.toUpperCase()}\n\nFecha: ${meetingDate}\n\nAGENDA:\n${meeting.agenda || "No hay agenda registrada"}\n\nACUERDOS:\n${agreementsText}\n\nNOTAS:\n${meeting.notes || "No hay notas registradas"}\n\n---\nDocumento generado desde Liahonaap - Sistema Administrativo de Barrio`;

    const element = document.createElement("a");
    const file = new Blob([content], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `reunion_${orgName.replace(/\s+/g, "_").toLowerCase()}_${new Date(meeting.date).getTime()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      date: "",
      agenda: "",
      notes: "",
      agreementsText: "",
    },
  });

  const budgetRequestForm = useForm<BudgetRequestFormValues>({
    resolver: zodResolver(budgetRequestSchema),
    defaultValues: {
      description: "",
      amount: "",
      category: "otros",
      requestType: "pago_adelantado",
      notes: "",
      receiptFile: undefined,
      activityPlanFile: undefined,
    },
  });

  const budgetRequestType = budgetRequestForm.watch("requestType");

  const uploadReceiptFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      throw new Error("No se pudo subir el archivo");
    }

    return response.json() as Promise<{ filename: string; url: string }>;
  };

  const onSubmit = (data: MeetingFormValues) => {
    if (!organizationId) return;

    const agreements = (data.agreementsText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((description) => ({ description, responsible: "Por definir" }));

    createMutation.mutate(
      {
        date: data.date,
        organizationId,
        agenda: data.agenda || "",
        agreements,
        notes: data.notes || "",
      },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
          form.reset();
        },
      }
    );
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      await apiRequest("DELETE", `/api/presidency-meetings/${meetingId}`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-meetings", organizationId] });
      toast({ title: "Reunión eliminada", description: "La reunión de presidencia ha sido eliminada exitosamente." });
    } catch {
      toast({ title: "Error", description: "No se pudo eliminar la reunión", variant: "destructive" });
    }
  };

  const onSubmitBudgetRequest = async (values: BudgetRequestFormValues) => {
    if (!organizationId) return;

    const uploadedReceipts: { filename: string; url: string; category: "receipt" | "plan" }[] = [];

    if (values.requestType === "reembolso" && values.receiptFile) {
      try {
        const uploadedReceipt = await uploadReceiptFile(values.receiptFile);
        uploadedReceipts.push({ filename: uploadedReceipt.filename, url: uploadedReceipt.url, category: "receipt" });
      } catch {
        toast({ title: "Error", description: "No se pudo subir el comprobante", variant: "destructive" });
        return;
      }
    }

    if ((values.requestType === "pago_adelantado" || values.requestType === "reembolso") && values.activityPlanFile) {
      try {
        const uploadedPlan = await uploadReceiptFile(values.activityPlanFile);
        uploadedReceipts.push({ filename: uploadedPlan.filename, url: uploadedPlan.url, category: "plan" });
      } catch {
        toast({ title: "Error", description: "No se pudo subir la solicitud de gasto", variant: "destructive" });
        return;
      }
    }

    createBudgetRequestMutation.mutate(
      {
        description: values.description,
        amount: Number(values.amount),
        category: values.category,
        notes: values.notes || "",
        organizationId,
        status: "solicitado",
        receipts: uploadedReceipts,
      },
      {
        onSuccess: () => {
          setIsBudgetRequestDialogOpen(false);
          budgetRequestForm.reset();
        },
      }
    );
  };

  const activeGoal = goalSlideIndex === 0 ? null : (dashboardStats.goalsWithPercentage[goalSlideIndex - 1] ?? null);
  const activeBudgetSlide = dashboardStats.budgetSlides[budgetSlideIndex] ?? dashboardStats.budgetSlides[0];
  const organizationBudgetMovements = (budgetRequests as any[])
    .filter((request: any) => request.organizationId === organizationId)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const goalGradients: [string, string, string][] = [
    ["#F5CF74", "#E3AF45", "#1F8795"],
    ["#C5E8C6", "#56C2BD", "#4E9D63"],
    ["#A0C8FF", "#5BB8F7", "#4B7BE5"],
    ["#FBC4AB", "#F08080", "#EF476F"],
  ];
  const activeGoalGradient = goalGradients[Math.max(0, goalSlideIndex - 1) % goalGradients.length];
  const goalSummarySegments = dashboardStats.goalsWithPercentage.map((goal: any, index: number) => ({
    value: dashboardStats.goalsWithPercentage.length > 0 ? goal.percentage / dashboardStats.goalsWithPercentage.length : 0,
    color: goalGradients[index % goalGradients.length][2],
  }));

  const moveGoalSlide = (direction: "next" | "prev") => {
    setGoalSlideIndex((prev) => {
      const maxSlide = dashboardStats.goalsWithPercentage.length;
      if (maxSlide === 0) return 0;
      return direction === "next"
        ? Math.min(prev + 1, maxSlide)
        : Math.max(prev - 1, 0);
    });
  };

  const moveBudgetSlide = (direction: "next" | "prev") => {
    setBudgetSlideIndex((prev) => (
      direction === "next"
        ? Math.min(prev + 1, dashboardStats.budgetSlides.length - 1)
        : Math.max(prev - 1, 0)
    ));
  };

  const handleSwipe = (startX: number | null, endX: number | null, onPrev: () => void, onNext: () => void) => {
    if (startX === null || endX === null) return;
    const delta = endX - startX;
    if (delta > 35) onPrev();
    if (delta < -35) onNext();
  };

  const getTouchStartX = (event: any) => event.touches?.[0]?.clientX ?? null;
  const getTouchEndX = (event: any) => event.changedTouches?.[0]?.clientX ?? null;

  if (isLoading || !organizationId) {
    return (
      <div className="p-4 md:p-8">
        <Skeleton className="mb-6 h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:space-y-8 md:p-6 xl:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 120, damping: 18 }}>
        <p className="text-sm text-muted-foreground">Panel de Presidencia</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{pageTitle}</h1>
        <div className="mt-3">
          <Button
            className="rounded-full"
            onClick={() => navigateWithTransition(setLocation, `/presidency/${params?.org ?? ""}/manage`)}
            data-testid="button-manage-organization"
          >
            Gestionar Organización
          </Button>
        </div>
      </motion.div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear reunión de presidencia</DialogTitle>
            <DialogDescription>Registra la reunión de presidencia de {orgName}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} data-testid="input-date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="agenda" render={({ field }) => (
                <FormItem>
                  <FormLabel>Agenda (opcional)</FormLabel>
                  <FormControl><Textarea placeholder="Puntos a tratar en la reunión" {...field} data-testid="textarea-agenda" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="agreementsText" render={({ field }) => (
                <FormItem>
                  <FormLabel>Acuerdos (uno por línea)</FormLabel>
                  <FormControl><Textarea placeholder="Acuerdo 1\nAcuerdo 2" {...field} data-testid="textarea-agreements" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl><Textarea placeholder="Notas de la reunión" {...field} data-testid="textarea-notes" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">Cancelar</Button>
                <Button type="submit" data-testid="button-submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creando..." : "Crear reunión"}</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-12">
        <div className="col-span-1 flex flex-col gap-3 md:gap-4 lg:col-span-4">
          <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
            <button type="button" onClick={() => setMembersDialogOpen(true)} className="rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card" data-testid="button-org-members-card">
              <p className="text-xs text-muted-foreground">Miembros de la organización</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-2xl font-semibold md:text-3xl">{dashboardStats.membersCount}</p>
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
            </button>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Directorio de {orgName}</DialogTitle>
                <DialogDescription>Miembros asignados a esta organización</DialogDescription>
              </DialogHeader>
              <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                {organizationMembers.length > 0 ? organizationMembers.map((member) => (
                  <div key={member.id} className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{member.nameSurename}</p>
                        <p className="text-xs text-muted-foreground">{member.phone || member.email || "Sin contacto"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.phone && <a href={`tel:${member.phone}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70"><Phone className="h-4 w-4" /></a>}
                        {member.email && <a href={`mailto:${member.email}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70"><Mail className="h-4 w-4" /></a>}
                      </div>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No hay miembros asignados a esta organización.</p>}
              </div>
            </DialogContent>
          </Dialog>

          <button type="button" onClick={() => setLocation(`/calendar?org=${params?.org ?? ""}`)} className="rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card" data-testid="button-org-calendar-card">
            <p className="text-xs text-muted-foreground">Calendario</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-2xl font-semibold md:text-3xl">{dashboardStats.monthlyActivities}</p>
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Actividades del mes</p>
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigateWithTransition(setLocation, `/presidency/${params?.org ?? ""}/manage`)}
          className="col-span-1 flex min-h-[220px] flex-col justify-between rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card lg:col-span-3"
          data-testid="button-presidency-meetings-overview"
        >
          <div>
            <p className="text-xs text-muted-foreground">Reuniones de presidencia</p>
            <p className="mt-2 text-2xl font-semibold">{dashboardStats.monthMeetings} de {dashboardStats.weeksInMonth}</p>
            <Progress value={dashboardStats.monthMeetingProgress} className="mt-2 h-2" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Asistencia a clases</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-xl font-semibold">{Math.round(dashboardStats.monthlyAttendancePercent)}%</p>
              <div className="relative h-12 w-12 shrink-0" data-testid="mini-gauge-attendance-classes">
                <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
                  <circle cx="24" cy="24" r="18" fill="none" stroke="hsl(var(--muted) / 0.55)" strokeWidth="5" />
                  <circle
                    cx="24"
                    cy="24"
                    r="18"
                    fill="none"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 18}`}
                    strokeDashoffset={`${2 * Math.PI * 18 * (1 - Math.max(0, Math.min(100, dashboardStats.monthlyAttendancePercent)) / 100)}`}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground">
                  {Math.round(dashboardStats.monthlyAttendancePercent)}
                </span>
              </div>
            </div>
          </div>
        </button>

      </div>

      <div className="grid gap-4 lg:grid-cols-2">

        <Card className="rounded-3xl border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Metas de organización</CardTitle>
            <CardDescription>Seguimiento del cumplimiento mensual</CardDescription>
          </CardHeader>
          <CardContent className="rounded-3xl border border-border/60 bg-gradient-to-b from-card to-muted/20 p-4"
            onPointerDown={(event) => { goalDragStartX.current = event.clientX; }}
            onPointerUp={(event) => handleSwipe(goalDragStartX.current, event.clientX, () => moveGoalSlide("prev"), () => moveGoalSlide("next"))}
            onTouchStart={(event) => { goalDragStartX.current = getTouchStartX(event); }}
            onTouchEnd={(event) => handleSwipe(goalDragStartX.current, getTouchEndX(event), () => moveGoalSlide("prev"), () => moveGoalSlide("next"))}
          >
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold leading-none">{Math.round(goalSlideIndex === 0 ? dashboardStats.goalProgress : (activeGoal?.percentage ?? 0))}%</span>
              <span className="text-base font-medium text-muted-foreground">Metas cumplidas</span>
            </div>
            <CircularGauge
              value={goalSlideIndex === 0 ? dashboardStats.goalProgress : (activeGoal?.percentage ?? 0)}
              label={`${Math.round(goalSlideIndex === 0 ? dashboardStats.goalProgress : (activeGoal?.percentage ?? 0))}%`}
              subtitle={goalSlideIndex === 0 ? "Avance total" : (activeGoal?.title || "Metas cumplidas")}
              gradientId="goals"
              gradientStops={activeGoalGradient}
              segments={goalSlideIndex === 0 ? goalSummarySegments : undefined}
            />
            <div className="mt-1 text-center text-sm text-muted-foreground">
              {goalSlideIndex === 0 ? (
                <p>{`${dashboardStats.completedGoals} de ${dashboardStats.goalsWithPercentage.length} metas completadas`}</p>
              ) : (
                <p>{`Progreso de la meta: ${activeGoal?.current ?? 0} de ${Math.max(1, activeGoal?.target ?? 0)}`}</p>
              )}
              <p>{`Avance total: ${Math.round(dashboardStats.goalProgress)}%`}</p>
            </div>
            {dashboardStats.goalsWithPercentage.length > 0 && (
              <div className="mt-3 flex justify-center gap-2" data-testid="goal-dots">
                {Array.from({ length: dashboardStats.goalsWithPercentage.length + 1 }).map((_, index: number) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setGoalSlideIndex(index)}
                    className={`h-2.5 w-2.5 rounded-full transition-all ${goalSlideIndex === index ? "bg-primary w-5" : "bg-muted-foreground/30"}`}
                    aria-label={index === 0 ? "Ir al resumen total" : `Ir a meta ${index}`}
                  />
                ))}
              </div>
            )}
            <Button className="mt-4 w-full rounded-full" variant="secondary" onClick={() => setLocation(`/goals?tab=organizacion&org=${params?.org ?? ""}`)} data-testid="button-goals-from-gauge">+ Ver metas</Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Presupuesto de organización</CardTitle>
            <CardDescription>Uso del trimestre actual</CardDescription>
          </CardHeader>
          <CardContent
            className="rounded-3xl border border-border/60 bg-gradient-to-b from-card to-muted/20 p-4"
            onPointerDown={(event) => { budgetDragStartX.current = event.clientX; }}
            onPointerUp={(event) => handleSwipe(budgetDragStartX.current, event.clientX, () => moveBudgetSlide("prev"), () => moveBudgetSlide("next"))}
            onTouchStart={(event) => { budgetDragStartX.current = getTouchStartX(event); }}
            onTouchEnd={(event) => handleSwipe(budgetDragStartX.current, getTouchEndX(event), () => moveBudgetSlide("prev"), () => moveBudgetSlide("next"))}
          >
            <div className="mb-1">
              <p className="text-4xl font-bold leading-none">{Math.round(activeBudgetSlide?.percentage ?? dashboardStats.budgetUsage)}% usado</p>
              <p className="mt-1 text-lg font-medium">€{(activeBudgetSlide?.amount ?? dashboardStats.spentBudget).toFixed(2)} usados</p>
              <p className="text-sm text-muted-foreground">de €{dashboardStats.assignedBudget.toFixed(2)}</p>
            </div>
            <CircularGauge
              value={activeBudgetSlide?.percentage ?? dashboardStats.budgetUsage}
              label={`€${(activeBudgetSlide?.amount ?? dashboardStats.spentBudget).toFixed(0)}`}
              subtitle={`${activeBudgetSlide?.title ?? "usados"}`}
              gradientId="budget"
              gradientStops={activeBudgetSlide?.gradientStops}
            />
            <div className="mt-3 flex justify-center gap-2" data-testid="budget-dots">
              {dashboardStats.budgetSlides.map((_: any, index: number) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setBudgetSlideIndex(index)}
                  className={`h-2.5 w-2.5 rounded-full transition-all ${budgetSlideIndex === index ? "bg-primary w-5" : "bg-muted-foreground/30"}`}
                  aria-label={`Ir a concepto ${index + 1}`}
                />
              ))}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button className="w-full rounded-full" variant="secondary" onClick={() => setIsBudgetMovementsDialogOpen(true)} data-testid="button-view-budget-movements-from-card">
                Ver movimientos
              </Button>
              <Button className="w-full rounded-full" variant="outline" onClick={() => setIsBudgetRequestDialogOpen(true)} data-testid="button-request-budget-from-card">
                Solicitar presupuesto
              </Button>
            </div>
            <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Disponible</span><span className="font-medium">€{dashboardStats.availableBudget.toFixed(2)}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isBudgetMovementsDialogOpen} onOpenChange={setIsBudgetMovementsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Movimientos de presupuesto</DialogTitle>
            <DialogDescription>Solicitudes de esta organización y su estado.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {organizationBudgetMovements.length > 0 ? organizationBudgetMovements.map((movement: any) => (
              <div key={movement.id} className="rounded-xl border border-border/70 bg-background/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{movement.description}</p>
                  <span className="text-sm font-semibold">€{Number(movement.amount ?? 0).toFixed(2)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{String(movement.status || "solicitado").replace("_", " ")}</span>
                  <span>{new Date(movement.createdAt).toLocaleDateString("es-ES")}</span>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No hay movimientos registrados todavía.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBudgetRequestDialogOpen} onOpenChange={setIsBudgetRequestDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Solicitar presupuesto</DialogTitle>
            <DialogDescription>Completa la solicitud con el monto y categoría.</DialogDescription>
          </DialogHeader>
          <Form {...budgetRequestForm}>
            <form onSubmit={budgetRequestForm.handleSubmit(onSubmitBudgetRequest)} className="space-y-4">
              <FormField control={budgetRequestForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl><Input placeholder="Ej: Materiales para actividad" {...field} data-testid="input-budget-request-description" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={budgetRequestForm.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto (€)</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" {...field} data-testid="input-budget-request-amount" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={budgetRequestForm.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-budget-request-category">
                        <SelectValue placeholder="Selecciona categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="actividades">Actividades</SelectItem>
                      <SelectItem value="materiales">Materiales</SelectItem>
                      <SelectItem value="otros">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={budgetRequestForm.control} name="requestType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de solicitud</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-budget-request-type">
                        <SelectValue placeholder="Selecciona un tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="reembolso">Reembolso</SelectItem>
                      <SelectItem value="pago_adelantado">Pago por adelantado</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {budgetRequestType === "reembolso" && (
                <FormField control={budgetRequestForm.control} name="receiptFile" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjuntar comprobantes</FormLabel>
                    <FormControl>
                      <div className="flex flex-col gap-2">
                        <Input id="presidency-budget-receipt-file" type="file" accept={allowedDocumentExtensions.join(",")} onChange={(event) => field.onChange(event.target.files?.[0] ?? undefined)} onBlur={field.onBlur} ref={field.ref} className="hidden" data-testid="input-budget-request-receipt-file" />
                        <Button type="button" variant="outline" className="w-fit" asChild>
                          <label htmlFor="presidency-budget-receipt-file" className="cursor-pointer">
                            <Upload className="mr-2 h-4 w-4" />Seleccionar comprobante
                          </label>
                        </Button>
                        <span className="text-xs text-muted-foreground">{field.value ? `Archivo seleccionado: ${field.value.name}` : "Ningún archivo seleccionado"}</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {(budgetRequestType === "pago_adelantado" || budgetRequestType === "reembolso") && (
                <FormField control={budgetRequestForm.control} name="activityPlanFile" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Solicitud de gastos</FormLabel>
                    <FormControl>
                      <div className="flex flex-col gap-2">
                        <Input id="presidency-budget-plan-file" type="file" accept={allowedDocumentExtensions.join(",")} onChange={(event) => field.onChange(event.target.files?.[0] ?? undefined)} onBlur={field.onBlur} ref={field.ref} className="hidden" data-testid="input-budget-request-plan-file" />
                        <Button type="button" variant="outline" className="w-fit" asChild>
                          <label htmlFor="presidency-budget-plan-file" className="cursor-pointer">
                            <Upload className="mr-2 h-4 w-4" />Subir solicitud de gasto
                          </label>
                        </Button>
                        <span className="text-xs text-muted-foreground">{field.value ? `Archivo seleccionado: ${field.value.name}` : "Ningún archivo seleccionado"}</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={budgetRequestForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl><Textarea {...field} data-testid="input-budget-request-notes" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" className="w-full" data-testid="button-submit-budget-request" disabled={createBudgetRequestMutation.isPending}>
                {createBudgetRequestMutation.isPending ? "Enviando..." : "Enviar solicitud"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {dashboardStats.latestMeeting && (
        <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle>Última reunión</CardTitle>
            <CardDescription>
              {new Date(dashboardStats.latestMeeting.date).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Array.isArray(dashboardStats.latestMeeting.agreements) && dashboardStats.latestMeeting.agreements.length > 0 ? (
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {dashboardStats.latestMeeting.agreements.slice(0, 3).map((agreement: any, index: number) => (
                  <li key={`${agreement.description}-${index}`}>{agreement.description}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin acuerdos registrados en la última reunión.</p>
            )}
          </CardContent>
        </Card>
      )}



      <Dialog open={isResourcesModalOpen} onOpenChange={setIsResourcesModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recursos: {resourcesCategoryLabels[selectedResourcesCategory]}</DialogTitle>
            <DialogDescription>Recursos disponibles para {orgName} en esta sección.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {isLoadingSectionResources ? (
              <p className="text-sm text-muted-foreground">Cargando recursos...</p>
            ) : strictSectionResources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay recursos disponibles en esta sección.</p>
            ) : (
              strictSectionResources.map((resource: any) => (
                <div key={resource.id} className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <p className="text-sm font-semibold">{resource.placeholderName || resource.title}</p>
                  {resource.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">{resource.description}</p>
                  ) : null}
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(resource.fileUrl, "_blank", "noopener,noreferrer")}
                  >
                    <Download className="mr-2 h-4 w-4" /> Descargar
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm xl:col-span-8">
          <CardHeader>
            <CardTitle>Historial de reuniones</CardTitle>
            <CardDescription>Fecha, hora y acuerdos más recientes por reunión</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {meetings.length > 0 ? (
              meetings.map((meeting: any) => (
                <motion.div
                  key={meeting.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                  className="rounded-2xl border border-border/70 bg-background/80 p-4"
                  data-testid={`card-meeting-${meeting.id}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Reunión — {new Date(meeting.date).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary" className="rounded-full"><CalendarDays className="mr-1 h-3 w-3" />Registro</Badge>
                        {Array.isArray(meeting.agreements) && meeting.agreements.length > 0 && <Badge className="rounded-full bg-chart-4/20 text-foreground">Acuerdos</Badge>}
                        {meeting.notes && <Badge className="rounded-full bg-chart-1/20 text-foreground">Notas</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleExportMeetingPDF(meeting)} data-testid={`button-export-pdf-${meeting.id}`}>
                        <Download className="mr-2 h-4 w-4" />Informe
                      </Button>
                      {canDelete && (
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteMeeting(meeting.id)} data-testid={`button-delete-meeting-${meeting.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {Array.isArray(meeting.agreements) && meeting.agreements.length > 0 && (
                    <div className="mt-4" data-testid={`meeting-agreements-${meeting.id}`}>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acuerdos</h4>
                      <ul className="list-inside list-disc whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                        {meeting.agreements.slice(0, 3).map((agreement: any, idx: number) => (
                          <li key={`${meeting.id}-agreement-${idx}`}>{agreement.description}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {meeting.notes && (
                    <div className="mt-3" data-testid={`meeting-notes-${meeting.id}`}>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Apuntes</h4>
                      <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">{meeting.notes}</p>
                    </div>
                  )}

                  {!meeting.notes && (!Array.isArray(meeting.agreements) || meeting.agreements.length === 0) && (
                    <p className="py-3 text-center text-sm text-muted-foreground">No hay detalles de esta reunión</p>
                  )}
                </motion.div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-muted-foreground">No hay reuniones programadas para esta presidencia</div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm xl:col-span-4">
          <CardHeader>
            <CardTitle>Recursos</CardTitle>
            <CardDescription>Acceso rápido para presidencias</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => openResourcesModal("manuales")}
                className="rounded-2xl border border-border/70 bg-background/80 p-4 text-left"
              ><BookOpen className="mb-2 h-5 w-5 text-chart-1" /><p className="text-sm font-medium">Manuales</p></button>
              <button
                type="button"
                onClick={() => openResourcesModal("plantillas")}
                className="rounded-2xl border border-border/70 bg-background/80 p-4 text-left"
              ><FileText className="mb-2 h-5 w-5 text-chart-2" /><p className="text-sm font-medium">Plantillas</p></button>
              <button
                type="button"
                onClick={() => openResourcesModal("capacitacion")}
                className="rounded-2xl border border-border/70 bg-background/80 p-4 text-left"
              ><PlayCircle className="mb-2 h-5 w-5 text-chart-4" /><p className="text-sm font-medium">Capacitación</p></button>
              <button type="button" onClick={() => setIsBudgetRequestDialogOpen(true)} className="rounded-2xl border border-border/70 bg-background/80 p-4 text-left"><Wallet className="mb-2 h-5 w-5 text-chart-3" /><p className="text-sm font-medium">Presupuesto</p></button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
