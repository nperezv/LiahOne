import { useState, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CalendarDays, MapPin, Users, Download, Trash2, ChevronDown, ChevronRight, CheckSquare, Square, Globe, Send, CheckCircle2, XCircle, Upload, Image, LayoutList, RefreshCw, Pencil, ClipboardList, CheckCheck, Eye, Music, Sparkles, Utensils, Tv2, X, Loader2, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/auth-tokens";
import { normalizeMemberName } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useActivities, useCreateActivity, useOrganizations, useDeleteActivity, useMembers, useHymns, useUsers, useAllMemberCallings } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { exportActivities } from "@/lib/export";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  servicio_bautismal: "Servicio Bautismal",
  deportiva: "Deportiva",
  capacitacion: "Capacitación",
  fiesta: "Fiesta",
  hermanamiento: "Hermanamiento",
  actividad_org: "Actividad de Org.",
  otro: "Otro",
};

const APPROVAL_STATUS_CONFIG: Record<string, { label: string; variant: string; icon: React.ReactNode }> = {
  draft:          { label: "Borrador",       variant: "secondary", icon: null },
  submitted:      { label: "En revisión",    variant: "default",   icon: <Send className="h-3 w-3" /> },
  approved:       { label: "Aprobada",       variant: "default",   icon: <CheckCircle2 className="h-3 w-3 text-green-600" /> },
  needs_revision: { label: "Requiere rev.",  variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  cancelled:      { label: "Cancelada",      variant: "destructive", icon: null },
};



const activitySchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  date: z.string().min(1, "La fecha es requerida"),
  location: z.string().optional(),
  organizationId: z.string().optional(),
  type: z.enum(["servicio_bautismal", "deportiva", "capacitacion", "fiesta", "hermanamiento", "actividad_org", "otro"]),
  isPublic: z.boolean().default(false),
});

type ActivityFormValues = z.infer<typeof activitySchema>;

interface ChecklistItem {
  id: string;
  activityId: string;
  itemKey: string;
  label: string;
  completed: boolean;
  completedBy?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  sortOrder: number;
}

// ── Autocomplete types & components ───────────────────────────────────────────

type HymnOption   = { value: string; number: number; title: string };
type MemberOption = { value: string };

const filterHymnOptions = (options: HymnOption[], query: string) => {
  const t = query.trim();
  if (!t) return options;
  const lo = t.toLowerCase();
  return options.filter(o => String(o.number).startsWith(t) || o.value.toLowerCase().includes(lo));
};

const filterMemberOptions = (options: MemberOption[], query: string) => {
  const t = query.trim();
  if (!t) return options;
  return options.filter(o => o.value.toLowerCase().includes(t.toLowerCase()));
};

