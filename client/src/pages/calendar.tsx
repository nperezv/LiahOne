import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isTomorrow,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "reunion" | "consejo" | "presidencia" | "entrevista" | "actividad";
  location?: string;
  description?: string;
  status?: "programada" | "completada" | "cancelada" | "archivada";
}

const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }

  navigate(path);
};

export default function CalendarPage() {
  const [, setLocation] = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"agenda" | "month" | "day">("agenda");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const presidencyOrg = new URLSearchParams(window.location.search).get("org");

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthGridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const monthGridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: monthGridStart, end: monthGridEnd });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getEventDotClass = (type: string) => {
    switch (type) {
      case "reunion":
        return "bg-blue-500";
      case "consejo":
        return "bg-purple-500";
      case "presidencia":
        return "bg-green-500";
      case "entrevista":
        return "bg-orange-500";
      case "actividad":
        return "bg-pink-500";
      default:
        return "bg-gray-500";
    }
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case "reunion":
        return "Reunión Sacramental";
      case "consejo":
        return "Consejo de Barrio";
      case "presidencia":
        return "Presidencia";
      case "entrevista":
        return "Entrevista";
      case "actividad":
        return "Actividad";
      default:
        return type;
    }
  };

  const eventsOnDate = (date: Date) => {
    return events.filter((event) => isSameDay(new Date(event.date), date));
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsEventDialogOpen(true);
  };

  const isUpcomingEvent = (event: CalendarEvent) => {
    const eventDate = new Date(event.date);
    if (eventDate < startOfDay(new Date())) {
      return false;
    }
    if (event.type === "entrevista" && event.status === "completada") {
      return false;
    }
    return true;
  };

  const upcomingEvents = [...events]
    .filter(isUpcomingEvent)
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    .slice(0, 10);

  const agendaSections = useMemo(() => {
    const upcoming = [...events]
      .filter(isUpcomingEvent)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const groups = new Map<string, CalendarEvent[]>();
    upcoming.forEach((event) => {
      const key = format(new Date(event.date), "yyyy-MM-dd");
      const existing = groups.get(key) ?? [];
      existing.push(event);
      groups.set(key, existing);
    });

    return Array.from(groups.entries()).map(([key, groupEvents]) => {
      const date = new Date(`${key}T00:00:00`);
      const label = isToday(date)
        ? `Hoy · ${format(date, "d MMM", { locale: es })}`
        : isTomorrow(date)
          ? `Mañana · ${format(date, "d MMM", { locale: es })}`
          : format(date, "EEEE d MMMM", { locale: es });
      return {
        key,
        date,
        label,
        events: groupEvents,
      };
    });
  }, [events]);

  const selectedDayEvents = useMemo(() => {
    return eventsOnDate(selectedDate).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [events, selectedDate]);

  const headerDate = viewMode === "day" ? selectedDate : currentDate;

  const handlePrev = () => {
    if (viewMode === "day") {
      setSelectedDate((prev) => addDays(prev, -1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    }
  };

  const handleNext = () => {
    if (viewMode === "day") {
      setSelectedDate((prev) => addDays(prev, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    }
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-96 w-full" />
          </div>
          <div>
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Calendario</h1>
          <p className="text-muted-foreground">Vista integrada de todas las actividades y eventos</p>
        </div>
        {presidencyOrg && (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => navigateWithTransition(setLocation, `/presidency/${presidencyOrg}`)}
            data-testid="button-back-presidency-panel"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Calendar */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg sm:text-xl">
                    {viewMode === "day"
                      ? format(headerDate, "EEEE d MMMM", { locale: es })
                      : format(headerDate, "MMMM yyyy", { locale: es })}
                  </CardTitle>
                  {viewMode === "day" && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {isToday(headerDate) ? "Hoy" : format(headerDate, "dd MMM yyyy", { locale: es })}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrev}
                    data-testid="button-prev-month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToday}
                    data-testid="button-today"
                  >
                    Hoy
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleNext}
                    data-testid="button-next-month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 mt-4 flex-wrap">
                <Button
                  variant={viewMode === "agenda" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("agenda")}
                  data-testid="button-agenda-view"
                >
                  Agenda
                </Button>
                <Button
                  variant={viewMode === "month" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("month")}
                  data-testid="button-month-view"
                >
                  Mes
                </Button>
                <Button
                  variant={viewMode === "day" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("day")}
                  data-testid="button-day-view"
                >
                  Día
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {viewMode === "agenda" ? (
                <div className="space-y-6">
                  {agendaSections.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No hay eventos próximos</div>
                  ) : (
                    agendaSections.map((section) => (
                      <div key={section.key} className="space-y-3">
                        <div className="text-sm font-semibold text-muted-foreground">{section.label}</div>
                        <div className="space-y-2">
                          {section.events.map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              className="w-full text-left p-3 sm:p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                              data-testid={`agenda-event-${event.id}`}
                              onClick={() => handleEventClick(event)}
                            >
                              <div className="flex gap-4">
                                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                  {format(new Date(event.date), "HH:mm")}
                                </div>
                                <div className="flex-1">
                                  <div className="text-sm font-semibold leading-tight">{event.title}</div>
                                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                                    <span className={`h-2 w-2 rounded-full ${getEventDotClass(event.type)}`} />
                                    <span>{getEventTypeLabel(event.type)}</span>
                                    {event.location && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {event.location}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : viewMode === "month" ? (
                <div className="overflow-x-auto">
                  <div className="min-w-[720px]">
                    {/* Calendar Header */}
                    <div className="grid grid-cols-7 gap-2 mb-2">
                      {["L", "M", "X", "J", "V", "S", "D"].map(day => (
                        <div key={day} className="text-center font-semibold text-xs sm:text-sm text-muted-foreground py-2">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Days */}
                    <div className="grid grid-cols-7 gap-2">
                      {monthDays.map(day => {
                        const dayEvents = eventsOnDate(day);
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isToday = isSameDay(day, new Date());
                        const uniqueTypes = Array.from(new Set(dayEvents.map((event) => event.type)));

                        return (
                          <button
                            key={day.toISOString()}
                            type="button"
                            onClick={() => {
                              setSelectedDate(day);
                              setViewMode("day");
                            }}
                            className={`min-h-24 sm:min-h-32 p-2 rounded-xl border text-left transition ${
                              isToday
                                ? "bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700"
                                : isCurrentMonth
                                ? "bg-white border-gray-200 hover:bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                                : "bg-gray-50 border-gray-200 opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:opacity-30"
                            }`}
                            data-testid={`calendar-day-${format(day, "dd-MM-yyyy")}`}
                          >
                            <div className="text-xs sm:text-sm font-semibold mb-1 text-center">{format(day, "d")}</div>
                            <div className="flex flex-wrap justify-center gap-1 mt-2">
                              {uniqueTypes.slice(0, 3).map((type) => (
                                <span
                                  key={type}
                                  className={`h-2 w-2 rounded-full ${getEventDotClass(type)}`}
                                />
                              ))}
                            </div>
                            {dayEvents.length > 3 && (
                              <div className="text-[10px] text-muted-foreground text-center mt-2">
                                +{dayEvents.length - 3}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {/* Day View */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2 overflow-x-auto">
                      {weekDays.map((day) => {
                        const isSelected = isSameDay(day, selectedDate);
                        return (
                          <button
                            key={day.toISOString()}
                            type="button"
                            className={`flex flex-col items-center px-3 py-2 rounded-xl border text-xs sm:text-sm min-w-[72px] ${
                              isSelected
                                ? "bg-blue-500 text-white border-blue-500"
                                : "bg-white border-gray-200 text-muted-foreground dark:bg-slate-900 dark:border-slate-700"
                            }`}
                            onClick={() => setSelectedDate(day)}
                          >
                            <span className="uppercase text-[10px]">{format(day, "EEE", { locale: es })}</span>
                            <span className="font-semibold">{format(day, "d")}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Eventos del día</h3>
                      {selectedDayEvents.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Sin eventos</div>
                      ) : (
                        <div className="space-y-2">
                          {selectedDayEvents.map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              className="w-full text-left p-3 sm:p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                              data-testid={`day-event-${event.id}`}
                              onClick={() => handleEventClick(event)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold">{event.title}</div>
                                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                                    <span className={`h-2 w-2 rounded-full ${getEventDotClass(event.type)}`} />
                                    <span>{getEventTypeLabel(event.type)}</span>
                                    {event.location && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {event.location}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                                  <Clock className="h-3 w-3" />
                                  {format(new Date(event.date), "HH:mm")}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Events Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Próximos Eventos</CardTitle>
              <CardDescription>Próximos 10 eventos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingEvents.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No hay eventos próximos</div>
                ) : (
                  upcomingEvents.map(event => (
                    <button
                      key={event.id}
                      type="button"
                      className="w-full text-left p-3 rounded-md border border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      data-testid={`upcoming-event-${event.id}`}
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="text-sm font-semibold leading-tight line-clamp-2">{event.title}</div>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {getEventTypeLabel(event.type)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(event.date), "d MMM, HH:mm", { locale: es })}
                      </div>
                      {event.location && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title ?? "Detalle del evento"}</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{getEventTypeLabel(selectedEvent.type)}</Badge>
                <span className="text-muted-foreground">
                  {format(new Date(selectedEvent.date), "d MMMM yyyy, HH:mm", { locale: es })}
                </span>
              </div>
              {selectedEvent.location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}
              {selectedEvent.description && (
                <div className="text-muted-foreground">{selectedEvent.description}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
