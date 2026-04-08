import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CalendarDays, MapPin, Users, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

// ── Lobby — /actividades ──────────────────────────────────────────────────────
export function ActivitiesLobby() {
  const { data: activities, isLoading } = useQuery<any[]>({
    queryKey: ["/api/actividades"],
    queryFn: async () => {
      const res = await fetch("/api/actividades");
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Actividades del Barrio</h1>
          <p className="text-muted-foreground text-sm">Próximas actividades abiertas a la comunidad</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
          </div>
        ) : !activities || activities.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No hay actividades próximas publicadas.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((act) => (
              <a key={act.id} href={`/actividades/${act.slug}`} className="block">
                <div className="rounded-2xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
                  {act.flyer_url && (
                    <img
                      src={act.flyer_url}
                      alt={act.title}
                      className="w-full h-48 object-cover"
                    />
                  )}
                  <div className="p-4 space-y-2">
                    <div>
                      {act.organization_name && (
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          {act.organization_name}
                        </p>
                      )}
                      <h2 className="text-lg font-bold">{act.title}</h2>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(act.date)} · {formatTime(act.date)}
                      </span>
                      {act.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {act.location}
                        </span>
                      )}
                      {act.asistencia_esperada && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {act.asistencia_esperada} personas
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail — /actividades/:slug ───────────────────────────────────────────────
export function ActivityPublicDetail() {
  const { slug } = useParams<{ slug: string }>();

  const { data: act, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/actividades", slug],
    queryFn: async () => {
      const res = await fetch(`/api/actividades/${slug}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: Boolean(slug),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  if (isError || !act) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-muted-foreground">
        <p className="text-lg font-medium">Actividad no encontrada</p>
        <a href="/actividades" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Ver todas las actividades
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <a href="/actividades" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Todas las actividades
        </a>

        {act.flyer_url && (
          <img
            src={act.flyer_url}
            alt={act.title}
            className="w-full rounded-2xl object-contain max-h-96 border"
          />
        )}

        <div className="space-y-3">
          {act.organization_name && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {act.organization_name}
            </p>
          )}
          <h1 className="text-2xl font-extrabold tracking-tight">{act.title}</h1>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              <span className="capitalize">{formatDate(act.date)}</span>
              <span className="text-foreground font-medium">· {formatTime(act.date)}</span>
            </div>
            {act.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <span>{act.location}</span>
              </div>
            )}
            {act.asistencia_esperada && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 shrink-0 text-primary" />
                <span>Capacidad estimada: {act.asistencia_esperada} personas</span>
              </div>
            )}
          </div>

          {act.description && (
            <div className="pt-2 border-t">
              <p className="text-sm leading-relaxed">{act.description}</p>
            </div>
          )}

          {act.objetivo && (
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Objetivo</p>
              <p className="text-sm leading-relaxed">{act.objetivo}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
