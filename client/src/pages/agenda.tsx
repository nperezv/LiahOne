import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  parseISO,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Settings } from "lucide-react";
import {
  useAgendaAvailability,
  useCreateAgendaTask,
  useAgendaData,
  useRunAgendaPlanner,
  useUpdateAgendaAvailability,
  useUpdateAgendaTaskStatus,
  useAssignments,
} from "@/hooks/use-api";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

type TaskFilter = "open" | "planned" | "atRisk" | "done";

function sourceLabel(sourceType: string) {
  if (sourceType === "activity") return "Actividad";
  if (sourceType === "interview") return "Entrevista";
  return "Manual";
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatAssignmentReference(relatedTo?: string | null) {
  if (!relatedTo) return "Sin referencia";
  if (relatedTo.startsWith("budget:")) return `Presupuesto ${relatedTo.replace("budget:", "#")}`;
  if (relatedTo.startsWith("interview:")) return `Entrevista ${relatedTo.replace("interview:", "#")}`;
  if (relatedTo.startsWith("organization_interview:")) return `Entrevista org. ${relatedTo.replace("organization_interview:", "#")}`;
  return relatedTo;
}

function shouldHideManualReminderEvent(event: any, taskTitles: Set<string>) {
  if (event.sourceType !== "manual") return false;

  const normalizedTitle = normalizeComparableText(event.title || "");
  const normalizedDescription = normalizeComparableText(event.description || "");
  const combinedText = `${normalizedTitle} ${normalizedDescription}`.trim();
  const reminderLikeText = /record|recuerd|llamar|comprar|preparar|pendiente|tarea|seguimiento/.test(combinedText);

  if (reminderLikeText) return true;
  return taskTitles.has(normalizedTitle) || taskTitles.has(normalizedDescription);
}

export default function AgendaPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data, isLoading } = useAgendaData();
  const runPlanner = useRunAgendaPlanner();
  const createAgendaTask = useCreateAgendaTask();
  const updateTaskStatus = useUpdateAgendaTaskStatus();
  const { data: availability } = useAgendaAvailability();
  const updateAvailability = useUpdateAgendaAvailability();
  const { data: assignments } = useAssignments();

  const [dictatedText, setDictatedText] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("open");
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("06:00");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  const events = data?.events ?? [];
  const plans = data?.plans ?? [];
  const tasks = data?.tasks ?? [];
  const pendingAssignments = useMemo(() => (assignments ?? []).filter((a: any) => (a.status === "pendiente" || a.status === "en_proceso") && a.assignedTo === user?.id && !String(a.relatedTo ?? "").startsWith("interview:") && !String(a.relatedTo ?? "").startsWith("organization_interview:")), [assignments, user?.id]);

  const quietWindow = availability?.doNotDisturbWindows?.[0];
  useEffect(() => {
    if (!quietWindow) return;
    setQuietStart(quietWindow.start);
    setQuietEnd(quietWindow.end);
  }, [quietWindow]);

  useEffect(() => {
    setEmailEnabled(Boolean(availability?.reminderChannels?.includes("email")));
  }, [availability?.reminderChannels]);

  const todayEvents = useMemo(() => events.filter((e) => isToday(parseISO(`${e.date}T00:00:00`))), [events]);
  const openTasks = useMemo(() => tasks.filter((t: any) => t.status === "open"), [tasks]);
  const atRiskTasks = useMemo(() => tasks.filter((t: any) => t.status === "open" && (t.metadata as any)?.atRisk), [tasks]);

  const weekDays = useMemo(() => {
    const s = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const e = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: s, end: e });
  }, [selectedDate]);

  const dayEvents = useMemo(
    () => events.filter((event) => isSameDay(parseISO(`${event.date}T00:00:00`), selectedDate)),
    [events, selectedDate]
  );

  const dayTasksDue = useMemo(
    () => tasks.filter((task: any) => task.dueAt && isSameDay(new Date(task.dueAt), selectedDate) && task.status !== "canceled"),
    [tasks, selectedDate]
  );

  const filteredDayEvents = useMemo(() => {
    const taskTitles = new Set(dayTasksDue.map((task: any) => normalizeComparableText(task.title || "")));
    const seen = new Set<string>();

    return dayEvents.filter((event: any) => {
      const normalizedTitle = normalizeComparableText(event.title || "");
      const eventKey = `${event.sourceType}|${event.date}|${event.startTime || ""}|${normalizedTitle}`;
      if (seen.has(eventKey)) return false;
      seen.add(eventKey);

      if (shouldHideManualReminderEvent(event, taskTitles)) return false;
      return true;
    });
  }, [dayEvents, dayTasksDue]);

  const savePreferences = () => {
    updateAvailability.mutate({
      timezone: availability?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      workDays: availability?.workDays ?? [1, 2, 3, 4, 5],
      workStartTime: availability?.workStartTime ?? "09:00",
      workEndTime: availability?.workEndTime ?? "18:00",
      bufferMinutes: availability?.bufferMinutes ?? 10,
      minBlockMinutes: availability?.minBlockMinutes ?? 15,
      doNotDisturbWindows: [{ start: quietStart, end: quietEnd }],
      reminderChannels: emailEnabled ? ["push", "email"] : ["push"],
    }, {
      onSuccess: () => setIsPreferencesOpen(false),
    });
  };

  const taskMap = useMemo(() => new Map(tasks.map((t: any) => [t.id, t])), [tasks]);

  const dayPlans = useMemo(() =>
    plans
      .filter((plan: any) => plan.status === "planned" && isSameDay(new Date(plan.startAt), selectedDate))
      .map((plan: any) => ({
        id: plan.id,
        title: taskMap.get(plan.taskId)?.title ?? "Bloque planificado",
        start: new Date(plan.startAt),
        end: new Date(plan.endAt),
      }))
      .sort((a: any, b: any) => a.start.getTime() - b.start.getTime()),
    [plans, selectedDate, taskMap]
  );

  const taskIdsWithPlans = useMemo(() => new Set(plans.filter((p: any) => p.status === "planned").map((p: any) => p.taskId)), [plans]);
  const filteredTasks = useMemo(() => {
    if (taskFilter === "atRisk") return tasks.filter((t: any) => t.status === "open" && (t.metadata as any)?.atRisk);
    if (taskFilter === "planned") return tasks.filter((t: any) => t.status === "open" && taskIdsWithPlans.has(t.id));
    if (taskFilter === "done") return tasks.filter((t: any) => t.status === "done");
    return tasks.filter((t: any) => t.status === "open");
  }, [taskFilter, tasks, taskIdsWithPlans]);

  const startDictation = () => {
    const recognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!recognitionImpl) return alert("Tu navegador no soporta dictado por voz.");
    const recognition = new recognitionImpl();
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setDictatedText(transcript);
    };
    recognition.start();
  };

  const confirmDictationTask = () => {
    if (!dictatedText) return;
    createAgendaTask.mutate({
      title: dictatedText,
      description: dictatedText,
    }, {
      onSuccess: () => setDictatedText(null),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6" data-testid="agenda-page">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda inteligente</h1>
          <p className="text-sm text-muted-foreground">Vista operativa diaria: captura, foco, calendario y tareas personales.</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isPreferencesOpen} onOpenChange={setIsPreferencesOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Abrir preferencias de agenda">
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Preferencias de recordatorios</DialogTitle>
                <DialogDescription>
                  Ajusta horas silenciosas y el canal para que la agenda se adapte a tu ritmo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Silencio desde</span>
                    <Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Hasta</span>
                    <Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
                  Enviar también por email
                </label>
                <Button className="w-full" onClick={savePreferences} disabled={updateAvailability.isPending}>
                  {updateAvailability.isPending ? "Guardando..." : "Guardar preferencias"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button onClick={() => runPlanner.mutate()} data-testid="button-plan-week">Planificar semana</Button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Eventos hoy</p><p className="text-2xl font-semibold">{todayEvents.length}</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">Tareas abiertas</p><p className="text-2xl font-semibold">{openTasks.length}</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">En riesgo</p><p className="text-2xl font-semibold text-amber-600">{atRiskTasks.length}</p></CardContent></Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-3 space-y-4">
          <Card>
            <CardHeader><CardTitle>Captura por voz</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" variant="outline" onClick={startDictation} disabled={isListening || createAgendaTask.isPending}>
                {isListening ? "Escuchando..." : "🎤 Empezar a dictar"}
              </Button>
              <p className="text-xs text-muted-foreground">Dicta la tarea en voz alta. Te mostraremos una confirmación antes de guardarla.</p>
              {dictatedText && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Confirmación</p>
                  <p className="text-sm">"{dictatedText}"</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={confirmDictationTask} disabled={createAgendaTask.isPending}>
                      {createAgendaTask.isPending ? "Guardando..." : "Sí, agregar a tareas"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDictatedText(null)} disabled={createAgendaTask.isPending}>Cancelar</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Foco ahora</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {atRiskTasks.slice(0, 3).map((task: any) => (
                <div key={task.id} className="rounded-lg border p-2">
                  <p className="font-medium text-sm">{task.title}</p>
                  <p className="text-xs text-muted-foreground">Prioridad {task.priority}</p>
                </div>
              ))}
              {atRiskTasks.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas críticas.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-6 space-y-4">
          <Card>
            <CardHeader><CardTitle>Semana</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => setSelectedDate((d) => addDays(d, -7))}>←</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedDate(new Date())}>Hoy</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedDate((d) => addDays(d, 7))}>→</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {weekDays.map((day) => {
                  const count = events.filter((e) => isSameDay(parseISO(`${e.date}T00:00:00`), day)).length;
                  return (
                    <button
                      key={day.toISOString()}
                      className={`rounded-lg border p-2 text-left ${isSameDay(day, selectedDate) ? "border-primary" : ""}`}
                      onClick={() => setSelectedDate(day)}
                    >
                      <p className="text-xs font-medium">{format(day, "EEE d", { locale: es })}</p>
                      <p className="text-xs text-muted-foreground">{count} items</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Timeline del día</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
              {!isLoading && dayEvents.length === 0 && dayPlans.length === 0 && dayTasksDue.length === 0 && <p className="text-sm text-muted-foreground">No hay elementos para este día.</p>}

              {dayPlans.map((plan: any) => (
                <div key={plan.id} className="rounded-lg border p-3 border-blue-500/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{plan.title}</p>
                    <Badge variant="default">Plan</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{format(plan.start, "HH:mm", { locale: es })} - {format(plan.end, "HH:mm", { locale: es })}</p>
                </div>
              ))}

              {dayTasksDue.map((task: any) => (
                <div key={`due-${task.id}`} className="rounded-lg border p-3 border-emerald-500/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{task.title}</p>
                    <Badge variant={task.status === "done" ? "outline" : "default"}>{task.status === "done" ? "Completada" : "Tarea"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Vence: {task.dueAt ? new Date(task.dueAt).toLocaleString("es-ES") : "Sin fecha"}</p>
                </div>
              ))}

              {filteredDayEvents.map((event) => {
                const isPast = parseISO(`${event.date}T${event.endTime ?? event.startTime ?? "23:59"}:00`).getTime() < Date.now();
                return (
                <div key={event.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{event.title}</p>
                    <div className="flex items-center gap-2">
                      {event.sourceType === "interview" ? <Badge variant={isPast ? "outline" : "secondary"}>{isPast ? "Entrevista completada" : "Entrevista programada"}</Badge> : isPast ? <Badge variant="outline">Pasada</Badge> : null}
                      <Badge variant="secondary">{sourceLabel(event.sourceType)}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{event.startTime ? `${event.startTime} - ${event.endTime ?? ""}` : "Sin hora"}</p>
                  {event.sourceType !== "manual" && (
                    <Button size="sm" variant="link" className="px-0" onClick={() => setLocation(event.sourceType === "activity" ? "/activities" : "/interviews")}>Abrir módulo original</Button>
                  )}
                </div>
              )})}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-3 space-y-4">
          <Card>
            <CardHeader><CardTitle>Tareas</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={taskFilter === "open" ? "default" : "outline"} onClick={() => setTaskFilter("open")}>Open</Button>
                <Button size="sm" variant={taskFilter === "planned" ? "default" : "outline"} onClick={() => setTaskFilter("planned")}>Planned</Button>
                <Button size="sm" variant={taskFilter === "atRisk" ? "default" : "outline"} onClick={() => setTaskFilter("atRisk")}>At Risk</Button>
                <Button size="sm" variant={taskFilter === "done" ? "default" : "outline"} onClick={() => setTaskFilter("done")}>Done</Button>
              </div>
              {filteredTasks.slice(0, 8).map((task: any) => (
                <div key={task.id} className="rounded-lg border p-2" data-testid={`task-${task.id}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{task.title}</p>
                    <Badge>{task.priority}</Badge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {task.status !== "done" && <Button size="sm" variant="outline" onClick={() => updateTaskStatus.mutate({ id: task.id, status: "done" })}>Completar</Button>}
                    {task.status !== "canceled" && <Button size="sm" variant="outline" onClick={() => updateTaskStatus.mutate({ id: task.id, status: "canceled" })}>Cancelar</Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>


          <Card>
            <CardHeader><CardTitle>Asignaciones pendientes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {pendingAssignments.slice(0, 6).map((assignment: any) => (
                <div key={assignment.id} className="rounded border p-2 text-xs">
                  <p className="font-medium">{assignment.title}</p>
                  <p className="text-muted-foreground">Estado: {assignment.status}</p>
                  <p className="text-muted-foreground">Ref: {formatAssignmentReference(assignment.relatedTo)}</p>
                  {assignment.dueDate && <p className="text-muted-foreground">Vence: {new Date(assignment.dueDate).toLocaleDateString("es-ES")}</p>}
                </div>
              ))}
              {pendingAssignments.length === 0 && <p className="text-sm text-muted-foreground">Sin asignaciones pendientes.</p>}
            </CardContent>
          </Card>

        </div>
      </section>
    </div>
  );
}
