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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Settings,
  Plus,
  Mic,
  Calendar as CalendarIcon,
  CheckSquare,
  LayoutGrid,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Search,
  Filter,
} from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

type TaskFilter = "open" | "planned" | "atRisk" | "done";

function sourceLabel(sourceType: string) {
  if (sourceType === "activity") return "Actividad";
  if (sourceType === "interview") return "Entrevista";
  return "Manual";
}

function taskUrl(task: any): string {
  const s = task.source as string;
  const srcId = task.sourceId as string | null | undefined;
  const fa = "&from=agenda";
  const hl = (id: string) => `?highlight=${encodeURIComponent(id)}${fa}`;
  const asgHl = hl(task.id);
  if (s === "budget")                 return `/budget${srcId ? hl(srcId) : `?${fa.slice(1)}`}`;
  if (s === "welfare")                return `/welfare${srcId ? hl(srcId) : `?${fa.slice(1)}`}`;
  if (s === "interview")              return `/interviews${srcId ? hl(srcId) : `?${fa.slice(1)}`}`;
  if (s === "organization_interview") return `/organization-interviews${srcId ? hl(srcId) : `?${fa.slice(1)}`}`;
  if (s === "council")                return `/ward-council${srcId ? hl(srcId) : `?${fa.slice(1)}`}`;
  if (s === "activity")               return `/activities${srcId ? hl(srcId) : `?${fa.slice(1)}`}`;
  if (s === "presidency-meeting")     return `/assignments${asgHl}`;
  if (s === "agenda")                 return "/agenda";
  return `/assignments${asgHl}`;
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
  const { toast } = useToast();
  const { data, isLoading } = useAgendaData();
  const runPlanner = useRunAgendaPlanner();
  const createAgendaTask = useCreateAgendaTask();
  const updateTaskStatus = useUpdateAgendaTaskStatus();
  const { data: availability } = useAgendaAvailability();
  const updateAvailability = useUpdateAgendaAvailability();
  const { data: assignments } = useAssignments();
  const { data: myTasks = [] } = useMyTasks();

  const [activeTab, setActiveTab] = useState<"timeline" | "kanban" | "checklist">("timeline");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<"baja" | "media" | "alta">("media");
  const [dictatedText, setDictatedText] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("06:00");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  const events = data?.events ?? [];
  const plans = data?.plans ?? [];
  const tasks = data?.tasks ?? [];

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
  const doneTasks = useMemo(() => tasks.filter((t: any) => t.status === "done"), [tasks]);

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
      onSuccess: () => {
        toast({ title: "Preferencias guardadas", description: "Configuración de silencio actualizada." });
        setIsPreferencesOpen(false);
      },
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

  const handleQuickAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;

    createAgendaTask.mutate({
      title,
      description: title,
    }, {
      onSuccess: () => {
        setQuickTitle("");
        toast({ title: "Tarea añadida", description: `"${title}" se guardó en tu agenda.` });
      },
    });
  };

  const startDictation = () => {
    const recognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!recognitionImpl) {
      toast({ title: "No disponible", description: "Tu navegador no soporta dictado por voz.", variant: "destructive" });
      return;
    }
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
      onSuccess: () => {
        setDictatedText(null);
        toast({ title: "Tarea guardada", description: "Se ha añadido la tarea dictada." });
      },
    });
  };

  const searchedTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter((t: any) => t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
  }, [tasks, searchQuery]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" data-testid="agenda-page">
      {/* Header & Quick Actions */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Espacio unificado de tareas, calendario y acuerdos personales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={isPreferencesOpen} onOpenChange={setIsPreferencesOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <Settings className="h-4 w-4" />
                Preferencias
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Preferencias de recordatorios</DialogTitle>
                <DialogDescription>
                  Ajusta horas silenciosas y canales de notificación de la agenda.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs font-medium">
                    <span className="text-muted-foreground">Silencio desde</span>
                    <Input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    <span className="text-muted-foreground">Hasta</span>
                    <Input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} className="rounded" />
                  Enviar también recordatorios por correo electrónico
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
            size="sm"
            className="gap-2 text-xs font-medium"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Auto-Planificar
          </Button>
        </div>
      </header>

      {/* Notion Quick Capture Input Bar */}
      <GlassCard className="p-2 sm:p-3 border-primary/20 bg-primary/5 shadow-md">
        <form onSubmit={handleQuickAdd} className="flex flex-col sm:flex-row items-center gap-2">
          <div className="relative flex-1 w-full">
            <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="+ Añadir tarea o acuerdo rápido (presiona Enter)..."
              className="pl-9 pr-4 bg-background/60 border-muted-foreground/20 text-sm focus-visible:ring-primary"
              data-testid="input-quick-task"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <select
              value={quickPriority}
              onChange={(e: any) => setQuickPriority(e.target.value)}
              className="h-9 text-xs rounded-md border border-input bg-background/80 px-3 text-muted-foreground focus:outline-none"
            >
              <option value="baja">Prioridad Normal</option>
              <option value="media">Prioridad Media</option>
              <option value="alta">🔥 Prioridad Alta</option>
            </select>

            <Button
              type="button"
              variant={isListening ? "destructive" : "outline"}
              size="sm"
              onClick={startDictation}
              className="gap-1.5 text-xs shrink-0"
            >
              <Mic className={`h-3.5 w-3.5 ${isListening ? "animate-pulse" : ""}`} />
              {isListening ? "Escuchando..." : "Dictar"}
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={!quickTitle.trim() || createAgendaTask.isPending}
              className="text-xs font-semibold px-4 shrink-0"
            >
              Añadir
            </Button>
          </div>
        </form>

        {dictatedText && (
          <div className="mt-3 p-3 rounded-lg border border-primary/30 bg-background/80 flex items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-muted-foreground font-semibold">Dictado detectado: </span>
              <span className="font-medium text-foreground">"{dictatedText}"</span>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" className="h-7 text-xs" onClick={confirmDictationTask}>Guardar</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDictatedText(null)}>Descartar</Button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Mini Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlassCard className="p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{todayEvents.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Eventos Hoy</p>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{openTasks.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Pendientes</p>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-amber-500">{atRiskTasks.length}</p>
            <p className="text-xs text-muted-foreground mt-1">En Riesgo</p>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-green-500/10 text-green-500">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none text-green-500">{doneTasks.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Completadas</p>
          </div>
        </GlassCard>
      </div>

      {/* Main Notion-Style Workspace Tabs */}
      <Tabs defaultValue="timeline" value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-2">
          <TabsList className="bg-muted/40 p-1">
            <TabsTrigger value="timeline" className="gap-2 text-xs sm:text-sm">
              <CalendarIcon className="h-4 w-4" />
              Línea de Tiempo
            </TabsTrigger>
            <TabsTrigger value="kanban" className="gap-2 text-xs sm:text-sm">
              <LayoutGrid className="h-4 w-4" />
              Tablero Kanban
            </TabsTrigger>
            <TabsTrigger value="checklist" className="gap-2 text-xs sm:text-sm">
              <CheckSquare className="h-4 w-4" />
              Minutas & Checklists
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en tareas..."
              className="h-8 pl-8 text-xs bg-muted/20"
            />
          </div>
        </div>

        {/* TAB 1: Timeline / Day View */}
        <TabsContent value="timeline" className="pt-4 space-y-4">
          {/* Week Selector */}
          <GlassCard className="p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Semana de {format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "d 'de' MMMM", { locale: es })}
              </span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedDate((d) => addDays(d, -7))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={() => setSelectedDate(new Date())}>
                  Hoy
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedDate((d) => addDays(d, 7))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {weekDays.map((day) => {
                const count = events.filter((e) => isSameDay(parseISO(`${e.date}T00:00:00`), day)).length;
                const isSel = isSameDay(day, selectedDate);
                const isTod = isToday(day);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all h-[78px] w-full ${
                      isSel
                        ? "border-primary bg-primary text-primary-foreground font-bold shadow-md"
                        : isTod
                        ? "border-primary/50 bg-primary/10 text-foreground font-semibold"
                        : "border-border/40 bg-background/40 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-85 leading-none">
                      {format(day, "EEE", { locale: es })}
                    </span>
                    <span className="text-base font-extrabold leading-none my-1">
                      {format(day, "d", { locale: es })}
                    </span>
                    <div className="h-3.5 flex items-center justify-center">
                      {count > 0 ? (
                        <span
                          className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-medium rounded-full ${
                            isSel
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-primary/20 text-primary font-semibold"
                          }`}
                        >
                          {count} {count === 1 ? "ev." : "ev."}
                        </span>
                      ) : (
                        <span className="h-1 w-1 rounded-full bg-transparent"></span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Daily Schedule List */}
          <GlassCard className="p-4 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Eventos y Acuerdos — {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
            </h3>

            {isLoading && <p className="text-xs text-muted-foreground py-4 text-center">Cargando agenda...</p>}

            {!isLoading && dayEvents.length === 0 && dayPlans.length === 0 && dayTasksDue.length === 0 && (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">Sin eventos o tareas programadas para este día.</p>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setActiveTab("kanban")}>
                  Ver todas las tareas pendientes →
                </Button>
              </div>
            )}

            <div className="space-y-2.5">
              {dayPlans.map((plan: any) => (
                <div key={plan.id} className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{plan.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(plan.start, "HH:mm")} - {format(plan.end, "HH:mm")}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-blue-500/40 text-blue-500 text-xs">Bloque Planificado</Badge>
                </div>
              ))}

              {dayTasksDue.map((task: any) => (
                <div key={`due-${task.id}`} className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Vence hoy: {task.dueAt ? new Date(task.dueAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "Sin hora"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={task.status === "done" ? "outline" : "default"}
                    className="h-7 text-xs"
                    onClick={() => updateTaskStatus.mutate({ id: task.id, status: task.status === "done" ? "open" : "done" })}
                  >
                    {task.status === "done" ? "✓ Completada" : "Marcar Hecho"}
                  </Button>
                </div>
              ))}

              {filteredDayEvents.map((event) => {
                const isPast = parseISO(`${event.date}T${event.endTime ?? event.startTime ?? "23:59"}:00`).getTime() < Date.now();
                const isInterview = event.sourceType === "interview";

                return (
                  <div key={event.id} className="p-3 rounded-xl border border-border/60 bg-background/40 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {event.startTime ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ""}` : "Todo el día"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{sourceLabel(event.sourceType)}</Badge>
                      {event.sourceType !== "manual" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setLocation(isInterview ? `/interviews?highlight=${encodeURIComponent(event.sourceId ?? "")}` : "/activities")}
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </TabsContent>

        {/* TAB 2: Notion Kanban Board */}
        <TabsContent value="kanban" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Column 1: Por Hacer */}
            <GlassCard className="p-3 border-purple-500/20 bg-purple-500/5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                  Por Hacer ({openTasks.length})
                </span>
              </div>

              <div className="space-y-2">
                {searchedTasks.filter((t: any) => t.status === "open" && !(t.metadata as any)?.atRisk).map((task: any) => (
                  <div key={task.id} className="p-3 rounded-xl border border-border/60 bg-background/80 shadow-xs space-y-2 hover:border-primary/40 transition-all">
                    <p className="text-sm font-medium leading-snug">{task.title}</p>
                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{task.priority ?? "normal"}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] px-2 text-primary"
                        onClick={() => updateTaskStatus.mutate({ id: task.id, status: "done" })}
                      >
                        Completar →
                      </Button>
                    </div>
                  </div>
                ))}
                {openTasks.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Sin tareas pendientes.</p>}
              </div>
            </GlassCard>

            {/* Column 2: En Riesgo / Foco */}
            <GlassCard className="p-3 border-amber-500/20 bg-amber-500/5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                  En Riesgo / Foco ({atRiskTasks.length})
                </span>
              </div>

              <div className="space-y-2">
                {searchedTasks.filter((t: any) => t.status === "open" && (t.metadata as any)?.atRisk).map((task: any) => (
                  <div key={task.id} className="p-3 rounded-xl border border-amber-500/30 bg-background/80 shadow-xs space-y-2">
                    <p className="text-sm font-medium leading-snug text-amber-950 dark:text-amber-100">{task.title}</p>
                    <div className="flex items-center justify-between pt-1 border-t border-amber-500/20">
                      <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-600">Prioridad Alta</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] px-2 text-primary"
                        onClick={() => updateTaskStatus.mutate({ id: task.id, status: "done" })}
                      >
                        Completar →
                      </Button>
                    </div>
                  </div>
                ))}
                {atRiskTasks.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Sin tareas críticas en riesgo.</p>}
              </div>
            </GlassCard>

            {/* Column 3: Completadas */}
            <GlassCard className="p-3 border-green-500/20 bg-green-500/5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <span className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  Completadas ({doneTasks.length})
                </span>
              </div>

              <div className="space-y-2">
                {searchedTasks.filter((t: any) => t.status === "done").slice(0, 10).map((task: any) => (
                  <div key={task.id} className="p-3 rounded-xl border border-border/40 bg-background/40 opacity-75 space-y-1">
                    <p className="text-sm font-medium line-through text-muted-foreground">{task.title}</p>
                    <p className="text-[10px] text-green-600 dark:text-green-400">✓ Completada</p>
                  </div>
                ))}
                {doneTasks.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Aún no hay tareas completadas.</p>}
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        {/* TAB 3: Interactive Notion Checklists & Notes */}
        <TabsContent value="checklist" className="pt-4 space-y-4">
          <GlassCard className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                Lista de Verificación de Acuerdos y Minutas
              </h3>
              <span className="text-xs text-muted-foreground">
                Haz clic en la casilla para marcar como completado
              </span>
            </div>

            <div className="space-y-2">
              {searchedTasks.filter((t: any) => t.status !== "canceled").map((task: any) => {
                const isDone = task.status === "done";

                return (
                  <div
                    key={task.id}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isDone
                        ? "bg-muted/20 border-border/40 opacity-70"
                        : "bg-background/60 border-border/60 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={isDone}
                        onCheckedChange={(checked) => {
                          updateTaskStatus.mutate({ id: task.id, status: checked ? "done" : "open" });
                        }}
                        className="h-5 w-5"
                      />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {task.title}
                        </p>
                        {task.description && task.description !== task.title && (
                          <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px]">{sourceLabel(task.source ?? "manual")}</Badge>
                      {task.priority === "alta" && <Badge variant="destructive" className="text-[10px]">Alta</Badge>}
                    </div>
                  </div>
                );
              })}

              {tasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No hay tareas o acuerdos registrados.</p>
              )}
            </div>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
