import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, RefreshCw, Repeat2, Calendar, Pencil, Trash2,
  ArrowLeftRight, CheckCircle2, Bell, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useOrganizations } from "@/hooks/use-api";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatDateEs(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-ES", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useRecurringSeries() {
  return useQuery<any[]>({
    queryKey: ["/api/recurring-series"],
    queryFn: () => apiRequest("GET", "/api/recurring-series"),
    staleTime: 30_000,
  });
}

function useSeriesInstances(seriesId: string | null) {
  return useQuery<any[]>({
    queryKey: ["/api/recurring-series", seriesId, "instances"],
    queryFn: () => apiRequest("GET", `/api/recurring-series/${seriesId}/instances`),
    enabled: Boolean(seriesId),
    staleTime: 30_000,
  });
}

// ── Form default ──────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: "",
  description: "",
  location: "",
  dayOfWeek: "5",
  timeOfDay: "20:00",
  rotationStartDate: "",
  notifyDaysBefore: "7",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecurringSeriesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: series = [], isLoading } = useRecurringSeries();
  const { data: organizations = [] } = useOrganizations();

  // Filter out 'barrio' type org
  const eligibleOrgs = (organizations as any[]).filter((o) => o.type !== "barrio");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [rotationOrgIds, setRotationOrgIds] = useState<string[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<any>(null);
  const [swapMode, setSwapMode] = useState<string[]>([]); // up to 2 activity IDs

  const { data: instances = [], isLoading: instancesLoading } = useSeriesInstances(selectedSeries?.id ?? null);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const createSeries = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/recurring-series", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/recurring-series"] }); setFormOpen(false); toast({ title: "Serie creada" }); },
    onError: () => toast({ title: "Error al crear", variant: "destructive" }),
  });

  const updateSeries = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiRequest("PATCH", `/api/recurring-series/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/recurring-series"] }); setFormOpen(false); toast({ title: "Serie actualizada" }); },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const deleteSeries = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/recurring-series/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/recurring-series"] });
      if (selectedSeries) setSelectedSeries(null);
      toast({ title: "Serie eliminada" });
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const generateNow = useMutation({
    mutationFn: (seriesId: string) => apiRequest("POST", `/api/recurring-series/${seriesId}/generate-now`),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/recurring-series"] });
      if (selectedSeries) qc.invalidateQueries({ queryKey: ["/api/recurring-series", selectedSeries.id, "instances"] });
      toast({ title: `Generadas ${data.created} instancias (${data.skipped} ya existían)` });
    },
    onError: () => toast({ title: "Error al generar", variant: "destructive" }),
  });

  const swapInstances = useMutation({
    mutationFn: ({ seriesId, a, b }: { seriesId: string; a: string; b: string }) =>
      apiRequest("POST", `/api/recurring-series/${seriesId}/swap`, { activityIdA: a, activityIdB: b }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/recurring-series", selectedSeries?.id, "instances"] });
      setSwapMode([]);
      toast({ title: "Semanas intercambiadas" });
    },
    onError: () => toast({ title: "Error al intercambiar", variant: "destructive" }),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setRotationOrgIds(eligibleOrgs.map((o: any) => o.id));
    setFormOpen(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setForm({
      title: s.title ?? "",
      description: s.description ?? "",
      location: s.location ?? "",
      dayOfWeek: String(s.day_of_week ?? 5),
      timeOfDay: s.time_of_day ?? "20:00",
      rotationStartDate: s.rotation_start_date?.slice(0, 10) ?? "",
      notifyDaysBefore: String(s.notify_days_before ?? 14),
    });
    setRotationOrgIds(s.rotation_org_ids ?? []);
    setFormOpen(true);
  }

  function handleSubmit() {
    const body = {
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      dayOfWeek: Number(form.dayOfWeek),
      timeOfDay: form.timeOfDay,
      rotationOrgIds,
      rotationStartDate: form.rotationStartDate,
      notifyDaysBefore: Number(form.notifyDaysBefore),
    };
    if (editing) { updateSeries.mutate({ id: editing.id, body }); }
    else { createSeries.mutate(body); }
  }

  function toggleSwap(id: string) {
    setSwapMode((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  function moveOrg(index: number, dir: -1 | 1) {
    const next = [...rotationOrgIds];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setRotationOrgIds(next);
  }

  function addOrg(id: string) {
    if (!rotationOrgIds.includes(id)) setRotationOrgIds([...rotationOrgIds, id]);
  }
  function removeOrg(id: string) {
    setRotationOrgIds(rotationOrgIds.filter((x) => x !== id));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Actividades Recurrentes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Rotación semanal automática por organización
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreate} className="rounded-full">
            <Plus className="h-4 w-4 mr-2" /> Nueva serie
          </Button>
          <Link href="/dashboard">
            <Button variant="outline" className="rounded-full">
              <ArrowLeft className="h-4 w-4 mr-2" /> Volver
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Series list ────────────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Series configuradas
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
            </div>
          ) : series.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">
                <Repeat2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aún no hay series. Crea la primera.</p>
              </CardContent>
            </Card>
          ) : (
            series.map((s) => (
              <Card
                key={s.id}
                className={`rounded-2xl cursor-pointer transition-shadow hover:shadow-md ${selectedSeries?.id === s.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedSeries(selectedSeries?.id === s.id ? null : s)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <CardTitle className="text-base">{s.title}</CardTitle>
                      <CardDescription className="mt-0.5">
                        {DAY_NAMES[s.day_of_week]} · {s.time_of_day} · {s.instance_count ?? 0} instancias generadas
                      </CardDescription>
                    </div>
                    <Badge variant={s.active ? "default" : "secondary"}>
                      {s.active ? "Activa" : "Pausada"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 flex gap-2">
                  <Button size="sm" variant="outline" className="rounded-full h-7 px-3 text-xs"
                    onClick={(e) => { e.stopPropagation(); openEdit(s); }}>
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-full h-7 px-3 text-xs"
                    disabled={generateNow.isPending}
                    onClick={(e) => { e.stopPropagation(); generateNow.mutate(s.id); }}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${generateNow.isPending ? "animate-spin" : ""}`} /> Generar ahora
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-full h-7 px-3 text-xs text-destructive border-destructive/40"
                    onClick={(e) => { e.stopPropagation(); if (confirm("¿Eliminar esta serie?")) deleteSeries.mutate(s.id); }}>
                    <Trash2 className="h-3 w-3 mr-1" /> Eliminar
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* ── Instances list ─────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {selectedSeries ? `Instancias — ${selectedSeries.title}` : "Selecciona una serie"}
            </h2>
            {swapMode.length === 2 && (
              <Button size="sm" className="rounded-full h-7 px-3 text-xs"
                onClick={() => swapInstances.mutate({ seriesId: selectedSeries.id, a: swapMode[0], b: swapMode[1] })}>
                <ArrowLeftRight className="h-3.5 w-3.5 mr-1" /> Confirmar intercambio
              </Button>
            )}
            {swapMode.length === 1 && (
              <span className="text-xs text-muted-foreground">Selecciona una segunda semana para intercambiar</span>
            )}
          </div>

          {!selectedSeries ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecciona una serie para ver sus semanas</p>
              </CardContent>
            </Card>
          ) : instancesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : instances.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-10 text-center text-muted-foreground">
                <RefreshCw className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">El cron generará las próximas 8 semanas automáticamente.</p>
                <p className="text-xs mt-1">Se ejecuta diariamente a las 07:00.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {instances.map((inst) => {
                const isPast = new Date(inst.date) < new Date();
                const isSelected = swapMode.includes(inst.id);
                return (
                  <div
                    key={inst.id}
                    className={`rounded-xl border p-3 text-sm flex items-center justify-between gap-3 transition-colors ${
                      isSelected ? "bg-primary/10 border-primary" : isPast ? "opacity-50" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{inst.organization_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {formatDateEs(inst.date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {inst.notified_rotation && (
                        <Bell className="h-3.5 w-3.5 text-green-500" title="Notificado" />
                      )}
                      {inst.approval_status === "approved" && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" title="Aprobado" />
                      )}
                      {!isPast && (
                        <Button
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          className="rounded-full h-6 px-2 text-xs"
                          onClick={() => toggleSwap(inst.id)}
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit dialog ─────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar serie" : "Nueva serie recurrente"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre de la actividad</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Noche de Hermanamiento" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Día de la semana</Label>
                <Select value={form.dayOfWeek} onValueChange={(v) => setForm({ ...form, dayOfWeek: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Hora</Label>
                <Input type="time" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha de inicio de rotación</Label>
                <Input type="date" value={form.rotationStartDate}
                  onChange={(e) => setForm({ ...form, rotationStartDate: e.target.value })} />
                <p className="text-xs text-muted-foreground">El primer {DAY_NAMES[Number(form.dayOfWeek)]} desde esta fecha será el índice 0 de la rotación.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Avisar con N días de antelación</Label>
                <Input type="number" min={1} max={60} value={form.notifyDaysBefore}
                  onChange={(e) => setForm({ ...form, notifyDaysBefore: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Lugar (opcional)</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Capilla del Barrio" />
            </div>

            <div className="space-y-1.5">
              <Label>Descripción (opcional)</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2} placeholder="Descripción de la actividad" />
            </div>

            {/* Rotation order */}
            <div className="space-y-2">
              <Label>Orden de rotación de organizaciones</Label>
              <p className="text-xs text-muted-foreground">Arrastra o usa las flechas para ordenar. La primera organización es la del índice 0.</p>

              {/* Org adder */}
              <Select onValueChange={(v) => addOrg(v)}>
                <SelectTrigger><SelectValue placeholder="Agregar organización…" /></SelectTrigger>
                <SelectContent>
                  {eligibleOrgs
                    .filter((o: any) => !rotationOrgIds.includes(o.id))
                    .map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="space-y-1.5 mt-2">
                {rotationOrgIds.map((id, i) => {
                  const org = (eligibleOrgs as any[]).find((o) => o.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-muted/30">
                      <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>
                      <span className="flex-1 font-medium">{org?.name ?? id}</span>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveOrg(i, -1)} disabled={i === 0}>↑</Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveOrg(i, 1)} disabled={i === rotationOrgIds.length - 1}>↓</Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeOrg(id)}>×</Button>
                      </div>
                    </div>
                  );
                })}
                {rotationOrgIds.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">Sin organizaciones en rotación</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" className="rounded-full" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button className="rounded-full" onClick={handleSubmit}
              disabled={!form.title || !form.rotationStartDate || rotationOrgIds.length === 0 || createSeries.isPending || updateSeries.isPending}>
              {editing ? "Guardar cambios" : "Crear serie"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
