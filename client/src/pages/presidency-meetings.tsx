import * as React from "react";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { useRoute, useLocation } from "wouter";
import {
  Plus,
  Download,
  ExternalLink,
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
  MessageCircle,
  Cake,
  UsersRound,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import {
  usePresidencyMeetings,
  useCreatePresidencyMeeting,
  useCreateAssignment,
  useCreateBudgetRequest,
  useOrganizations,
  useUsers,
  useBudgetRequests,
  useOrganizationBudgets,
  useOrganizationMembers,
  useActivities,
  useGoals,
  useOrganizationAttendanceByOrg,
  useOrganizationInterviews,
  usePresidencyResources,
  useAssignments,
  useBirthdays,
} from "@/hooks/use-api";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/auth-tokens";
import { downloadResourceFile, openResourceFileInBrowser } from "@/lib/resource-download";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatBirthdayMonthDay, getDaysUntilBirthday } from "@shared/birthday-utils";

const isPdfFile = (filename?: string) => filename?.toLowerCase().endsWith(".pdf") ?? false;

const buildUniqueTemplateName = (baseName: string) => {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  return `${baseName}-${stamp}`;
};

const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }

  navigate(path);
};

const meetingSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  location: z.string().optional(),
  openingPrayerBy: z.string().optional(),
  hasSpiritualThought: z.enum(["si", "no"]),
  spiritualThoughtBy: z.string().optional(),
  previousReviewPoints: z.string().optional(),
  topicsToDiscuss: z.string().optional(),
  keyPoints: z.string().optional(),
  closingHymn: z.string().optional(),
  closingPrayerBy: z.string().optional(),
  agenda: z.string().optional(),
  notes: z.string().optional(),
  agreementsText: z.string().optional(),
});

const FEMALE_ORG_TYPES = new Set(["sociedad_socorro", "primaria", "mujeres_jovenes"]);

const getPresidentRoleLabel = (organizationType?: string) =>
  FEMALE_ORG_TYPES.has(organizationType ?? "") ? "Presidenta" : "Presidente";

const getCounselorRoleLabel = (index: number, organizationType?: string) => {
  const isFemale = FEMALE_ORG_TYPES.has(organizationType ?? "");
  if (index === 0) return isFemale ? "Primera consejera" : "Primer consejero";
  if (index === 1) return isFemale ? "Segunda consejera" : "Segundo consejero";
  return isFemale ? "Consejera" : "Consejero";
};

const inferCounselorOrder = (
  callingName?: string | null,
  callingOrder?: number | null,
) => {
  // Fuente de verdad: el orden explícito capturado en Directorio (1 = primero, 2 = segundo).
  if (callingOrder === 1 || callingOrder === 2) return callingOrder;

  // Respaldo: cuando no hay orden numérico, inferirlo desde el nombre del llamamiento.
  const normalizedCalling = normalizeLeaderLookupKey(callingName);
  if (normalizedCalling.includes("primera") || normalizedCalling.includes("primer")) return 1;
  if (normalizedCalling.includes("segunda") || normalizedCalling.includes("segundo")) return 2;

  return undefined;
};

const normalizeLeaderLookupKey = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const budgetRequestSchema = z.object({
  description: z.string().min(1, "La descripción es requerida"),
  amount: z.string().min(1, "El monto es requerido"),
  category: z.enum(["actividades", "materiales", "otros"]),
  requestType: z.enum(["reembolso", "pago_adelantado"]),
  activityDate: z.string().min(1, "La fecha prevista es requerida"),
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
type MeetingReportFormValues = {
  reviewNotes: string;
  assignments: Array<{ title: string; description: string; assignedTo: string; dueDate: string }>;
  agreements: string;
  goalsReport: string;
};
const allowedDocumentExtensions = [".jpg", ".jpeg", ".pdf", ".doc", ".docx"];

const splitLines = (value?: string) =>
  (value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const parseAgendaSections = (agenda?: string) => {
  const lines = (agenda || "").split("\n");
  const sectionRegex = /^(LUGAR|ORACIÓN INICIAL|PENSAMIENTO ESPIRITUAL|REVISIÓN REUNIÓN ANTERIOR|TEMAS A TRATAR|PUNTOS IMPORTANTES|CIERRE):\s*(.*)$/i;
  const sections: Record<string, string[]> = {
    LUGAR: [],
    "ORACIÓN INICIAL": [],
    "PENSAMIENTO ESPIRITUAL": [],
    "REVISIÓN REUNIÓN ANTERIOR": [],
    "TEMAS A TRATAR": [],
    "PUNTOS IMPORTANTES": [],
    CIERRE: [],
  };

  let current: keyof typeof sections | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(sectionRegex);
    if (match) {
      const section = match[1].toUpperCase() as keyof typeof sections;
      current = section;
      if (match[2]) sections[section].push(match[2]);
      continue;
    }

    if (current) {
      sections[current].push(line.replace(/^[-•]\s*/, ""));
    }
  }

  return sections;
};

const buildStructuredAgenda = (values: MeetingFormValues) => {
  const date = new Date(values.date);
  const dateLabel = Number.isNaN(date.getTime())
    ? values.date
    : date.toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short" });
  const dayLabel = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("es-ES", { weekday: "long" });

  const previousReview = splitLines(values.previousReviewPoints);
  const topics = splitLines(values.topicsToDiscuss);
  const keyPoints = splitLines(values.keyPoints);
  const hasThought = values.hasSpiritualThought === "si";
  const closingByPrayer = !values.closingHymn?.trim();

  const lines = [
    `FECHA Y HORA: ${dateLabel}`,
    `DÍA: ${dayLabel || "Por definir"}`,
    `LUGAR: ${values.location?.trim() || "Por definir"}`,
    `ORACIÓN INICIAL: ${values.openingPrayerBy?.trim() || "Por definir"}`,
    `PENSAMIENTO ESPIRITUAL: ${hasThought ? `Sí — ${values.spiritualThoughtBy?.trim() || "Por definir"}` : "No"}`,
    "REVISIÓN REUNIÓN ANTERIOR:",
    ...(previousReview.length > 0 ? previousReview.map((item) => `- ${item}`) : ["- Sin puntos previos"]),
    "TEMAS A TRATAR:",
    ...(topics.length > 0 ? topics.map((item) => `- ${item}`) : ["- Sin temas definidos"]),
    "PUNTOS IMPORTANTES:",
    ...(keyPoints.length > 0 ? keyPoints.map((item) => `- ${item}`) : ["- Sin puntos importantes"]),
    "CIERRE:",
    ...(closingByPrayer
      ? [`- Oración final: ${values.closingPrayerBy?.trim() || "Por definir"}`]
      : [`- Himno final: ${values.closingHymn?.trim() || "Por definir"}`, `- Oración final: ${values.closingPrayerBy?.trim() || "Por definir"}`]),
  ];

  return lines.join("\n");
};

const BudgetCurrencyInput = ({ className, ...props }: ComponentProps<typeof Input>) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
    <Input
      type="number"
      step="0.01"
      min="0"
      inputMode="decimal"
      placeholder="0.00"
      className={["pl-8", className].filter(Boolean).join(" ")}
      {...props}
    />
  </div>
);

const formatCurrencyInputValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return trimmed;
  return parsed.toFixed(2);
};

const parseCurrencyInputValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  return Number.parseFloat(trimmed.replace(",", "."));
};

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

function MiniStatGauge({ value, centerLabel, color }: { value: number; centerLabel: string; color: string }) {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - normalized / 100);

  return (
    <div className="relative h-10 w-10 shrink-0" data-testid={`mini-gauge-${centerLabel}`}>
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="hsl(var(--muted) / 0.55)" strokeWidth="5" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground">
        {centerLabel}
      </span>
    </div>
  );
}

export default function PresidencyMeetingsPage() {
  const { user } = useAuth();
  const [, params] = useRoute("/presidency/:org");
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBudgetRequestDialogOpen, setIsBudgetRequestDialogOpen] = useState(false);
  const [isBudgetMovementsDialogOpen, setIsBudgetMovementsDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [leadersDialogOpen, setLeadersDialogOpen] = useState(false);
  const [leaderProfileDialogOpen, setLeaderProfileDialogOpen] = useState(false);
  const [selectedLeaderProfile, setSelectedLeaderProfile] = useState<any | null>(null);
  const [isResourcesModalOpen, setIsResourcesModalOpen] = useState(false);
  const [latestCreatedMeetingId, setLatestCreatedMeetingId] = useState<string | null>(null);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportMeeting, setReportMeeting] = useState<any | null>(null);
  const [selectedResourcesCategory, setSelectedResourcesCategory] = useState<"manuales" | "plantillas" | "capacitacion">("manuales");
  const [organizationId, setOrganizationId] = useState<string | undefined>();
  const [goalSlideIndex, setGoalSlideIndex] = useState(0);
  const [budgetSlideIndex, setBudgetSlideIndex] = useState(0);
  const goalDragStartX = React.useRef<number | null>(null);
  const budgetDragStartX = React.useRef<number | null>(null);

  const { data: organizations = [] } = useOrganizations();
  const { data: users = [] } = useUsers();
  const { data: meetings = [], isLoading } = usePresidencyMeetings(organizationId);
  const { data: budgetRequests = [] } = useBudgetRequests();
  const { data: goals = [] } = useGoals();
  const { data: organizationBudgets = [] } = useOrganizationBudgets(organizationId ?? "");
  const { data: organizationMembers = [] } = useOrganizationMembers(organizationId, { enabled: Boolean(organizationId) });
  const { data: activities = [] } = useActivities();
  const { data: assignments = [] } = useAssignments();
  const { data: birthdays = [] } = useBirthdays();
  const { data: sectionResources = [], isLoading: isLoadingSectionResources } = usePresidencyResources({
    organizationId,
    category: selectedResourcesCategory,
  });
  const { data: budgetTemplateResources = [] } = usePresidencyResources({
    organizationId,
    category: "plantillas",
  });

  const suggestedBudgetTemplate = useMemo(() => {
    if (!Array.isArray(budgetTemplateResources)) return undefined;
    return budgetTemplateResources.find((resource: any) => /presupuesto|budget|gasto|reembolso/i.test(`${resource.placeholderName ?? ""} ${resource.title ?? ""} ${resource.description ?? ""}`))
      ?? budgetTemplateResources.find((resource: any) => resource.resourceType !== "video")
      ?? budgetTemplateResources[0];
  }, [budgetTemplateResources]);

  const strictSectionResources = useMemo(
    () => sectionResources.filter((resource: any) => resource.category === selectedResourcesCategory),
    [sectionResources, selectedResourcesCategory]
  );
  const { data: attendance = [] } = useOrganizationAttendanceByOrg(organizationId);
  const { data: organizationInterviews = [] } = useOrganizationInterviews();
  const createMutation = useCreatePresidencyMeeting(organizationId);
  const createAssignmentMutation = useCreateAssignment();
  const createBudgetRequestMutation = useCreateBudgetRequest();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const isObispado = user?.role === "obispo" || user?.role === "consejero_obispo";
  const canCreate = !isOrgMember || organizationId === user?.organizationId;
  const canDelete = isObispado || isOrgMember;
  const assignableUsers = useMemo(
    () =>
      (users as any[]).filter(
        (member) =>
          member?.active !== false &&
          (!organizationId || member.organizationId === organizationId || isObispado)
      ),
    [users, organizationId, isObispado]
  );

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

  useEffect(() => {
    if (!latestCreatedMeetingId) return;

    const card = document.querySelector(`[data-testid="card-meeting-${latestCreatedMeetingId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      const timeoutId = window.setTimeout(() => setLatestCreatedMeetingId(null), 2600);
      return () => window.clearTimeout(timeoutId);
    }
  }, [latestCreatedMeetingId, meetings]);

  const orgName = params?.org ? organizationNames[params.org] || params.org : "Presidencia";
  const currentOrganization = organizations.find((org: any) => org.id === organizationId);
  const organizationType = currentOrganization?.type;
  const isLeadershipOnly = params?.org === "jas";
  const pageTitle = isLeadershipOnly ? `Liderazgo de ${orgName}` : `Presidencia de ${orgName}`;
  const meetingTitle = isLeadershipOnly ? "REUNIÓN DE LIDERAZGO" : "REUNIÓN DE PRESIDENCIA";

  const currentDate = new Date();
  const sundaysInMonth = useMemo(() => getSundaysForMonth(currentDate), [currentDate.getMonth(), currentDate.getFullYear()]);

  const leadership = useMemo(() => {
    const organizationUsers = (users as any[]).filter((member) => member.organizationId === organizationId);
    const orgMembersById = new Map(
      (organizationMembers as any[])
        .filter((member) => member?.id)
        .map((member) => [String(member.id), member]),
    );
    const orgMembersByName = new Map(
      (organizationMembers as any[])
        .filter((member) => member?.nameSurename)
        .map((member) => [normalizeLeaderLookupKey(String(member.nameSurename)), member]),
    );

    const hydrateLeader = (member: any) => {
      const directoryById = member?.memberId ? orgMembersById.get(String(member.memberId)) : undefined;
      const key = normalizeLeaderLookupKey(String(member?.name ?? ""));
      const directoryMember = directoryById ?? orgMembersByName.get(key);
      return {
        ...member,
        callingName: directoryMember?.callingName ?? member.callingName,
        callingOrder: directoryMember?.callingOrder ?? member.callingOrder,
      };
    };

    const presidents = organizationUsers
      .filter((member) => member.role === "presidente_organizacion")
      .map((member) => ({ ...hydrateLeader(member), roleLabel: getPresidentRoleLabel(organizationType) }));

    const counselorsWithCallings = organizationUsers
      .filter((member) => member.role === "consejero_organizacion")
      .map(hydrateLeader);

    const counselors = counselorsWithCallings
      .sort((a, b) => {
        const orderA = Number(inferCounselorOrder(a.callingName, a.callingOrder) ?? 999);
        const orderB = Number(inferCounselorOrder(b.callingName, b.callingOrder) ?? 999);
        if (orderA !== orderB) return orderA - orderB;
        return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es");
      })
      .map((member, index) => {
        const counselorOrder = inferCounselorOrder(member.callingName, member.callingOrder);
        const roleLabel = counselorOrder
          ? getCounselorRoleLabel(counselorOrder - 1, organizationType)
          : getCounselorRoleLabel(index, organizationType);
        return { ...member, roleLabel };
      });

    const leaders = [...presidents, ...counselors];
    const visibleLeaders = leaders.slice(0, 3);
    const hiddenLeaders = leaders.slice(3);

    return { leaders, visibleLeaders, hiddenLeaders };
  }, [organizationId, organizationMembers, organizationType, users]);

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
    const reportedWeekKeys = new Set(
      attendanceInMonth
        .filter((entry: any) => Number(entry.attendeesCount ?? 0) > 0)
        .map((entry: any) => String(entry.weekKey ?? String(entry.weekStartDate ?? "").slice(0, 10)))
    );
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

    const yearInterviews = (organizationInterviews as any[]).filter((item: any) => {
      if (item.organizationId !== organizationId) return false;
      const interviewDate = new Date(item.date);
      return !Number.isNaN(interviewDate.getTime()) && interviewDate.getFullYear() === currentYear;
    });
    const completedYearInterviews = yearInterviews.filter((item: any) => String(item.status ?? "").toLowerCase() === "completada").length;
    const annualInterviewGoal = organizationMembers.length;
    const interviewProgressPercent = annualInterviewGoal > 0
      ? Math.min(100, (completedYearInterviews / annualInterviewGoal) * 100)
      : 0;
    const pendingInterviewsCount = Math.max(0, annualInterviewGoal - completedYearInterviews);

    const organizationAssignments = (assignments as any[]).filter((assignment: any) => assignment.organizationId === organizationId);
    const pendingAssignmentsCount = organizationAssignments.filter((assignment: any) => ["pendiente", "en_proceso"].includes(String(assignment.status ?? ""))).length;
    const completedAssignmentsCount = organizationAssignments.filter((assignment: any) => assignment.status === "completada" || assignment.resolution === "completada").length;
    const assignmentsTotal = pendingAssignmentsCount + completedAssignmentsCount;
    const assignmentsCompletionPercent = assignmentsTotal > 0
      ? Math.min(100, (completedAssignmentsCount / assignmentsTotal) * 100)
      : 0;

    const nowDate = new Date();
    const organizationBirthdays = (birthdays as any[])
      .filter((birthday: any) => birthday.organizationId === organizationId)
      .map((birthday: any) => ({
        ...birthday,
        daysUntil: getDaysUntilBirthday(birthday.birthDate),
      }))
      .sort((a: any, b: any) => a.daysUntil - b.daysUntil);
    const upcomingBirthday = organizationBirthdays.find((birthday: any) => birthday.daysUntil >= 0);
    const birthdaysThisMonth = organizationBirthdays.filter((birthday: any) => {
      const date = new Date(birthday.birthDate);
      return !Number.isNaN(date.getTime()) && date.getMonth() === nowDate.getMonth();
    }).length;

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
      interviewProgressPercent,
      pendingInterviewsCount,
      pendingAssignmentsCount,
      completedAssignmentsCount,
      assignmentsCompletionPercent,
      upcomingBirthday,
      birthdaysThisMonth,
      latestMeeting,
      budgetSlides,
    };
  }, [activities, assignments, attendance, birthdays, budgetRequests, goals, meetings, organizationBudgets, organizationId, organizationInterviews, organizationMembers.length, sundaysInMonth.length]);

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
      location: "",
      openingPrayerBy: "",
      hasSpiritualThought: "no",
      spiritualThoughtBy: "",
      previousReviewPoints: "",
      topicsToDiscuss: "",
      keyPoints: "",
      closingHymn: "",
      closingPrayerBy: "",
      agenda: "",
      notes: "",
      agreementsText: "",
    },
  });

  const reportForm = useForm<MeetingReportFormValues>({
    defaultValues: {
      reviewNotes: "",
      assignments: [{ title: "", description: "", assignedTo: "", dueDate: "" }],
      agreements: "",
      goalsReport: "",
    },
  });

  const budgetRequestForm = useForm<BudgetRequestFormValues>({
    resolver: zodResolver(budgetRequestSchema),
    defaultValues: {
      description: "",
      amount: "",
      category: "otros",
      requestType: "pago_adelantado",
      activityDate: "",
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

    const structuredAgenda = buildStructuredAgenda(data);

    createMutation.mutate(
      {
        date: data.date,
        organizationId,
        agenda: structuredAgenda,
        agreements,
        notes: data.notes || "",
      },
      {
        onSuccess: (createdMeeting: any) => {
          setIsDialogOpen(false);
          form.reset();
          setLatestCreatedMeetingId(createdMeeting?.id ?? null);
          toast({
            title: "Reunión creada",
            description: "La reunión fue creada. Usa el botón 'Registrar informe' en la tarjeta para completar el informe.",
          });
        },
      }
    );
  };

  const openMeetingReport = (meeting: any) => {
    const sections = parseAgendaSections(meeting.agenda);
    setReportMeeting(meeting);
    reportForm.reset({
      reviewNotes: sections["REVISIÓN REUNIÓN ANTERIOR"].join("\n"),
      assignments: [{ title: "", description: "", assignedTo: "", dueDate: "" }],
      agreements: "",
      goalsReport: "",
    });
    setIsReportDialogOpen(true);
  };

  const addReportAssignmentRow = () => {
    const current = reportForm.getValues("assignments") || [];
    reportForm.setValue("assignments", [...current, { title: "", description: "", assignedTo: "", dueDate: "" }]);
  };

  const removeReportAssignmentRow = (index: number) => {
    const current = reportForm.getValues("assignments") || [];
    reportForm.setValue("assignments", current.filter((_, idx) => idx !== index));
  };

  const onSubmitMeetingReport = async (values: MeetingReportFormValues) => {
    if (!reportMeeting) return;

    const assignmentsToCreate = (values.assignments || []).filter((assignment) => assignment.title.trim() && assignment.assignedTo);

    for (const assignment of assignmentsToCreate) {
      await createAssignmentMutation.mutateAsync({
        title: assignment.title.trim(),
        description: assignment.description?.trim() || "",
        assignedTo: assignment.assignedTo,
        dueDate: assignment.dueDate || undefined,
        relatedTo: `presidency_meeting:${reportMeeting.id}`,
        silent: true,
      });
    }

    const existingNotes = reportMeeting.notes?.trim();
    const reportSummary = [
      "INFORME DE REUNIÓN",
      values.reviewNotes?.trim() ? `\nRevisión de reunión anterior:\n${values.reviewNotes.trim()}` : "",
      values.agreements?.trim() ? `\nAcuerdos:\n${values.agreements.trim()}` : "",
      values.goalsReport?.trim() ? `\nInforme de metas:\n${values.goalsReport.trim()}` : "",
      assignmentsToCreate.length > 0
        ? `\nAsignaciones creadas:\n${assignmentsToCreate.map((item, index) => `${index + 1}. ${item.title}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");

    const mergedNotes = [existingNotes, reportSummary].filter(Boolean).join("\n\n---\n\n");
    const mergedAgreements = [
      ...(Array.isArray(reportMeeting.agreements) ? reportMeeting.agreements : []),
      ...splitLines(values.agreements).map((description) => ({ description, responsible: "Por definir" })),
    ];

    await apiRequest("PUT", `/api/presidency-meetings/${reportMeeting.id}`, {
      notes: mergedNotes,
      agreements: mergedAgreements,
    });

    queryClient.invalidateQueries({ queryKey: ["/api/presidency-meetings", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    setIsReportDialogOpen(false);
    setReportMeeting(null);
    toast({ title: "Informe guardado", description: "Se guardó el informe y se crearon las asignaciones." });
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

    const parsedAmount = parseCurrencyInputValue(values.amount);
    if (!Number.isFinite(parsedAmount)) {
      toast({
        title: "Monto inválido",
        description: "Ingresa un monto válido. Puedes usar coma o punto para decimales.",
        variant: "destructive",
      });
      return;
    }

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
        amount: parsedAmount,
        category: values.category,
        notes: values.notes || "",
        activityDate: values.activityDate ? new Date(`${values.activityDate}T00:00:00`) : null,
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear reunión de presidencia</DialogTitle>
            <DialogDescription>Registra la reunión de presidencia de {orgName}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha y hora</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} data-testid="input-date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lugar</FormLabel>
                  <FormControl><Input placeholder="Salón de presidencia" {...field} data-testid="input-location" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="openingPrayerBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Primera oración (quién la hará)</FormLabel>
                  <FormControl><Input placeholder="Nombre" {...field} data-testid="input-opening-prayer-by" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="hasSpiritualThought" render={({ field }) => (
                <FormItem>
                  <FormLabel>¿Habrá pensamiento espiritual?</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-spiritual-thought"><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="si">Sí</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {form.watch("hasSpiritualThought") === "si" && (
                <FormField control={form.control} name="spiritualThoughtBy" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pensamiento espiritual (quién lo hará)</FormLabel>
                    <FormControl><Input placeholder="Nombre" {...field} data-testid="input-spiritual-thought-by" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="previousReviewPoints" render={({ field }) => (
                <FormItem>
                  <FormLabel>Puntos a revisar de la reunión anterior (uno por línea)</FormLabel>
                  <FormControl><Textarea placeholder="Seguimiento acuerdo 1" {...field} data-testid="textarea-previous-review" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="topicsToDiscuss" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temas a tratar (uno por línea)</FormLabel>
                  <FormControl><Textarea placeholder="Tema 1" {...field} data-testid="textarea-topics" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="keyPoints" render={({ field }) => (
                <FormItem>
                  <FormLabel>Puntos importantes (uno por línea)</FormLabel>
                  <FormControl><Textarea placeholder="Punto importante 1" {...field} data-testid="textarea-key-points" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="closingHymn" render={({ field }) => (
                <FormItem>
                  <FormLabel>Último himno (opcional)</FormLabel>
                  <FormControl><Input placeholder="Himno #" {...field} data-testid="input-closing-hymn" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="closingPrayerBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Última oración</FormLabel>
                  <FormControl><Input placeholder="Nombre" {...field} data-testid="input-closing-prayer-by" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="agenda" render={({ field }) => (
                <FormItem>
                  <FormLabel>Agenda generada</FormLabel>
                  <FormControl><Textarea placeholder="La agenda se genera automáticamente" {...field} data-testid="textarea-agenda" disabled /></FormControl>
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

      <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Informe de la reunión</DialogTitle>
            <DialogDescription>Registra acuerdos, metas y asignaciones de la reunión seleccionada.</DialogDescription>
          </DialogHeader>

          <Form {...reportForm}>
            <form onSubmit={reportForm.handleSubmit(onSubmitMeetingReport)} className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-sm font-medium">Puntos de agenda</p>
                <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{reportMeeting?.agenda || "Sin agenda registrada"}</p>
              </div>

              <FormField control={reportForm.control} name="reviewNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Revisión de reunión anterior</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Resultados del seguimiento" data-testid="textarea-report-review" /></FormControl>
                </FormItem>
              )} />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Asignaciones de esta reunión</p>
                  <Button type="button" variant="outline" size="sm" onClick={addReportAssignmentRow} data-testid="button-add-report-assignment">Agregar asignación</Button>
                </div>

                {(reportForm.watch("assignments") || []).map((_, index) => (
                  <div key={`report-assignment-${index}`} className="grid gap-2 rounded-xl border border-border/70 p-3 md:grid-cols-2">
                    <FormField control={reportForm.control} name={`assignments.${index}.title`} render={({ field }) => (
                      <FormItem><FormLabel>Título</FormLabel><FormControl><Input {...field} data-testid={`input-report-assignment-title-${index}`} /></FormControl></FormItem>
                    )} />
                    <FormField control={reportForm.control} name={`assignments.${index}.assignedTo`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Asignado a</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid={`select-report-assigned-to-${index}`}><SelectValue placeholder="Selecciona miembro" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {assignableUsers.map((member: any) => (
                              <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={reportForm.control} name={`assignments.${index}.description`} render={({ field }) => (
                      <FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea {...field} data-testid={`textarea-report-assignment-description-${index}`} /></FormControl></FormItem>
                    )} />
                    <FormField control={reportForm.control} name={`assignments.${index}.dueDate`} render={({ field }) => (
                      <FormItem><FormLabel>Fecha límite</FormLabel><FormControl><Input type="datetime-local" {...field} data-testid={`input-report-assignment-due-date-${index}`} /></FormControl></FormItem>
                    )} />
                    {(reportForm.watch("assignments") || []).length > 1 && (
                      <div className="md:col-span-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeReportAssignmentRow(index)} data-testid={`button-remove-report-assignment-${index}`}>Eliminar</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <FormField control={reportForm.control} name="agreements" render={({ field }) => (
                <FormItem>
                  <FormLabel>Acuerdos (uno por línea)</FormLabel>
                  <FormControl><Textarea {...field} data-testid="textarea-report-agreements" /></FormControl>
                </FormItem>
              )} />

              <FormField control={reportForm.control} name="goalsReport" render={({ field }) => (
                <FormItem>
                  <FormLabel>Informe de metas</FormLabel>
                  <FormControl><Textarea {...field} data-testid="textarea-report-goals" /></FormControl>
                </FormItem>
              )} />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsReportDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createAssignmentMutation.isPending} data-testid="button-save-meeting-report">Guardar informe</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="mt-3 grid grid-cols-2 gap-3 md:gap-4 lg:hidden">
        <div
          className="col-span-1 flex min-h-[220px] flex-col rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm"
          data-testid="card-org-leaders-mobile"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Líderes de la organización</p>
            <UsersRound className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="mt-3 space-y-2">
            {leadership.visibleLeaders.length > 0 ? leadership.visibleLeaders.map((leader: any) => {
              const displayName = String(leader.name ?? "Sin nombre").trim() || "Sin nombre";
              return (
                <button
                  key={`leader-mobile-${leader.id}`}
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    setSelectedLeaderProfile(leader);
                    setLeaderProfileDialogOpen(true);
                  }}
                >
                  <p className="text-sm font-semibold leading-tight hover:underline">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{leader.roleLabel}</p>
                </button>
              );
            }) : (
              <p className="text-sm text-muted-foreground">No hay líderes asignados todavía.</p>
            )}
          </div>
        </div>

        <div className="col-span-1 grid gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => navigateWithTransition(setLocation, `/birthdays?from=presidency-panel&orgSlug=${params?.org ?? ""}&orgId=${organizationId ?? ""}`)}
            className="rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card"
            data-testid="button-org-birthdays-card-mobile"
          >
            <p className="text-xs text-muted-foreground">Cumpleaños de la organización</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xl font-semibold">{dashboardStats.upcomingBirthday ? `${dashboardStats.upcomingBirthday.daysUntil} días` : "Sin próximos"}</p>
              <Cake className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {dashboardStats.upcomingBirthday
                ? `${dashboardStats.upcomingBirthday.name} · ${formatBirthdayMonthDay(dashboardStats.upcomingBirthday.birthDate)}`
                : "No hay cumpleaños cargados"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{dashboardStats.birthdaysThisMonth} este mes</p>
          </button>

          <button
            type="button"
            onClick={() => navigateWithTransition(setLocation, `/assignments?from=presidency-panel&orgSlug=${params?.org ?? ""}&orgId=${organizationId ?? ""}`)}
            className="rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card"
            data-testid="button-org-assignments-progress-card-mobile"
          >
            <p className="text-xs text-muted-foreground">Asignaciones pendientes</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-2xl font-semibold">{Math.round(dashboardStats.assignmentsCompletionPercent)}%</p>
              <MiniStatGauge
                value={dashboardStats.assignmentsCompletionPercent}
                centerLabel={String(dashboardStats.pendingAssignmentsCount)}
                color="hsl(var(--chart-3))"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Pendientes: {dashboardStats.pendingAssignmentsCount}</p>
            <p className="text-xs text-muted-foreground">Completadas: {dashboardStats.completedAssignmentsCount}</p>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:hidden">
        <div className="col-span-1 flex flex-col gap-3 md:gap-4">
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
          className="col-span-1 flex h-full min-h-[220px] flex-col justify-between overflow-hidden rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card"
          data-testid="button-presidency-meetings-overview"
        >
          <div>
            <p className="text-xs text-muted-foreground">Reuniones de presidencia</p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="text-2xl font-semibold">{Math.round(dashboardStats.monthMeetingProgress)}%</p>
              <MiniStatGauge
                value={dashboardStats.monthMeetingProgress}
                centerLabel={String(dashboardStats.monthMeetings)}
                color="hsl(var(--chart-1))"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Entrevistas</p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="text-2xl font-semibold">{Math.round(dashboardStats.interviewProgressPercent)}%</p>
              <MiniStatGauge
                value={dashboardStats.interviewProgressPercent}
                centerLabel={String(dashboardStats.pendingInterviewsCount)}
                color="hsl(var(--chart-2))"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Asistencia a clases</p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="text-2xl font-semibold">{Math.round(dashboardStats.monthlyAttendancePercent)}%</p>
              <MiniStatGauge
                value={dashboardStats.monthlyAttendancePercent}
                centerLabel={String(Math.round(dashboardStats.averageWeeklyAttendance))}
                color="hsl(var(--chart-4))"
              />
            </div>
          </div>
        </button>
      </div>

      <div className="hidden gap-3 md:gap-4 lg:grid lg:grid-cols-12">
        <Dialog open={leadersDialogOpen} onOpenChange={setLeadersDialogOpen}>
          <div
            className="flex min-h-[220px] flex-col rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm lg:col-span-6 lg:min-h-[260px]"
            data-testid="card-org-leaders"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Líderes de la organización</p>
              <UsersRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-3 space-y-2">
              {leadership.visibleLeaders.length > 0 ? leadership.visibleLeaders.map((leader: any) => {
                const displayName = String(leader.name ?? "Sin nombre").trim() || "Sin nombre";
                return (
                  <button
                    key={leader.id}
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      setSelectedLeaderProfile(leader);
                      setLeaderProfileDialogOpen(true);
                    }}
                  >
                    <p className="text-sm font-semibold leading-tight hover:underline">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{leader.roleLabel}</p>
                  </button>
                );
              }) : (
                <p className="text-sm text-muted-foreground">No hay líderes asignados todavía.</p>
              )}
            </div>
            {leadership.hiddenLeaders.length > 0 && (
              <button type="button" className="mt-auto pt-3 text-left text-xs text-muted-foreground hover:underline" onClick={() => setLeadersDialogOpen(true)}>+{leadership.hiddenLeaders.length} líderes más</button>
            )}
          </div>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Líderes de {orgName}</DialogTitle>
              <DialogDescription>Presidencia y consejeros asignados</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {leadership.leaders.length > 0 ? leadership.leaders.map((leader: any) => {
                const displayName = String(leader.name ?? "Sin nombre").trim() || "Sin nombre";
                const initials = displayName
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part: string) => part[0]?.toUpperCase())
                  .join("") || "?";
                return (
                  <div key={`leader-modal-${leader.id}`} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-border/60">
                        <AvatarImage src={leader.avatarUrl ?? undefined} alt={displayName} />
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{displayName}</p>
                        <p className="text-xs text-muted-foreground">{leader.roleLabel}</p>
                      </div>
                    </div>
                  </div>
                );
              }) : <p className="text-sm text-muted-foreground">No hay líderes registrados en esta organización.</p>}
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid gap-3 md:gap-4 lg:col-span-6">
          <button
            type="button"
            onClick={() => navigateWithTransition(setLocation, `/birthdays?from=presidency-panel&orgSlug=${params?.org ?? ""}&orgId=${organizationId ?? ""}`)}
            className="rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card"
            data-testid="button-org-birthdays-card"
          >
            <p className="text-xs text-muted-foreground">Cumpleaños de la organización</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xl font-semibold">{dashboardStats.upcomingBirthday ? `${dashboardStats.upcomingBirthday.daysUntil} días` : "Sin próximos"}</p>
              <Cake className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {dashboardStats.upcomingBirthday
                ? `${dashboardStats.upcomingBirthday.name} · ${formatBirthdayMonthDay(dashboardStats.upcomingBirthday.birthDate)}`
                : "No hay cumpleaños cargados"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{dashboardStats.birthdaysThisMonth} este mes</p>
          </button>

          <button
            type="button"
            onClick={() => navigateWithTransition(setLocation, `/assignments?from=presidency-panel&orgSlug=${params?.org ?? ""}&orgId=${organizationId ?? ""}`)}
            className="rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card"
            data-testid="button-org-assignments-progress-card"
          >
            <p className="text-xs text-muted-foreground">Asignaciones pendientes</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-2xl font-semibold">{Math.round(dashboardStats.assignmentsCompletionPercent)}%</p>
              <MiniStatGauge
                value={dashboardStats.assignmentsCompletionPercent}
                centerLabel={String(dashboardStats.pendingAssignmentsCount)}
                color="hsl(var(--chart-3))"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Pendientes: {dashboardStats.pendingAssignmentsCount}</p>
            <p className="text-xs text-muted-foreground">Completadas: {dashboardStats.completedAssignmentsCount}</p>
          </button>
        </div>

        <div className="col-span-1 flex flex-col gap-3 md:gap-4 lg:col-span-6 lg:flex lg:flex-col">
          <button type="button" onClick={() => setMembersDialogOpen(true)} className="rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card" data-testid="button-org-members-card-desktop">
            <p className="text-xs text-muted-foreground">Miembros de la organización</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-2xl font-semibold md:text-3xl">{dashboardStats.membersCount}</p>
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
          </button>

          <button type="button" onClick={() => setLocation(`/calendar?org=${params?.org ?? ""}`)} className="rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card" data-testid="button-org-calendar-card-desktop">
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
          className="col-span-1 flex h-full min-h-[220px] flex-col justify-between overflow-hidden rounded-3xl border border-border/70 bg-card/90 p-4 text-left shadow-sm transition-colors hover:bg-card lg:col-span-6"
          data-testid="button-presidency-meetings-overview-desktop"
        >
          <div>
            <p className="text-xs text-muted-foreground">Reuniones de presidencia</p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="text-2xl font-semibold">{Math.round(dashboardStats.monthMeetingProgress)}%</p>
              <MiniStatGauge
                value={dashboardStats.monthMeetingProgress}
                centerLabel={String(dashboardStats.monthMeetings)}
                color="hsl(var(--chart-1))"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Entrevistas</p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="text-2xl font-semibold">{Math.round(dashboardStats.interviewProgressPercent)}%</p>
              <MiniStatGauge
                value={dashboardStats.interviewProgressPercent}
                centerLabel={String(dashboardStats.pendingInterviewsCount)}
                color="hsl(var(--chart-2))"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Asistencia a clases</p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="text-2xl font-semibold">{Math.round(dashboardStats.monthlyAttendancePercent)}%</p>
              <MiniStatGauge
                value={dashboardStats.monthlyAttendancePercent}
                centerLabel={String(Math.round(dashboardStats.averageWeeklyAttendance))}
                color="hsl(var(--chart-4))"
              />
            </div>
          </div>
        </button>
      </div>

      <Dialog open={leaderProfileDialogOpen} onOpenChange={setLeaderProfileDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Perfil de líder</DialogTitle>
            <DialogDescription>Información de contacto y llamamiento</DialogDescription>
          </DialogHeader>
          {selectedLeaderProfile ? (() => {
            const displayName = String(selectedLeaderProfile.name ?? "Sin nombre").trim() || "Sin nombre";
            const initials = displayName
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part: string) => part[0]?.toUpperCase())
              .join("") || "?";
            const phoneDigits = String(selectedLeaderProfile.phone ?? "").replace(/[^\d]/g, "");
            const phoneHref = phoneDigits ? `tel:${phoneDigits}` : undefined;
            const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits}` : undefined;
            const mailHref = selectedLeaderProfile.email ? `mailto:${selectedLeaderProfile.email}` : undefined;

            return (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-fit">
                  <Avatar className="h-24 w-24 border border-border/70">
                    <AvatarImage src={selectedLeaderProfile.avatarUrl ?? undefined} alt={displayName} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </div>
                <div>
                  <p className="text-lg font-semibold">{displayName}</p>
                  <p className="text-sm text-muted-foreground">{selectedLeaderProfile.roleLabel}</p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <a href={phoneHref} className="inline-flex items-center gap-1 rounded-md border border-border/70 px-3 py-2 text-sm hover:bg-muted/30">
                    <Phone className="h-4 w-4" /> Llamar
                  </a>
                  <a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border/70 px-3 py-2 text-sm hover:bg-muted/30">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                  <a href={mailHref} className="inline-flex items-center gap-1 rounded-md border border-border/70 px-3 py-2 text-sm hover:bg-muted/30">
                    <Mail className="h-4 w-4" /> Correo
                  </a>
                </div>
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-2">

        <Card className="flex h-full flex-col rounded-3xl border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Metas de organización</CardTitle>
            <CardDescription>Seguimiento del cumplimiento mensual</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-5 pb-5 pt-1 sm:px-4 sm:pb-4 sm:pt-0"
            onPointerDown={(event) => { goalDragStartX.current = event.clientX; }}
            onPointerUp={(event) => handleSwipe(goalDragStartX.current, event.clientX, () => moveGoalSlide("prev"), () => moveGoalSlide("next"))}
            onTouchStart={(event) => { goalDragStartX.current = getTouchStartX(event); }}
            onTouchEnd={(event) => handleSwipe(goalDragStartX.current, getTouchEndX(event), () => moveGoalSlide("prev"), () => moveGoalSlide("next"))}
          >
            <div className="mb-2 flex items-baseline gap-2 pt-1">
              <span className="text-4xl font-bold leading-none">{Math.round(goalSlideIndex === 0 ? dashboardStats.goalProgress : (activeGoal?.percentage ?? 0))}%</span>
              <span className="text-base font-medium text-muted-foreground">Metas cumplidas</span>
            </div>
            <div className="mt-4 sm:mt-3">
              <CircularGauge
              value={goalSlideIndex === 0 ? dashboardStats.goalProgress : (activeGoal?.percentage ?? 0)}
              label={`${Math.round(goalSlideIndex === 0 ? dashboardStats.goalProgress : (activeGoal?.percentage ?? 0))}%`}
              subtitle={goalSlideIndex === 0 ? "Avance total" : (activeGoal?.title || "Metas cumplidas")}
              gradientId="goals"
              gradientStops={activeGoalGradient}
              segments={goalSlideIndex === 0 ? goalSummarySegments : undefined}
            />
            </div>
            <div className="mt-3 text-center text-sm text-muted-foreground">
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
            <Button className="mt-5 w-full rounded-full lg:mt-auto" variant="secondary" onClick={() => navigateWithTransition(setLocation, `/goals?tab=organizacion&org=${params?.org ?? ""}`)} data-testid="button-goals-from-gauge">+ Ver metas</Button>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col rounded-3xl border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Presupuesto de organización</CardTitle>
            <CardDescription>Uso del trimestre actual</CardDescription>
          </CardHeader>
          <CardContent
            className="flex flex-1 flex-col px-5 pb-5 pt-1 sm:px-4 sm:pb-4 sm:pt-0"
            onPointerDown={(event) => { budgetDragStartX.current = event.clientX; }}
            onPointerUp={(event) => handleSwipe(budgetDragStartX.current, event.clientX, () => moveBudgetSlide("prev"), () => moveBudgetSlide("next"))}
            onTouchStart={(event) => { budgetDragStartX.current = getTouchStartX(event); }}
            onTouchEnd={(event) => handleSwipe(budgetDragStartX.current, getTouchEndX(event), () => moveBudgetSlide("prev"), () => moveBudgetSlide("next"))}
          >
            <div className="mb-2 pt-1">
              <p className="text-4xl font-bold leading-none">{Math.round(activeBudgetSlide?.percentage ?? dashboardStats.budgetUsage)}% usado</p>
              <p className="mt-1 text-lg font-medium">€{(activeBudgetSlide?.amount ?? dashboardStats.spentBudget).toFixed(2)} usados</p>
              <p className="text-sm text-muted-foreground">de €{dashboardStats.assignedBudget.toFixed(2)}</p>
            </div>
            <div className="mt-4 sm:mt-3">
              <CircularGauge
              value={activeBudgetSlide?.percentage ?? dashboardStats.budgetUsage}
              label={`€${(activeBudgetSlide?.amount ?? dashboardStats.spentBudget).toFixed(0)}`}
              subtitle={`${activeBudgetSlide?.title ?? "usados"}`}
              gradientId="budget"
              gradientStops={activeBudgetSlide?.gradientStops}
            />
            </div>
            <div className="mt-4 flex justify-center gap-2" data-testid="budget-dots">
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Solicitar presupuesto</DialogTitle>
            <DialogDescription>Completa la solicitud con el monto y categoría.</DialogDescription>
          </DialogHeader>
          <Form {...budgetRequestForm}>
            <form onSubmit={budgetRequestForm.handleSubmit(onSubmitBudgetRequest)} className="space-y-4">
              {suggestedBudgetTemplate && suggestedBudgetTemplate.resourceType !== "video" && (
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                  <p className="text-sm font-medium">Plantilla recomendada para solicitud</p>
                  <p className="text-xs text-muted-foreground">Descárgala y complétala antes de enviar la solicitud para evitar errores.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={async () => {
                      try {
                        const uniqueName = buildUniqueTemplateName(suggestedBudgetTemplate.placeholderName || suggestedBudgetTemplate.title || "plantilla-presupuesto");
                        await downloadResourceFile(suggestedBudgetTemplate.fileUrl, uniqueName, suggestedBudgetTemplate.fileName);
                      } catch {
                        toast({
                          title: "Error",
                          description: "No se pudo descargar la plantilla recomendada.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" /> Descargar plantilla
                  </Button>
                </div>
              )}

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
                  <FormControl>
                    <BudgetCurrencyInput
                      {...field}
                      onBlur={(event) => {
                        field.onChange(formatCurrencyInputValue(event.target.value));
                        field.onBlur();
                      }}
                      data-testid="input-budget-request-amount"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Ingresa el monto con decimales (ej: 125.50).</p>
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

              <FormField control={budgetRequestForm.control} name="activityDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha prevista de la actividad o gasto</FormLabel>
                  <FormControl><Input type="date" {...field} data-testid="input-budget-request-activity-date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!(isMobile && isPdfFile(resource.fileName)) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await openResourceFileInBrowser(resource.fileUrl, resource.placeholderName || resource.title, resource.fileName);
                          } catch {
                            toast({
                              title: "Error",
                              description: "No se pudo abrir el recurso.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" /> Abrir
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await downloadResourceFile(resource.fileUrl, resource.placeholderName || resource.title, resource.fileName);
                        } catch {
                          toast({
                            title: "Error",
                            description: "No se pudo descargar el recurso.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" /> Descargar
                    </Button>
                  </div>
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
                  className={`rounded-2xl border bg-background/80 p-4 transition-all ${latestCreatedMeetingId === meeting.id ? "border-primary ring-2 ring-primary/30" : "border-border/70"}`}
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
                      <Button
                        size="sm"
                        variant={latestCreatedMeetingId === meeting.id ? "default" : "secondary"}
                        onClick={() => openMeetingReport(meeting)}
                        data-testid={`button-meeting-report-${meeting.id}`}
                      >
                        Registrar informe
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

                  {meeting.agenda && (
                    <div className="mt-3" data-testid={`meeting-agenda-${meeting.id}`}>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda</h4>
                      <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">{meeting.agenda}</p>
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
