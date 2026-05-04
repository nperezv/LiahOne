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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { Settings } from "lucide-react";
import {
  useAgendaAvailability,
  useCreateAgendaTask,
  useAgendaData,
  useRunAgendaPlanner,
  useUpdateAgendaAvailability,
  useUpdateAgendaTaskStatus,
  useAssignments,
  useMyTasks,
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
  const { data: myTasks = [] } = useMyTasks();

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
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8" data-testid="agenda-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
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
          <Button
            onClick={() => runPlanner.mutate()}
            data-testid="button-plan-week"
            className="rounded-xl bg-primary text-primary-foreground shadow-[0_6px_24px_hsl(var(--primary)/0.35)] hover:bg-primary/90"
          >
            Planificar
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {[{ label: "Eventos hoy", value: todayEvents.length, tone: "text-foreground" }, { label: "Abiertas", value: openTasks.length, tone: "text-foreground" }, { label: "En riesgo", value: atRiskTasks.length, tone: "text-amber-500" }].map((item) => (
          <GlassCard key={item.label}>
            <div className="space-y-1 p-3 sm:p-4">
              <p className="text-2xl font-extrabold leading-none sm:text-3xl">
                <span className={item.tone}>{item.value}</span>
              </p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
            </div>
          </GlassCard>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="order-1 space-y-4 xl:col-span-3">
          <GlassCard>
            <div className="space-y-3 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Captura por voz</p>
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
            </div>
          </GlassCard>

          <GlassCard>
            <div className="space-y-3 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Foco ahora ⚡</p>
              <div className="space-y-2">
                {atRiskTasks.slice(0, 3).map((task: any) => (
                  <div key={task.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">Prioridad {task.priority}</p>
                  </div>
                ))}
                {atRiskTasks.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas críticas.</p>}
              </div>
            </div>
          </GlassCard>

          <GlassCard className="order-4 xl:order-none">
            <div className="space-y-3 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Mis pendientes ({myTasks.filter((t: any) => t.status !== "done" && t.status !== "canceled" && t.status !== "archivada").length})
              </p>
              {(() => {
                const active = myTasks.filter((t: any) => t.status !== "done" && t.status !== "canceled" && t.status !== "archivada");
                if (active.length === 0) return <p className="text-sm text-muted-foreground">Todo al día ✓</p>;
                // Agrupar por fuente
                const groups: Record<string, any[]> = {};
                for (const t of active) {
                  const key = `${t.sourceEmoji} ${t.sourceLabel}`;
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(t);
                }
                return (
                  <div className="space-y-3">
                    {Object.entries(groups).map(([groupLabel, items]) => (
                      <div key={groupLabel}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{groupLabel}</p>
                        <div className="space-y-1">
                          {items.slice(0, 5).map((t: any) => (
                            <div key={t.id} className="rounded-lg border border-border/60 bg-background/20 px-2 py-1.5 text-xs">
                              <p className="font-medium leading-tight">{t.title}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                                {t.areaLabel && <span className="rounded bg-primary/10 px-1 py-px text-primary">{t.areaLabel}</span>}
                                {t.priority && <span className="font-semibold text-amber-600">{t.priority}</span>}
                                {t.dueDate && <span>Vence {new Date(t.dueDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>}
                              </div>
                            </div>
                          ))}
                          {items.length > 5 && <p className="text-[10px] text-muted-foreground">+{items.length - 5} más</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </GlassCard>
        </div>

        <div className="order-2 space-y-4 xl:col-span-6">
          <GlassCard>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Semana</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedDate((d) => addDays(d, -7))}>←</Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedDate(new Date())}>Hoy</Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedDate((d) => addDays(d, 7))}>→</Button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day) => {
                  const count = events.filter((e) => isSameDay(parseISO(`${e.date}T00:00:00`), day)).length;
                  return (
                    <button
                      key={day.toISOString()}
                      className={`rounded-xl border p-2 text-center transition-colors ${isSameDay(day, selectedDate) ? "border-primary/50 bg-primary/15" : "border-border/70"}`}
                      onClick={() => setSelectedDate(day)}
                    >
                      <p className="text-[11px] font-semibold leading-tight capitalize">{format(day, "EEE", { locale: es })}</p>
                      <p className="text-base font-bold leading-tight">{format(day, "d", { locale: es })}</p>
                      <p className="text-[10px] text-muted-foreground">{count}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="space-y-3 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Timeline · {format(selectedDate, "EEE d 'de' MMMM", { locale: es }).toUpperCase()}</p>
              {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
              {!isLoading && dayEvents.length === 0 && dayPlans.length === 0 && dayTasksDue.length === 0 && <p className="text-sm text-muted-foreground">No hay elementos para este día.</p>}

              {dayPlans.map((plan: any) => (
                <div key={plan.id} className="rounded-lg border border-blue-500/40 bg-blue-500/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{plan.title}</p>
                    <Badge variant="default">Plan</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{format(plan.start, "HH:mm", { locale: es })} - {format(plan.end, "HH:mm", { locale: es })}</p>
                </div>
              ))}

              {dayTasksDue.map((task: any) => (
                <div key={`due-${task.id}`} className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
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
                  <div key={event.id} className="rounded-lg border border-border/70 bg-background/20 p-3">
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
                );
              })}
            </div>
          </GlassCard>
        </div>

        <div className="order-3 xl:col-span-3">
          <GlassCard>
            <div className="space-y-3 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Tareas</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={taskFilter === "open" ? "default" : "outline"} onClick={() => setTaskFilter("open")}>Abiertas</Button>
                <Button size="sm" variant={taskFilter === "planned" ? "default" : "outline"} onClick={() => setTaskFilter("planned")}>Planif.</Button>
                <Button size="sm" variant={taskFilter === "atRisk" ? "default" : "outline"} onClick={() => setTaskFilter("atRisk")}>Riesgo</Button>
                <Button size="sm" variant={taskFilter === "done" ? "default" : "outline"} onClick={() => setTaskFilter("done")}>Hechas</Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {filteredTasks.slice(0, 8).map((task: any) => (
                  <div key={task.id} className="rounded-lg border border-border/70 bg-background/20 p-2" data-testid={`task-${task.id}`}>
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
                {filteredTasks.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas en esta vista.</p>}
              </div>
            </div>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}
