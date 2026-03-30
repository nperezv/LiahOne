import { useState, useRef, useMemo, useEffect, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, ChevronDown, ChevronUp, CheckCircle2, Clock, Loader2, Save,
  CalendarDays, Sparkles, Tv2, Utensils, Upload, FileText, ExternalLink, Plus, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getAccessToken } from "@/lib/auth-tokens";
import { normalizeMemberName } from "@/lib/utils";
import { BudgetRequestDialog } from "@/components/budget-request-dialog";

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

// ── MemberAutocomplete ──────────────────────────────────────────────────────

type MemberOption = { value: string };

const filterMemberOptions = (options: MemberOption[], query: string) => {
  const trimmed = query.trim();
  if (!trimmed) return options;
  return options.filter((o) => o.value.toLowerCase().includes(trimmed.toLowerCase()));
};

function MemberAutocomplete({
  value, options, placeholder, onChange, className,
}: {
  value: string; options: MemberOption[]; placeholder?: string;
  onChange: (v: string) => void; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => filterMemberOptions(options, value), [options, value]);
  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && value.trim().length > 0 && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg text-sm">
          {filtered.slice(0, 15).map((o) => (
            <li
              key={o.value}
              className="px-3 py-2 cursor-pointer hover:bg-accent truncate"
              onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); }}
            >
              {o.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── LogisticsDetail ─────────────────────────────────────────────────────────

type CoordData = { logistics: Record<string, any>; baptismDetails: Record<string, any> };
type ArregloTask = { persona: string; asignacion: string; hora: string };

function LogisticsDetail({
  baptismServiceId,
  canEdit,
}: {
  baptismServiceId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const comprobanteRef = useRef<HTMLInputElement>(null);
  const [uploadingComprobante, setUploadingComprobante] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [arregloBudgetOpen, setArregloBudgetOpen] = useState(false);
  const [refrigerioBudgetOpen, setRefrigeriBudgetOpen] = useState(false);
  const [draft, setDraft] = useState<CoordData>({ logistics: {}, baptismDetails: {} });
  const draftInitialized = useRef(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/baptisms/services", baptismServiceId, "coordination"],
    queryFn: () => apiRequest("GET", `/api/baptisms/services/${baptismServiceId}/coordination`),
    enabled: Boolean(baptismServiceId),
  });

  useEffect(() => {
    if (data && !draftInitialized.current) {
      setDraft({
        logistics: (data as any).logistics ?? {},
        baptismDetails: (data as any).baptismDetails ?? {},
      });
      draftInitialized.current = true;
    }
  }, [data]);

  const membersQuery = useQuery<any[]>({ queryKey: ["/api/members"] });
  const memberOptions = useMemo(
    () => Array.from(new Set(
      (membersQuery.data ?? [])
        .map((m: any) => normalizeMemberName(m.nameSurename))
        .filter((n): n is string => Boolean(n))
    )).map((value) => ({ value })),
    [membersQuery.data],
  );

  const saveMutation = useMutation({
    mutationFn: (d: CoordData) =>
      apiRequest("PUT", `/api/baptisms/services/${baptismServiceId}/coordination`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/services", baptismServiceId, "coordination"] });
      toast({ title: "Logística guardada" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const setLog = (field: string, value: any) =>
    setDraft((d) => ({ ...d, logistics: { ...d.logistics, [field]: value } }));

  // arregloTasks — derived from draft with legacy field migration
  const arregloTasks: ArregloTask[] = draft.logistics.arreglo_tasks
    ?? (draft.logistics.arreglo_participantes?.length
      ? (draft.logistics.arreglo_participantes as string[]).map((p: string) => ({
          persona: p, asignacion: "", hora: draft.logistics.arreglo_hora ?? "",
        }))
      : [{ persona: "", asignacion: "", hora: "" }]);

  const setArregloTasks = (tasks: ArregloTask[]) => {
    setDraft((d) => ({
      ...d,
      logistics: {
        ...d.logistics,
        arreglo_tasks: tasks,
        arreglo_participantes: tasks.map((t) => t.persona).filter((p) => p.trim()),
        arreglo_responsable: tasks[0]?.persona || null,
        arreglo_hora: tasks.find((t) => t.hora)?.hora || null,
      },
    }));
  };

  // refrigerioResponsables — derived from draft with legacy field migration
  const refrigerioResponsables: string[] =
    (draft.logistics.refrigerio_responsables as string[] | null | undefined)?.length
      ? (draft.logistics.refrigerio_responsables as string[])
      : draft.logistics.refrigerio_responsable
        ? [draft.logistics.refrigerio_responsable as string]
        : [""];

  const setRefrigerioResponsables = (names: string[]) => {
    setDraft((d) => ({
      ...d,
      logistics: {
        ...d.logistics,
        refrigerio_responsables: names,
        refrigerio_responsable: names[0] ?? null,
      },
    }));
  };

  const handleComprobanteUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingComprobante(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getAccessToken();
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!uploadRes.ok) throw new Error("No se pudo subir el comprobante");
      const uploaded = await uploadRes.json();
      const updatedLogistics = {
        ...draft.logistics,
        espacio_comprobante_url: uploaded.url,
        espacio_comprobante_nombre: file.name,
      };
      setDraft((d) => ({ ...d, logistics: updatedLogistics }));
      await saveMutation.mutateAsync({ logistics: updatedLogistics, baptismDetails: draft.baptismDetails });
    } catch (err: any) {
      toast({ title: "Error al subir", description: err.message ?? "No se pudo subir el comprobante", variant: "destructive" });
    } finally {
      setUploadingComprobante(false);
      if (comprobanteRef.current) comprobanteRef.current.value = "";
    }
  };

  if (isLoading) return (
    <div className="mt-4 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );

  if (isError || !data) return (
    <p className="mt-4 text-sm text-muted-foreground">No se pudo cargar el detalle de logística.</p>
  );

  // Section completion (same logic as mission-work.tsx)
  const secReserva = !!draft.logistics.espacio_comprobante_url;
  const secArreglo = arregloTasks.some((t) => t.persona.trim()) &&
    (!draft.logistics.arreglo_necesita_presupuesto || !!draft.logistics.arreglo_presupuesto_solicitado);
  const secEquipo = !!draft.logistics.equipo_responsable?.trim();
  const secRefrigerio = refrigerioResponsables.some((r) => r.trim()) &&
    !!(draft.logistics.refrigerio_detalle as string | null | undefined)?.trim() &&
    (!draft.logistics.refrigerio_necesita_presupuesto || !!draft.logistics.refrigerio_presupuesto_solicitado);
  const secLimpieza = !!draft.logistics.limpieza_responsable?.trim();
  const completedCount = [secReserva, secArreglo, secEquipo, secRefrigerio, secLimpieza].filter(Boolean).length;

  const dot = (done: boolean) => (
    <span className={`h-2 w-2 rounded-full shrink-0 ${done ? "bg-primary" : "bg-muted-foreground/30"}`} />
  );
  const itemClass = (done: boolean) =>
    `border rounded-lg px-3 border-b-0 transition-colors ${done ? "border-primary/40 bg-primary/5" : ""}`;

  return (
    <div className="mt-4 border-t pt-4 space-y-4">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{completedCount} de 5 listos</span>
          {completedCount === 5 && <span className="text-green-600 font-medium">Completo</span>}
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(completedCount / 5) * 100}%` }} />
        </div>
      </div>

      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-1">

        {/* ── Reserva de ambientes ── */}
        <AccordionItem value="reserva" className={itemClass(secReserva)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Reserva de ambientes</span>
              <span className="ml-auto mr-2">{dot(secReserva)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => window.open("https://www.churchofjesuschrist.org/calendar", "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  Ir al calendario
                </Button>
                {canEdit && (
                  <button
                    type="button"
                    disabled={uploadingComprobante}
                    onClick={() => comprobanteRef.current?.click()}
                    className="relative w-full overflow-hidden rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed"
                  >
                    <span
                      className="pointer-events-none absolute inset-y-0 left-0 rounded-[5px] bg-emerald-500/25 transition-none"
                      style={uploadingComprobante ? { animation: "btn-fill 5s ease-out forwards" } : { width: 0 }}
                    />
                    <span className="relative z-10 flex items-center justify-center gap-1.5">
                      <Upload className="h-3.5 w-3.5 shrink-0" />
                      {uploadingComprobante ? "Cargando..." : "Cargar comprobante de la reserva"}
                    </span>
                  </button>
                )}
                <input
                  ref={comprobanteRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/jpg,image/heic,image/heif,.pdf,.jpg,.jpeg,.heic,.heif"
                  className="hidden"
                  onChange={handleComprobanteUpload}
                />
              </div>
              {draft.logistics.espacio_comprobante_url && (
                <div className="flex items-center gap-1.5 text-xs bg-muted/50 px-2 py-1.5 rounded-md">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  <a
                    href={draft.logistics.espacio_comprobante_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:underline text-foreground"
                  >
                    {draft.logistics.espacio_comprobante_nombre ?? "Comprobante"}
                  </a>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Arreglo y preparación ── */}
        <AccordionItem value="arreglo" className={itemClass(secArreglo)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Arreglo y preparación</span>
              <span className="ml-auto mr-2">{dot(secArreglo)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={!!draft.logistics.arreglo_necesita_presupuesto}
                    onCheckedChange={(v) => setLog("arreglo_necesita_presupuesto", v)}
                    disabled={!canEdit}
                  />
                  <span className="text-xs text-muted-foreground">Necesito solicitar presupuesto</span>
                </label>
                {draft.logistics.arreglo_necesita_presupuesto && canEdit && (
                  <Button
                    type="button"
                    variant={draft.logistics.arreglo_presupuesto_solicitado ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setArregloBudgetOpen(true)}
                  >
                    {draft.logistics.arreglo_presupuesto_solicitado ? "✓ Presupuesto solicitado" : "Solicitar presupuesto"}
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground block">Tareas</Label>
                {arregloTasks.map((task, i) => (
                  <div key={i} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-0.5 block">Persona asignada</Label>
                          {canEdit ? (
                            <MemberAutocomplete
                              value={task.persona}
                              options={memberOptions}
                              placeholder="Nombre del miembro"
                              className="h-7 text-sm"
                              onChange={(v) => {
                                const updated = [...arregloTasks];
                                updated[i] = { ...updated[i], persona: v };
                                setArregloTasks(updated);
                              }}
                            />
                          ) : (
                            <p className="text-sm">{task.persona || "-"}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-0.5 block">Asignación</Label>
                          {canEdit ? (
                            <Input
                              className="h-7 text-sm"
                              placeholder="Ej: Decorar el salón"
                              value={task.asignacion}
                              onChange={(e) => {
                                const updated = [...arregloTasks];
                                updated[i] = { ...updated[i], asignacion: e.target.value };
                                setArregloTasks(updated);
                              }}
                            />
                          ) : (
                            <p className="text-sm">{task.asignacion || "-"}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-0.5 block">Hora</Label>
                          {canEdit ? (
                            <Input
                              type="time"
                              className="h-7 text-sm"
                              value={task.hora}
                              onChange={(e) => {
                                const updated = [...arregloTasks];
                                updated[i] = { ...updated[i], hora: e.target.value };
                                setArregloTasks(updated);
                              }}
                            />
                          ) : (
                            <p className="text-sm">{task.hora || "-"}</p>
                          )}
                        </div>
                      </div>
                      {canEdit && arregloTasks.length > 1 && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive mt-0.5 shrink-0"
                          onClick={() => setArregloTasks(arregloTasks.filter((_, j) => j !== i))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {canEdit && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setArregloTasks([...arregloTasks, { persona: "", asignacion: "", hora: "" }])}
                  >
                    <Plus className="h-3 w-3" /> Añadir tarea
                  </button>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Equipo y tecnología ── */}
        <AccordionItem value="equipo" className={itemClass(secEquipo)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <Tv2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Equipo y tecnología</span>
              <span className="ml-auto mr-2">{dot(secEquipo)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="Nombre"
                    value={draft.logistics.equipo_responsable ?? ""}
                    onChange={(e) => setLog("equipo_responsable", e.target.value)}
                    readOnly={!canEdit}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Fecha</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={draft.logistics.equipo_fecha ?? ""}
                    onChange={(e) => setLog("equipo_fecha", e.target.value || null)}
                    readOnly={!canEdit}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Lista de equipo / notas</Label>
                <Textarea
                  className="text-sm min-h-[56px] resize-none"
                  placeholder="Micrófono, proyector, pila bautismal..."
                  value={draft.logistics.equipo_lista ?? ""}
                  onChange={(e) => setLog("equipo_lista", e.target.value)}
                  readOnly={!canEdit}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Refrigerio ── */}
        <AccordionItem value="refrigerio" className={itemClass(secRefrigerio)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <Utensils className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Refrigerio</span>
              <span className="ml-auto mr-2">{dot(secRefrigerio)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={!!draft.logistics.refrigerio_necesita_presupuesto}
                    onCheckedChange={(v) => setLog("refrigerio_necesita_presupuesto", v)}
                    disabled={!canEdit}
                  />
                  <span className="text-xs text-muted-foreground">Necesito solicitar presupuesto</span>
                </label>
                {draft.logistics.refrigerio_necesita_presupuesto && canEdit && (
                  <Button
                    type="button"
                    variant={draft.logistics.refrigerio_presupuesto_solicitado ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setRefrigeriBudgetOpen(true)}
                  >
                    {draft.logistics.refrigerio_presupuesto_solicitado ? "✓ Presupuesto solicitado" : "Solicitar presupuesto"}
                  </Button>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Qué se preparará</Label>
                <Textarea
                  className="text-sm min-h-[44px] resize-none"
                  placeholder="Ej: Pastas, refrescos, tarta..."
                  value={(draft.logistics.refrigerio_detalle as string | null | undefined) ?? ""}
                  onChange={(e) => setLog("refrigerio_detalle", e.target.value)}
                  readOnly={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground block">Responsables</Label>
                {refrigerioResponsables.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      {canEdit ? (
                        <MemberAutocomplete
                          value={name}
                          options={memberOptions}
                          placeholder="Nombre del miembro"
                          className="h-7 text-sm"
                          onChange={(v) => {
                            const updated = [...refrigerioResponsables];
                            updated[i] = v;
                            setRefrigerioResponsables(updated);
                          }}
                        />
                      ) : (
                        <p className="text-sm">{name || "-"}</p>
                      )}
                    </div>
                    {canEdit && refrigerioResponsables.length > 1 && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setRefrigerioResponsables(refrigerioResponsables.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setRefrigerioResponsables([...refrigerioResponsables, ""])}
                  >
                    <Plus className="h-3 w-3" /> Añadir responsable
                  </button>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Limpieza ── */}
        <AccordionItem value="limpieza" className={itemClass(secLimpieza)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Limpieza</span>
              <span className="ml-auto mr-2">{dot(secLimpieza)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="Nombre"
                    value={draft.logistics.limpieza_responsable ?? ""}
                    onChange={(e) => setLog("limpieza_responsable", e.target.value)}
                    readOnly={!canEdit}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Fecha</Label>
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={draft.logistics.limpieza_fecha ?? ""}
                    onChange={(e) => setLog("limpieza_fecha", e.target.value || null)}
                    readOnly={!canEdit}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Notas / tareas</Label>
                <Textarea
                  className="text-sm min-h-[44px] resize-none"
                  value={draft.logistics.limpieza_notas ?? ""}
                  onChange={(e) => setLog("limpieza_notas", e.target.value)}
                  readOnly={!canEdit}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {canEdit && (
        <Button
          className="w-full"
          onClick={() => saveMutation.mutate(draft)}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Guardar logística
        </Button>
      )}

      <BudgetRequestDialog
        open={arregloBudgetOpen}
        onOpenChange={setArregloBudgetOpen}
        defaultDescription="Arreglo y preparación del servicio bautismal"
        onSuccess={() => setLog("arreglo_presupuesto_solicitado", true)}
      />
      <BudgetRequestDialog
        open={refrigerioBudgetOpen}
        onOpenChange={setRefrigeriBudgetOpen}
        defaultDescription="Refrigerio para el servicio bautismal"
        onSuccess={() => setLog("refrigerio_presupuesto_solicitado", true)}
      />
    </div>
  );
}

// ── TaskCard ────────────────────────────────────────────────────────────────

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

// ── Page ────────────────────────────────────────────────────────────────────

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
