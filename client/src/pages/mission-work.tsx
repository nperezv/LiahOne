import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueries } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d}d`;
  return new Date(dateStr).toLocaleDateString("es-ES");
}

const MISSION_ROLES = [
  "mission_leader", "ward_missionary", "full_time_missionary",
  "obispo", "consejero_obispo", "presidente_organizacion",
  "consejero_organizacion", "secretario_organizacion",
];

const STAGE_OPTIONS = [
  { value: "new", label: "Nuevo" },
  { value: "teaching", label: "En enseñanza" },
  { value: "on_date", label: "Con fecha bautismal" },
  { value: "baptized", label: "Bautizado" },
  { value: "confirmed", label: "Confirmado" },
];

const PERSON_TYPE_OPTIONS = [
  { value: "friend", label: "Amigo" },
  { value: "recent_convert", label: "Converso reciente" },
  { value: "less_active", label: "Menos activo" },
];

const LESSON_STATUS_OPTIONS = [
  { value: "not_started", label: "No iniciada" },
  { value: "taught", label: "Enseñada" },
  { value: "completed", label: "Completada" },
  { value: "repeated", label: "Repetida" },
];

const COMMITMENT_RESULT_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "done", label: "Cumplido" },
  { value: "not_done", label: "No cumplido" },
  { value: "partial", label: "Parcial" },
];

const MILESTONE_STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "done", label: "Hecho" },
  { value: "waived", label: "Dispensado" },
];

const ITEM_TYPE_OPTIONS = [
  { value: "lesson", label: "Lección" },
  { value: "commitment", label: "Compromiso" },
  { value: "milestone", label: "Hito" },
  { value: "checkpoint", label: "Verificación" },
  { value: "habit", label: "Hábito" },
];

const MILESTONE_KEY_OPTIONS = [
  { value: "", label: "Sin clave especial" },
  { value: "baptism_date_set", label: "Fecha bautismal definida (habilita programar bautismo)" },
  { value: "interview_scheduled", label: "Entrevista programada" },
  { value: "interview_approved", label: "Entrevista aprobada" },
];

const PROGRAM_ITEM_TYPE_LABELS: Record<string, string> = {
  opening_prayer: "Oración inicial",
  hymn: "Himno",
  talk: "Discurso",
  special_music: "Música especial",
  ordinance_baptism: "Ordenanza: Bautismo",
  closing_prayer: "Oración final",
};

const BAPTISM_ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  refreshments: "Refrigerio",
  cleaning: "Limpieza",
  baptism_clothing: "Ropa bautismal",
  wet_clothes_pickup: "Recogida de ropa mojada",
  reception: "Recepción",
  music: "Música",
};

const ASSIGNEE_ROLE_LABELS: Record<string, string> = {
  missionary: "Misionero",
  member_friend: "Amigo miembro",
  leader: "Líder",
};

function stageLabel(s: string) { return STAGE_OPTIONS.find((o) => o.value === s)?.label ?? s; }
function personTypeLabel(t: string) { return PERSON_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t; }
function stageBadgeVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "baptized" || s === "confirmed") return "default";
  if (s === "on_date") return "secondary";
  return "outline";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MissionWorkPage() {
  const { toast } = useToast();
  const me = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const contacts = useQuery<any[]>({ queryKey: ["/api/mission/contacts"] });
  const services = useQuery<any[]>({ queryKey: ["/api/baptisms/services"] });
  const pendingPosts = useQuery<any[]>({
    queryKey: ["/api/baptisms/moderation/posts?status=pending"],
    enabled: me.data?.role === "mission_leader",
  });

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBaptismOpen, setCreateBaptismOpen] = useState(false);

  const readinessQueries = useQueries({
    queries: (services.data || []).map((svc) => ({
      queryKey: [`/api/baptisms/services/${svc.id}/minimum-ready`],
      enabled: Boolean(svc?.id),
    })),
  });
  const linkQueries = useQueries({
    queries: (services.data || []).map((svc) => ({
      queryKey: [`/api/baptisms/services/${svc.id}/public-link-state`],
      enabled: Boolean(svc?.id),
    })),
  });

  const publishLink = useMutation({
    mutationFn: (serviceId: string) => apiRequest("POST", `/api/baptisms/services/${serviceId}/publish-link`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/moderation/posts?status=pending"] });
      toast({ title: "Enlace 24h publicado" });
    },
  });

  const moderate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      apiRequest("PATCH", `/api/baptisms/moderation/posts/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/moderation/posts?status=pending"] });
      toast({ title: "Post moderado" });
    },
  });

  const byType = useMemo(() => {
    const rows = contacts.data || [];
    return {
      friend: rows.filter((x) => x.personType === "friend"),
      recent: rows.filter((x) => x.personType === "recent_convert"),
      less: rows.filter((x) => x.personType === "less_active"),
    };
  }, [contacts.data]);

  // Build id→query maps so we can sort services by date without index mismatch
  const readinessMap = useMemo(() => {
    const raw = services.data || [];
    return Object.fromEntries(raw.map((s, i) => [s.id, readinessQueries[i]?.data]));
  }, [services.data, readinessQueries]);

  const linkMap = useMemo(() => {
    const raw = services.data || [];
    return Object.fromEntries(raw.map((s, i) => [s.id, linkQueries[i]?.data]));
  }, [services.data, linkQueries]);

  const sortedServices = useMemo(
    () => [...(services.data || [])].sort((a, b) => new Date(a.serviceAt).getTime() - new Date(b.serviceAt).getTime()),
    [services.data],
  );

  const isLeader = me.data?.role === "mission_leader";

  if (!MISSION_ROLES.includes(me.data?.role)) {
    return <div className="p-6 text-sm text-muted-foreground">No tienes permisos para Obra Misional.</div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Obra Misional</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Nuevo contacto</Button>
      </div>

      <Tabs defaultValue="friends">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="friends">Amigos ({byType.friend.length})</TabsTrigger>
          <TabsTrigger value="recent">Conversos ({byType.recent.length})</TabsTrigger>
          <TabsTrigger value="less">Menos activos ({byType.less.length})</TabsTrigger>
          <TabsTrigger value="baptisms">Bautismos</TabsTrigger>
          {isLeader && <TabsTrigger value="templates">Plantillas</TabsTrigger>}
          {isLeader && <TabsTrigger value="moderation">Moderación</TabsTrigger>}
        </TabsList>

        <TabsContent value="friends">
          <ContactList title="Amigos" rows={byType.friend} onSelect={setSelectedContactId} />
        </TabsContent>
        <TabsContent value="recent">
          <ContactList title="Conversos recientes" rows={byType.recent} onSelect={setSelectedContactId} />
        </TabsContent>
        <TabsContent value="less">
          <ContactList title="Menos activos" rows={byType.less} onSelect={setSelectedContactId} />
        </TabsContent>

        <TabsContent value="baptisms">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Servicios bautismales ({(services.data || []).length})</CardTitle>
                <Button size="sm" onClick={() => setCreateBaptismOpen(true)}>+ Nuevo bautismo</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortedServices.map((service) => {
                const readiness = readinessMap[service.id] as any;
                const linkState = linkMap[service.id] as any;
                return (
                  <button
                    key={service.id}
                    className="w-full rounded border p-3 text-left text-sm hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedServiceId(service.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{service.locationName}</p>
                        <p className="text-muted-foreground">{new Date(service.serviceAt).toLocaleString("es-ES")}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {readiness?.ready
                          ? <Badge className="bg-green-600 text-xs">Listo</Badge>
                          : <Badge variant="secondary" className="text-xs">Pendiente</Badge>}
                        {linkState?.active
                          ? <Badge className="text-xs">Link activo</Badge>
                          : <Badge variant="outline" className="text-xs">Sin link</Badge>}
                      </div>
                    </div>
                    {readiness && !readiness.ready && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Faltantes: {readiness.missingProgramTypes?.join(", ") || "—"} · {readiness.missingCriticalAssignments?.join(", ") || "—"}
                      </p>
                    )}
                  </button>
                );
              })}
              {sortedServices.length === 0 && <p className="text-sm text-muted-foreground">Sin servicios.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {isLeader && (
          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>
        )}

        {isLeader && (
          <TabsContent value="moderation">
            <Card>
              <CardHeader><CardTitle>Felicitaciones pendientes</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(pendingPosts.data || []).length === 0 && <p className="text-sm text-muted-foreground">Sin pendientes.</p>}
                {(pendingPosts.data || []).map((post) => (
                  <div key={post.id} className="rounded border p-3 text-sm">
                    <p className="font-medium">{post.displayName || "Anónimo"}</p>
                    <p className="mb-2 text-muted-foreground">{post.message}</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => moderate.mutate({ id: post.id, status: "approved" })}>Aprobar</Button>
                      <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: post.id, status: "rejected" })}>Rechazar</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <ContactSheet
        contactId={selectedContactId}
        open={Boolean(selectedContactId)}
        onOpenChange={(o) => { if (!o) setSelectedContactId(null); }}
      />

      <BaptismServiceSheet
        serviceId={selectedServiceId}
        open={Boolean(selectedServiceId)}
        onOpenChange={(o) => { if (!o) setSelectedServiceId(null); }}
        isLeader={isLeader}
        onPublishLink={(id) => publishLink.mutate(id)}
        publishPending={publishLink.isPending}
      />

      <CreateContactDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/mission/contacts"] })}
      />

      <CreateBaptismServiceDialog
        open={createBaptismOpen}
        onOpenChange={setCreateBaptismOpen}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/baptisms/services"] });
          queryClient.invalidateQueries({ queryKey: ["/api/baptisms/eligible-contacts"] });
        }}
      />
    </div>
  );
}