function HymnAutocomplete({ value, options, placeholder, onChange }: {
  value: string; options: HymnOption[]; placeholder?: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => filterHymnOptions(options, value), [options, value]);
  return (
    <div className="relative">
      <div className="relative">
        <Music className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="text-sm pl-8"
          value={value}
          placeholder={placeholder ?? "Número o nombre del himno"}
          autoComplete="off"
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
      </div>
      {open && value.trim().length > 0 && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg text-sm">
          {filtered.slice(0, 20).map(o => (
            <li key={o.number} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent"
              onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false); }}>
              <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">{o.number}</span>
              <span className="truncate">{o.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberAutocomplete({ value, options, placeholder, onChange }: {
  value: string; options: MemberOption[]; placeholder?: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => filterMemberOptions(options, value), [options, value]);
  return (
    <div className="relative">
      <Input
        className="text-sm"
        value={value}
        placeholder={placeholder ?? "Nombre del miembro"}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && value.trim().length > 0 && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg text-sm">
          {filtered.slice(0, 15).map(o => (
            <li key={o.value} className="px-3 py-2 cursor-pointer hover:bg-accent truncate"
              onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false); }}>
              {o.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Field metadata — defines input type and placeholder per section_data key ──

type FieldType = "text" | "textarea" | "checkbox" | "number";

const FIELD_META: Record<string, { type: FieldType; placeholder?: string; inputKind?: "member" | "hymn" }> = {
  prog_preside:          { type: "text", inputKind: "member", placeholder: "Nombre de quien preside" },
  prog_dirige:           { type: "text", inputKind: "member", placeholder: "Nombre de quien dirige" },
  prog_himno_apertura:   { type: "text", inputKind: "hymn",   placeholder: "Número o nombre del himno" },
  prog_oracion_apertura: { type: "text", inputKind: "member", placeholder: "Nombre" },
  prog_himno_cierre:     { type: "text", inputKind: "hymn",   placeholder: "Número o nombre del último himno" },
  prog_oracion_cierre:   { type: "text", inputKind: "member", placeholder: "Nombre" },
  prog_mensaje_1:        { type: "text", inputKind: "member", placeholder: "Nombre del ponente y tema" },
};

// Types that require at least one message AND hymns in the program
const TYPES_REQUIRING_MSG_AND_HYMNS = ["capacitacion", "hermanamiento"];

// Required keys per section — completing these unlocks the next section
const PROG_REQUIRED_BASE = ["prog_preside", "prog_dirige", "prog_oracion_apertura", "prog_oracion_cierre"];
const PROG_REQUIRED_WITH_MSG = [...PROG_REQUIRED_BASE, "prog_mensaje_1", "prog_himno_apertura", "prog_himno_cierre"];
const COORD_REQUIRED = ["coord_espacio", "coord_arreglo", "coord_limpieza"];

function getProgRequired(activityType: string) {
  return TYPES_REQUIRING_MSG_AND_HYMNS.includes(activityType)
    ? PROG_REQUIRED_WITH_MSG
    : PROG_REQUIRED_BASE;
}

// ── SectionPanel — editable sections that auto-complete checklist items ───────

const SECTION_CONFIG = {
  programa:     { label: "Programa",     color: "text-blue-700 dark:text-blue-400",     icon: ClipboardList },
  coordinacion: { label: "Coordinación", color: "text-violet-700 dark:text-violet-400", icon: Users },
} as const;

function sectionOfKey(key: string): "programa" | "coordinacion" {
  if (key.startsWith("coord_")) return "coordinacion";
  return "programa";
}

function SectionField({
  itemKey, label, completed, value, onChange, memberOptions, hymnOptions, optional,
}: {
  itemKey: string; label: string; completed: boolean; value: string; onChange: (v: string) => void;
  memberOptions: MemberOption[]; hymnOptions: HymnOption[]; optional?: boolean;
}) {
  const meta = FIELD_META[itemKey] ?? { type: "text" as FieldType };

  const labelEl = (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">{label}</label>
      {optional && <span className="text-[10px] text-muted-foreground">(opcional)</span>}
    </div>
  );

  if (meta.type === "checkbox") return (
    <div className="space-y-1.5">
      {labelEl}
      <label className="flex items-center gap-2 cursor-pointer text-sm ml-5">
        <input type="checkbox" className="h-4 w-4 accent-primary"
          checked={value === "true"} onChange={e => onChange(e.target.checked ? "true" : "")} />
        Sí, se compartió
      </label>
    </div>
  );

  if (meta.type === "textarea") return (
    <div className="space-y-1.5">
      {labelEl}
      <Textarea className="text-sm min-h-[72px] resize-none" placeholder={meta.placeholder}
        value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );

  if (meta.type === "number") return (
    <div className="space-y-1.5">
      {labelEl}
      <Input type="number" min={0} className="text-sm w-36" placeholder={meta.placeholder}
        value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );

  // text — with optional member/hymn autocomplete
  return (
    <div className="space-y-1.5">
      {labelEl}
      {meta.inputKind === "member" ? (
        <MemberAutocomplete value={value} options={memberOptions} placeholder={meta.placeholder} onChange={onChange} />
      ) : meta.inputKind === "hymn" ? (
        <HymnAutocomplete value={value} options={hymnOptions} placeholder={meta.placeholder} onChange={onChange} />
      ) : (
        <Input className="text-sm" placeholder={meta.placeholder} value={value} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}

// Keys that are optional for types that don't require msg+hymns
const HYMN_KEYS = new Set(["prog_himno_apertura", "prog_himno_cierre"]);
const MSG_KEYS  = new Set(["prog_mensaje_1"]);

// ── CoordSectionForm — rich accordion form matching activity-logistics.tsx ────

type ArregloTask = { persona: string; asignacion: string };

function CoordSectionForm({
  activityId, sectionData, memberOptions, onSaved,
}: {
  activityId: string;
  sectionData: Record<string, string>;
  memberOptions: MemberOption[];
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const parseArr = <T,>(key: string, fallback: T[]): T[] => {
    try { return JSON.parse(sectionData[key] || "null") ?? fallback; } catch { return fallback; }
  };

  const [espacioNotas, setEspacioNotas] = useState(sectionData["coord_espacio_notas"] ?? "");
  const [arregloTasks, setArregloTasks] = useState<ArregloTask[]>(
    () => parseArr("coord_arreglo_tasks", [{ persona: "", asignacion: "" }])
  );
  const [equipoResponsable, setEquipoResponsable] = useState(sectionData["coord_equipo_responsable"] ?? "");
  const [equipoLista, setEquipoLista] = useState(sectionData["coord_equipo_lista"] ?? "");
  const [refrigerioAplica, setRefrigerioAplica] = useState(sectionData["coord_refrigerio_aplica"] !== "false");
  const [refrigerioDetalle, setRefrigerioDetalle] = useState(sectionData["coord_refrigerio_detalle"] ?? "");
  const [refrigerioResponsables, setRefrigerioResponsables] = useState<string[]>(
    () => parseArr("coord_refrigerio_responsables", [""])
  );
  const [limpiezaResponsables, setLimpiezaResponsables] = useState<string[]>(
    () => parseArr("coord_limpieza_responsables", [""])
  );
  const [limpiezaNotas, setLimpiezaNotas] = useState(sectionData["coord_limpieza_notas"] ?? "");

  const saveMut = useMutation({
    mutationFn: () => {
      const secEspacio    = espacioNotas.trim() ? "listo" : "";
      const secArreglo    = arregloTasks.some(t => t.persona.trim()) ? "listo" : "";
      const secEquipo     = equipoResponsable.trim() ? "listo" : "";
      const secRefrigerio = !refrigerioAplica ? "no_aplica"
        : refrigerioResponsables.some(r => r.trim()) && refrigerioDetalle.trim() ? "listo" : "";
      const secLimpieza   = limpiezaResponsables.some(r => r.trim()) ? "listo" : "";

      const fields: Record<string, string> = {
        coord_espacio:    secEspacio,
        coord_arreglo:    secArreglo,
        coord_equipo:     secEquipo,
        coord_refrigerio: secRefrigerio,
        coord_limpieza:   secLimpieza,
        coord_espacio_notas:             espacioNotas,
        coord_arreglo_tasks:             JSON.stringify(arregloTasks.filter(t => t.persona.trim())),
        coord_equipo_responsable:        equipoResponsable,
        coord_equipo_lista:              equipoLista,
        coord_refrigerio_aplica:         refrigerioAplica ? "true" : "false",
        coord_refrigerio_detalle:        refrigerioDetalle,
        coord_refrigerio_responsables:   JSON.stringify(refrigerioResponsables.filter(r => r.trim())),
        coord_limpieza_responsables:     JSON.stringify(limpiezaResponsables.filter(r => r.trim())),
        coord_limpieza_notas:            limpiezaNotas,
      };
      return apiRequest("PATCH", `/api/activities/${activityId}/section`, { section: "coordinacion", fields });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "Coordinación guardada" });
      onSaved();
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const dot = (done: boolean) => (
    <span className={`h-2 w-2 rounded-full shrink-0 ${done ? "bg-primary" : "bg-muted-foreground/30"}`} />
  );
  const itemCls = (done: boolean) =>
    `border rounded-lg px-3 border-b-0 transition-colors ${done ? "border-primary/40 bg-primary/5" : ""}`;

  const secEspacio    = !!espacioNotas.trim();
  const secArreglo    = arregloTasks.some(t => t.persona.trim());
  const secEquipo     = !!equipoResponsable.trim();
  const secRefrigerio = !refrigerioAplica || (refrigerioResponsables.some(r => r.trim()) && !!refrigerioDetalle.trim());
  const secLimpieza   = limpiezaResponsables.some(r => r.trim());
  const completedCount = [secEspacio, secArreglo, secEquipo, secRefrigerio, secLimpieza].filter(Boolean).length;

  return (
    <div className="space-y-4 py-1">
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{completedCount} de 5 listos</span>
          {completedCount === 5 && <span className="text-green-600 font-medium">Completo</span>}
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(completedCount / 5) * 100}%` }} />
        </div>
      </div>

      <Accordion type="multiple" className="space-y-1">

        {/* Reserva de ambientes */}
        <AccordionItem value="espacio" className={itemCls(secEspacio)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Reserva de ambientes</span>
              <span className="ml-auto mr-2">{dot(secEspacio)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 pt-1">
              <Button type="button" variant="outline" size="sm" className="w-full text-xs"
                onClick={() => window.open("https://www.churchofjesuschrist.org/calendar", "_blank")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Ir al calendario de la iglesia
              </Button>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Confirmación / notas del espacio</Label>
                <Textarea className="text-sm min-h-[56px] resize-none"
                  placeholder="Ej: Salón cultural reservado para el sábado 9h-12h"
                  value={espacioNotas} onChange={e => setEspacioNotas(e.target.value)} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Arreglo y preparación */}
        <AccordionItem value="arreglo" className={itemCls(secArreglo)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Arreglo y preparación</span>
              <span className="ml-auto mr-2">{dot(secArreglo)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 pt-1">
              <Label className="text-xs text-muted-foreground block">Tareas asignadas</Label>
              {arregloTasks.map((task, i) => (
                <div key={i} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-0.5 block">Persona asignada</Label>
                        <MemberAutocomplete value={task.persona} options={memberOptions}
                          placeholder="Nombre del miembro" className="h-7 text-sm"
                          onChange={v => { const u = [...arregloTasks]; u[i] = { ...u[i], persona: v }; setArregloTasks(u); }} />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-0.5 block">Asignación</Label>
                        <Input className="h-7 text-sm" placeholder="Ej: Decorar el salón"
                          value={task.asignacion}
                          onChange={e => { const u = [...arregloTasks]; u[i] = { ...u[i], asignacion: e.target.value }; setArregloTasks(u); }} />
                      </div>
                    </div>
                    {arregloTasks.length > 1 && (
                      <button type="button" className="text-muted-foreground hover:text-destructive mt-0.5 shrink-0"
                        onClick={() => setArregloTasks(arregloTasks.filter((_, j) => j !== i))}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setArregloTasks([...arregloTasks, { persona: "", asignacion: "" }])}>
                <Plus className="h-3 w-3" /> Añadir tarea
              </button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Equipo y tecnología */}
        <AccordionItem value="equipo" className={itemCls(secEquipo)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <Tv2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Equipo y tecnología</span>
              <span className="ml-auto mr-2">{dot(secEquipo)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Responsable</Label>
                <MemberAutocomplete value={equipoResponsable} options={memberOptions}
                  placeholder="Nombre" className="h-8 text-sm" onChange={setEquipoResponsable} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Lista de equipo / notas</Label>
                <Textarea className="text-sm min-h-[56px] resize-none"
                  placeholder="Micrófono, proyector, sillas extra…"
                  value={equipoLista} onChange={e => setEquipoLista(e.target.value)} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Refrigerio */}
        <AccordionItem value="refrigerio" className={itemCls(secRefrigerio)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <Utensils className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Refrigerio</span>
              <span className="ml-auto mr-2">{dot(secRefrigerio)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={refrigerioAplica} onCheckedChange={setRefrigerioAplica} />
                <span className="text-xs text-muted-foreground">Habrá refrigerio</span>
              </label>
              {refrigerioAplica && (<>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Qué se preparará</Label>
                  <Textarea className="text-sm min-h-[44px] resize-none"
                    placeholder="Ej: Pastas, refrescos, tarta…"
                    value={refrigerioDetalle} onChange={e => setRefrigerioDetalle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground block">Responsables</Label>
                  {refrigerioResponsables.map((name, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1">
                        <MemberAutocomplete value={name} options={memberOptions}
                          placeholder="Nombre del miembro" className="h-7 text-sm"
                          onChange={v => { const u = [...refrigerioResponsables]; u[i] = v; setRefrigerioResponsables(u); }} />
                      </div>
                      {refrigerioResponsables.length > 1 && (
                        <button type="button" className="text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => setRefrigerioResponsables(refrigerioResponsables.filter((_, j) => j !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setRefrigerioResponsables([...refrigerioResponsables, ""])}>
                    <Plus className="h-3 w-3" /> Añadir responsable
                  </button>
                </div>
              </>)}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Limpieza */}
        <AccordionItem value="limpieza" className={itemCls(secLimpieza)}>
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 flex-1">
              <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Limpieza</span>
              <span className="ml-auto mr-2">{dot(secLimpieza)}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground block">Responsables</Label>
                {limpiezaResponsables.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <MemberAutocomplete value={name} options={memberOptions}
                        placeholder="Nombre del miembro" className="h-7 text-sm"
                        onChange={v => { const u = [...limpiezaResponsables]; u[i] = v; setLimpiezaResponsables(u); }} />
                    </div>
                    {limpiezaResponsables.length > 1 && (
                      <button type="button" className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => setLimpiezaResponsables(limpiezaResponsables.filter((_, j) => j !== i))}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setLimpiezaResponsables([...limpiezaResponsables, ""])}>
                  <Plus className="h-3 w-3" /> Añadir responsable
                </button>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Notas / tareas</Label>
                <Textarea className="text-sm min-h-[44px] resize-none"
                  value={limpiezaNotas} onChange={e => setLimpiezaNotas(e.target.value)} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      <Button className="w-full" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
        {saveMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando…</> : "Guardar coordinación"}
      </Button>
    </div>
  );
}

function SectionEditDialog({
  section, items, activityId, sectionData, open, onOpenChange, activityType, activityOrgId,
}: {
  section: "programa" | "coordinacion";
  items: ChecklistItem[];
  activityId: string;
  sectionData: Record<string, string>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activityType: string;
  activityOrgId?: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rawMembers = [] } = useMembers();
  const { data: rawHymns = [] } = useHymns();
  const { data: organizations = [] } = useOrganizations();
  const { data: users = [] } = useUsers();
  const { user } = useAuth();
  const canReadCallings = ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero"].includes(user?.role || "");
  const { data: memberCallings = [] } = useAllMemberCallings({ enabled: canReadCallings });

  const requiresMsgAndHymns = TYPES_REQUIRING_MSG_AND_HYMNS.includes(activityType);

  // All members normalized
  const allMemberOptions = useMemo<MemberOption[]>(
    () => Array.from(new Set(
      (rawMembers as any[]).map(m => normalizeMemberName(m.nameSurename)).filter(Boolean)
    )).map(v => ({ value: v as string })),
    [rawMembers]
  );

  // Bishopric only (preside) — use users table filtered by role, same as sacramental meeting
  const bishopricOptions = useMemo<MemberOption[]>(
    () => {
      const getMemberLabel = (m: any) => m?.fullName || m?.name || m?.email || "";
      return (users as any[])
        .filter(m => ["obispo", "consejero_obispo"].includes(m.role))
        .map(m => getMemberLabel(m))
        .filter(Boolean)
        .map(v => ({ value: v as string }));
    },
    [users]
  );

  // Org presidency members (dirige) — use member callings filtered by activityOrgId
  const orgMemberOptions = useMemo<MemberOption[]>(
    () => {
      if (activityOrgId && (memberCallings as any[]).length > 0) {
        const names = (memberCallings as any[])
          .filter(c => c.organizationId === activityOrgId && c.isActive && c.memberName)
          .map(c => normalizeMemberName(c.memberName) || c.memberName)
          .filter(Boolean);
        const unique = Array.from(new Set(names));
        if (unique.length > 0) return unique.map(v => ({ value: v as string }));
      }
      // Fallback to directory members filtered by organizationId, then all
      const filtered = activityOrgId
        ? (rawMembers as any[]).filter(m => m.organizationId === activityOrgId)
        : (rawMembers as any[]);
      return Array.from(new Set(
        filtered.map(m => normalizeMemberName(m.nameSurename)).filter(Boolean)
      )).map(v => ({ value: v as string }));
    },
    [memberCallings, rawMembers, activityOrgId]
  );

  const hymnOptions = useMemo<HymnOption[]>(
    () => (rawHymns as any[]).map(h => ({ value: `${h.number} - ${h.title}`, number: h.number, title: h.title })),
    [rawHymns]
  );

  // Select appropriate member options per field key
  const memberOptionsForKey = (key: string): MemberOption[] => {
    if (key === "prog_preside") return bishopricOptions.length > 0 ? bishopricOptions : allMemberOptions;
    if (key === "prog_dirige")  return orgMemberOptions.length > 0 ? orgMemberOptions : allMemberOptions;
    return allMemberOptions;
  };

  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of items) init[item.itemKey] = sectionData[item.itemKey] ?? "";
    for (const k of Object.keys(sectionData)) {
      if ((k.startsWith("prog_mensaje_") || k.startsWith("prog_pensamiento_")) && !(k in init))
        init[k] = sectionData[k];
    }
    return init;
  });

  // Dynamic extra entries: mensajes y pensamientos espirituales
  const [extraMsgCount, setExtraMsgCount] = useState(() => {
    let n = 0;
    for (const k of Object.keys(sectionData)) {
      if (/^prog_mensaje_(\d+)$/.test(k) && Number(k.split("_")[2]) > 1) n++;
    }
    return n;
  });
  const [pensamientos, setPensamientos] = useState<string[]>(() => {
    const list: string[] = [];
    for (const k of Object.keys(sectionData)) {
      if (/^prog_pensamiento_(\d+)$/.test(k)) list.push(sectionData[k]);
    }
    return list;
  });

  const hasMessages = items.some(i => i.itemKey === "prog_mensaje_1");
  const setField = (k: string, v: string) => setFields(f => ({ ...f, [k]: v }));

  const allFields = useMemo(() => {
    const f = { ...fields };
    pensamientos.forEach((p, i) => { f[`prog_pensamiento_${i + 1}`] = p; });
    return f;
  }, [fields, pensamientos]);

  const saveMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/activities/${activityId}/section`, { section, fields: allFields }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/activities"] });
      onOpenChange(false);
      toast({ title: "Sección guardada" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const cfg = SECTION_CONFIG[section];
  const displayItems = items.filter(i => i.itemKey !== "prog_flyer");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={cfg.color}>{cfg.label}</DialogTitle>
          <DialogDescription className="text-xs">
            Completa los campos — los ítems se marcan automáticamente al guardar.
          </DialogDescription>
        </DialogHeader>
        {section === "coordinacion" && (
          <CoordSectionForm
            activityId={activityId}
            sectionData={sectionData}
            memberOptions={allMemberOptions}
            onSaved={() => onOpenChange(false)}
          />
        )}
        {section !== "coordinacion" && <div className="space-y-4 py-1">
          {displayItems.map((item) => {
            if (item.itemKey === "prog_mensaje_1" && hasMessages) {
              return (
                <div key="mensajes" className="space-y-3 rounded-lg border px-3 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mensajes</p>
                  {/* First message — required */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Mensaje 1</label>
                    <MemberAutocomplete
                      value={fields["prog_mensaje_1"] ?? ""}
                      options={allMemberOptions}
                      placeholder="Ponente y tema del mensaje"
                      onChange={v => setField("prog_mensaje_1", v)}
                    />
                  </div>
                  {/* Extra messages */}
                  {Array.from({ length: extraMsgCount }, (_, i) => i + 2).map(n => (
                    <div key={n} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Mensaje {n}</label>
                        <Button type="button" size="sm" variant="ghost"
                          className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            setFields(f => { const nf = { ...f }; delete nf[`prog_mensaje_${n}`]; return nf; });
                            setExtraMsgCount(c => c - 1);
                          }}>Quitar</Button>
                      </div>
                      <MemberAutocomplete
                        value={fields[`prog_mensaje_${n}`] ?? ""}
                        options={allMemberOptions}
                        placeholder="Ponente y tema del mensaje"
                        onChange={v => setField(`prog_mensaje_${n}`, v)}
                      />
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs w-full"
                    onClick={() => { setExtraMsgCount(c => c + 1); setField(`prog_mensaje_${extraMsgCount + 2}`, ""); }}>
                    <Plus className="h-3 w-3 mr-1" /> Agregar mensaje
                  </Button>

                  {/* Pensamientos espirituales */}
                  {pensamientos.length > 0 && (
                    <div className="pt-2 space-y-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground">Pensamientos espirituales</p>
                      {pensamientos.map((p, i) => (
                        <div key={i} className="flex gap-2">
                          <MemberAutocomplete value={p} options={allMemberOptions}
                            placeholder={`Ponente del pensamiento ${i + 1}`}
                            onChange={v => setPensamientos(arr => arr.map((x, j) => j === i ? v : x))} />
                          <Button type="button" size="sm" variant="ghost"
                            className="h-9 px-1.5 text-xs text-destructive hover:text-destructive"
                            onClick={() => setPensamientos(arr => arr.filter((_, j) => j !== i))}>Quitar</Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs w-full"
                    onClick={() => setPensamientos(arr => [...arr, ""])}>
                    <Plus className="h-3 w-3 mr-1" /> Agregar pensamiento espiritual
                  </Button>
                </div>
              );
            }
            {
              const isOptional =
                (HYMN_KEYS.has(item.itemKey) && !requiresMsgAndHymns) ||
                (MSG_KEYS.has(item.itemKey) && !requiresMsgAndHymns);
              return (
                <SectionField
                  key={item.itemKey}
                  itemKey={item.itemKey}
                  label={item.label}
                  completed={item.completed}
                  value={fields[item.itemKey] ?? ""}
                  onChange={v => setField(item.itemKey, v)}
                  memberOptions={memberOptionsForKey(item.itemKey)}
                  hymnOptions={hymnOptions}
                  optional={isOptional}
                />
              );
            }
          })}
        </div>}
        {section !== "coordinacion" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Guardando…" : "Guardar sección"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SectionPanel({
  items, activityId, sectionData, canEditPrograma, flyerUrl, canUploadFlyer,
  activityType, activityOrgId,
}: {
  items: ChecklistItem[];
  activityId: string;
  sectionData: Record<string, string>;
  canEditPrograma: boolean;
  flyerUrl?: string | null;
  canUploadFlyer: boolean;
  activityType: string;
  activityOrgId?: string | null;
}) {
  const hasSections = items.some(i => i.itemKey.startsWith("prog_") || i.itemKey.startsWith("coord_"));
  const [editSection, setEditSection] = useState<"programa" | "coordinacion" | null>(null);

  if (!hasSections) {
    // Flat read-only list for baptism / legacy activities
    const completed = items.filter(i => i.completed).length;
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Checklist — {completed}/{items.length} completados</p>
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            {item.completed
              ? <CheckSquare className="h-4 w-4 text-green-600 shrink-0" />
              : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className={item.completed ? "line-through text-muted-foreground" : ""}>{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  const bySection: Record<string, ChecklistItem[]> = { programa: [], coordinacion: [] };
  for (const item of items) bySection[sectionOfKey(item.itemKey)].push(item);

  const sections = (["programa", "coordinacion"] as const).filter(s => bySection[s].length > 0);
  const totalCompleted = items.filter(i => i.completed && i.itemKey !== "prog_flyer").length;
  const totalRequired  = items.filter(i => i.itemKey !== "prog_flyer").length;

  // Sequential locking: coordinacion unlocks only after programa is complete
  const isCompleted = (keys: string[]) => keys.every(k => {
    const item = items.find(i => i.itemKey === k);
    return !item || item.completed;
  });
  const progRequired = getProgRequired(activityType);
  const progFullDone = isCompleted(progRequired);

  const sectionLocked: Record<string, boolean> = {
    programa:     false,
    coordinacion: !progFullDone,
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground font-medium">
        Preparación — {totalCompleted}/{totalRequired} completados
      </p>

      {/* Flyer upload always visible for programa */}
      {bySection.programa.some(i => i.itemKey === "prog_flyer") && (
        <FlyerUpload activityId={activityId} flyerUrl={flyerUrl} canUpload={canUploadFlyer} />
      )}

      {sections.map(sec => {
        const cfg = SECTION_CONFIG[sec];
        const secItems = bySection[sec];
        const secCompleted = secItems.filter(i => i.completed && i.itemKey !== "prog_flyer").length;
        const secTotal    = secItems.filter(i => i.itemKey !== "prog_flyer").length;
        const allDone = secCompleted === secTotal && secTotal > 0;
        const locked  = sectionLocked[sec];

        return (
          <div key={sec} className={`rounded-lg border px-3 py-2.5 transition-opacity ${locked ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <cfg.icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                <span className="text-xs text-muted-foreground ml-1">{secCompleted}/{secTotal}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {allDone && <CheckCheck className="h-3.5 w-3.5 text-green-500" />}
                {locked ? (
                  <span className="text-[10px] text-muted-foreground italic">Completa Programa primero</span>
                ) : canEditPrograma && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                    onClick={() => setEditSection(sec)}>
                    <Pencil className="h-3 w-3 mr-1" />
                    {allDone ? "Editar" : "Completar"}
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-2 space-y-1">
              {secItems.filter(i => i.itemKey !== "prog_flyer").map(item => (
                <div key={item.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  {item.completed
                    ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                    : <Square className="h-3 w-3 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <span className={item.completed ? "line-through" : ""}>{item.label}</span>
                    {item.completed && sectionData[item.itemKey] && item.itemKey !== "prog_flyer" && (
                      <p className="text-[10px] text-muted-foreground/70 not-line-through truncate max-w-[200px]">
                        {["listo", "no_aplica"].includes(sectionData[item.itemKey])
                          ? (sectionData[item.itemKey] === "no_aplica" ? "No aplica" : "✓")
                          : (sectionData[item.itemKey] === "true" ? "Sí" : sectionData[item.itemKey])}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {/* Show extra saved messages (prog_mensaje_2+) in read mode */}
              {Object.entries(sectionData)
                .filter(([k]) => /^prog_mensaje_[2-9]$/.test(k) && sectionData[k])
                .map(([k, v]) => (
                  <div key={k} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="line-through">Mensaje adicional</span>
                      <p className="text-[10px] text-muted-foreground/70 not-line-through truncate max-w-[200px]">{v}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        );
      })}

      {editSection && (
        <SectionEditDialog
          section={editSection}
          items={bySection[editSection]}
          activityId={activityId}
          sectionData={sectionData}
          open={true}
          onOpenChange={(v) => { if (!v) setEditSection(null); }}
          activityType={activityType}
          activityOrgId={activityOrgId}
        />
      )}
    </div>
  );
}

function FlyerUpload({ activityId, flyerUrl, canUpload }: { activityId: string; flyerUrl?: string | null; canUpload: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("flyer", file);
      const token = getAccessToken();
      const res = await fetch(`/api/activities/${activityId}/flyer`, {
        method: "POST",
        body: form,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(await res.text());
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "Flyer subido correctamente" });
    } catch {
      toast({ title: "Error al subir flyer", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {flyerUrl ? (
        <a href={flyerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
          <Image className="h-4 w-4" /> Ver flyer
        </a>
      ) : (
        <span className="text-sm text-muted-foreground italic">Sin flyer</span>
      )}
      {canUpload && (
        <>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            {uploading ? "Subiendo..." : flyerUrl ? "Cambiar flyer" : "Subir flyer"}
          </Button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
        </>
      )}
    </div>
  );
}

function ApprovalActions({
  activity,
  userRole,
  orgId,
}: {
  activity: any;
  userRole?: string;
  orgId?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectComment, setRejectComment] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);

  const isObispado = ["obispo", "consejero_obispo", "secretario_ejecutivo"].includes(userRole ?? "");
  const isOrgMember = ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"].includes(userRole ?? "");
  const belongsToOrg = activity.organizationId === orgId;

  const submitMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/activities/${activity.id}/submit`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/activities"] }); toast({ title: "Actividad enviada para aprobación" }); },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });
  const approveMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/activities/${activity.id}/approve`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/activities"] }); toast({ title: "Actividad aprobada" }); },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });
  const rejectMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/activities/${activity.id}/reject`, { comment: rejectComment }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/activities"] }); setRejectOpen(false); toast({ title: "Actividad devuelta para revisión" }); },
    onError: (e: any) => toast({ title: "Error", description: e?.message, variant: "destructive" }),
  });

  const canSubmit = (isOrgMember && belongsToOrg) || isObispado;
  const status = activity.approvalStatus;

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
      {canSubmit && (status === "draft" || status === "needs_revision") && (
        <Button size="sm" variant="outline" onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
          <Send className="h-3.5 w-3.5 mr-1" />
          {submitMut.isPending ? "Enviando..." : "Enviar al obispo"}
        </Button>
      )}
      {isObispado && status === "submitted" && (
        <>
          <Button size="sm" className="border-green-500 text-green-700" variant="outline" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {approveMut.isPending ? "Aprobando..." : "Aprobar"}
          </Button>
          <Button size="sm" variant="outline" className="border-red-400 text-red-700" onClick={() => setRejectOpen(true)}>
            <XCircle className="h-3.5 w-3.5 mr-1" /> Rechazar
          </Button>
        </>
      )}
      {status === "approved" && activity.slug && (
        <a href={`/actividades/${activity.slug}`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline">
            <Globe className="h-3.5 w-3.5 mr-1" /> Ver página pública
          </Button>
        </a>
      )}
      {activity.approvalComment && (
        <p className="w-full text-xs text-red-600 mt-1">Comentario: {activity.approvalComment}</p>
      )}

      {rejectOpen && (
        <div className="w-full space-y-2 mt-2">
          <input
            className="w-full border rounded px-3 py-1.5 text-sm"
            placeholder="Motivo del rechazo (opcional)"
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}>
              {rejectMut.isPending ? "Rechazando..." : "Confirmar rechazo"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejectOpen(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BasicEditForm({ activity, onCancel }: { activity: any; onCancel: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [fields, setFields] = useState({
    title: activity.title ?? "",
    description: activity.description ?? "",
    date: activity.date ? activity.date.slice(0, 16) : "",
    location: activity.location ?? "",
    isPublic: activity.isPublic ?? false,
  });

  const mut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/activities/${activity.id}/basic`, fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "Actividad actualizada" });
      onCancel();
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  return (
    <div className="space-y-3 rounded-lg border px-4 py-3 bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Información básica</p>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Título</label>
        <Input value={fields.title} onChange={e => setFields(f => ({ ...f, title: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Descripción</label>
        <Textarea className="min-h-[72px] resize-none text-sm" value={fields.description} onChange={e => setFields(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Fecha y hora</label>
          <Input type="datetime-local" value={fields.date} onChange={e => setFields(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Ubicación</label>
          <Input value={fields.location} onChange={e => setFields(f => ({ ...f, location: e.target.value }))} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="basic-public" className="h-4 w-4 accent-primary" checked={fields.isPublic} onChange={e => setFields(f => ({ ...f, isPublic: e.target.checked }))} />
        <label htmlFor="basic-public" className="text-sm cursor-pointer flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" /> Publicar en landing pública
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Guardando…" : "Guardar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

function ActivityCard({
  activity,
  organizations,
  userRole,
  orgId,
  canDelete,
  canSeeChecklist,
  canEditPrograma,
  canUploadFlyer,
  canEditBasic,
  onDelete,
}: {
  activity: any;
  organizations: any[];
  userRole?: string;
  orgId?: string;
  canDelete: boolean;
  canSeeChecklist: boolean;
  canEditPrograma: boolean;
  canUploadFlyer: boolean;
  canEditBasic: boolean;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const isPast = new Date(activity.date) < new Date();
  const isOrgActivity = activity.type === "actividad_org";
  const approvalCfg = APPROVAL_STATUS_CONFIG[activity.approvalStatus ?? "draft"];
  const isRecurring = !!(activity as any).recurringSeriesId;

  const dateDisplay = (() => {
    const d = new Date(activity.date);
    return (
      d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) +
      " · " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0")
    );
  })();

  const orgName = activity.organizationId
    ? organizations.find((o: any) => o.id === activity.organizationId)?.name
    : null;

  const totalItems = activity.checklistItems?.length ?? 0;
  const doneItems = activity.checklistItems?.filter((i: any) => i.completed).length ?? 0;

  return (
    <div className={`rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md ${isPast ? "opacity-75" : ""}`}>
      {/* Card header — always visible, click to expand */}
      <div className="p-4 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="font-semibold text-sm leading-tight">{activity.title}</span>
              {isRecurring && (
                <Badge variant="outline" className="text-[10px] gap-1 border-cyan-400 text-cyan-700 dark:border-cyan-500 dark:text-cyan-400">
                  <RefreshCw className="h-2.5 w-2.5" /> Recurrente
                </Badge>
              )}
              {activity.quarterlyPlanItemId && (
                <Badge variant="outline" className="text-[10px] gap-1 border-violet-400 text-violet-700">
                  <LayoutList className="h-2.5 w-2.5" /> Plan
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" />{dateDisplay}
              </span>
              {activity.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />{activity.location}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isOrgActivity && !isRecurring && approvalCfg ? (
              <Badge variant={approvalCfg.variant as any} className="gap-1 text-xs">
                {approvalCfg.icon}{approvalCfg.label}
              </Badge>
            ) : isPast ? (
              <Badge variant="secondary" className="text-xs">Realizada</Badge>
            ) : null}
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
        {/* Bottom meta */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <Badge variant="outline" className="text-[10px]">
            {ACTIVITY_TYPE_LABELS[activity.type] || activity.type || "Otro"}
          </Badge>
          {orgName && <Badge variant="outline" className="text-[10px]">{orgName}</Badge>}
          {canSeeChecklist && totalItems > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto">{doneItems}/{totalItems} preparación</span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {/* Toolbar: mode toggle + delete */}
          <div className="flex items-center justify-between gap-2">
            <div>
              {canEditBasic && (
                <Button
                  size="sm"
                  variant={editMode ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs gap-1"
                  onClick={() => setEditMode(m => !m)}
                >
                  {editMode ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  {editMode ? "Lectura" : "Editar"}
                </Button>
              )}
            </div>
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-xs text-destructive hover:text-destructive gap-1"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </Button>
            )}
          </div>

          {/* Basic edit form (edit mode only) */}
          {editMode && <BasicEditForm activity={activity} onCancel={() => setEditMode(false)} />}

          {/* Description (read mode) */}
          {!editMode && activity.description && (
            <p className="text-sm text-muted-foreground">{activity.description}</p>
          )}

          {/* Section panel */}
          {canSeeChecklist && activity.checklistItems && activity.checklistItems.length > 0 && (
            <SectionPanel
              items={activity.checklistItems}
              activityId={activity.id}
              sectionData={(activity as any).sectionData ?? {}}
              canEditPrograma={editMode ? canEditPrograma : false}
              flyerUrl={activity.flyerUrl}
              canUploadFlyer={editMode ? canUploadFlyer : false}
              activityType={activity.type}
              activityOrgId={activity.organizationId}
            />
          )}

          {/* Flyer for non-checklist org activities */}
          {!canSeeChecklist && isOrgActivity && (
            <FlyerUpload activityId={activity.id} flyerUrl={activity.flyerUrl} canUpload={editMode ? canUploadFlyer : false} />
          )}

          {/* Approval actions */}
          {isOrgActivity && (
            <ApprovalActions activity={activity} userRole={userRole} orgId={orgId} />
          )}

          {!canSeeChecklist && !isOrgActivity && !activity.description && (
            <p className="text-sm text-muted-foreground italic">Sin detalles adicionales</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActivitiesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { user } = useAuth();
  const { data: activities = [], isLoading } = useActivities();
  const { data: organizations = [] } = useOrganizations();
  const createMutation = useCreateActivity();
  const deleteMutation = useDeleteActivity();

  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const isObispado = user?.role === "obispo" || user?.role === "consejero_obispo";
  const isLiderActividades = user?.role === "lider_actividades";
  const canManage =
    isObispado ||
    user?.role === "secretario" ||
    user?.role === "secretario_ejecutivo" ||
    isLiderActividades ||
    isOrgMember;
  const canDelete = isObispado || isOrgMember;

  // Per-activity: only owning org, lider_actividades, and bishopric see the checklist
  const canSeeChecklist = (activity: any) =>
    isObispado ||
    isLiderActividades ||
    (isOrgMember && activity.organizationId === user?.organizationId);

  // Filter activities based on user role, then by archive toggle
  const [showArchive, setShowArchive] = useState(false);
  const now = new Date();
  const roleFilteredActivities = isOrgMember
    ? activities.filter((a: any) => a.organizationId === user?.organizationId)
    : activities;
  const filteredActivities = roleFilteredActivities.filter((a: any) => showArchive
    ? new Date(a.date) < now
    : new Date(a.date) >= now
  );

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      location: "",
      organizationId: isOrgMember ? user?.organizationId || "" : "",
      type: "otro",
      isPublic: false,
    },
  });

  const onSubmit = (data: ActivityFormValues) => {
    const organizationId = isOrgMember ? user?.organizationId : data.organizationId || undefined;

    createMutation.mutate(
      {
        title: data.title,
        description: data.description || "",
        date: data.date,
        location: data.location || "",
        organizationId: organizationId,
        type: data.type,
        isPublic: data.isPublic,
        responsiblePerson: user?.name || "Sin asignar",
      },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
          form.reset();
        },
      },
    );
  };

  const handleDelete = (activityId: string) => {
    if (window.confirm("¿Está seguro de que desea eliminar esta actividad?")) {
      deleteMutation.mutate(activityId);
    }
  };

  const upcomingActivities = roleFilteredActivities.filter((a: any) => new Date(a.date) >= now);
  const pastActivities = roleFilteredActivities.filter((a: any) => new Date(a.date) < now);

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }


  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Actividades</h1>
          <p className="text-sm text-muted-foreground">Gestiona las actividades del barrio</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          <div className="flex rounded-full border border-border/70 bg-muted/40 p-0.5 text-xs shrink-0">
            <button type="button" onClick={() => setShowArchive(false)}
              className={`rounded-full px-3 py-1 transition-colors ${!showArchive ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>
              Próximas
            </button>
            <button type="button" onClick={() => setShowArchive(true)}
              className={`rounded-full px-3 py-1 transition-colors ${showArchive ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>
              Archivo
            </button>
          </div>
          <Button
            variant="outline"
            onClick={() => exportActivities(filteredActivities)}
            data-testid="button-export-activities"
          >
            <Download className="h-4 w-4 lg:mr-2" />
            <span className="sr-only lg:not-sr-only">Exportar</span>
          </Button>
          {canManage && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-activity">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Actividad
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Crear Nueva Actividad</DialogTitle>
                  <DialogDescription>Programa una actividad para el barrio o una organización</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Título</FormLabel>
                          <FormControl>
                            <Input placeholder="Noche de hogar especial" {...field} data-testid="input-title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Actividad</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-type">
                                <SelectValue placeholder="Selecciona el tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción (Opcional)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Detalles de la actividad" {...field} data-testid="textarea-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha y Hora</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} data-testid="input-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ubicación (Opcional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Capilla del barrio" {...field} data-testid="input-location" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {!isOrgMember && (
                      <FormField
                        control={form.control}
                        name="organizationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organización (Opcional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-organization">
                                  <SelectValue placeholder="Barrio completo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {organizations.map((org: any) => (
                                  <SelectItem key={org.id} value={org.id}>
                                    {org.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="isPublic"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3 rounded-lg border p-3">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4 accent-primary"
                              id="is-public-checkbox"
                            />
                          </FormControl>
                          <div className="space-y-0.5">
                            <FormLabel htmlFor="is-public-checkbox" className="flex items-center gap-1.5 cursor-pointer font-medium">
                              <Globe className="h-4 w-4 text-muted-foreground" />
                              Publicar en la landing pública
                            </FormLabel>
                            <p className="text-xs text-muted-foreground">Visible para cualquier persona que visite la página principal</p>
                          </div>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                        Cancelar
                      </Button>
                      <Button type="submit" data-testid="button-submit" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "Creando..." : "Crear Actividad"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximas Actividades</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-upcoming-activities">
              {upcomingActivities.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Planificadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Realizadas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-past-activities">
              {pastActivities.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Este año</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">
          {showArchive ? "Archivo de Actividades" : "Próximas Actividades"}
        </h2>
        {filteredActivities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            {showArchive ? "No hay actividades pasadas" : "No hay actividades próximas"}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredActivities.map((activity: any) => {
              const belongsToMyOrg = activity.organizationId === user?.organizationId;
              const actCanUploadFlyer = isObispado || ((isOrgMember || isLiderActividades) && belongsToMyOrg);
              const actCanEditPrograma = isObispado || (isOrgMember && belongsToMyOrg);
              const actCanEditBasic = isObispado || (isOrgMember && belongsToMyOrg) || isLiderActividades;
              const actCanDelete = canDelete && (isObispado || (isOrgMember && belongsToMyOrg));
              return (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  organizations={organizations}
                  userRole={user?.role}
                  orgId={user?.organizationId}
                  canDelete={actCanDelete}
                  canSeeChecklist={canSeeChecklist(activity)}
                  canEditPrograma={actCanEditPrograma}
                  canUploadFlyer={actCanUploadFlyer}
                  canEditBasic={actCanEditBasic}
                  onDelete={() => handleDelete(activity.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
