import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, ChevronDown, ChevronUp, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

const ALLOWED_ROLES = ["lider_actividades", "obispo", "consejero_obispo", "technology_specialist"];

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "Sin fecha";
  return new Date(dateStr).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
        Completado
      </Badge>
    );
  }
  if (status === "in_progress") {
    return (
      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
        En progreso
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
      Pendiente
    </Badge>
  );
}

function LogisticsDetail({ baptismServiceId }: { baptismServiceId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/baptisms/services", baptismServiceId, "coordination"],
    queryFn: () => apiRequest("GET", `/api/baptisms/services/${baptismServiceId}/coordination`),
    enabled: Boolean(baptismServiceId),
  });

  if (isLoading) {
    return (
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No se pudo cargar el detalle de logística.
      </p>
    );
  }

  const log = data.logistics;

  if (!log) {
    return (
      <p className="mt-4 text-sm text-muted-foreground italic">
        Sin datos de logística registrados aún.
      </p>
    );
  }

  const arregloTasks: { persona?: string; asignacion?: string; hora?: string }[] =
    Array.isArray(log.arreglo_tasks) ? log.arreglo_tasks : [];
  const refrigerioResponsables: string[] = Array.isArray(log.refrigerio_responsables)
    ? log.refrigerio_responsables
    : [];

  return (
    <div className="mt-4 space-y-4 text-sm">
      {/* Reserva de ambientes */}
      <section>
        <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wide mb-1">
          Reserva de ambientes
        </h4>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {log.espacio_responsable && (
            <div><span className="font-medium">Responsable:</span> {log.espacio_responsable}</div>
          )}
          {log.espacio_fecha && (
            <div><span className="font-medium">Fecha:</span> {formatDate(log.espacio_fecha)}</div>
          )}
          {log.espacio_hora_inicio && (
            <div><span className="font-medium">Hora inicio:</span> {log.espacio_hora_inicio}</div>
          )}
          {log.espacio_hora_fin && (
            <div><span className="font-medium">Hora fin:</span> {log.espacio_hora_fin}</div>
          )}
          {Array.isArray(log.espacio_salas) && log.espacio_salas.length > 0 && (
            <div className="sm:col-span-2">
              <span className="font-medium">Salas:</span> {log.espacio_salas.join(", ")}
            </div>
          )}
          {log.espacio_notas && (
            <div className="sm:col-span-2">
              <span className="font-medium">Notas:</span> {log.espacio_notas}
            </div>
          )}
          {log.espacio_comprobante_url && (
            <div className="sm:col-span-2">
              <span className="font-medium">Comprobante:</span>{" "}
              <a
                href={log.espacio_comprobante_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                Ver comprobante
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Arreglo y preparación */}
      <section>
        <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wide mb-1">
          Arreglo y preparación
        </h4>
        {arregloTasks.length > 0 ? (
          <table className="w-full text-sm border rounded overflow-hidden">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-2 py-1 font-medium">Persona</th>
                <th className="text-left px-2 py-1 font-medium">Asignación</th>
                <th className="text-left px-2 py-1 font-medium">Hora</th>
              </tr>
            </thead>
            <tbody>
              {arregloTasks.map((t, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1">{t.persona || "-"}</td>
                  <td className="px-2 py-1">{t.asignacion || "-"}</td>
                  <td className="px-2 py-1">{t.hora || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground italic">Sin tareas de arreglo.</p>
        )}
        {log.arreglo_notas && (
          <div className="mt-1">
            <span className="font-medium">Notas:</span> {log.arreglo_notas}
          </div>
        )}
      </section>

      {/* Equipo y tecnología */}
      <section>
        <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wide mb-1">
          Equipo y tecnología
        </h4>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {log.equipo_responsable && (
            <div><span className="font-medium">Responsable:</span> {log.equipo_responsable}</div>
          )}
          {log.equipo_lista && (
            <div className="sm:col-span-2">
              <span className="font-medium">Lista de equipo:</span> {log.equipo_lista}
            </div>
          )}
          {log.equipo_notas && (
            <div className="sm:col-span-2">
              <span className="font-medium">Notas:</span> {log.equipo_notas}
            </div>
          )}
        </div>
      </section>

      {/* Refrigerio */}
      <section>
        <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wide mb-1">
          Refrigerio
        </h4>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {refrigerioResponsables.length > 0 && (
            <div className="sm:col-span-2">
              <span className="font-medium">Responsables:</span>{" "}
              {refrigerioResponsables.join(", ")}
            </div>
          )}
          {log.refrigerio_detalle && (
            <div className="sm:col-span-2">
              <span className="font-medium">Detalle:</span> {log.refrigerio_detalle}
            </div>
          )}
          {log.refrigerio_notas && (
            <div className="sm:col-span-2">
              <span className="font-medium">Notas:</span> {log.refrigerio_notas}
            </div>
          )}
        </div>
      </section>

      {/* Limpieza */}
      <section>
        <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wide mb-1">
          Limpieza
        </h4>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {log.limpieza_responsable && (
            <div><span className="font-medium">Responsable:</span> {log.limpieza_responsable}</div>
          )}
          {log.limpieza_notas && (
            <div className="sm:col-span-2">
              <span className="font-medium">Notas:</span> {log.limpieza_notas}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function TaskCard({ task }: { task: any }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      apiRequest("PATCH", `/api/service-tasks/${task.id}/status`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-tasks"] });
    },
  });

  const nextStatus =
    task.status === "pending"
      ? "in_progress"
      : task.status === "in_progress"
      ? "completed"
      : null;

  const nextStatusLabel =
    nextStatus === "in_progress" ? "Marcar en progreso" : nextStatus === "completed" ? "Marcar completado" : null;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold leading-snug flex-1">
            {task.title || "Tarea sin título"}
          </CardTitle>
          <StatusBadge status={task.status} />
        </div>
        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
          {task.service_at && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{formatDate(task.service_at)}</span>
            </div>
          )}
          {task.location_name && (
            <div>Lugar: {task.location_name}</div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {task.description && (
          <p className="text-sm text-muted-foreground mb-3">{task.description}</p>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {nextStatusLabel && task.status !== "completed" && (
              <Button
                size="sm"
                variant={nextStatus === "completed" ? "default" : "outline"}
                onClick={() => statusMutation.mutate(nextStatus!)}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : nextStatus === "completed" ? (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                ) : null}
                {nextStatusLabel}
              </Button>
            )}
          </div>

          {task.baptism_service_id && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Ocultar logística
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Ver logística
                </>
              )}
            </Button>
          )}
        </div>

        {expanded && task.baptism_service_id && (
          <LogisticsDetail baptismServiceId={task.baptism_service_id} />
        )}
      </CardContent>
    </Card>
  );
}

export default function ActivityLogisticsPage() {
  const { user } = useAuth();

  const { data: tasks = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/service-tasks"],
    queryFn: () => apiRequest("GET", "/api/service-tasks"),
    enabled: Boolean(user) && ALLOWED_ROLES.includes(user?.role ?? ""),
  });

  if (!user || !ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">No tienes acceso a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Logística de actividades</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tareas de logística asignadas para los servicios bautismales.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-32 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-1">
            No hay tareas de logística
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Cuando se creen tareas de logística para servicios bautismales, aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task: any) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