// ─── Contact List ─────────────────────────────────────────────────────────────

function ContactList({ title, rows, onSelect }: { title: string; rows: any[]; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) => x.fullName?.toLowerCase().includes(q) || x.phone?.includes(q) || x.email?.toLowerCase().includes(q));
    }
    if (stageFilter !== "all") r = r.filter((x) => x.stage === stageFilter);
    return r;
  }, [rows, search, stageFilter]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title} ({rows.length})</CardTitle>
          {rows.length > 0 && (
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todas las etapas</SelectItem>
                {STAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        {rows.length > 4 && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email…"
            className="mt-2 h-8 text-sm"
          />
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {filtered.map((row) => (
            <button
              key={row.id}
              className="w-full rounded border p-3 text-left text-sm hover:bg-muted/50 transition-colors"
              onClick={() => onSelect(row.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.fullName}</span>
                <Badge variant={stageBadgeVariant(row.stage)} className="text-xs shrink-0">
                  {stageLabel(row.stage)}
                </Badge>
              </div>
              {(row.phone || row.email) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[row.phone, row.email].filter(Boolean).join(" · ")}
                </p>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {rows.length === 0 ? "Sin elementos." : "Sin resultados para esa búsqueda."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const templates = useQuery<any[]>({ queryKey: ["/api/mission/templates"] });

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = { friend: [], recent_convert: [], less_active: [] };
    for (const t of templates.data || []) {
      if (map[t.personType]) map[t.personType].push(t);
    }
    return map;
  }, [templates.data]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Nueva plantilla</Button>
      </div>
      {PERSON_TYPE_OPTIONS.map((pt) => (
        <div key={pt.value}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">{pt.label}</h3>
          <div className="space-y-2">
            {grouped[pt.value]?.length === 0 && (
              <p className="text-xs text-muted-foreground pl-1">Sin plantillas.</p>
            )}
            {(grouped[pt.value] || []).map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["/api/mission/templates"] })} />
            ))}
          </div>
        </div>
      ))}

      <CreateTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/mission/templates"] });
          toast({ title: "Plantilla creada" });
        }}
      />
    </div>
  );
}

