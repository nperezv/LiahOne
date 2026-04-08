import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CalendarDays, MapPin, Users, Download, Trash2, ChevronDown, ChevronRight, CheckSquare, Square, Globe, Send, CheckCircle2, XCircle, Upload, Image, LayoutList, RefreshCw, Pencil, ClipboardList, Truck, CheckCheck, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/auth-tokens";
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
import { useActivities, useCreateActivity, useOrganizations, useDeleteActivity } from "@/hooks/use-api";
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

// ── Field metadata — defines input type and placeholder per section_data key ──

type FieldType = "text" | "textarea" | "checkbox" | "number";

const FIELD_META: Record<string, { type: FieldType; placeholder?: string }> = {
  prog_preside:          { type: "text",     placeholder: "Nombre de quien preside" },
  prog_dirige:           { type: "text",     placeholder: "Nombre de quien dirige" },
  prog_oracion_apertura: { type: "text",     placeholder: "Nombre" },
  prog_oracion_cierre:   { type: "text",     placeholder: "Nombre" },
  prog_mensaje_1:        { type: "text",     placeholder: "Nombre del ponente y tema del mensaje" },
  coord_invitaciones:    { type: "textarea", placeholder: "¿Cómo se compartirán/compartieron las invitaciones?" },
  coord_enlace:          { type: "checkbox" },
  coord_asistentes:      { type: "number",   placeholder: "Número estimado" },
  coord_objetivos:       { type: "textarea", placeholder: "Objetivos y justificante de la actividad…" },
  coord_equipos:         { type: "text",     placeholder: "Equipos o participantes confirmados" },
  coord_arbitros:        { type: "text",     placeholder: "Árbitros o coordinadores confirmados" },
  coord_material:        { type: "textarea", placeholder: "Material deportivo necesario" },
  log_espacio:           { type: "text",     placeholder: "Lugar/espacio confirmado" },
  log_arreglo:           { type: "textarea", placeholder: "Arreglo de sillas, decoración, etc." },
  log_equipo:            { type: "textarea", placeholder: "Equipo de sonido, proyector, etc." },
  log_refrigerio:        { type: "textarea", placeholder: "Detalles del refrigerio (si aplica)" },
  log_limpieza:          { type: "text",     placeholder: "Responsable de la limpieza" },
  log_decoracion:        { type: "textarea", placeholder: "Plan y responsable de la decoración" },
};

// Required keys per section — completing these unlocks the next section
const PROG_REQUIRED  = ["prog_preside", "prog_dirige", "prog_oracion_apertura", "prog_oracion_cierre"];
const COORD_REQUIRED = ["coord_invitaciones", "coord_asistentes", "coord_objetivos"];
const LOG_REQUIRED   = ["log_espacio"];

// ── SectionPanel — editable sections that auto-complete checklist items ───────

const SECTION_CONFIG = {
  programa:     { label: "Programa",     color: "text-blue-700 dark:text-blue-400",     icon: ClipboardList },
  coordinacion: { label: "Coordinación", color: "text-violet-700 dark:text-violet-400", icon: Users },
  logistica:    { label: "Logística",    color: "text-amber-700 dark:text-amber-400",    icon: Truck },
} as const;

function sectionOfKey(key: string): "programa" | "coordinacion" | "logistica" {
  if (key.startsWith("coord_")) return "coordinacion";
  if (key.startsWith("log_"))   return "logistica";
  return "programa";
}

