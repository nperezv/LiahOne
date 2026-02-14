import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarDays, Check, ChevronDown, Mail, MessageCircle, Phone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  useOrganizations,
  useOrganizationMembers,
  useOrganizationAttendanceByOrg,
  useUpsertOrganizationAttendance,
  usePresidencyMeetings,
  useCreatePresidencyMeeting,
  useUsers,
  useAllMemberCallings,
  useOrganizationInterviews,
  useAssignments,
  useBirthdays,
} from "@/hooks/use-api";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCallingLabel } from "@/lib/callings";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

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

type MeetingFormValues = z.infer<typeof meetingSchema>;

const splitLines = (value?: string) =>
  (value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

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

  return [
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
  ].join("\n");
};

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

const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }

  navigate(path);
};

const FEMALE_ORG_TYPES = new Set(["sociedad_socorro", "primaria", "mujeres_jovenes"]);

const getPresidentRoleLabel = (organizationType?: string) =>
  FEMALE_ORG_TYPES.has(organizationType ?? "") ? "Presidenta" : "Presidente";

const getCounselorRoleLabel = (index: number, organizationType?: string) => {
  const isFemale = FEMALE_ORG_TYPES.has(organizationType ?? "");
  if (index === 0) return isFemale ? "Primera consejera" : "Primer consejero";
  if (index === 1) return isFemale ? "Segunda consejera" : "Segundo consejero";
  return isFemale ? "Consejera" : "Consejero";
};

const inferCounselorOrder = (callingName?: string | null, callingOrder?: number | null) => {
  if (callingOrder === 1 || callingOrder === 2) return callingOrder;
  const normalized = callingName?.trim().toLowerCase() ?? "";
  if (normalized.includes("primera") || normalized.includes("primer")) return 1;
  if (normalized.includes("segunda") || normalized.includes("segundo")) return 2;
  return undefined;
};

const getSecretaryRoleLabel = (organizationType?: string) =>
  FEMALE_ORG_TYPES.has(organizationType ?? "") ? "Secretaria" : "Secretario";

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];