function TemplateCard({ template, onUpdated }: { template: any; onUpdated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const items = useQuery<any[]>({
    queryKey: [`/api/mission/templates/${template.id}/items`],
    enabled: open,
  });

  const addItem = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/mission/templates/${template.id}/items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/mission/templates/${template.id}/items`] });
      setAddOpen(false);
      toast({ title: "Ítem añadido" });
    },
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <CardTitle className="text-sm font-medium">{template.name}</CardTitle>
                {template.isDefault && <Badge variant="secondary" className="text-xs">Por defecto</Badge>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {items.data ? `${items.data.length} ítems` : ""}
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            {items.isLoading && <p className="text-xs text-muted-foreground py-2">Cargando…</p>}
            {(items.data || []).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs shrink-0">
                    {ITEM_TYPE_OPTIONS.find((o) => o.value === item.itemType)?.label ?? item.itemType}
                  </Badge>
                  <span className="truncate">{item.title}</span>
                  {item.required && <span className="text-xs text-destructive shrink-0">*</span>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">#{item.order}</span>
              </div>
            ))}
            {items.data?.length === 0 && <p className="text-xs text-muted-foreground py-1">Sin ítems. Añade el primero.</p>}

            {addOpen ? (
              <AddItemForm
                nextOrder={(items.data?.length ?? 0)}
                onSubmit={(data) => addItem.mutate(data)}
                onCancel={() => setAddOpen(false)}
                saving={addItem.isPending}
              />
            ) : (
              <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => setAddOpen(true)}>
                + Añadir ítem
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function AddItemForm({ nextOrder, onSubmit, onCancel, saving }: {
  nextOrder: number; onSubmit: (data: any) => void; onCancel: () => void; saving: boolean;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    defaultValues: { title: "", itemType: "lesson", required: false, order: nextOrder, milestoneKey: "" },
  });
  const itemType = watch("itemType");
  const required = watch("required");
  const milestoneKey = watch("milestoneKey");

  function handleSubmitWithMetadata(data: any) {
    const { milestoneKey: mk, ...rest } = data;
    onSubmit({ ...rest, metadata: mk ? { milestoneKey: mk } : {} });
  }

  return (
    <form onSubmit={handleSubmit(handleSubmitWithMetadata)} className="rounded border p-3 space-y-3 bg-muted/30">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Título *</Label>
          <Input {...register("title", { required: true })} placeholder="Ej: Lección 1 — La restauración" className="h-8 text-sm" />
          {errors.title && <p className="text-xs text-destructive">Requerido</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={itemType} onValueChange={(v) => setValue("itemType", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ITEM_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Orden</Label>
          <Input type="number" {...register("order", { valueAsNumber: true })} className="h-8 text-sm" />
        </div>
        {itemType === "milestone" && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Clave del hito</Label>
            <Select value={milestoneKey} onValueChange={(v) => setValue("milestoneKey", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MILESTONE_KEY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={required} onCheckedChange={(v) => setValue("required", v)} id="required-switch" />
        <Label htmlFor="required-switch" className="text-xs cursor-pointer">Obligatorio</Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Guardando…" : "Añadir"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

function CreateTemplateDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void;
}) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    defaultValues: { name: "", personType: "friend", isDefault: false },
  });
  const personType = watch("personType");
  const isDefault = watch("isDefault");

  const create = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/mission/templates", data),
    onSuccess: () => { onCreated(); onOpenChange(false); reset(); },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva plantilla</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4">
          <div className="space-y-1">
            <Label>Nombre *</Label>
            <Input {...register("name", { required: true })} placeholder="Ej: Plan de seguimiento — Amigos" />
            {errors.name && <p className="text-xs text-destructive">Requerido</p>}
          </div>
          <div className="space-y-1">
            <Label>Tipo de persona</Label>
            <Select value={personType} onValueChange={(v) => setValue("personType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSON_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isDefault} onCheckedChange={(v) => setValue("isDefault", v)} id="default-switch" />
            <Label htmlFor="default-switch" className="cursor-pointer text-sm">Usar como plantilla por defecto</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creando…" : "Crear"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Baptism Service Sheet ────────────────────────────────────────────────────

function BaptismServiceSheet({ serviceId, open, onOpenChange, isLeader, onPublishLink, publishPending }: {
  serviceId: string | null; open: boolean; onOpenChange: (o: boolean) => void;
  isLeader: boolean; onPublishLink: (id: string) => void; publishPending: boolean;
}) {
  const { toast } = useToast();

  const service = useQuery<any>({
    queryKey: [`/api/baptisms/services/${serviceId}`],
    enabled: Boolean(serviceId) && open,
  });
  const linkState = useQuery<any>({
    queryKey: [`/api/baptisms/services/${serviceId}/public-link-state`],
    enabled: Boolean(serviceId) && open,
  });
  const hymns = useQuery<any[]>({ queryKey: ["/api/hymns"], enabled: open });

  const [addProgram, setAddProgram] = useState(false);
  const [addAssignment, setAddAssignment] = useState(false);

  const addProgramItem = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/baptisms/services/${serviceId}/program-items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/baptisms/services/${serviceId}`] });
      setAddProgram(false);
      toast({ title: "Ítem añadido al programa" });
    },
  });

  const updateProgramItem = useMutation({
    mutationFn: ({ itemId, ...data }: any) => apiRequest("PATCH", `/api/baptisms/program-items/${itemId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/baptisms/services/${serviceId}`] }),
  });

  const addBaptismAssignment = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/baptisms/services/${serviceId}/assignments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/baptisms/services/${serviceId}`] });
      setAddAssignment(false);
      toast({ title: "Asignación añadida" });
    },
  });

  const updateBaptismAssignment = useMutation({
    mutationFn: ({ assignmentId, ...data }: any) => apiRequest("PATCH", `/api/baptisms/assignments/${assignmentId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/baptisms/services/${serviceId}`] }),
  });

  if (!serviceId) return null;
  const svc = service.data;

  const programItems: any[] = svc?.programItems ? [...svc.programItems].sort((a: any, b: any) => a.order - b.order) : [];
  const assignments: any[] = svc?.assignments || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        {!svc ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <SheetTitle className="text-lg leading-tight">{svc.locationName}</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {new Date(svc.serviceAt).toLocaleString("es-ES")}
                {svc.locationAddress && ` · ${svc.locationAddress}`}
              </p>
              {isLeader && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => onPublishLink(svc.id)} disabled={publishPending}>
                    Publicar enlace 24h
                  </Button>
                  {linkState.data?.activePublicUrl && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={linkState.data.activePublicUrl} target="_blank" rel="noreferrer">Vista pública</a>
                    </Button>
                  )}
                </div>
              )}
            </SheetHeader>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 py-4 space-y-6">

                {/* Program */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Programa ({programItems.length})</h3>
                    <Button size="sm" variant="outline" onClick={() => setAddProgram((v) => !v)}>
                      {addProgram ? "Cancelar" : "+ Añadir"}
                    </Button>
                  </div>

                  {programItems.map((item) => (
                    <ProgramItemRow
                      key={item.id}
                      item={item}
                      hymns={hymns.data || []}
                      onUpdate={(data) => updateProgramItem.mutate({ itemId: item.id, ...data })}
                    />
                  ))}
                  {programItems.length === 0 && !addProgram && (
                    <p className="text-xs text-muted-foreground">Sin ítems en el programa.</p>
                  )}

                  {addProgram && (
                    <AddProgramItemForm
                      hymns={hymns.data || []}
                      nextOrder={programItems.length}
                      onSubmit={(d) => addProgramItem.mutate(d)}
                      onCancel={() => setAddProgram(false)}
                      saving={addProgramItem.isPending}
                    />
                  )}
                </div>

                <Separator />

                {/* Assignments */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Asignaciones ({assignments.length})</h3>
                    <Button size="sm" variant="outline" onClick={() => setAddAssignment((v) => !v)}>
                      {addAssignment ? "Cancelar" : "+ Añadir"}
                    </Button>
                  </div>

                  {assignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      assignment={a}
                      onToggleDone={() => updateBaptismAssignment.mutate({
                        assignmentId: a.id,
                        status: a.status === "done" ? "pending" : "done",
                      })}
                    />
                  ))}
                  {assignments.length === 0 && !addAssignment && (
                    <p className="text-xs text-muted-foreground">Sin asignaciones.</p>
                  )}

                  {addAssignment && (
                    <AddAssignmentForm
                      onSubmit={(d) => addBaptismAssignment.mutate(d)}
                      onCancel={() => setAddAssignment(false)}
                      saving={addBaptismAssignment.isPending}
                    />
                  )}
                </div>

              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProgramItemRow({ item, hymns, onUpdate }: { item: any; hymns: any[]; onUpdate: (d: any) => void }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        className="w-full flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-muted/30 transition-colors text-left"
        onClick={() => setEditing(true)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">#{item.order}</span>
          <Badge variant="outline" className="text-xs shrink-0">{PROGRAM_ITEM_TYPE_LABELS[item.type] ?? item.type}</Badge>
          <span className="truncate">{item.title || item.participantDisplayName || "—"}</span>
        </div>
        {!item.publicVisibility && <Badge variant="secondary" className="text-xs ml-2 shrink-0">Privado</Badge>}
      </button>
    );
  }

  return (
    <ProgramItemEditForm
      item={item}
      hymns={hymns}
      onSave={(d) => { onUpdate(d); setEditing(false); }}
      onCancel={() => setEditing(false)}
    />
  );
}

function ProgramItemEditForm({ item, hymns, onSave, onCancel }: {
  item: any; hymns: any[]; onSave: (d: any) => void; onCancel: () => void;
}) {
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      type: item.type,
      title: item.title || "",
      participantDisplayName: item.participantDisplayName || "",
      publicVisibility: item.publicVisibility ?? true,
      hymnId: item.hymnId || "",
      order: item.order,
    },
  });
  const type = watch("type");
  const publicVisibility = watch("publicVisibility");

  return (
    <form onSubmit={handleSubmit(onSave)} className="rounded border p-3 space-y-2 bg-muted/30">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={type} onValueChange={(v) => setValue("type", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PROGRAM_ITEM_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Orden</Label>
          <Input type="number" {...register("order", { valueAsNumber: true })} className="h-8 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Título / descripción</Label>
          <Input {...register("title")} placeholder="Título" className="h-8 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Participante</Label>
          <Input {...register("participantDisplayName")} placeholder="Nombre del participante" className="h-8 text-sm" />
        </div>
        {type === "hymn" && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Himno</Label>
            <Select value={watch("hymnId")} onValueChange={(v) => setValue("hymnId", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar himno" /></SelectTrigger>
              <SelectContent>
                {hymns.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs">{h.number} — {h.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={publicVisibility} onCheckedChange={(v) => setValue("publicVisibility", v)} id="vis-switch" />
        <Label htmlFor="vis-switch" className="text-xs cursor-pointer">Visible en enlace público</Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">Guardar</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

function AddProgramItemForm({ hymns, nextOrder, onSubmit, onCancel, saving }: {
  hymns: any[]; nextOrder: number; onSubmit: (d: any) => void; onCancel: () => void; saving: boolean;
}) {
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: { type: "talk", title: "", participantDisplayName: "", publicVisibility: true, hymnId: "", order: nextOrder },
  });
  const type = watch("type");
  const publicVisibility = watch("publicVisibility");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded border p-3 space-y-2 bg-muted/30">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Tipo *</Label>
          <Select value={type} onValueChange={(v) => setValue("type", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PROGRAM_ITEM_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Orden</Label>
          <Input type="number" {...register("order", { valueAsNumber: true })} className="h-8 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Título</Label>
          <Input {...register("title")} placeholder="Título" className="h-8 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Participante</Label>
          <Input {...register("participantDisplayName")} placeholder="Nombre del participante" className="h-8 text-sm" />
        </div>
        {type === "hymn" && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Himno</Label>
            <Select value={watch("hymnId")} onValueChange={(v) => setValue("hymnId", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar himno" /></SelectTrigger>
              <SelectContent>
                {hymns.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs">{h.number} — {h.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={publicVisibility} onCheckedChange={(v) => setValue("publicVisibility", v)} id="pub-switch" />
        <Label htmlFor="pub-switch" className="text-xs cursor-pointer">Visible en enlace público</Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Guardando…" : "Añadir"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

function AssignmentRow({ assignment, onToggleDone }: { assignment: any; onToggleDone: () => void }) {
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <Badge variant="outline" className="text-xs shrink-0">
          {BAPTISM_ASSIGNMENT_TYPE_LABELS[assignment.type] ?? assignment.type}
        </Badge>
        <span className="truncate text-muted-foreground">
          {assignment.assigneeName || "Sin asignar"}
        </span>
      </div>
      <button
        onClick={onToggleDone}
        className={`shrink-0 text-xs px-2 py-0.5 rounded-full border transition-colors ${
          assignment.status === "done"
            ? "bg-green-100 border-green-300 text-green-700"
            : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
        }`}
      >
        {assignment.status === "done" ? "Hecho" : "Pendiente"}
      </button>
    </div>
  );
}

function AddAssignmentForm({ onSubmit, onCancel, saving }: {
  onSubmit: (d: any) => void; onCancel: () => void; saving: boolean;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    defaultValues: { type: "refreshments", assigneeName: "", notes: "" },
  });
  const type = watch("type");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded border p-3 space-y-2 bg-muted/30">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Tipo *</Label>
          <Select value={type} onValueChange={(v) => setValue("type", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(BAPTISM_ASSIGNMENT_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Responsable</Label>
          <Input {...register("assigneeName")} placeholder="Nombre" className="h-8 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Notas</Label>
          <Input {...register("notes")} placeholder="Notas opcionales" className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Guardando…" : "Añadir"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

// ─── Contact Sheet ────────────────────────────────────────────────────────────

function ContactSheet({
  contactId, open, onOpenChange,
}: { contactId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const contact = useQuery<any>({
    queryKey: [`/api/mission/contacts/${contactId}`],
    enabled: Boolean(contactId) && open,
  });
  const progress = useQuery<{ lessons: any[]; commitments: any[]; milestones: any[] }>({
    queryKey: [`/api/mission/contacts/${contactId}/progress`],
    enabled: Boolean(contactId) && open,
  });
  const templateItems = useQuery<any[]>({
    queryKey: [`/api/mission/contacts/${contactId}/template-items`],
    enabled: Boolean(contactId) && open,
  });
  const notes = useQuery<any[]>({
    queryKey: [`/api/mission/contacts/${contactId}/notes`],
    enabled: Boolean(contactId) && open,
  });
  const assignees = useQuery<any[]>({
    queryKey: [`/api/mission/contacts/${contactId}/assignees`],
    enabled: Boolean(contactId) && open,
  });

  const updateContact = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/mission/contacts/${contactId}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData([`/api/mission/contacts/${contactId}`], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/mission/contacts"] });
      toast({ title: "Guardado" });
    },
  });
  const addNote = useMutation({
    mutationFn: (note: string) => apiRequest("POST", `/api/mission/contacts/${contactId}/notes`, { note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/mission/contacts/${contactId}/notes`] }),
  });
  const updateLesson = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: string }) =>
      apiRequest("POST", `/api/mission/contacts/${contactId}/lessons/${itemId}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/mission/contacts/${contactId}/progress`] }),
  });
  const updateCommitment = useMutation({
    mutationFn: ({ itemId, result }: { itemId: string; result: string }) =>
      apiRequest("POST", `/api/mission/contacts/${contactId}/commitments/${itemId}/result`, { result }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/mission/contacts/${contactId}/progress`] }),
  });
  const updateMilestone = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: string }) =>
      apiRequest("POST", `/api/mission/contacts/${contactId}/milestones/${itemId}/status`, { status }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [`/api/mission/contacts/${contactId}/progress`] });
      if (vars.status === "done") toast({ title: "Hito completado" });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message, variant: "destructive" }),
  });

  const mergedProgress = useMemo(() => {
    const items = templateItems.data || [];
    const prog = progress.data;
    const lessonMap = new Map((prog?.lessons || []).map((l: any) => [l.templateItemId, l]));
    const commitMap = new Map((prog?.commitments || []).map((c: any) => [c.templateItemId, c]));
    const mileMap = new Map((prog?.milestones || []).map((m: any) => [m.templateItemId, m]));

    const lessons: any[] = [];
    const commitments: any[] = [];
    const milestones: any[] = [];

    for (const item of items) {
      if (["lesson", "checkpoint", "habit"].includes(item.itemType)) {
        const t = lessonMap.get(item.id);
        lessons.push({ templateItemId: item.id, itemTitle: item.title, itemRequired: item.required, status: t?.status ?? "not_started", taughtAt: t?.taughtAt, completedAt: t?.completedAt });
      } else if (item.itemType === "commitment") {
        const t = commitMap.get(item.id);
        commitments.push({ templateItemId: item.id, itemTitle: item.title, itemRequired: item.required, result: t?.result ?? "pending", dueAt: t?.dueAt });
      } else if (item.itemType === "milestone") {
        const t = mileMap.get(item.id);
        milestones.push({ templateItemId: item.id, itemTitle: item.title, itemRequired: item.required, status: t?.status ?? "pending", doneAt: t?.doneAt });
      }
    }

    if (items.length === 0 && prog) return prog;
    return { lessons, commitments, milestones };
  }, [templateItems.data, progress.data]);

  if (!contactId) return null;
  const c = contact.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        {!c ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SheetTitle className="text-lg leading-tight">{c.fullName}</SheetTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">{personTypeLabel(c.personType)}</p>
                </div>
                <Badge variant={stageBadgeVariant(c.stage)} className="shrink-0 mt-1">{stageLabel(c.stage)}</Badge>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 py-4 space-y-6">
                <InfoSection contact={c} onSave={(data) => updateContact.mutate(data)} saving={updateContact.isPending} />

                {(assignees.data || []).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Asignados</h3>
                      {assignees.data!.map((a) => (
                        <div key={a.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                          <span>{a.userName || a.assigneeName || "—"}</span>
                          <span className="text-xs text-muted-foreground">
                            {ASSIGNEE_ROLE_LABELS[a.assigneeRole] ?? a.assigneeRole}
                            {a.isPrimary ? " · Principal" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <Separator />
                <ProgressSection
                  merged={mergedProgress}
                  loading={progress.isLoading || templateItems.isLoading}
                  onLesson={(id, s) => updateLesson.mutate({ itemId: id, status: s })}
                  onCommitment={(id, r) => updateCommitment.mutate({ itemId: id, result: r })}
                  onMilestone={(id, s) => updateMilestone.mutate({ itemId: id, status: s })}
                />

                <Separator />
                <NotesSection
                  notes={notes.data || []}
                  loading={notes.isLoading}
                  onAdd={(note) => addNote.mutate(note)}
                  saving={addNote.isPending}
                />
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Info Section ─────────────────────────────────────────────────────────────

function InfoSection({ contact, onSave, saving }: { contact: any; onSave: (d: any) => void; saving: boolean }) {
  const { register, handleSubmit, setValue, watch, reset } = useForm({
    defaultValues: {
      fullName: contact.fullName ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      stage: contact.stage ?? "new",
      personType: contact.personType ?? "friend",
    },
  });
  const stage = watch("stage");
  const personType = watch("personType");

  // Sync form when server data changes (e.g. after save)
  useEffect(() => {
    reset({
      fullName: contact.fullName ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      stage: contact.stage ?? "new",
      personType: contact.personType ?? "friend",
    });
  }, [contact, reset]);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-3">
      <h3 className="text-sm font-semibold">Información</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Nombre completo</Label>
          <Input {...register("fullName")} placeholder="Nombre completo" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Teléfono</Label>
          <Input {...register("phone")} placeholder="+34 000 000 000" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input {...register("email")} placeholder="email@ejemplo.com" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={personType} onValueChange={(v) => setValue("personType", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERSON_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Etapa</Label>
          <Select value={stage} onValueChange={(v) => setValue("stage", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving} className="w-full">
        {saving ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

// ─── Progress Section ─────────────────────────────────────────────────────────

function ProgressSection({ merged, loading, onLesson, onCommitment, onMilestone }: {
  merged: { lessons: any[]; commitments: any[]; milestones: any[] };
  loading: boolean;
  onLesson: (id: string, s: string) => void;
  onCommitment: (id: string, r: string) => void;
  onMilestone: (id: string, s: string) => void;
}) {
  const total = (merged.lessons?.length ?? 0) + (merged.commitments?.length ?? 0) + (merged.milestones?.length ?? 0);

  const done = useMemo(() => {
    const doneLesson = (merged.lessons || []).filter((i) => i.status === "completed" || i.status === "taught").length;
    const doneCommit = (merged.commitments || []).filter((i) => i.result === "done").length;
    const doneMile = (merged.milestones || []).filter((i) => i.status === "done").length;
    return doneLesson + doneCommit + doneMile;
  }, [merged]);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Progreso espiritual</h3>
        {!loading && total > 0 && (
          <span className="text-xs text-muted-foreground">{done}/{total}</span>
        )}
      </div>
      {!loading && total > 0 && (
        <Progress value={pct} className="h-1.5" />
      )}
      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : total === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin plantilla configurada. El líder misional debe crear una plantilla por defecto para este tipo de contacto.
        </p>
      ) : (
        <>
          {(merged.lessons?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lecciones</p>
              {merged.lessons.map((item) => (
                <ProgressItem key={item.templateItemId} title={item.itemTitle} required={item.itemRequired}
                  options={LESSON_STATUS_OPTIONS} value={item.status} onChange={(v) => onLesson(item.templateItemId, v)}
                  date={item.completedAt || item.taughtAt} />
              ))}
            </div>
          )}
          {(merged.commitments?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Compromisos</p>
              {merged.commitments.map((item) => (
                <ProgressItem key={item.templateItemId} title={item.itemTitle} required={item.itemRequired}
                  options={COMMITMENT_RESULT_OPTIONS} value={item.result} onChange={(v) => onCommitment(item.templateItemId, v)}
                  date={item.dueAt} />
              ))}
            </div>
          )}
          {(merged.milestones?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Hitos</p>
              {merged.milestones.map((item) => (
                <ProgressItem key={item.templateItemId} title={item.itemTitle} required={item.itemRequired}
                  options={MILESTONE_STATUS_OPTIONS} value={item.status} onChange={(v) => onMilestone(item.templateItemId, v)}
                  date={item.doneAt} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProgressItem({ title, required, options, value, onChange, date }: {
  title: string; required?: boolean; options: { value: string; label: string }[];
  value: string; onChange: (v: string) => void; date?: string | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
      <div className="flex-1 min-w-0">
        <span className="truncate">{title}</span>
        {required && <span className="ml-1 text-xs text-destructive">*</span>}
        {date && <span className="ml-2 text-xs text-muted-foreground">{new Date(date).toLocaleDateString("es-ES")}</span>}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-36 text-xs shrink-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Notes Section ────────────────────────────────────────────────────────────

function NotesSection({ notes, loading, onAdd, saving }: {
  notes: any[]; loading: boolean; onAdd: (note: string) => void; saving: boolean;
}) {
  const [text, setText] = useState("");
  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  }
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Notas</h3>
      <div className="space-y-1">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Añadir nota…" rows={2}
          className="text-sm resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />
        <Button size="sm" onClick={submit} disabled={saving || !text.trim()} className="w-full">
          {saving ? "Guardando…" : "Añadir nota"}
        </Button>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Cargando…</p>
        : notes.length === 0 ? <p className="text-xs text-muted-foreground">Sin notas.</p>
        : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="rounded border p-3 text-sm">
                <p className="whitespace-pre-wrap">{n.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.authorName ? `${n.authorName} · ` : ""}
                  <span title={new Date(n.createdAt).toLocaleString("es-ES")}>{relativeTime(n.createdAt)}</span>
                </p>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ─── Create Contact Dialog ─────────────────────────────────────────────────────

function CreateContactDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void;
}) {
  const { toast } = useToast();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    defaultValues: { fullName: "", personType: "friend", stage: "new", phone: "", email: "" },
  });
  const personType = watch("personType");

  const create = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/mission/contacts", data),
    onSuccess: () => { onCreated(); onOpenChange(false); reset(); toast({ title: "Contacto creado" }); },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo contacto</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4">
          <div className="space-y-1">
            <Label>Nombre completo *</Label>
            <Input {...register("fullName", { required: true })} placeholder="Nombre completo" />
            {errors.fullName && <p className="text-xs text-destructive">Requerido</p>}
          </div>
          <div className="space-y-1">
            <Label>Tipo de persona</Label>
            <Select value={personType} onValueChange={(v) => setValue("personType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSON_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input {...register("phone")} placeholder="+34 000 000 000" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input {...register("email")} placeholder="email@ejemplo.com" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creando…" : "Crear"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Baptism Service Dialog ────────────────────────────────────────────

function CreateBaptismServiceDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void;
}) {
  const { toast } = useToast();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    defaultValues: { candidateContactId: "", serviceAt: "", locationName: "", locationAddress: "", mapsUrl: "" },
  });
  const candidateContactId = watch("candidateContactId");

  const eligible = useQuery<{ id: string; fullName: string }[]>({
    queryKey: ["/api/baptisms/eligible-contacts"],
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/baptisms/services", data),
    onSuccess: () => {
      onCreated();
      onOpenChange(false);
      reset();
      toast({ title: "Servicio bautismal creado" });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message ?? "No se pudo crear el servicio", variant: "destructive" }),
  });

  const contacts = eligible.data || [];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo servicio bautismal</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4">
          <div className="space-y-1">
            <Label>Candidato *</Label>
            {contacts.length === 0 && !eligible.isLoading ? (
              <p className="text-xs text-muted-foreground rounded border px-3 py-2">
                No hay contactos con el hito "Fecha bautismal definida" completado sin servicio ya programado.
              </p>
            ) : (
              <Select value={candidateContactId} onValueChange={(v) => setValue("candidateContactId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder={eligible.isLoading ? "Cargando…" : "Seleccionar contacto"} />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Fecha y hora *</Label>
              <Input type="datetime-local" {...register("serviceAt", { required: true })} />
              {errors.serviceAt && <p className="text-xs text-destructive">Requerido</p>}
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Lugar *</Label>
              <Input {...register("locationName", { required: true })} placeholder="Ej: Capilla Calle Mayor" />
              {errors.locationName && <p className="text-xs text-destructive">Requerido</p>}
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Dirección</Label>
              <Input {...register("locationAddress")} placeholder="Calle Mayor 1, Madrid" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Enlace Google Maps</Label>
              <Input {...register("mapsUrl")} placeholder="https://maps.google.com/…" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending || contacts.length === 0}>
              {create.isPending ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
