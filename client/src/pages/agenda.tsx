import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgendaAvailability, useAgendaCapture, useAgendaData, useAgendaLogs, useRunAgendaPlanner, useUpdateAgendaAvailability, useUpdateAgendaTaskStatus } from "@/hooks/use-api";
import { useLocation } from "wouter";

type CalendarMode = "day" | "week" | "month";
type TaskFilter = "open" | "planned" | "atRisk" | "done";

function sourceLabel(sourceType: string) {
  if (sourceType === "activity") return "Actividad";
  if (sourceType === "interview") return "Entrevista";
  return "Manual";
}

export default function AgendaPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useAgendaData();
  const runPlanner = useRunAgendaPlanner();
  const capture = useAgendaCapture();
  const updateTaskStatus = useUpdateAgendaTaskStatus();
  const { data: availability } = useAgendaAvailability();
  const updateAvailability = useUpdateAgendaAvailability();
  const { data: logs } = useAgendaLogs(25);
  const [text, setText] = useState("");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("open");
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("06:00");
  const [emailEnabled, setEmailEnabled] = useState(false);

  const events = data?.events ?? [];
  const plans = data?.plans ?? [];
  const tasks = data?.tasks ?? [];

  const quietWindow = availability?.doNotDisturbWindows?.[0];
  const activeLogs = logs ?? [];

  useEffect(() => {
    if (!quietWindow) return;
    setQuietStart(quietWindow.start);
    setQuietEnd(quietWindow.end);
  }, [quietWindow]);

  useEffect(() => {
    setEmailEnabled(Boolean(availability?.reminderChannels?.includes("email")));
  }, [availability?.reminderChannels]);

  const todayEvents = useMemo(
    () => events.filter((event) => isToday(parseISO(`${event.date}T00:00:00`))),
    [events]
  );

  const visibleCalendarDays = useMemo(() => {
    if (calendarMode === "day") return [selectedDate];
    if (calendarMode === "week") {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }

    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [calendarMode, selectedDate]);

  const taskIdsWithPlans = useMemo(() => new Set(plans.filter((p: any) => p.status === "planned").map((p: any) => p.taskId)), [plans]);

  const filteredTasks = useMemo(() => {
    if (taskFilter === "atRisk") {
      return tasks.filter((task: any) => task.status === "open" && (task.metadata as any)?.atRisk);
    }
    if (taskFilter === "planned") {
      return tasks.filter((task: any) => taskIdsWithPlans.has(task.id) && task.status === "open");
    }
    if (taskFilter === "done") {
      return tasks.filter((task: any) => task.status === "done");
    }
    return tasks.filter((task: any) => task.status === "open");
  }, [taskFilter, tasks, taskIdsWithPlans]);

  const startDictation = () => {
    const recognitionImpl =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!recognitionImpl) {
      alert("Tu navegador no soporta dictado por voz.");
      return;
    }

    const recognition = new recognitionImpl();
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setText(transcript);
      capture.mutate(transcript);
    };

    recognition.start();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8" data-testid="agenda-page">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agenda inteligente</h1>
          <p className="text-sm text-muted-foreground">Tu planificador personal (actividades + entrevistas + tareas + recordatorios).</p>
        </div>
        <Button onClick={() => runPlanner.mutate()} data-testid="button-plan-week">Plan my week</Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Captura rápida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej: Recuérdame preparar la clase mañana a las 18:00" />
            <Button variant="outline" onClick={startDictation}>🎤 Dictate</Button>
            <Button onClick={() => capture.mutate(text)} disabled={!text.trim()}>+ Add</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Timeline de hoy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading && <p className="text-sm text-muted-foreground">Cargando...</p>}
              {!isLoading && todayEvents.length === 0 && <p className="text-sm text-muted-foreground">No hay eventos para hoy.</p>}
              {todayEvents.map((event) => (
                <div key={event.id} className="rounded-xl border p-3" data-testid={`today-event-${event.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{event.title}</p>
                    <Badge variant="secondary">{sourceLabel(event.sourceType)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {event.startTime ? `${event.startTime} - ${event.endTime ?? ""}` : "Sin hora"}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                  {event.sourceType !== "manual" && (
                    <Button
                      size="sm"
                      variant="link"
                      className="px-0"
                      onClick={() => setLocation(event.sourceType === "activity" ? "/activities" : "/interviews")}
                    >
                      Abrir módulo original
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Calendario</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant={calendarMode === "day" ? "default" : "outline"} onClick={() => setCalendarMode("day")}>Día</Button>
                  <Button size="sm" variant={calendarMode === "week" ? "default" : "outline"} onClick={() => setCalendarMode("week")}>Semana</Button>
                  <Button size="sm" variant={calendarMode === "month" ? "default" : "outline"} onClick={() => setCalendarMode("month")}>Mes</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelectedDate((d) => addDays(d, -1))}>←</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedDate(new Date())}>Hoy</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedDate((d) => addDays(d, 1))}>→</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {visibleCalendarDays.map((day) => {
                  const dayEvents = events.filter((event) => isSameDay(parseISO(`${event.date}T00:00:00`), day));
                  return (
                    <div
                      key={day.toISOString()}
                      className={`rounded-lg border p-2 ${isSameDay(day, selectedDate) ? "border-primary" : ""} ${calendarMode === "month" && !isSameMonth(day, selectedDate) ? "opacity-40" : ""}`}
                    >
                      <p className="text-xs font-medium">{format(day, "EEE d", { locale: es })}</p>
                      <div className="mt-1 space-y-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <p key={event.id} className="truncate text-[11px] text-muted-foreground">• {event.title}</p>
                        ))}
                        {dayEvents.length > 3 && <p className="text-[11px] text-muted-foreground">+{dayEvents.length - 3} más</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          <Card>
            <CardContent className="py-4 space-y-2">
              {(events ?? []).slice(0, 20).map((event) => (
                <div key={event.id} className="flex items-center justify-between border-b pb-2">
                  <span>{event.title}</span>
                  <span className="text-xs text-muted-foreground">{format(parseISO(`${event.date}T00:00:00`), "dd MMM", { locale: es })}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={taskFilter === "open" ? "default" : "outline"} onClick={() => setTaskFilter("open")}>Open</Button>
                <Button size="sm" variant={taskFilter === "planned" ? "default" : "outline"} onClick={() => setTaskFilter("planned")}>Planned</Button>
                <Button size="sm" variant={taskFilter === "atRisk" ? "default" : "outline"} onClick={() => setTaskFilter("atRisk")}>At risk</Button>
                <Button size="sm" variant={taskFilter === "done" ? "default" : "outline"} onClick={() => setTaskFilter("done")}>Done</Button>
              </div>
            </CardHeader>
            <CardContent className="py-4 space-y-2">
              {filteredTasks.map((task) => (
                <div key={task.id} className="rounded-lg border p-3" data-testid={`task-${task.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{task.title}</span>
                    <Badge>{task.priority}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Estado: {task.status} {(task.metadata as any)?.atRisk ? "· At Risk" : ""}</p>
                  <div className="mt-2 flex gap-2">
                    {task.status !== "done" && <Button size="sm" variant="outline" onClick={() => updateTaskStatus.mutate({ id: task.id, status: "done" })}>Completar</Button>}
                    {task.status !== "canceled" && <Button size="sm" variant="outline" onClick={() => updateTaskStatus.mutate({ id: task.id, status: "canceled" })}>Cancelar</Button>}
                    {task.status !== "open" && <Button size="sm" variant="ghost" onClick={() => updateTaskStatus.mutate({ id: task.id, status: "open" })}>Reabrir</Button>}
                  </div>
                </div>
              ))}
              {filteredTasks.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay tareas para este filtro.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Preferencias de recordatorio</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Quiet hours inicio</p>
                  <Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Quiet hours fin</p>
                  <Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
                Activar canal email
              </label>
              <Button size="sm" onClick={() => updateAvailability.mutate({
                timezone: availability?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
                workDays: availability?.workDays ?? [1,2,3,4,5],
                workStartTime: availability?.workStartTime ?? "09:00",
                workEndTime: availability?.workEndTime ?? "18:00",
                bufferMinutes: availability?.bufferMinutes ?? 10,
                minBlockMinutes: availability?.minBlockMinutes ?? 15,
                doNotDisturbWindows: [{ start: quietStart, end: quietEnd }],
                reminderChannels: emailEnabled ? ["push", "email"] : ["push"],
              })}>Guardar preferencias</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Timeline de auditoría</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {activeLogs.map((log) => (
                <div key={log.id} className="rounded-lg border p-2 text-xs">
                  <p className="font-medium">{log.intent ?? "acción"} · {log.endpoint}</p>
                  <p className="text-muted-foreground">{new Date(log.createdAt).toLocaleString("es-ES")}</p>
                </div>
              ))}
              {activeLogs.length === 0 && <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