export default function PresidencyManageOrganizationPage() {
  const [, params] = useRoute("/presidency/:org/manage");
  const [, setLocation] = useLocation();
  const [organizationId, setOrganizationId] = useState<string | undefined>();
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, string[]>>({});
  const [attendanceEditorDate, setAttendanceEditorDate] = useState<string | null>(null);
  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState(false);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
    leadership: false,
    meetings: false,
    interviews: false,
    attendance: false,
    assignments: false,
    birthdays: false,
  });
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: organizations = [] } = useOrganizations();
  const { data: users = [] } = useUsers();
  const { data: allMemberCallings = [] } = useAllMemberCallings({ enabled: Boolean(organizationId) });
  const { data: meetings = [], isLoading: meetingsLoading } = usePresidencyMeetings(organizationId);
  const { data: organizationMembers = [], isLoading: membersLoading } = useOrganizationMembers(organizationId, { enabled: Boolean(organizationId) });
  const { data: attendance = [] } = useOrganizationAttendanceByOrg(organizationId);
  const { data: organizationInterviews = [] } = useOrganizationInterviews();
  const { data: assignments = [] } = useAssignments();
  const { data: birthdays = [] } = useBirthdays();
  const createMutation = useCreatePresidencyMeeting(organizationId);
  const upsertAttendanceMutation = useUpsertOrganizationAttendance();

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

  const watchedMeetingValues = form.watch();

  useEffect(() => {
    const generatedAgenda = buildStructuredAgenda(watchedMeetingValues);
    form.setValue("agenda", generatedAgenda, { shouldDirty: false, shouldValidate: false });
  }, [
    form,
    watchedMeetingValues.date,
    watchedMeetingValues.location,
    watchedMeetingValues.openingPrayerBy,
    watchedMeetingValues.hasSpiritualThought,
    watchedMeetingValues.spiritualThoughtBy,
    watchedMeetingValues.previousReviewPoints,
    watchedMeetingValues.topicsToDiscuss,
    watchedMeetingValues.keyPoints,
    watchedMeetingValues.closingHymn,
    watchedMeetingValues.closingPrayerBy,
  ]);

  useEffect(() => {
    if (params?.org && organizations.length > 0) {
      const slug = organizationSlugs[params.org];
      const org = organizations.find((o: any) => o.type === slug);
      setOrganizationId(org?.id);
    }
  }, [params?.org, organizations]);

  const orgName = params?.org ? organizationNames[params.org] || params.org : "Organización";
  const panelTitle = params?.org ? `Presidencia de ${orgName}` : "Panel de Presidencia";
  const currentOrganization = organizations.find((org: any) => org.id === organizationId);
  const organizationType = currentOrganization?.type;
  const canUseOrganizationInterviews = organizationType === "cuorum_elderes" || organizationType === "sociedad_socorro";
  const hasOrganizationInterviewsAccess =
    user?.organizationId === organizationId &&
    (user?.role === "presidente_organizacion" ||
      user?.role === "consejero_organizacion" ||
      user?.role === "secretario_organizacion");
  const todayIso = formatLocalDateKey(new Date());
  const selectedDate = useMemo(() => new Date(selectedYear, selectedMonth, 1), [selectedMonth, selectedYear]);
  const sundaysInMonth = useMemo(() => getSundaysForMonth(selectedDate), [selectedDate]);

  const leadership = useMemo(() => {
    const organizationUsers = (users as any[]).filter((user) => user.organizationId === organizationId);
    const activeOrgCallings = (allMemberCallings as any[]).filter(
      (calling) => calling.isActive && calling.organizationId === organizationId
    );

    const callingByMemberId = new Map<string, any>();
    activeOrgCallings.forEach((calling) => {
      if (!calling.memberId) return;
      const existing = callingByMemberId.get(calling.memberId);
      if (!existing) {
        callingByMemberId.set(calling.memberId, calling);
        return;
      }

      const existingOrder = Number(existing.callingOrder ?? 999);
      const incomingOrder = Number(calling.callingOrder ?? 999);
      if (incomingOrder < existingOrder) {
        callingByMemberId.set(calling.memberId, calling);
      }
    });

    const hydrateLeader = (user: any) => {
      const matchedCalling = user.memberId ? callingByMemberId.get(user.memberId) : undefined;
      return {
        ...user,
        callingName: matchedCalling?.callingName ?? user.callingName,
        callingOrder: matchedCalling?.callingOrder ?? user.callingOrder,
        organizationName: matchedCalling?.organizationName ?? user.organizationName,
      };
    };

    const presidents = organizationUsers
      .filter((user) => user.role === "presidente_organizacion")
      .map(hydrateLeader);
    const counselors = organizationUsers
      .filter((user) => user.role === "consejero_organizacion")
      .map(hydrateLeader)
      .sort((a, b) => {
        const orderA = Number(a.callingOrder ?? inferCounselorOrder(a.callingName, a.callingOrder) ?? 999);
        const orderB = Number(b.callingOrder ?? inferCounselorOrder(b.callingName, b.callingOrder) ?? 999);
        if (orderA !== orderB) return orderA - orderB;
        return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es");
      });
    const secretaries = organizationUsers
      .filter((user) => user.role === "secretario_organizacion")
      .map(hydrateLeader);
    const leadershipIds = new Set([...presidents, ...counselors, ...secretaries].map((user) => user.id));
    const otherCallings = organizationUsers.filter((user) => !leadershipIds.has(user.id));

    return { presidents, counselors, secretaries, otherCallings };
  }, [allMemberCallings, organizationId, users]);

  const monthlyAttendanceStats = useMemo(() => {
    const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-`;
    const attendanceInMonth = (attendance as any[]).filter((entry: any) => {
      const key = typeof entry.weekKey === "string"
        ? entry.weekKey
        : String(entry.weekStartDate ?? "").slice(0, 10);
      return key.startsWith(monthPrefix);
    });

    const present = attendanceInMonth.reduce((sum: number, entry: any) => sum + Number(entry.attendeesCount ?? 0), 0);
    const reportedWeekKeys = new Set(
      attendanceInMonth
        .filter((entry: any) => Number(entry.attendeesCount ?? 0) > 0)
        .map((entry: any) => String(entry.weekKey ?? String(entry.weekStartDate ?? "").slice(0, 10)))
    );
    const reportedWeeks = reportedWeekKeys.size;
    const elapsedWeeks = sundaysInMonth.filter((sunday) => formatLocalDateKey(sunday) <= todayIso).length;
    const averageWeeklyAttendance = elapsedWeeks > 0 ? present / elapsedWeeks : 0;
    const attendancePercent = organizationMembers.length > 0
      ? Math.min(100, (averageWeeklyAttendance / organizationMembers.length) * 100)
      : 0;
    const reportedElapsedWeeks = sundaysInMonth
      .map((sunday) => formatLocalDateKey(sunday))
      .filter((iso) => iso <= todayIso && reportedWeekKeys.has(iso)).length;
    const compliancePercent = elapsedWeeks > 0 ? Math.min(100, (reportedElapsedWeeks / elapsedWeeks) * 100) : 0;

    return { present, averageWeeklyAttendance, attendancePercent, reportedWeeks, reportedElapsedWeeks, elapsedWeeks, compliancePercent, weeksInMonth: sundaysInMonth.length };
  }, [attendance, organizationMembers.length, selectedMonth, selectedYear, sundaysInMonth, todayIso]);

  useEffect(() => {
    const nextDrafts: Record<string, string[]> = {};
    sundaysInMonth.forEach((sunday) => {
      const iso = formatLocalDateKey(sunday);
      const existing = (attendance as any[]).find((entry: any) => {
        const key = typeof entry.weekKey === "string"
          ? entry.weekKey
          : String(entry.weekStartDate ?? "").slice(0, 10);
        return key === iso;
      });
      const ids = Array.isArray(existing?.attendeeMemberIds)
        ? existing.attendeeMemberIds.filter((id: unknown): id is string => typeof id === "string")
        : [];
      nextDrafts[iso] = ids;
    });
    setAttendanceDrafts(nextDrafts);
  }, [attendance, sundaysInMonth]);

  const toggleAttendanceMember = (isoDate: string, memberId: string) => {
    setAttendanceDrafts((prev) => {
      const current = prev[isoDate] ?? [];
      const next = current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId];
      return { ...prev, [isoDate]: next };
    });
  };

  const toggleCard = (cardKey: string) => {
    setExpandedCards((prev) => ({ ...prev, [cardKey]: !prev[cardKey] }));
  };

  const organizationInterviewsList = useMemo(
    () => (organizationInterviews as any[]).filter((item: any) => item.organizationId === organizationId),
    [organizationInterviews, organizationId]
  );

  const currentQuarterRange = useMemo(() => {
    const now = new Date();
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999);
    return { start, end, quarter: Math.floor(now.getMonth() / 3) + 1, year: now.getFullYear() };
  }, []);

  const quarterInterviews = useMemo(
    () => organizationInterviewsList.filter((item: any) => {
      const interviewDate = new Date(item.date);
      if (Number.isNaN(interviewDate.getTime())) return false;
      return interviewDate >= currentQuarterRange.start && interviewDate <= currentQuarterRange.end;
    }),
    [organizationInterviewsList, currentQuarterRange]
  );

  const yearInterviews = useMemo(
    () => organizationInterviewsList.filter((item: any) => {
      const interviewDate = new Date(item.date);
      return !Number.isNaN(interviewDate.getTime()) && interviewDate.getFullYear() === currentQuarterRange.year;
    }),
    [organizationInterviewsList, currentQuarterRange.year]
  );

  const completedQuarterInterviews = useMemo(
    () => quarterInterviews.filter((item: any) => String(item.status ?? "").toLowerCase() === "completada"),
    [quarterInterviews]
  );

  const completedYearInterviews = useMemo(
    () => yearInterviews.filter((item: any) => String(item.status ?? "").toLowerCase() === "completada"),
    [yearInterviews]
  );

  const annualInterviewGoal = organizationMembers.length;
  const quarterlyInterviewGoal = annualInterviewGoal / 4;
  const pendingQuarterInterviews = Math.max(0, quarterlyInterviewGoal - completedQuarterInterviews.length);
  const interviewCompletionPercent = annualInterviewGoal > 0
    ? Math.min(100, (completedYearInterviews.length / annualInterviewGoal) * 100)
    : 0;

  const pendingAssignments = useMemo(
    () => (assignments as any[]).filter((assignment: any) => assignment.status !== "completada"),
    [assignments]
  );

  const organizationBirthdays = useMemo(
    () => (birthdays as any[]).filter((birthday: any) => !birthday.organizationId || birthday.organizationId === organizationId),
    [birthdays, organizationId]
  );
  const birthdayPreview = organizationBirthdays.slice(0, 3);

  const canEditWeek = (isoDate: string) => isoDate <= todayIso;

  const handleSaveAttendance = (isoDate: string) => {
    if (!canEditWeek(isoDate)) return;
    if (!organizationId) return;
    const attendeeMemberIds = attendanceDrafts[isoDate] ?? [];
    upsertAttendanceMutation.mutate({
      organizationId,
      weekStartDate: isoDate,
      attendeeMemberIds,
      attendeesCount: attendeeMemberIds.length,
      totalMembers: organizationMembers.length,
    });
  };

  const onSubmit = (values: MeetingFormValues) => {
    if (!organizationId) return;
    const structuredAgenda = buildStructuredAgenda(values);

    const agreements = (values.agreementsText ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    createMutation.mutate(
      {
        date: values.date,
        organizationId,
        agenda: structuredAgenda,
        agreements,
        notes: values.notes || "",
      },
      {
        onSuccess: () => {
          setIsCreateMeetingOpen(false);
          form.reset();
        },
      }
    );
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      await apiRequest("DELETE", `/api/presidency-meetings/${meetingId}`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-meetings", organizationId] });
      toast({ title: "Reunión eliminada", description: "La reunión fue eliminada." });
    } catch {
      toast({ title: "Error", description: "No se pudo eliminar la reunión", variant: "destructive" });
    }
  };

  if (!organizationId || meetingsLoading || membersLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6 xl:p-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-56 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 xl:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Panel de Presidencia</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{panelTitle}</h1>
        </div>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => navigateWithTransition(setLocation, `/presidency/${params?.org ?? ""}`)}
          data-testid="button-back-presidency-panel"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-3xl border-border/70 bg-card/95">
          <CardHeader className="pb-3">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => toggleCard("leadership")}>
              <div>
                <CardTitle>Liderazgo y llamamientos</CardTitle>
                <CardDescription>Presidencia y líderes de organización</CardDescription>
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", expandedCards.leadership ? "rotate-180" : "rotate-0")} />
            </button>
          </CardHeader>
          {expandedCards.leadership ? (
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-semibold">Presidencia</p>
                {[
                  ...leadership.presidents.map((leader: any) => ({ ...leader, roleLabel: getPresidentRoleLabel(organizationType) })),
                  ...leadership.counselors.map((leader: any, index: number) => {
                    const counselorOrder = inferCounselorOrder(leader.callingName, leader.callingOrder);
                    const roleLabel = counselorOrder
                      ? getCounselorRoleLabel(counselorOrder - 1, organizationType)
                      : getCounselorRoleLabel(index, organizationType);
                    return { ...leader, roleLabel };
                  }),
                  ...leadership.secretaries.map((leader: any) => ({ ...leader, roleLabel: getSecretaryRoleLabel(organizationType) })),
                ].map((leader: any) => {
                  const phoneDigits = leader.phone?.replace(/[^\d]/g, "") ?? "";
                  const phoneHref = phoneDigits ? `tel:${phoneDigits}` : undefined;
                  const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits}` : undefined;
                  const mailHref = leader.email ? `mailto:${leader.email}` : undefined;

                  return (
                    <div key={leader.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{leader.name}</p>
                        <p className="text-xs text-muted-foreground">{formatCallingLabel(leader.roleLabel, orgName)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={phoneHref} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full border", phoneHref ? "border-blue-400/60 text-blue-400" : "pointer-events-none border-border/50 text-muted-foreground/50")}><Phone className="h-4 w-4" /></a>
                        <a href={whatsappHref} target="_blank" rel="noreferrer" className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full border", whatsappHref ? "border-emerald-400/60 text-emerald-400" : "pointer-events-none border-border/50 text-muted-foreground/50")}><MessageCircle className="h-4 w-4" /></a>
                        <a href={mailHref} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full border", mailHref ? "border-amber-400/60 text-amber-400" : "pointer-events-none border-border/50 text-muted-foreground/50")}><Mail className="h-4 w-4" /></a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          ) : null}
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/95">
          <CardHeader className="pb-3">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => toggleCard("meetings")}>
              <div>
                <CardTitle>Reuniones de presidencia</CardTitle>
                <CardDescription>Gestión de reuniones y seguimiento mensual</CardDescription>
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", expandedCards.meetings ? "rotate-180" : "rotate-0")} />
            </button>
          </CardHeader>
          {expandedCards.meetings ? (
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Este mes</p>
                <p className="text-2xl font-semibold">{meetings.length} reuniones registradas</p>
              </div>
              <Button className="rounded-full" onClick={() => setIsCreateMeetingOpen(true)} data-testid="button-create-meeting-from-management-page">
                <Plus className="mr-2 h-4 w-4" /> Nueva reunión
              </Button>
              <div className="space-y-2">
                {meetings.length > 0 ? meetings.map((meeting: any) => (
                  <div key={meeting.id} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{new Date(meeting.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}</p>
                      <p className="text-xs text-muted-foreground">{meeting.agenda || "Sin agenda"}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteMeeting(meeting.id)} data-testid={`button-delete-management-meeting-${meeting.id}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )) : <p className="text-sm text-muted-foreground">Aún no hay reuniones para esta organización.</p>}
              </div>
            </CardContent>
          ) : null}
        </Card>

{canUseOrganizationInterviews ? (
        <Card className="rounded-3xl border-border/70 bg-card/95">
          <CardHeader className="pb-3">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => toggleCard("interviews")}>
              <div>
                <CardTitle>Entrevistas de organización</CardTitle>
                <CardDescription>Seguimiento de entrevistas por organización</CardDescription>
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", expandedCards.interviews ? "rotate-180" : "rotate-0")} />
            </button>
          </CardHeader>
          {expandedCards.interviews ? (
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <p className="text-muted-foreground">Pendientes (trimestre)</p>
                  <p className="text-xl font-semibold">{Math.ceil(pendingQuarterInterviews)}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <p className="text-muted-foreground">Completadas (trimestre)</p>
                  <p className="text-xl font-semibold">{completedQuarterInterviews.length}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                <p className="text-muted-foreground">Objetivo anual ({currentQuarterRange.year})</p>
                <p className="text-xl font-semibold">{completedYearInterviews.length}/{annualInterviewGoal}</p>
              </div>
              <Button variant="outline" className="w-full rounded-full" onClick={() => {
                if (!hasOrganizationInterviewsAccess) {
                  toast({
                    title: "Acceso restringido",
                    description: "Solo la presidencia de esta organización puede gestionar entrevistas.",
                    variant: "destructive",
                  });
                  return;
                }
                const searchParams = new URLSearchParams({
                  from: "presidency-manage",
                  orgSlug: params?.org ?? "",
                  orgId: organizationId ?? "",
                });
                navigateWithTransition(setLocation, `/organization-interviews?${searchParams.toString()}`);
              }}>Ver entrevistas</Button>
            </CardContent>
          ) : null}
        </Card>

        ) : null}

        <Card className="rounded-3xl border-border/70 bg-gradient-to-b from-card via-card/95 to-muted/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur">
          <CardHeader className="pb-3">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => toggleCard("attendance")}>
              <div>
                <CardTitle>Registro de asistencia</CardTitle>
                <CardDescription>Promedio y cumplimiento semanal</CardDescription>
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", expandedCards.attendance ? "rotate-180" : "rotate-0")} />
            </button>
            {expandedCards.attendance ? (
              <Button type="button" variant="outline" onClick={() => setIsMonthPickerOpen(true)} className="h-9 w-fit rounded-full border-border/70 bg-background/50 px-3 text-sm font-normal capitalize">
                <CalendarDays className="mr-2 h-4 w-4" />
                {selectedDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
              </Button>
            ) : null}
          </CardHeader>
          {expandedCards.attendance ? (
            <CardContent className="space-y-3">
              <div className="space-y-3 rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><p className="text-sm text-muted-foreground">Asistencia mensual</p><p className="text-xl font-semibold">{Math.round(monthlyAttendanceStats.attendancePercent)}%</p></div>
                  <div><p className="text-sm text-muted-foreground">Cumplimiento semanal</p><p className="text-xl font-semibold">{Math.round(monthlyAttendanceStats.compliancePercent)}%</p></div>
                </div>
                <Progress value={monthlyAttendanceStats.attendancePercent} className="mt-2 h-2" />
              </div>
              <div className="space-y-2">
                {sundaysInMonth.map((sunday) => {
                  const iso = formatLocalDateKey(sunday);
                  const isEditable = canEditWeek(iso);
                  return (
                    <div key={iso} className={`grid items-center gap-2 rounded-2xl border border-border/70 bg-background/70 p-3 transition-opacity sm:grid-cols-[1fr_190px] ${isEditable ? "" : "opacity-50"}`}>
                      <p className="text-sm font-medium capitalize">{sunday.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "short" })}</p>
                      <Button variant="outline" className="rounded-xl border-border/70 bg-background/80" onClick={() => setAttendanceEditorDate(iso)} data-testid={`button-edit-attendance-management-${iso}`} disabled={!isEditable}>
                        {(attendanceDrafts[iso] ?? []).length}/{organizationMembers.length} asistentes
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          ) : null}
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/95">
          <CardHeader className="pb-3">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => toggleCard("assignments")}>
              <div>
                <CardTitle>Asignaciones pendientes</CardTitle>
                <CardDescription>Tareas activas de la organización</CardDescription>
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", expandedCards.assignments ? "rotate-180" : "rotate-0")} />
            </button>
          </CardHeader>
          {expandedCards.assignments ? (
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="text-sm text-muted-foreground">Pendientes</p>
                <p className="text-2xl font-semibold">{pendingAssignments.length} tareas</p>
              </div>
              <Button variant="outline" className="w-full rounded-full" onClick={() => {
                const searchParams = new URLSearchParams({
                  from: "presidency-manage",
                  orgSlug: params?.org ?? "",
                  orgId: organizationId ?? "",
                });
                navigateWithTransition(setLocation, `/assignments?${searchParams.toString()}`);
              }}>Ver tareas</Button>
            </CardContent>
          ) : null}
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/95">
          <CardHeader className="pb-3">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => toggleCard("birthdays")}>
              <div>
                <CardTitle>Cumpleaños</CardTitle>
                <CardDescription>Próximos cumpleaños en la organización</CardDescription>
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", expandedCards.birthdays ? "rotate-180" : "rotate-0")} />
            </button>
          </CardHeader>
          {expandedCards.birthdays ? (
            <CardContent className="space-y-3">
              {birthdayPreview.length > 0 ? birthdayPreview.map((birthday: any) => (
                <div key={birthday.id} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                  <p className="font-medium">{birthday.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(birthday.birthDate).toLocaleDateString("es-ES", { day: "2-digit", month: "long" })}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground">No hay cumpleaños registrados.</p>}
              <Button variant="outline" className="w-full rounded-full" onClick={() => {
                const searchParams = new URLSearchParams({
                  from: "presidency-manage",
                  orgSlug: params?.org ?? "",
                  orgId: organizationId ?? "",
                });
                navigateWithTransition(setLocation, `/birthdays?${searchParams.toString()}`);
              }}>Ver todo</Button>
            </CardContent>
          ) : null}
        </Card>
      </div>

      <Dialog open={isCreateMeetingOpen} onOpenChange={setIsCreateMeetingOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear reunión de presidencia</DialogTitle>
            <DialogDescription>Registra la reunión de presidencia de {orgName}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha y hora</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>Lugar</FormLabel>
                  <FormControl><Input placeholder="Salón de presidencia" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="openingPrayerBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Primera oración (quién la hará)</FormLabel>
                  <FormControl><Input placeholder="Nombre" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="hasSpiritualThought" render={({ field }) => (
                <FormItem>
                  <FormLabel>¿Habrá pensamiento espiritual?</FormLabel>
                  <FormControl>
                    <select
                      value={field.value}
                      onChange={field.onChange}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {form.watch("hasSpiritualThought") === "si" && (
                <FormField control={form.control} name="spiritualThoughtBy" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pensamiento espiritual (quién lo hará)</FormLabel>
                    <FormControl><Input placeholder="Nombre" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="previousReviewPoints" render={({ field }) => (
                <FormItem>
                  <FormLabel>Puntos a revisar de la reunión anterior (uno por línea)</FormLabel>
                  <FormControl><Textarea placeholder="Seguimiento acuerdo 1" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="topicsToDiscuss" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temas a tratar (uno por línea)</FormLabel>
                  <FormControl><Textarea placeholder="Tema 1" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="keyPoints" render={({ field }) => (
                <FormItem>
                  <FormLabel>Puntos importantes (uno por línea)</FormLabel>
                  <FormControl><Textarea placeholder="Punto importante 1" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="closingHymn" render={({ field }) => (
                <FormItem>
                  <FormLabel>Último himno (opcional)</FormLabel>
                  <FormControl><Input placeholder="Himno #" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="closingPrayerBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Última oración</FormLabel>
                  <FormControl><Input placeholder="Nombre" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="agenda" render={({ field }) => (
                <FormItem>
                  <FormLabel>Agenda generada</FormLabel>
                  <FormControl><Textarea placeholder="La agenda se genera automáticamente" {...field} disabled /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="agreementsText" render={({ field }) => (
                <FormItem>
                  <FormLabel>Acuerdos (uno por línea)</FormLabel>
                  <FormControl><Textarea placeholder="Acuerdo 1\nAcuerdo 2" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl><Textarea placeholder="Notas de la reunión" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateMeetingOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Creando..." : "Crear reunión"}</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isMonthPickerOpen} onOpenChange={setIsMonthPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Seleccionar mes</DialogTitle>
            <DialogDescription>Elige el año y el mes para registrar la asistencia.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              className="rounded-xl border-border/70 bg-background/80"
              type="number"
              min={2020}
              max={2100}
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value) || new Date().getFullYear())}
            />
            <div className="grid grid-cols-3 gap-2">
              {MONTH_NAMES.map((month, index) => (
                <Button
                  key={month}
                  type="button"
                  variant={selectedMonth === index ? "default" : "outline"}
                  className="rounded-xl capitalize"
                  onClick={() => {
                    setSelectedMonth(index);
                    setIsMonthPickerOpen(false);
                  }}
                >
                  {month}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(attendanceEditorDate)} onOpenChange={(open) => { if (!open) setAttendanceEditorDate(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lista de asistencia</DialogTitle>
            <DialogDescription>
              {attendanceEditorDate ? new Date(`${attendanceEditorDate}T00:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" }) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {organizationMembers.map((member: any) => {
              const selected = attendanceEditorDate ? (attendanceDrafts[attendanceEditorDate] ?? []).includes(member.id) : false;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => attendanceEditorDate && toggleAttendanceMember(attendanceEditorDate, member.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "border-border/70 bg-muted/20 hover:bg-muted/40"}`}
                  data-testid={`attendance-management-member-${member.id}`}
                >
                  <span className="text-sm font-medium">{member.nameSurename}</span>
                  {selected ? <Check className="h-4 w-4 text-primary" /> : <span className="text-xs text-muted-foreground">Tap para marcar</span>}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAttendanceEditorDate(null)}>Cerrar</Button>
            {attendanceEditorDate ? (
              <Button onClick={() => { handleSaveAttendance(attendanceEditorDate); setAttendanceEditorDate(null); }}>
                Guardar asistencia
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
