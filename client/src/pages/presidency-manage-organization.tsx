import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  useOrganizations,
  useMembers,
  useOrganizationAttendanceByOrg,
  useUpsertOrganizationAttendance,
  usePresidencyMeetings,
  useCreatePresidencyMeeting,
  useUsers,
} from "@/hooks/use-api";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const meetingSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  agenda: z.string().optional(),
  notes: z.string().optional(),
  agreementsText: z.string().optional(),
});

type MeetingFormValues = z.infer<typeof meetingSchema>;

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

const roleLabelMap: Record<string, string> = {
  presidente_organizacion: "Presidencia",
  consejero_organizacion: "Consejero/a",
  secretario_organizacion: "Secretario/a",
  obispo: "Obispo",
  consejero_obispo: "Consejero del Obispo",
  secretario: "Secretario",
  secretario_ejecutivo: "Secretario Ejecutivo",
  secretario_financiero: "Secretario Financiero",
};

export default function PresidencyManageOrganizationPage() {
  const [, params] = useRoute("/presidency/:org/manage");
  const [, setLocation] = useLocation();
  const [organizationId, setOrganizationId] = useState<string | undefined>();
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, string[]>>({});
  const [attendanceEditorDate, setAttendanceEditorDate] = useState<string | null>(null);
  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const { toast } = useToast();

  const { data: organizations = [] } = useOrganizations();
  const { data: users = [] } = useUsers();
  const { data: meetings = [], isLoading: meetingsLoading } = usePresidencyMeetings(organizationId);
  const { data: members = [], isLoading: membersLoading } = useMembers({ enabled: Boolean(organizationId) });
  const { data: attendance = [] } = useOrganizationAttendanceByOrg(organizationId);
  const createMutation = useCreatePresidencyMeeting(organizationId);
  const upsertAttendanceMutation = useUpsertOrganizationAttendance();

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema),
    defaultValues: { date: "", agenda: "", notes: "", agreementsText: "" },
  });

  useEffect(() => {
    if (params?.org && organizations.length > 0) {
      const slug = organizationSlugs[params.org];
      const org = organizations.find((o: any) => o.type === slug);
      setOrganizationId(org?.id);
    }
  }, [params?.org, organizations]);

  const orgName = params?.org ? organizationNames[params.org] || params.org : "Organización";
  const todayIso = formatLocalDateKey(new Date());
  const selectedDate = useMemo(() => new Date(selectedYear, selectedMonth, 1), [selectedMonth, selectedYear]);
  const sundaysInMonth = useMemo(() => getSundaysForMonth(selectedDate), [selectedDate]);

  const leadership = useMemo(() => {
    const organizationUsers = (users as any[]).filter((user) => user.organizationId === organizationId);
    const presidents = organizationUsers.filter((user) => user.role === "presidente_organizacion");
    const counselors = organizationUsers.filter((user) => user.role === "consejero_organizacion");
    const secretaries = organizationUsers.filter((user) => user.role === "secretario_organizacion");
    const leadershipIds = new Set([...presidents, ...counselors, ...secretaries].map((user) => user.id));
    const otherCallings = organizationUsers.filter((user) => !leadershipIds.has(user.id));

    return { presidents, counselors, secretaries, otherCallings };
  }, [organizationId, users]);

  const organizationMembers = useMemo(
    () => (members as any[]).filter((member: any) => member.organizationId === organizationId),
    [members, organizationId]
  );

  const monthlyAttendanceStats = useMemo(() => {
    const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-`;
    const attendanceInMonth = (attendance as any[]).filter((entry: any) => {
      const key = typeof entry.weekKey === "string"
        ? entry.weekKey
        : String(entry.weekStartDate ?? "").slice(0, 10);
      return key.startsWith(monthPrefix);
    });

    const present = attendanceInMonth.reduce((sum: number, entry: any) => sum + Number(entry.attendeesCount ?? 0), 0);
    const reportedWeekKeys = new Set(attendanceInMonth.map((entry: any) => String(entry.weekKey ?? String(entry.weekStartDate ?? "").slice(0, 10))));
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

    const agreements = (values.agreementsText ?? "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    createMutation.mutate(
      {
        date: values.date,
        organizationId,
        agenda: values.agenda || "",
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
          <p className="text-sm text-muted-foreground">Presidencia de {orgName}</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Gestionar Organización</h1>
        </div>
        <Button variant="outline" className="rounded-full" onClick={() => setLocation(`/presidency/${params?.org ?? ""}`)} data-testid="button-back-presidency-panel">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver al panel
        </Button>
      </div>

      <Card className="rounded-3xl border-border/70 bg-card/95">
        <CardHeader>
          <CardTitle>Liderazgo y llamamientos</CardTitle>
          <CardDescription>Primero la presidencia, luego otros llamamientos activos de la organización</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...leadership.presidents, ...leadership.counselors, ...leadership.secretaries].map((leader: any) => (
            <div key={leader.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{leader.name}</p>
                <p className="text-xs text-muted-foreground">{roleLabelMap[leader.role] ?? leader.role}</p>
              </div>
              <Badge variant="secondary">Presidencia</Badge>
            </div>
          ))}

          {leadership.otherCallings.length > 0 ? (
            leadership.otherCallings.map((person: any) => (
              <div key={person.id} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{person.name}</p>
                  <p className="text-xs text-muted-foreground">{roleLabelMap[person.role] ?? person.role}</p>
                </div>
                <Badge variant="outline">Llamamiento</Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No hay otros llamamientos de usuario en esta organización.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-3xl border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle>Reuniones de presidencia</CardTitle>
            <CardDescription>Gestión de reuniones y seguimiento mensual</CardDescription>
          </CardHeader>
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
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteMeeting(meeting.id)} data-testid={`button-delete-management-meeting-${meeting.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">Aún no hay reuniones para esta organización.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle>Control de asistencia (domingo a domingo)</CardTitle>
            <CardDescription>{selectedDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-sm">Asistencia mensual</p>
              <p className="text-xl font-semibold">{Math.round(monthlyAttendanceStats.attendancePercent)}%</p>
              <Progress value={monthlyAttendanceStats.attendancePercent} className="mt-2 h-2" />
              <p className="mt-1 text-xs text-muted-foreground">Promedio semanal: {Math.round(monthlyAttendanceStats.averageWeeklyAttendance)} de {organizationMembers.length} miembros</p>
              <p className="text-xs text-muted-foreground">Total acumulado del mes: {monthlyAttendanceStats.present}</p>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-sm">Cumplimiento semanal de registro</p>
              <p className="text-xl font-semibold">{monthlyAttendanceStats.elapsedWeeks}/{monthlyAttendanceStats.weeksInMonth} semanas transcurridas</p>
              <p className="text-xs text-muted-foreground">Registradas: {monthlyAttendanceStats.reportedElapsedWeeks}/{monthlyAttendanceStats.elapsedWeeks || 0} ({Math.round(monthlyAttendanceStats.compliancePercent)}%)</p>
              <p className="text-xs text-muted-foreground">Total mes registrado: {monthlyAttendanceStats.reportedWeeks}/{monthlyAttendanceStats.weeksInMonth}</p>
              <Progress value={monthlyAttendanceStats.compliancePercent} className="mt-2 h-2" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="number" min={2020} max={2100} value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value) || new Date().getFullYear())} />
              <Input type="number" min={1} max={12} value={selectedMonth + 1} onChange={(event) => {
                const month = Number(event.target.value);
                if (!Number.isNaN(month) && month >= 1 && month <= 12) setSelectedMonth(month - 1);
              }} />
            </div>

            <div className="space-y-2">
              {sundaysInMonth.map((sunday) => {
                const iso = formatLocalDateKey(sunday);
                return (
                  <div key={iso} className="grid items-center gap-2 rounded-xl border border-border/70 bg-background/80 p-3 sm:grid-cols-[1fr_180px_100px]">
                    <p className="text-sm font-medium">{sunday.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "short" })}</p>
                    <Button variant="outline" onClick={() => setAttendanceEditorDate(iso)} data-testid={`button-edit-attendance-management-${iso}`} disabled={!canEditWeek(iso)}>
                      {(attendanceDrafts[iso] ?? []).length}/{organizationMembers.length} asistentes
                    </Button>
                    <Button variant="outline" onClick={() => handleSaveAttendance(iso)} data-testid={`button-save-attendance-management-${iso}`} disabled={!canEditWeek(iso)}>
                      <Check className="mr-2 h-4 w-4" />{canEditWeek(iso) ? "Guardar" : "Bloqueado"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
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
                  <FormLabel>Fecha</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="agenda" render={({ field }) => (
                <FormItem>
                  <FormLabel>Agenda (opcional)</FormLabel>
                  <FormControl><Textarea placeholder="Puntos a tratar" {...field} /></FormControl>
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
