import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, ChevronDown, ChevronUp, CheckCircle2, Clock, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ALLOWED_ROLES = ["lider_actividades", "obispo", "consejero_obispo", "technology_specialist"];
const CAN_EDIT_ROLES = ["lider_actividades", "obispo", "consejero_obispo"];

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "Sin fecha";
  return new Date(dateStr).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completado</Badge>;
  if (status === "in_progress")
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">En progreso</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pendiente</Badge>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-semibold text-muted-foreground uppercase text-xs tracking-wide mb-2 mt-4 first:mt-0">
      {children}
    </h4>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="text-sm">
      <span className="font-medium">{label}: </span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

function LogisticsDetail({
  baptismServiceId,
  canEdit,
}: {
  baptismServiceId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<string, any> | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/baptisms/services", baptismServiceId, "coordination"],
    queryFn: () => apiRequest("GET", `/api/baptisms/services/${baptismServiceId}/coordination`),
    enabled: Boolean(baptismServiceId),
    select: (d: any) => d,
    onSuccess: (d: any) => {
      if (draft === null) setDraft(d?.logistics ?? {});
    },
  } as any);

  const saveMutation = useMutation({
    mutationFn: (logistics: Record<string, any>) =>
      apiRequest("PUT", `/api/baptisms/services/${baptismServiceId}/coordination`, { logistics }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/services", baptismServiceId, "coordination"] });
      toast({ title: "Logística guardada" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="mt-4 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );

  if (isError || !data) return (
    <p className="mt-4 text-sm text-muted-foreground">No se pudo cargar el detalle de logística.</p>
  );

  const log = data.logistics ?? {};
  const d = draft ?? log;

  const set = (key: string, val: any) => setDraft((prev) => ({ ...(prev ?? log), [key]: val }));

  const arregloTasks: { persona?: string; asignacion?: string; hora?: string }[] =
    Array.isArray(log.arreglo_tasks) ? log.arreglo_tasks : [];
  const refrigerioResponsables: string[] = Array.isArray(log.refrigerio_responsables)
    ? log.refrigerio_responsables
    : log.refrigerio_responsable ? [log.refrigerio_responsable] : [];

  if (!canEdit) {
    // Read-only view
    return (
      <div className="mt-4 space-y-3 text-sm border-t pt-4">
        <SectionTitle>Reserva de ambientes</SectionTitle>
        <Field label="Responsable" value={log.espacio_responsable} />
        <Field label="Fecha" value={log.espacio_fecha ? formatDate(log.espacio_fecha) : null} />
        <Field label="Hora inicio" value={log.espacio_hora_inicio} />
        <Field label="Hora fin" value={log.espacio_hora_fin} />
        {Array.isArray(log.espacio_salas) && log.espacio_salas.length > 0 && (
          <Field label="Salas" value={log.espacio_salas.join(", ")} />
        )}
        <Field label="Notas" value={log.espacio_notas} />

        <SectionTitle>Arreglo y preparación</SectionTitle>
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
          <p className="text-muted-foreground italic text-sm">Sin tareas de arreglo.</p>
        )}
        <Field label="Notas" value={log.arreglo_notas} />

        <SectionTitle>Equipo y tecnología</SectionTitle>
        <Field label="Responsable" value={log.equipo_responsable} />
        <Field label="Lista de equipo" value={log.equipo_lista} />
        <Field label="Notas" value={log.equipo_notas} />

        <SectionTitle>Refrigerio</SectionTitle>
        {refrigerioResponsables.length > 0 && (
          <Field label="Responsables" value={refrigerioResponsables.join(", ")} />
        )}
        <Field label="Qué se preparará" value={log.refrigerio_detalle} />
        <Field label="Notas" value={log.refrigerio_notas} />

        <SectionTitle>Limpieza</SectionTitle>
        <Field label="Responsable" value={log.limpieza_responsable} />
        <Field label="Notas" value={log.limpieza_notas} />
      </div>
    );
  }

  // Editable view
  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      {/* Reserva de ambientes */}
      <div className="space-y-2">
        <SectionTitle>Reserva de ambientes</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
            <Input className="h-8 text-sm" value={d.espacio_responsable ?? ""}
              onChange={(e) => set("espacio_responsable", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Fecha</Label>
            <Input type="date" className="h-8 text-sm" value={d.espacio_fecha ?? ""}
              onChange={(e) => set("espacio_fecha", e.target.value || null)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Hora inicio</Label>
            <Input type="time" className="h-8 text-sm" value={d.espacio_hora_inicio ?? ""}
              onChange={(e) => set("espacio_hora_inicio", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Hora fin</Label>
            <Input type="time" className="h-8 text-sm" value={d.espacio_hora_fin ?? ""}
              onChange={(e) => set("espacio_hora_fin", e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Notas</Label>
          <Textarea className="text-sm min-h-[44px] resize-none" value={d.espacio_notas ?? ""}
            onChange={(e) => set("espacio_notas", e.target.value)} />
        </div>
      </div>

      {/* Arreglo y preparación — show read-only tasks, editable notes */}
      <div className="space-y-2">
        <SectionTitle>Arreglo y preparación</SectionTitle>
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
          <p className="text-xs text-muted-foreground italic">Sin tareas registradas.</p>
        )}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Notas</Label>
          <Textarea className="text-sm min-h-[44px] resize-none" value={d.arreglo_notas ?? ""}
            onChange={(e) => set("arreglo_notas", e.target.value)} />
        </div>
      </div>

      {/* Equipo y tecnología */}
      <div className="space-y-2">
        <SectionTitle>Equipo y tecnología</SectionTitle>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
          <Input className="h-8 text-sm" value={d.equipo_responsable ?? ""}
            onChange={(e) => set("equipo_responsable", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Lista de equipo</Label>
          <Textarea className="text-sm min-h-[44px] resize-none" placeholder="Micrófono, proyector..."
            value={d.equipo_lista ?? ""}
            onChange={(e) => set("equipo_lista", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Notas</Label>
          <Textarea className="text-sm min-h-[44px] resize-none" value={d.equipo_notas ?? ""}
            onChange={(e) => set("equipo_notas", e.target.value)} />
        </div>
      </div>

      {/* Refrigerio */}
      <div className="space-y-2">
        <SectionTitle>Refrigerio</SectionTitle>
        {refrigerioResponsables.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Responsables: {refrigerioResponsables.join(", ")}
          </p>
        )}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Qué se preparará</Label>
          <Textarea className="text-sm min-h-[44px] resize-none" placeholder="Pastas, refrescos..."
            value={d.refrigerio_detalle ?? ""}
            onChange={(e) => set("refrigerio_detalle", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Notas</Label>
          <Textarea className="text-sm min-h-[44px] resize-none" value={d.refrigerio_notas ?? ""}
            onChange={(e) => set("refrigerio_notas", e.target.value)} />
        </div>
      </div>

      {/* Limpieza */}
      <div className="space-y-2">
        <SectionTitle>Limpieza</SectionTitle>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
          <Input className="h-8 text-sm" value={d.limpieza_responsable ?? ""}
            onChange={(e) => set("limpieza_responsable", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Notas / tareas</Label>
          <Textarea className="text-sm min-h-[44px] resize-none" value={d.limpieza_notas ?? ""}
            onChange={(e) => set("limpieza_notas", e.target.value)} />
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() => saveMutation.mutate(d)}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        Guardar logística
      </Button>
    </div>
  );
}

function TaskCard({ task, canEdit }: { task: any; canEdit: boolean }) {
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
    task.status === "pending" ? "in_progress"
    : task.status === "in_progress" ? "completed"
    : null;

  const nextStatusLabel =
    nextStatus === "in_progress" ? "Marcar en progreso"
    : nextStatus === "completed" ? "Marcar completado"
    : null;

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
          {task.location_name && <div>Lugar: {task.location_name}</div>}
        </div>
      </CardHeader>
      <CardContent>
        {task.description && (
          <p className="text-sm text-muted-foreground mb-3">{task.description}</p>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {nextStatusLabel && (
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
                <><ChevronUp className="h-3 w-3 mr-1" />Ocultar logística</>
              ) : (
                <><ChevronDown className="h-3 w-3 mr-1" />Ver logística</>
              )}
            </Button>
          )}
        </div>

        {expanded && task.baptism_service_id && (
          <LogisticsDetail
            baptismServiceId={task.baptism_service_id}
            canEdit={canEdit}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function ActivityLogisticsPage() {
  const { user } = useAuth();
  const canEdit = CAN_EDIT_ROLES.includes(user?.role ?? "");

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
          <h3 className="text-lg font-medium text-muted-foreground mb-1">No hay tareas de logística</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Cuando se creen tareas de logística para servicios bautismales, aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task: any) => (
            <TaskCard key={task.id} task={task} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