function SectionField({
  itemKey, label, completed, value, onChange,
}: {
  itemKey: string; label: string; completed: boolean; value: string; onChange: (v: string) => void;
}) {
  const meta = FIELD_META[itemKey] ?? { type: "text" as FieldType };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {completed
          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          : <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <label className="text-sm font-medium">{label}</label>
      </div>
      {meta.type === "checkbox" ? (
        <label className="flex items-center gap-2 cursor-pointer text-sm ml-5">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={value === "true"}
            onChange={e => onChange(e.target.checked ? "true" : "")}
          />
          Sí, se compartió
        </label>
      ) : meta.type === "textarea" ? (
        <Textarea
          className="text-sm min-h-[72px] resize-none"
          placeholder={meta.placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : meta.type === "number" ? (
        <Input
          type="number"
          min={0}
          className="text-sm w-36"
          placeholder={meta.placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <Input
          className="text-sm"
          placeholder={meta.placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function SectionEditDialog({
  section, items, activityId, sectionData, open, onOpenChange,
}: {
  section: "programa" | "coordinacion" | "logistica";
  items: ChecklistItem[];
  activityId: string;
  sectionData: Record<string, string>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Build initial fields from checklist items + any extra prog_mensaje_* from sectionData
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of items) init[item.itemKey] = sectionData[item.itemKey] ?? "";
    // restore any extra messages already saved
    for (const k of Object.keys(sectionData)) {
      if (k.startsWith("prog_mensaje_") && !(k in init)) init[k] = sectionData[k];
    }
    return init;
  });

  // Count extra message slots (prog_mensaje_2, _3, …)
  const [extraMsgCount, setExtraMsgCount] = useState(() => {
    let n = 0;
    for (const k of Object.keys(sectionData)) {
      if (/^prog_mensaje_(\d+)$/.test(k) && Number(k.split("_")[2]) > 1) n++;
    }
    return n;
  });

  const hasMessages = items.some(i => i.itemKey === "prog_mensaje_1");

  const saveMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/activities/${activityId}/section`, { section, fields }),
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
          <p className="text-xs text-muted-foreground">Completa los campos — los ítems se marcan automáticamente al guardar.</p>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {displayItems.map((item) => {
            if (item.itemKey === "prog_mensaje_1" && hasMessages) {
              // Render message block with dynamic add button
              return (
                <div key="mensajes" className="space-y-3">
                  <div className="flex items-center gap-2">
                    {item.completed
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      : <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <span className="text-sm font-medium">Mensajes / Ponencias</span>
                  </div>
                  {/* First message (required checklist item) */}
                  <div className="ml-5">
                    <Input
                      className="text-sm"
                      placeholder="Ponente y tema del 1er mensaje"
                      value={fields["prog_mensaje_1"] ?? ""}
                      onChange={e => setFields(f => ({ ...f, prog_mensaje_1: e.target.value }))}
                    />
                  </div>
                  {/* Extra messages */}
                  {Array.from({ length: extraMsgCount }, (_, i) => i + 2).map(n => (
                    <div key={n} className="ml-5 flex gap-2">
                      <Input
                        className="text-sm flex-1"
                        placeholder={`Ponente y tema del ${n}º mensaje`}
                        value={fields[`prog_mensaje_${n}`] ?? ""}
                        onChange={e => setFields(f => ({ ...f, [`prog_mensaje_${n}`]: e.target.value }))}
                      />
                      <Button
                        type="button" size="sm" variant="ghost"
                        className="h-9 px-2 text-destructive hover:text-destructive"
                        onClick={() => {
                          setFields(f => { const nf = { ...f }; delete nf[`prog_mensaje_${n}`]; return nf; });
                          setExtraMsgCount(c => c - 1);
                        }}
                      >×</Button>
                    </div>
                  ))}
                  <Button
                    type="button" size="sm" variant="outline"
                    className="ml-5 h-7 text-xs"
                    onClick={() => {
                      setExtraMsgCount(c => c + 1);
                      setFields(f => ({ ...f, [`prog_mensaje_${extraMsgCount + 2}`]: "" }));
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Agregar mensaje
                  </Button>
                </div>
              );
            }
            return (
              <SectionField
                key={item.itemKey}
                itemKey={item.itemKey}
                label={item.label}
                completed={item.completed}
                value={fields[item.itemKey] ?? ""}
                onChange={v => setFields(f => ({ ...f, [item.itemKey]: v }))}
              />
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Guardando…" : "Guardar sección"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionPanel({
  items, activityId, sectionData, canEditPrograma, canEditLogistica, flyerUrl, canUploadFlyer,
}: {
  items: ChecklistItem[];
  activityId: string;
  sectionData: Record<string, string>;
  canEditPrograma: boolean;
  canEditLogistica: boolean;
  flyerUrl?: string | null;
  canUploadFlyer: boolean;
}) {
  const hasSections = items.some(i => i.itemKey.startsWith("prog_") || i.itemKey.startsWith("coord_") || i.itemKey.startsWith("log_"));
  const [editSection, setEditSection] = useState<"programa" | "coordinacion" | "logistica" | null>(null);

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

  const bySection: Record<string, ChecklistItem[]> = { programa: [], coordinacion: [], logistica: [] };
  for (const item of items) bySection[sectionOfKey(item.itemKey)].push(item);

  const sections = (["programa", "coordinacion", "logistica"] as const).filter(s => bySection[s].length > 0);
  const totalCompleted = items.filter(i => i.completed && i.itemKey !== "prog_flyer").length;
  const totalRequired  = items.filter(i => i.itemKey !== "prog_flyer").length;

  // Sequential locking: check required keys per section
  const isCompleted = (keys: string[]) => keys.every(k => {
    const item = items.find(i => i.itemKey === k);
    return !item || item.completed; // if key not in this activity's checklist, skip
  });
  const progDone  = isCompleted(PROG_REQUIRED);
  // If this type has messages, prog_mensaje_1 is also required
  const hasMensaje1 = bySection.programa.some(i => i.itemKey === "prog_mensaje_1");
  const progFullDone = progDone && (!hasMensaje1 || isCompleted(["prog_mensaje_1"]));
  const coordDone = isCompleted(COORD_REQUIRED);

  const sectionLocked: Record<string, boolean> = {
    programa:     false,
    coordinacion: !progFullDone,
    logistica:    !coordDone,
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
        const canEdit = sec === "logistica" ? canEditLogistica : canEditPrograma;
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
                  <span className="text-[10px] text-muted-foreground italic">
                    {sec === "coordinacion" ? "Completa Programa primero" : "Completa Coordinación primero"}
                  </span>
                ) : canEdit && (
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
                        {sectionData[item.itemKey] === "true" ? "Sí" : sectionData[item.itemKey]}
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
  canEditLogistica,
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
  canEditLogistica: boolean;
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
              canEditLogistica={editMode ? canEditLogistica : false}
              flyerUrl={activity.flyerUrl}
              canUploadFlyer={editMode ? canUploadFlyer : false}
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
              const actCanEditLogistica = isObispado || isLiderActividades || (isOrgMember && belongsToMyOrg);
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
                  canEditLogistica={actCanEditLogistica}
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
