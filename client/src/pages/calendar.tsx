import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { ChevronLeft, ChevronRight, Clock, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "reunion" | "consejo" | "presidencia" | "entrevista" | "actividad";
  location?: string;
  description?: string;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/events"],
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const calendarDays = viewMode === "month" 
    ? monthDays 
    : weekDays;

  const getEventColor = (type: string) => {
    switch (type) {
      case "reunion":
        return "bg-blue-500 text-white border-blue-600 dark:bg-blue-600 dark:text-white dark:border-blue-700";
      case "consejo":
        return "bg-purple-500 text-white border-purple-600 dark:bg-purple-600 dark:text-white dark:border-purple-700";
      case "presidencia":
        return "bg-green-500 text-white border-green-600 dark:bg-green-600 dark:text-white dark:border-green-700";
      case "entrevista":
        return "bg-orange-500 text-white border-orange-600 dark:bg-orange-600 dark:text-white dark:border-orange-700";
      case "actividad":
        return "bg-pink-500 text-white border-pink-600 dark:bg-pink-600 dark:text-white dark:border-pink-700";
      default:
        return "bg-gray-500 text-white border-gray-600 dark:bg-gray-600 dark:text-white dark:border-gray-700";
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

  const upcomingEvents = events
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    .slice(0, 10);

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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Calendario</h1>
        <p className="text-muted-foreground">Vista integrada de todas las actividades y eventos</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Calendar */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{format(currentDate, "MMMM yyyy", { locale: es })}</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
                    data-testid="button-prev-month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentDate(new Date())}
                    data-testid="button-today"
                  >
                    Hoy
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
                    data-testid="button-next-month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant={viewMode === "month" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("month")}
                  data-testid="button-month-view"
                >
                  Mes
                </Button>
                <Button
                  variant={viewMode === "week" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("week")}
                  data-testid="button-week-view"
                >
                  Semana
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {viewMode === "month" ? (
                <div>
                  {/* Calendar Header */}
                  <div className="grid grid-cols-7 gap-2 mb-2">
                    {["L", "M", "X", "J", "V", "S", "D"].map(day => (
                      <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
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

                      return (
                        <div
                          key={day.toISOString()}
                          className={`min-h-32 p-2 rounded-md border ${
                            isToday
                              ? "bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700"
                              : isCurrentMonth
                              ? "bg-white border-gray-200 dark:bg-slate-900 dark:border-slate-700"
                              : "bg-gray-50 border-gray-200 opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:opacity-30"
                          }`}
                          data-testid={`calendar-day-${format(day, "dd-MM-yyyy")}`}
                        >
                          <div className="text-sm font-semibold mb-1 text-center">{format(day, "d")}</div>
                          <div className="space-y-1">
                            {dayEvents.slice(0, 2).map(event => (
                              <div
                                key={event.id}
                                className={`text-xs p-1 rounded border cursor-pointer hover:opacity-80 ${getEventColor(event.type)}`}
                                title={event.title}
                                data-testid={`event-${event.id}`}
                              >
                                {event.title.length > 12 ? `${event.title.substring(0, 12)}...` : event.title}
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-xs text-muted-foreground text-center">
                                +{dayEvents.length - 2} más
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Week View */}
                  <div className="space-y-4">
                    {weekDays.map(day => {
                      const dayEvents = eventsOnDate(day);
                      const isToday = isSameDay(day, new Date());

                      return (
                        <div
                          key={day.toISOString()}
                          className={`p-4 rounded-md border ${isToday ? "bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700" : "bg-white border-gray-200 dark:bg-slate-900 dark:border-slate-700"}`}
                        >
                          <div className="font-semibold mb-2">
                            {format(day, "EEEE, d MMMM", { locale: es })}
                          </div>
                          {dayEvents.length === 0 ? (
                            <div className="text-sm text-muted-foreground">Sin eventos</div>
                          ) : (
                            <div className="space-y-2">
                              {dayEvents.map(event => (
                                <div key={event.id} className={`p-2 rounded border ${getEventColor(event.type)}`} data-testid={`event-${event.id}`}>
                                  <div className="font-medium text-sm">{event.title}</div>
                                  <div className="flex gap-2 text-xs mt-1">
                                    {event.location && (
                                      <div className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {event.location}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {format(new Date(event.date), "HH:mm")}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                    <div
                      key={event.id}
                      className="p-3 rounded-md border border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      data-testid={`upcoming-event-${event.id}`}
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
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
