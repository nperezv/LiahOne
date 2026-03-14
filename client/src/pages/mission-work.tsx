import React, { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  User2,
  BookOpen,
  Star,
  Heart,
  Sparkles,
  GraduationCap,
  Church,
  Pencil,
  Plus,
} from "lucide-react";
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
  {
    value: "baptism_date_set",
    label: "Fecha bautismal definida (habilita programar bautismo)",
  },
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

const TASK_PRIORITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};
const TASK_STATUS_LABELS: Record<string, string> = {
  open: "Abierta",
  done: "Hecha",
  canceled: "Cancelada",
};

function taskPriorityColor(p: string) {
  if (p === "high") return "text-destructive";
  if (p === "medium") return "text-yellow-600";
  return "text-muted-foreground";
}

function taskDueBadge(dueAt: string | null, status: string) {
  if (status !== "open" || !dueAt) return null;
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0)
    return (
      <span className="text-xs text-destructive font-medium">Vencida</span>
    );
  if (diff < 3 * 24 * 3600_000)
    return <span className="text-xs text-yellow-600">Pronto</span>;
  return null;
}

function stageLabel(s: string) {
  return STAGE_OPTIONS.find((o) => o.value === s)?.label ?? s;
}
function personTypeLabel(t: string) {
  return PERSON_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}
function stageBadgeVariant(s: string): "default" | "secondary" | "outline" {
  if (s === "baptized" || s === "confirmed") return "default";
  if (s === "on_date") return "secondary";
  return "outline";
}

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending_approval: "Pendiente de aprobación",
  approved: "Aprobada",
  needs_revision: "Necesita revisión",
};

function approvalBadgeVariant(
  s: string,
): "default" | "secondary" | "outline" | "destructive" {
  if (s === "approved") return "default";
  if (s === "pending_approval") return "secondary";
  if (s === "needs_revision") return "destructive";
  return "outline";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MissionWorkPage() {
  const { toast } = useToast();
  const missionAccess = useQuery<any>({ queryKey: ["/api/mission/access"] });
  const contacts = useQuery<any[]>({ queryKey: ["/api/mission/contacts"] });
  const services = useQuery<any[]>({ queryKey: ["/api/baptisms/services"] });
  const pendingPosts = useQuery<any[]>({
    queryKey: ["/api/baptisms/moderation/posts?status=pending"],
    enabled: Boolean(missionAccess.data?.canModeratePosts),
  });

  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createFriendOpen, setCreateFriendOpen] = useState(false);
  const [createBaptismOpen, setCreateBaptismOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    mutationFn: (serviceId: string) =>
      apiRequest("POST", `/api/baptisms/services/${serviceId}/publish-link`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/services"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/baptisms/moderation/posts?status=pending"],
      });
      toast({ title: "Enlace 24h publicado" });
    },
  });

  const moderate = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "approved" | "rejected";
    }) =>
      apiRequest("PATCH", `/api/baptisms/moderation/posts/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/baptisms/moderation/posts?status=pending"],
      });
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
    return Object.fromEntries(
      raw.map((s, i) => [s.id, readinessQueries[i]?.data]),
    );
  }, [services.data, readinessQueries]);

  const linkMap = useMemo(() => {
    const raw = services.data || [];
    return Object.fromEntries(raw.map((s, i) => [s.id, linkQueries[i]?.data]));
  }, [services.data, linkQueries]);

  const sortedServices = useMemo(
    () =>
      [...(services.data || [])].sort(
        (a, b) =>
          new Date(a.serviceAt).getTime() - new Date(b.serviceAt).getTime(),
      ),
    [services.data],
  );

  const isLeader = Boolean(missionAccess.data?.isMissionLeader);
  const canApprove = ["obispo", "consejero_obispo"].includes(
    missionAccess.data?.role ?? "",
  );

  const pendingApprovals = useQuery<any[]>({
    queryKey: ["/api/baptisms/pending-approvals"],
    enabled: canApprove,
  });

  if (missionAccess.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Cargando permisos de Obra Misional...
      </div>
    );
  }

  if (missionAccess.isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        No se pudo validar tu acceso a Obra Misional.
      </div>
    );
  }

  if (!missionAccess.data?.hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No tienes permisos para Obra Misional.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Obra Misional</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          + Nuevo contacto
        </Button>
      </div>

      <Tabs defaultValue="friends">
        <div className="flex items-center justify-between gap-2">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="friends">
              Amigos ({byType.friend.length})
            </TabsTrigger>
            <TabsTrigger value="recent">
              Conversos ({byType.recent.length})
            </TabsTrigger>
            <TabsTrigger value="less">
              Menos activos ({byType.less.length})
            </TabsTrigger>
            <TabsTrigger value="baptisms">Bautismos</TabsTrigger>
            <TabsTrigger value="coordination">Coordinación</TabsTrigger>
            {canApprove && (
              <TabsTrigger value="approvals">
                Aprobaciones
                {(pendingApprovals.data?.length ?? 0) > 0
                  ? ` (${pendingApprovals.data!.length})`
                  : ""}
              </TabsTrigger>
            )}
            {isLeader && (
              <TabsTrigger value="moderation">Moderación</TabsTrigger>
            )}
            {showAdvanced && canApprove && (
              <TabsTrigger value="templates">Plantillas (avanzado)</TabsTrigger>
            )}
          </TabsList>
          {canApprove && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Ocultar avanzado" : "Ver avanzado"}
            </Button>
          )}
        </div>

        <TabsContent value="friends">
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCreateFriendOpen(true)}>
                + Agregar amigo desde directorio
              </Button>
            </div>
            <ContactList
              title="Amigos"
              rows={byType.friend}
              onSelect={setSelectedContactId}
            />
          </div>
        </TabsContent>
        <TabsContent value="recent">
          <ContactList
            title="Conversos recientes"
            rows={byType.recent}
            onSelect={setSelectedContactId}
          />
        </TabsContent>
        <TabsContent value="less">
          <LessActiveTab
            rows={byType.less}
            onSelect={setSelectedContactId}
            onCreated={() =>
              queryClient.invalidateQueries({
                queryKey: ["/api/mission/contacts"],
              })
            }
          />
        </TabsContent>

        <TabsContent value="baptisms">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  Servicios bautismales ({(services.data || []).length})
                </CardTitle>
                <Button size="sm" onClick={() => setCreateBaptismOpen(true)}>
                  + Nuevo bautismo
                </Button>
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
                        <p className="text-muted-foreground">
                          {new Date(service.serviceAt).toLocaleString("es-ES")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {readiness?.ready ? (
                          <Badge className="bg-green-600 text-xs">Listo</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Pendiente
                          </Badge>
                        )}
                        {linkState?.active ? (
                          <Badge className="text-xs">Link activo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Sin link
                          </Badge>
                        )}
                      </div>
                    </div>
                    {readiness && !readiness.ready && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Faltantes:{" "}
                        {readiness.missingProgramTypes?.join(", ") || "—"} ·{" "}
                        {readiness.missingCriticalAssignments?.join(", ") ||
                          "—"}
                      </p>
                    )}
                  </button>
                );
              })}
              {sortedServices.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin servicios.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coordination">
          <CoordinationTab />
        </TabsContent>

        {canApprove && (
          <TabsContent value="approvals">
            <ApprovalTab
              rows={pendingApprovals.data || []}
              loading={pendingApprovals.isLoading}
              onSelect={setSelectedServiceId}
            />
          </TabsContent>
        )}

        {showAdvanced && canApprove && (
          <TabsContent value="templates">
            <TemplatesTab />
          </TabsContent>
        )}

        {isLeader && (
          <TabsContent value="moderation">
            <Card>
              <CardHeader>
                <CardTitle>Felicitaciones pendientes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(pendingPosts.data || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Sin pendientes.
                  </p>
                )}
                {(pendingPosts.data || []).map((post) => (
                  <div key={post.id} className="rounded border p-3 text-sm">
                    <p className="font-medium">
                      {post.displayName || "Anónimo"}
                    </p>
                    <p className="mb-2 text-muted-foreground">{post.message}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          moderate.mutate({ id: post.id, status: "approved" })
                        }
                      >
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          moderate.mutate({ id: post.id, status: "rejected" })
                        }
                      >
                        Rechazar
                      </Button>
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
        onOpenChange={(o) => {
          if (!o) setSelectedContactId(null);
        }}
      />

      <BaptismServiceSheet
        serviceId={selectedServiceId}
        open={Boolean(selectedServiceId)}
        onOpenChange={(o) => {
          if (!o) setSelectedServiceId(null);
        }}
        isLeader={isLeader}
        canApprove={canApprove}
        onPublishLink={(id) => publishLink.mutate(id)}
        publishPending={publishLink.isPending}
      />

      <CreateContactDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ["/api/mission/contacts"] })
        }
      />

      <CreateBaptismServiceDialog
        open={createBaptismOpen}
        onOpenChange={setCreateBaptismOpen}
        onCreated={() => {
          queryClient.invalidateQueries({
            queryKey: ["/api/baptisms/services"],
          });
          queryClient.invalidateQueries({
            queryKey: ["/api/baptisms/eligible-contacts"],
          });
        }}
      />

      <SelectMemberDialog
        open={createFriendOpen}
        onOpenChange={setCreateFriendOpen}
        personType="friend"
        buttonLabel="Agregar como amigo"
        onCreated={() => {
          queryClient.invalidateQueries({
            queryKey: ["/api/mission/contacts"],
          });
          setCreateFriendOpen(false);
        }}
      />
    </div>
  );
}

// ─── Contact List ─────────────────────────────────────────────────────────────

function ContactList({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: any[];
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (x) =>
          x.fullName?.toLowerCase().includes(q) ||
          x.phone?.includes(q) ||
          x.email?.toLowerCase().includes(q),
      );
    }
    if (stageFilter !== "all") r = r.filter((x) => x.stage === stageFilter);
    return r;
  }, [rows, search, stageFilter]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>
            {title} ({rows.length})
          </CardTitle>
          {rows.length > 0 && (
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todas las etapas
                </SelectItem>
                {STAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
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
                <Badge
                  variant={stageBadgeVariant(row.stage)}
                  className="text-xs shrink-0"
                >
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
              {rows.length === 0
                ? "Sin elementos."
                : "Sin resultados para esa búsqueda."}
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
    const map: Record<string, any[]> = {
      friend: [],
      recent_convert: [],
      less_active: [],
    };
    for (const t of templates.data || []) {
      if (map[t.personType]) map[t.personType].push(t);
    }
    return map;
  }, [templates.data]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <SeedDefaultsButton
          onSeeded={() =>
            queryClient.invalidateQueries({
              queryKey: ["/api/mission/templates"],
            })
          }
        />
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          + Nueva plantilla
        </Button>
      </div>
      {PERSON_TYPE_OPTIONS.map((pt) => (
        <div key={pt.value}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {pt.label}
          </h3>
          <div className="space-y-2">
            {grouped[pt.value]?.length === 0 && (
              <p className="text-xs text-muted-foreground pl-1">
                Sin plantillas.
              </p>
            )}
            {(grouped[pt.value] || []).map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onUpdated={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["/api/mission/templates"],
                  })
                }
              />
            ))}
          </div>
        </div>
      ))}

      <CreateTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          queryClient.invalidateQueries({
            queryKey: ["/api/mission/templates"],
          });
          toast({ title: "Plantilla creada" });
        }}
      />
    </div>
  );
}

function TemplateCard({
  template,
  onUpdated,
}: {
  template: any;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const items = useQuery<any[]>({
    queryKey: [`/api/mission/templates/${template.id}/items`],
    enabled: open,
  });

  const addItem = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", `/api/mission/templates/${template.id}/items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/templates/${template.id}/items`],
      });
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
                {open ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <CardTitle className="text-sm font-medium">
                  {template.name}
                </CardTitle>
                {template.isDefault && (
                  <Badge variant="secondary" className="text-xs">
                    Por defecto
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {items.data ? `${items.data.length} ítems` : ""}
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-2">
            {items.isLoading && (
              <p className="text-xs text-muted-foreground py-2">Cargando…</p>
            )}
            {(items.data || []).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs shrink-0">
                    {ITEM_TYPE_OPTIONS.find((o) => o.value === item.itemType)
                      ?.label ?? item.itemType}
                  </Badge>
                  <span className="truncate">{item.title}</span>
                  {item.required && (
                    <span className="text-xs text-destructive shrink-0">*</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  #{item.order}
                </span>
              </div>
            ))}
            {items.data?.length === 0 && (
              <p className="text-xs text-muted-foreground py-1">
                Sin ítems. Añade el primero.
              </p>
            )}

            {addOpen ? (
              <AddItemForm
                nextOrder={items.data?.length ?? 0}
                onSubmit={(data) => addItem.mutate(data)}
                onCancel={() => setAddOpen(false)}
                saving={addItem.isPending}
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-1"
                onClick={() => setAddOpen(true)}
              >
                + Añadir ítem
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function AddItemForm({
  nextOrder,
  onSubmit,
  onCancel,
  saving,
}: {
  nextOrder: number;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      title: "",
      itemType: "lesson",
      required: false,
      order: nextOrder,
      milestoneKey: "",
    },
  });
  const itemType = watch("itemType");
  const required = watch("required");
  const milestoneKey = watch("milestoneKey");

  function handleSubmitWithMetadata(data: any) {
    const { milestoneKey: mk, ...rest } = data;
    onSubmit({ ...rest, metadata: mk ? { milestoneKey: mk } : {} });
  }

  return (
    <form
      onSubmit={handleSubmit(handleSubmitWithMetadata)}
      className="rounded border p-3 space-y-3 bg-muted/30"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Título *</Label>
          <Input
            {...register("title", { required: true })}
            placeholder="Ej: Lección 1 — La restauración"
            className="h-8 text-sm"
          />
          {errors.title && (
            <p className="text-xs text-destructive">Requerido</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select
            value={itemType}
            onValueChange={(v) => setValue("itemType", v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Orden</Label>
          <Input
            type="number"
            {...register("order", { valueAsNumber: true })}
            className="h-8 text-sm"
          />
        </div>
        {itemType === "milestone" && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Clave del hito</Label>
            <Select
              value={milestoneKey}
              onValueChange={(v) => setValue("milestoneKey", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MILESTONE_KEY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={required}
          onCheckedChange={(v) => setValue("required", v)}
          id="required-switch"
        />
        <Label htmlFor="required-switch" className="text-xs cursor-pointer">
          Obligatorio
        </Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Guardando…" : "Añadir"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function CreateTemplateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: { name: "", personType: "friend", isDefault: false },
  });
  const personType = watch("personType");
  const isDefault = watch("isDefault");

  const create = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/mission/templates", data),
    onSuccess: () => {
      onCreated();
      onOpenChange(false);
      reset();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva plantilla</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((d) => create.mutate(d))}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label>Nombre *</Label>
            <Input
              {...register("name", { required: true })}
              placeholder="Ej: Plan de seguimiento — Amigos"
            />
            {errors.name && (
              <p className="text-xs text-destructive">Requerido</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Tipo de persona</Label>
            <Select
              value={personType}
              onValueChange={(v) => setValue("personType", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSON_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={isDefault}
              onCheckedChange={(v) => setValue("isDefault", v)}
              id="default-switch"
            />
            <Label htmlFor="default-switch" className="cursor-pointer text-sm">
              Usar como plantilla por defecto
            </Label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Baptism Service Sheet ────────────────────────────────────────────────────

function BaptismServiceSheet({
  serviceId,
  open,
  onOpenChange,
  isLeader,
  canApprove,
  onPublishLink,
  publishPending,
}: {
  serviceId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  isLeader: boolean;
  canApprove: boolean;
  onPublishLink: (id: string) => void;
  publishPending: boolean;
}) {
  const { toast } = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);

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
    mutationFn: (data: any) =>
      apiRequest(
        "POST",
        `/api/baptisms/services/${serviceId}/program-items`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/baptisms/services/${serviceId}`],
      });
      setAddProgram(false);
      toast({ title: "Ítem añadido al programa" });
    },
  });

  const updateProgramItem = useMutation({
    mutationFn: ({ itemId, ...data }: any) =>
      apiRequest("PATCH", `/api/baptisms/program-items/${itemId}`, data),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [`/api/baptisms/services/${serviceId}`],
      }),
  });

  const addBaptismAssignment = useMutation({
    mutationFn: (data: any) =>
      apiRequest(
        "POST",
        `/api/baptisms/services/${serviceId}/assignments`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/baptisms/services/${serviceId}`],
      });
      setAddAssignment(false);
      toast({ title: "Asignación añadida" });
    },
  });

  const updateBaptismAssignment = useMutation({
    mutationFn: ({ assignmentId, ...data }: any) =>
      apiRequest("PATCH", `/api/baptisms/assignments/${assignmentId}`, data),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [`/api/baptisms/services/${serviceId}`],
      }),
  });

  const submitForApproval = useMutation({
    mutationFn: () =>
      apiRequest(
        "POST",
        `/api/baptisms/services/${serviceId}/submit-for-approval`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/baptisms/services/${serviceId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/services"] });
      toast({ title: "Agenda enviada al Obispo para aprobación" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err?.message,
        variant: "destructive",
      }),
  });

  const approveService = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/baptisms/services/${serviceId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/baptisms/services/${serviceId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/services"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/baptisms/pending-approvals"],
      });
      toast({
        title: "Agenda aprobada. El enlace se activará el día del bautismo.",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err?.message,
        variant: "destructive",
      }),
  });

  const rejectService = useMutation({
    mutationFn: (comment: string) =>
      apiRequest("POST", `/api/baptisms/services/${serviceId}/reject`, {
        comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/baptisms/services/${serviceId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/baptisms/services"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/baptisms/pending-approvals"],
      });
      setRejectOpen(false);
      toast({ title: "Agenda devuelta para revisión" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err?.message,
        variant: "destructive",
      }),
  });

  if (!serviceId) return null;
  const svc = service.data;

  const programItems: any[] = svc?.programItems
    ? [...svc.programItems].sort((a: any, b: any) => a.order - b.order)
    : [];
  const assignments: any[] = svc?.assignments || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
      >
        {!svc ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Cargando…
          </div>
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <div className="flex items-start justify-between gap-2">
                <SheetTitle className="text-lg leading-tight">
                  {svc.locationName}
                </SheetTitle>
                <Badge
                  variant={approvalBadgeVariant(svc.approvalStatus)}
                  className="shrink-0 text-xs mt-0.5"
                >
                  {APPROVAL_STATUS_LABELS[svc.approvalStatus] ??
                    svc.approvalStatus}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {new Date(svc.serviceAt).toLocaleString("es-ES")}
                {svc.locationAddress && ` · ${svc.locationAddress}`}
              </p>

              {/* Rejection comment visible to leader */}
              {svc.approvalStatus === "needs_revision" &&
                svc.approvalComment && (
                  <div className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <p className="font-medium text-xs mb-0.5">
                      Comentario del Obispo:
                    </p>
                    <p>{svc.approvalComment}</p>
                  </div>
                )}

              {/* Leader actions */}
              {(svc.approvalStatus === "draft" ||
                svc.approvalStatus === "needs_revision") && (
                <div className="flex gap-2 pt-1 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => submitForApproval.mutate()}
                    disabled={submitForApproval.isPending}
                  >
                    {submitForApproval.isPending
                      ? "Enviando…"
                      : "Enviar a aprobación"}
                  </Button>
                  {isLeader && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onPublishLink(svc.id)}
                      disabled={publishPending}
                    >
                      Publicar enlace manual
                    </Button>
                  )}
                </div>
              )}

              {/* Bishop actions */}
              {canApprove && svc.approvalStatus === "pending_approval" && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => approveService.mutate()}
                    disabled={approveService.isPending}
                  >
                    {approveService.isPending ? "Aprobando…" : "Aprobar agenda"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setRejectOpen(true)}
                  >
                    Rechazar
                  </Button>
                </div>
              )}

              {/* Approved: show public link state */}
              {svc.approvalStatus === "approved" && (
                <div className="flex gap-2 pt-1 flex-wrap">
                  {linkState.data?.active ? (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={linkState.data.activePublicUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver enlace público
                      </a>
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground self-center">
                      Enlace activo el{" "}
                      {new Date(svc.serviceAt).toLocaleDateString("es-ES")}
                    </p>
                  )}
                </div>
              )}
            </SheetHeader>

            {/* Reject dialog */}
            <RejectDialog
              open={rejectOpen}
              onOpenChange={setRejectOpen}
              onReject={(comment) => rejectService.mutate(comment)}
              saving={rejectService.isPending}
            />

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 py-4 space-y-6">
                {/* Program */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      Programa ({programItems.length})
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddProgram((v) => !v)}
                    >
                      {addProgram ? "Cancelar" : "+ Añadir"}
                    </Button>
                  </div>

                  {programItems.map((item) => (
                    <ProgramItemRow
                      key={item.id}
                      item={item}
                      hymns={hymns.data || []}
                      onUpdate={(data) =>
                        updateProgramItem.mutate({ itemId: item.id, ...data })
                      }
                    />
                  ))}
                  {programItems.length === 0 && !addProgram && (
                    <p className="text-xs text-muted-foreground">
                      Sin ítems en el programa.
                    </p>
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
                    <h3 className="text-sm font-semibold">
                      Asignaciones ({assignments.length})
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddAssignment((v) => !v)}
                    >
                      {addAssignment ? "Cancelar" : "+ Añadir"}
                    </Button>
                  </div>

                  {assignments.map((a) => (
                    <AssignmentRow
                      key={a.id}
                      assignment={a}
                      onToggleDone={() =>
                        updateBaptismAssignment.mutate({
                          assignmentId: a.id,
                          status: a.status === "done" ? "pending" : "done",
                        })
                      }
                    />
                  ))}
                  {assignments.length === 0 && !addAssignment && (
                    <p className="text-xs text-muted-foreground">
                      Sin asignaciones.
                    </p>
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

function ProgramItemRow({
  item,
  hymns,
  onUpdate,
}: {
  item: any;
  hymns: any[];
  onUpdate: (d: any) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        className="w-full flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-muted/30 transition-colors text-left"
        onClick={() => setEditing(true)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">
            #{item.order}
          </span>
          <Badge variant="outline" className="text-xs shrink-0">
            {PROGRAM_ITEM_TYPE_LABELS[item.type] ?? item.type}
          </Badge>
          <span className="truncate">
            {item.title || item.participantDisplayName || "—"}
          </span>
        </div>
        {!item.publicVisibility && (
          <Badge variant="secondary" className="text-xs ml-2 shrink-0">
            Privado
          </Badge>
        )}
      </button>
    );
  }

  return (
    <ProgramItemEditForm
      item={item}
      hymns={hymns}
      onSave={(d) => {
        onUpdate(d);
        setEditing(false);
      }}
      onCancel={() => setEditing(false)}
    />
  );
}

function ProgramItemEditForm({
  item,
  hymns,
  onSave,
  onCancel,
}: {
  item: any;
  hymns: any[];
  onSave: (d: any) => void;
  onCancel: () => void;
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
    <form
      onSubmit={handleSubmit(onSave)}
      className="rounded border p-3 space-y-2 bg-muted/30"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={type} onValueChange={(v) => setValue("type", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PROGRAM_ITEM_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Orden</Label>
          <Input
            type="number"
            {...register("order", { valueAsNumber: true })}
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Título / descripción</Label>
          <Input
            {...register("title")}
            placeholder="Título"
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Participante</Label>
          <Input
            {...register("participantDisplayName")}
            placeholder="Nombre del participante"
            className="h-8 text-sm"
          />
        </div>
        {type === "hymn" && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Himno</Label>
            <Select
              value={watch("hymnId")}
              onValueChange={(v) => setValue("hymnId", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Seleccionar himno" />
              </SelectTrigger>
              <SelectContent>
                {hymns.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs">
                    {h.number} — {h.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={publicVisibility}
          onCheckedChange={(v) => setValue("publicVisibility", v)}
          id="vis-switch"
        />
        <Label htmlFor="vis-switch" className="text-xs cursor-pointer">
          Visible en enlace público
        </Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function AddProgramItemForm({
  hymns,
  nextOrder,
  onSubmit,
  onCancel,
  saving,
}: {
  hymns: any[];
  nextOrder: number;
  onSubmit: (d: any) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      type: "talk",
      title: "",
      participantDisplayName: "",
      publicVisibility: true,
      hymnId: "",
      order: nextOrder,
    },
  });
  const type = watch("type");
  const publicVisibility = watch("publicVisibility");

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded border p-3 space-y-2 bg-muted/30"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Tipo *</Label>
          <Select value={type} onValueChange={(v) => setValue("type", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PROGRAM_ITEM_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Orden</Label>
          <Input
            type="number"
            {...register("order", { valueAsNumber: true })}
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Título</Label>
          <Input
            {...register("title")}
            placeholder="Título"
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Participante</Label>
          <Input
            {...register("participantDisplayName")}
            placeholder="Nombre del participante"
            className="h-8 text-sm"
          />
        </div>
        {type === "hymn" && (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Himno</Label>
            <Select
              value={watch("hymnId")}
              onValueChange={(v) => setValue("hymnId", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Seleccionar himno" />
              </SelectTrigger>
              <SelectContent>
                {hymns.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs">
                    {h.number} — {h.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={publicVisibility}
          onCheckedChange={(v) => setValue("publicVisibility", v)}
          id="pub-switch"
        />
        <Label htmlFor="pub-switch" className="text-xs cursor-pointer">
          Visible en enlace público
        </Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Guardando…" : "Añadir"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function AssignmentRow({
  assignment,
  onToggleDone,
}: {
  assignment: any;
  onToggleDone: () => void;
}) {
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

function AddAssignmentForm({
  onSubmit,
  onCancel,
  saving,
}: {
  onSubmit: (d: any) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: { type: "refreshments", assigneeName: "", notes: "" },
  });
  const type = watch("type");

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded border p-3 space-y-2 bg-muted/30"
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Tipo *</Label>
          <Select value={type} onValueChange={(v) => setValue("type", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BAPTISM_ASSIGNMENT_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Responsable</Label>
          <Input
            {...register("assigneeName")}
            placeholder="Nombre"
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Notas</Label>
          <Input
            {...register("notes")}
            placeholder="Notas opcionales"
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Guardando…" : "Añadir"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ─── Contact Sheet ────────────────────────────────────────────────────────────

function ContactSheet({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const contact = useQuery<any>({
    queryKey: [`/api/mission/contacts/${contactId}`],
    enabled: Boolean(contactId) && open,
  });

  const progress = useQuery<{
    lessons: any[];
    commitments: any[];
    milestones: any[];
  }>({
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
  const attendance = useQuery<any[]>({
    queryKey: [`/api/mission/contacts/${contactId}/attendance`],
    enabled: Boolean(contactId) && open,
  });

  const friendProgress = useQuery<any[]>({
    queryKey: [`/api/mission/contacts/${contactId}/friend-progress`],
    enabled: Boolean(contactId) && open,
  });

  const covenantPath = useQuery<any[]>({
    queryKey: [`/api/mission/contacts/${contactId}/covenant-path`],
    enabled: Boolean(contactId) && open,
  });

  const updateContact = useMutation({
    mutationFn: (data: any) =>
      apiRequest("PATCH", `/api/mission/contacts/${contactId}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData([`/api/mission/contacts/${contactId}`], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/mission/contacts"] });
      toast({ title: "Guardado" });
    },
  });
  const addNote = useMutation({
    mutationFn: (note: string) =>
      apiRequest("POST", `/api/mission/contacts/${contactId}/notes`, { note }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/contacts/${contactId}/notes`],
      }),
  });
  const updateLesson = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: string }) =>
      apiRequest(
        "POST",
        `/api/mission/contacts/${contactId}/lessons/${itemId}/status`,
        { status },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/contacts/${contactId}/progress`],
      }),
  });
  const updateCommitment = useMutation({
    mutationFn: ({ itemId, result }: { itemId: string; result: string }) =>
      apiRequest(
        "POST",
        `/api/mission/contacts/${contactId}/commitments/${itemId}/result`,
        { result },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/contacts/${contactId}/progress`],
      }),
  });
  const updateMilestone = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: string }) =>
      apiRequest(
        "POST",
        `/api/mission/contacts/${contactId}/milestones/${itemId}/status`,
        { status },
      ),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/contacts/${contactId}/progress`],
      });
      if (vars.status === "done") toast({ title: "Hito completado" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err?.message,
        variant: "destructive",
      }),
  });

  const confirmContact = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/mission/contacts/${contactId}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/contacts/${contactId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/mission/contacts"] });
      toast({ title: "Contacto confirmado como converso reciente" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err?.message,
        variant: "destructive",
      }),
  });

  const addAttendance = useMutation({
    mutationFn: (attendedAt: string) =>
      apiRequest("POST", `/api/mission/contacts/${contactId}/attendance`, {
        attendedAt,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/contacts/${contactId}/attendance`],
      }),
  });

  const removeAttendance = useMutation({
    mutationFn: (date: string) =>
      apiRequest(
        "DELETE",
        `/api/mission/contacts/${contactId}/attendance/${date}`,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/contacts/${contactId}/attendance`],
      }),
  });

  const saveFriendSection = useMutation({
    mutationFn: ({ sectionKey, data }: { sectionKey: string; data: any }) =>
      apiRequest(
        "PUT",
        `/api/mission/contacts/${contactId}/friend-progress/${sectionKey}`,
        data,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/contacts/${contactId}/friend-progress`],
      }),
  });

  const saveCovenantItem = useMutation({
    mutationFn: ({ itemKey, ...data }: any) =>
      apiRequest(
        "PUT",
        `/api/mission/contacts/${contactId}/covenant-path/${itemKey}`,
        data,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [`/api/mission/contacts/${contactId}/covenant-path`],
      }),
  });

  const mergedProgress = useMemo(() => {
    const items = templateItems.data || [];
    const prog = progress.data;
    const lessonMap = new Map(
      (prog?.lessons || []).map((l: any) => [l.templateItemId, l]),
    );
    const commitMap = new Map(
      (prog?.commitments || []).map((c: any) => [c.templateItemId, c]),
    );
    const mileMap = new Map(
      (prog?.milestones || []).map((m: any) => [m.templateItemId, m]),
    );

    const lessons: any[] = [];
    const commitments: any[] = [];
    const milestones: any[] = [];

    for (const item of items) {
      if (["lesson", "checkpoint", "habit"].includes(item.itemType)) {
        const t = lessonMap.get(item.id);
        lessons.push({
          templateItemId: item.id,
          itemTitle: item.title,
          itemRequired: item.required,
          status: t?.status ?? "not_started",
          taughtAt: t?.taughtAt,
          completedAt: t?.completedAt,
        });
      } else if (item.itemType === "commitment") {
        const t = commitMap.get(item.id);
        commitments.push({
          templateItemId: item.id,
          itemTitle: item.title,
          itemRequired: item.required,
          result: t?.result ?? "pending",
          dueAt: t?.dueAt,
        });
      } else if (item.itemType === "milestone") {
        const t = mileMap.get(item.id);
        milestones.push({
          templateItemId: item.id,
          itemTitle: item.title,
          itemRequired: item.required,
          status: t?.status ?? "pending",
          doneAt: t?.doneAt,
        });
      }
    }

    if (items.length === 0 && prog) return prog;
    return { lessons, commitments, milestones };
  }, [templateItems.data, progress.data]);

  if (!contactId) return null;
  const c = contact.data;

  const sixMonthsMs = 180 * 24 * 60 * 60 * 1000;
  const confirmedTs = c?.confirmedAt ? new Date(c.confirmedAt).getTime() : null;
  const showFriendProgress =
    c?.personType === "friend" ||
    (c?.personType === "recent_convert" &&
      confirmedTs !== null &&
      Date.now() - confirmedTs < sixMonthsMs);
  const showCovenantPath =
    c?.personType === "less_active" ||
    (c?.personType === "recent_convert" &&
      (confirmedTs === null || Date.now() - confirmedTs >= sixMonthsMs));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col"
      >
        {!c ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Cargando…
          </div>
        ) : (
          <>
            <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {c.fullName
                        .split(" ")
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <SheetTitle className="text-base leading-tight">
                      {c.fullName}
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {personTypeLabel(c.personType)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.personType === "friend" && c.stage === "baptized" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => confirmContact.mutate()}
                      disabled={confirmContact.isPending}
                    >
                      {confirmContact.isPending
                        ? "Confirmando…"
                        : "Confirmar bautismo"}
                    </Button>
                  )}
                  <Badge
                    variant={stageBadgeVariant(c.stage)}
                    className="text-xs"
                  >
                    {stageLabel(c.stage)}
                  </Badge>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-5 py-5 space-y-6">
                <InfoSection
                  contact={c}
                  onSave={(data) => updateContact.mutate(data)}
                  saving={updateContact.isPending}
                />

                {showFriendProgress && (
                  <>
                    <Separator />
                    <FriendDashboard
                      contact={c}
                      sections={friendProgress.data || []}
                      attendance={attendance.data || []}
                      loading={friendProgress.isLoading}
                      onSaveSection={(key, data) =>
                        saveFriendSection.mutate({ sectionKey: key, data })
                      }
                      onAddAttendance={(date) => addAttendance.mutate(date)}
                      onRemoveAttendance={(date) =>
                        removeAttendance.mutate(date)
                      }
                    />
                  </>
                )}

                {showCovenantPath && (
                  <>
                    <Separator />
                    <CovenantPathDashboard
                      contact={c}
                      items={covenantPath.data || []}
                      attendance={attendance.data || []}
                      loading={covenantPath.isLoading}
                      onSaveItem={(itemKey, data) =>
                        saveCovenantItem.mutate({ itemKey, ...data })
                      }
                      onAddAttendance={(date) => addAttendance.mutate(date)}
                      onRemoveAttendance={(date) =>
                        removeAttendance.mutate(date)
                      }
                    />
                  </>
                )}

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

function InfoSection({
  contact,
  onSave,
  saving,
}: {
  contact: any;
  onSave: (d: any) => void;
  saving: boolean;
}) {
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
          <Select
            value={personType}
            onValueChange={(v) => setValue("personType", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERSON_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Etapa</Label>
          <Select value={stage} onValueChange={(v) => setValue("stage", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
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

function ProgressSection({
  merged,
  loading,
  onLesson,
  onCommitment,
  onMilestone,
}: {
  merged: { lessons: any[]; commitments: any[]; milestones: any[] };
  loading: boolean;
  onLesson: (id: string, s: string) => void;
  onCommitment: (id: string, r: string) => void;
  onMilestone: (id: string, s: string) => void;
}) {
  const total =
    (merged.lessons?.length ?? 0) +
    (merged.commitments?.length ?? 0) +
    (merged.milestones?.length ?? 0);

  const done = useMemo(() => {
    const doneLesson = (merged.lessons || []).filter(
      (i) => i.status === "completed" || i.status === "taught",
    ).length;
    const doneCommit = (merged.commitments || []).filter(
      (i) => i.result === "done",
    ).length;
    const doneMile = (merged.milestones || []).filter(
      (i) => i.status === "done",
    ).length;
    return doneLesson + doneCommit + doneMile;
  }, [merged]);

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Progreso espiritual</h3>
        {!loading && total > 0 && (
          <span className="text-xs text-muted-foreground">
            {done}/{total}
          </span>
        )}
      </div>
      {!loading && total > 0 && <Progress value={pct} className="h-1.5" />}
      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : total === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin plantilla configurada. El líder misional debe crear una plantilla
          por defecto para este tipo de contacto.
        </p>
      ) : (
        <>
          {(merged.lessons?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Lecciones
              </p>
              {merged.lessons.map((item) => (
                <ProgressItem
                  key={item.templateItemId}
                  title={item.itemTitle}
                  required={item.itemRequired}
                  options={LESSON_STATUS_OPTIONS}
                  value={item.status}
                  onChange={(v) => onLesson(item.templateItemId, v)}
                  date={item.completedAt || item.taughtAt}
                />
              ))}
            </div>
          )}
          {(merged.commitments?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Compromisos
              </p>
              {merged.commitments.map((item) => (
                <ProgressItem
                  key={item.templateItemId}
                  title={item.itemTitle}
                  required={item.itemRequired}
                  options={COMMITMENT_RESULT_OPTIONS}
                  value={item.result}
                  onChange={(v) => onCommitment(item.templateItemId, v)}
                  date={item.dueAt}
                />
              ))}
            </div>
          )}
          {(merged.milestones?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Hitos
              </p>
              {merged.milestones.map((item) => (
                <ProgressItem
                  key={item.templateItemId}
                  title={item.itemTitle}
                  required={item.itemRequired}
                  options={MILESTONE_STATUS_OPTIONS}
                  value={item.status}
                  onChange={(v) => onMilestone(item.templateItemId, v)}
                  date={item.doneAt}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProgressItem({
  title,
  required,
  options,
  value,
  onChange,
  date,
}: {
  title: string;
  required?: boolean;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  date?: string | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
      <div className="flex-1 min-w-0">
        <span className="truncate">{title}</span>
        {required && <span className="ml-1 text-xs text-destructive">*</span>}
        {date && (
          <span className="ml-2 text-xs text-muted-foreground">
            {new Date(date).toLocaleDateString("es-ES")}
          </span>
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-36 text-xs shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Notes Section ────────────────────────────────────────────────────────────

function NotesSection({
  notes,
  loading,
  onAdd,
  saving,
}: {
  notes: any[];
  loading: boolean;
  onAdd: (note: string) => void;
  saving: boolean;
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
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Añadir nota…"
          rows={2}
          className="text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <Button
          size="sm"
          onClick={submit}
          disabled={saving || !text.trim()}
          className="w-full"
        >
          {saving ? "Guardando…" : "Añadir nota"}
        </Button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin notas.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded border p-3 text-sm">
              <p className="whitespace-pre-wrap">{n.note}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.authorName ? `${n.authorName} · ` : ""}
                <span title={new Date(n.createdAt).toLocaleString("es-ES")}>
                  {relativeTime(n.createdAt)}
                </span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create Contact Dialog ─────────────────────────────────────────────────────

function CreateContactDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      fullName: "",
      personType: "friend",
      stage: "new",
      phone: "",
      email: "",
    },
  });
  const personType = watch("personType");

  const create = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/mission/contacts", data),
    onSuccess: () => {
      onCreated();
      onOpenChange(false);
      reset();
      toast({ title: "Contacto creado" });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo contacto</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((d) => create.mutate(d))}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label>Nombre completo *</Label>
            <Input
              {...register("fullName", { required: true })}
              placeholder="Nombre completo"
            />
            {errors.fullName && (
              <p className="text-xs text-destructive">Requerido</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Tipo de persona</Label>
            <Select
              value={personType}
              onValueChange={(v) => setValue("personType", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSON_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Baptism Service Dialog ────────────────────────────────────────────

function CreateBaptismServiceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      candidateContactId: "",
      serviceAt: "",
      locationName: "",
      locationAddress: "",
      mapsUrl: "",
    },
  });
  const candidateContactId = watch("candidateContactId");

  const eligible = useQuery<{ id: string; fullName: string }[]>({
    queryKey: ["/api/baptisms/eligible-contacts"],
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/baptisms/services", data),
    onSuccess: () => {
      onCreated();
      onOpenChange(false);
      reset();
      toast({ title: "Servicio bautismal creado" });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err?.message ?? "No se pudo crear el servicio",
        variant: "destructive",
      }),
  });

  const contacts = eligible.data || [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo servicio bautismal</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((d) => create.mutate(d))}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label>Candidato *</Label>
            {contacts.length === 0 && !eligible.isLoading ? (
              <p className="text-xs text-muted-foreground rounded border px-3 py-2">
                No hay contactos con el hito "Fecha bautismal definida"
                completado sin servicio ya programado.
              </p>
            ) : (
              <Select
                value={candidateContactId}
                onValueChange={(v) => setValue("candidateContactId", v)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      eligible.isLoading ? "Cargando…" : "Seleccionar contacto"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Fecha y hora *</Label>
              <Input
                type="datetime-local"
                {...register("serviceAt", { required: true })}
              />
              {errors.serviceAt && (
                <p className="text-xs text-destructive">Requerido</p>
              )}
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Lugar *</Label>
              <Input
                {...register("locationName", { required: true })}
                placeholder="Ej: Capilla Calle Mayor"
              />
              {errors.locationName && (
                <p className="text-xs text-destructive">Requerido</p>
              )}
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Dirección</Label>
              <Input
                {...register("locationAddress")}
                placeholder="Calle Mayor 1, Madrid"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Enlace Google Maps</Label>
              <Input
                {...register("mapsUrl")}
                placeholder="https://maps.google.com/…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || contacts.length === 0}
            >
              {create.isPending ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fellowship Section ────────────────────────────────────────────────────────

function FellowshipSection({
  fellowshipName,
  onSave,
  saving,
}: {
  fellowshipName?: string | null;
  onSave: (name: string) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(fellowshipName ?? "");

  useEffect(() => {
    setValue(fellowshipName ?? "");
  }, [fellowshipName]);

  if (!editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Compañero miembro</h3>
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setEditing(true)}
          >
            Editar
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {fellowshipName || "No asignado"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Compañero miembro</h3>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Nombre del miembro compañero"
        className="h-8 text-sm"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={() => {
            onSave(value);
            setEditing(false);
          }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue(fellowshipName ?? "");
            setEditing(false);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ─── Attendance Section ────────────────────────────────────────────────────────

function AttendanceSection({
  rows,
  loading,
  onAdd,
  onRemove,
}: {
  rows: Array<{ id: string; attendedAt: string }>;
  loading: boolean;
  onAdd: (date: string) => void;
  onRemove: (date: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [pickedDate, setPickedDate] = useState("");

  const lastFour = rows.slice(0, 4);
  const count = rows.length;

  function submit() {
    if (!pickedDate) return;
    onAdd(pickedDate);
    setPickedDate("");
    setPicking(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Asistencia a la iglesia ({count})
        </h3>
        <button
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => setPicking((v) => !v)}
        >
          {picking ? "Cancelar" : "+ Añadir"}
        </button>
      </div>

      {picking && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={pickedDate}
            onChange={(e) => setPickedDate(e.target.value)}
            className="h-8 text-sm flex-1"
          />
          <Button size="sm" onClick={submit} disabled={!pickedDate}>
            Añadir
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : lastFour.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin registros de asistencia.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {lastFour.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-1 rounded border px-2 py-1 text-xs"
            >
              <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
              <span>
                {new Date(r.attendedAt + "T12:00:00").toLocaleDateString(
                  "es-ES",
                )}
              </span>
              <button
                className="ml-1 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(r.attendedAt)}
                title="Eliminar"
              >
                ×
              </button>
            </div>
          ))}
          {count > 4 && (
            <span className="text-xs text-muted-foreground self-center">
              +{count - 4} más
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Seed Defaults Button ──────────────────────────────────────────────────────

function SeedDefaultsButton({ onSeeded }: { onSeeded: () => void }) {
  const { toast } = useToast();
  const seed = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/mission/templates/seed-defaults"),
    onSuccess: (data: any) => {
      onSeeded();
      if (data?.created > 0)
        toast({ title: `${data.created} plantilla(s) por defecto creadas` });
      else toast({ title: "Las plantillas por defecto ya existen" });
    },
    onError: () =>
      toast({ title: "Error al crear plantillas", variant: "destructive" }),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => seed.mutate()}
      disabled={seed.isPending}
    >
      {seed.isPending ? "Creando…" : "Sembrar plantillas por defecto"}
    </Button>
  );
}

// ─── Coordination Tab ─────────────────────────────────────────────────────────

function CoordinationTab() {
  const [activeView, setActiveView] = useState<"tasks" | "dashboard">("tasks");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={activeView === "tasks" ? "default" : "outline"}
          onClick={() => setActiveView("tasks")}
        >
          Tareas
        </Button>
        <Button
          size="sm"
          variant={activeView === "dashboard" ? "default" : "outline"}
          onClick={() => setActiveView("dashboard")}
        >
          Dashboard
        </Button>
      </div>
      {activeView === "tasks" ? (
        <CoordinationTasksView />
      ) : (
        <CoordinationDashboard />
      )}
    </div>
  );
}

function CoordinationTasksView() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("open");
  const [createOpen, setCreateOpen] = useState(false);

  const tasks = useQuery<any[]>({
    queryKey: ["/api/mission/coordination-tasks", statusFilter],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/mission/coordination-tasks?status=${statusFilter}`,
      ),
  });

  const contacts = useQuery<any[]>({ queryKey: ["/api/mission/contacts"] });

  const updateTask = useMutation({
    mutationFn: ({ id, ...data }: any) =>
      apiRequest("PATCH", `/api/mission/coordination-tasks/${id}`, data),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["/api/mission/coordination-tasks"],
      }),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/mission/coordination-tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/mission/coordination-tasks"],
      });
      toast({ title: "Tarea eliminada" });
    },
  });

  const contactMap = useMemo(() => {
    return new Map((contacts.data || []).map((c: any) => [c.id, c.fullName]));
  }, [contacts.data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open" className="text-xs">
              Abiertas
            </SelectItem>
            <SelectItem value="done" className="text-xs">
              Hechas
            </SelectItem>
            <SelectItem value="canceled" className="text-xs">
              Canceladas
            </SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          + Nueva tarea
        </Button>
      </div>

      <div className="space-y-2">
        {tasks.isLoading && (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        )}
        {(tasks.data || []).length === 0 && !tasks.isLoading && (
          <p className="text-sm text-muted-foreground">Sin tareas.</p>
        )}
        {(tasks.data || []).map((task) => (
          <div key={task.id} className="rounded border p-3 text-sm space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium leading-tight">{task.title}</p>
                {task.contactId && (
                  <p className="text-xs text-muted-foreground">
                    Contacto: {contactMap.get(task.contactId) ?? task.contactId}
                  </p>
                )}
                {task.ownerName && (
                  <p className="text-xs text-muted-foreground">
                    Responsable: {task.ownerName}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className={`text-xs font-medium ${taskPriorityColor(task.priority)}`}
                >
                  {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
                </span>
              </div>
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground">
                {task.description}
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                {task.dueAt && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(task.dueAt).toLocaleDateString("es-ES")}
                  </span>
                )}
                {taskDueBadge(task.dueAt, task.status)}
              </div>
              <div className="flex gap-1">
                {task.status === "open" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2"
                    onClick={() =>
                      updateTask.mutate({ id: task.id, status: "done" })
                    }
                  >
                    Marcar hecha
                  </Button>
                )}
                {task.status === "done" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2"
                    onClick={() =>
                      updateTask.mutate({ id: task.id, status: "open" })
                    }
                  >
                    Reabrir
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2 text-destructive hover:text-destructive"
                  onClick={() => deleteTask.mutate(task.id)}
                >
                  Borrar
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        contacts={contacts.data || []}
        onCreated={() =>
          queryClient.invalidateQueries({
            queryKey: ["/api/mission/coordination-tasks"],
          })
        }
      />
    </div>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  contacts,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contacts: any[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      contactId: "none",
      ownerName: "",
      dueAt: "",
    },
  });
  const priority = watch("priority");
  const contactId = watch("contactId");

  const create = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/mission/coordination-tasks", data),
    onSuccess: () => {
      onCreated();
      onOpenChange(false);
      reset();
      toast({ title: "Tarea creada" });
    },
  });

  function handleCreate(data: any) {
    create.mutate({
      ...data,
      contactId:
        !data.contactId || data.contactId === "none" ? null : data.contactId,
      dueAt: data.dueAt || null,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarea de coordinación</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleCreate)} className="space-y-4">
          <div className="space-y-1">
            <Label>Título *</Label>
            <Input
              {...register("title", { required: true })}
              placeholder="Ej: Llamar a hermano García"
            />
            {errors.title && (
              <p className="text-xs text-destructive">Requerido</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Descripción</Label>
            <Textarea
              {...register("description")}
              placeholder="Detalles opcionales…"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Prioridad</Label>
              <Select
                value={priority}
                onValueChange={(v) => setValue("priority", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="low">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fecha límite</Label>
              <Input type="date" {...register("dueAt")} />
            </div>
            <div className="space-y-1">
              <Label>Responsable</Label>
              <Input {...register("ownerName")} placeholder="Nombre" />
            </div>
            <div className="space-y-1">
              <Label>Contacto relacionado</Label>
              <Select
                value={contactId}
                onValueChange={(v) => setValue("contactId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ninguno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Coordination Dashboard ────────────────────────────────────────────────────

function CoordinationDashboard() {
  const dashboard = useQuery<any>({
    queryKey: ["/api/mission/coordination-dashboard"],
  });

  if (dashboard.isLoading)
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!dashboard.data) return null;

  const { contacts, unlinkedTasks } = dashboard.data as {
    contacts: any[];
    unlinkedTasks: any[];
  };

  return (
    <div className="space-y-4">
      {unlinkedTasks.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              Tareas sin contacto ({unlinkedTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            {unlinkedTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between text-sm rounded border px-3 py-2"
              >
                <span>{t.title}</span>
                <div className="flex items-center gap-2">
                  {taskDueBadge(t.dueAt, t.status)}
                  <span className={`text-xs ${taskPriorityColor(t.priority)}`}>
                    {TASK_PRIORITY_LABELS[t.priority]}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {contacts.map((c: any) => (
          <div
            key={c.contactId}
            className="rounded border p-3 text-sm space-y-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{c.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {personTypeLabel(c.personType)} · {stageLabel(c.stage)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                {c.overdueTasks > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {c.overdueTasks} vencida{c.overdueTasks > 1 ? "s" : ""}
                  </Badge>
                )}
                {c.openTasks > 0 && c.overdueTasks === 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {c.openTasks} tarea{c.openTasks > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                {c.attendanceCount} asistencia
                {c.attendanceCount !== 1 ? "s" : ""}
                {c.lastAttendedAt &&
                  ` · última: ${new Date(c.lastAttendedAt + "T12:00:00").toLocaleDateString("es-ES")}`}
              </span>
              {c.fellowshipName && (
                <span className="flex items-center gap-1">
                  <Circle className="h-3 w-3" />
                  {c.fellowshipName}
                </span>
              )}
            </div>
          </div>
        ))}
        {contacts.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin contactos.</p>
        )}
      </div>
    </div>
  );
}

// ─── Approval Tab (bishop view) ───────────────────────────────────────────────

function ApprovalTab({
  rows,
  loading,
  onSelect,
}: {
  rows: any[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agendas pendientes de aprobación ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin agendas pendientes.
          </p>
        )}
        {rows.map((row) => (
          <button
            key={row.id}
            className="w-full rounded border p-3 text-left text-sm hover:bg-muted/50 transition-colors"
            onClick={() => onSelect(row.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{row.locationName}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.serviceAt).toLocaleString("es-ES")}
                  {row.candidateName && ` · Candidato: ${row.candidateName}`}
                </p>
                {row.leaderName && (
                  <p className="text-xs text-muted-foreground">
                    Preparado por: {row.leaderName}
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0 text-xs">
                Revisar
              </Badge>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Reject Dialog ────────────────────────────────────────────────────────────

// ─── Pastoral Dashboard Helpers ───────────────────────────────────────────────

function formatTimeSince(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 30) return `${days} día${days !== 1 ? "s" : ""}`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mes${months !== 1 ? "es" : ""}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0
    ? `${years} año${years !== 1 ? "s" : ""} ${rem} mes${rem !== 1 ? "es" : ""}`
    : `${years} año${years !== 1 ? "s" : ""}`;
}

function getSundaysOfCurrentMonth(): Date[] {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const result: Date[] = [];
  const d = new Date(year, month, 1);
  // advance to first Sunday
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  while (d.getMonth() === month) {
    result.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return result;
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Reusable section wrapper
function DashSection({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// Status row for milestones/hitos
function HitoRow({
  label,
  status,
  date,
  onCycle,
}: {
  label: string;
  status: string;
  date?: string | null;
  onCycle?: () => void;
}) {
  const cfg =
    status === "done"
      ? {
          cls: "border-green-200 bg-green-50 text-green-800",
          dot: "bg-green-500",
          icon: "✓",
        }
      : status === "waived"
        ? {
            cls: "border-yellow-200 bg-yellow-50 text-yellow-800",
            dot: "bg-yellow-400",
            icon: "~",
          }
        : {
            cls: "border-border bg-muted/30 text-muted-foreground",
            dot: "bg-muted-foreground/30",
            icon: "○",
          };

  return (
    <button
      onClick={onCycle}
      className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs text-left transition-colors hover:opacity-80 ${cfg.cls}`}
    >
      <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
      <span className="flex-1 leading-snug">{label}</span>
      {date && (
        <span className="opacity-60 shrink-0">
          {new Date(date).toLocaleDateString("es-ES")}
        </span>
      )}
    </button>
  );
}

// Sunday attendance visual tracker
function SundayAttendanceTracker({
  rows,
  onAdd,
  onRemove,
}: {
  rows: Array<{ attendedAt: string }>;
  onAdd: (date: string) => void;
  onRemove: (date: string) => void;
}) {
  const sundays = useMemo(() => getSundaysOfCurrentMonth(), []);
  const attendedSet = useMemo(
    () => new Set(rows.map((r) => r.attendedAt)),
    [rows],
  );

  const missed = sundays.filter((s) => {
    const ds = toDateStr(s);
    return !attendedSet.has(ds) && s <= new Date();
  }).length;

  return (
    <DashSection
      title="Asistió a la reunión sacramental"
      icon={<Church className="h-3.5 w-3.5" />}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
        {new Date().toLocaleDateString("es-ES", {
          month: "long",
          year: "numeric",
        })}
      </p>
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1.5 min-w-max pb-1">
          {sundays.map((sunday) => {
            const ds = toDateStr(sunday);
            const attended = attendedSet.has(ds);
            const isFuture = sunday > new Date();
            return (
              <button
                key={ds}
                disabled={isFuture}
                onClick={() => {
                  if (attended) onRemove(ds);
                  else onAdd(ds);
                }}
                className="flex flex-col items-center gap-1 group"
                title={ds}
              >
                <span className="text-[10px] font-medium leading-none text-muted-foreground">
                  {sunday.getDate()}
                </span>
                <span className="text-[9px] leading-none text-muted-foreground/70 uppercase">
                  {sunday
                    .toLocaleDateString("es-ES", { month: "short" })
                    .replace(".", "")
                    .slice(0, 3)}
                </span>
                <div
                  className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    isFuture
                      ? "border-border/30 bg-transparent"
                      : attended
                        ? "border-green-500 bg-green-500 shadow-sm"
                        : "border-muted-foreground/30 bg-transparent group-hover:border-muted-foreground"
                  }`}
                >
                  {attended && (
                    <svg
                      className="w-3 h-3 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {missed > 0 && (
        <p className="text-[11px] text-destructive font-medium">
          {missed} reunión{missed !== 1 ? "es" : ""} sacramental
          {missed !== 1 ? "es" : ""} que no asistió
        </p>
      )}
    </DashSection>
  );
}

// ─── Covenant Path Dashboard ──────────────────────────────────────────────────

const CP_PRINCIPLES = [
  "gospel_study",
  "sabbath_day",
  "share_gospel",
  "family_home_evening",
  "follow_prophet",
  "obey_commandments",
];
const CP_TEMPLE = [
  "temple_recommend_proxy",
  "family_history",
  "patriarchal_blessing",
  "endowment",
  "sealing",
];
const CP_ORDINATION = ["aaronic_priesthood_ymen", "melchizedek_priesthood"];
const CP_CALLING = ["young_women", "relief_society", "primary", "service"];
const CP_SELFRELIANCЕ = ["self_reliance"];

function CovenantPathDashboard({
  contact,
  items,
  attendance,
  loading,
  onSaveItem,
  onAddAttendance,
  onRemoveAttendance,
}: {
  contact: any;
  items: any[];
  attendance: Array<{ attendedAt: string }>;
  loading: boolean;
  onSaveItem: (itemKey: string, data: any) => void;
  onAddAttendance: (date: string) => void;
  onRemoveAttendance: (date: string) => void;
}) {
  const itemMap = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const get = (key: string) => itemMap.get(key);
  const cycleLesson = (key: string) => {
    const cur = get(key)?.lessonStatus ?? "not_started";
    const next =
      cur === "not_started"
        ? "taught"
        : cur === "taught"
          ? "completed"
          : "not_started";
    onSaveItem(key, { lessonStatus: next });
  };
  const cycleMilestone = (key: string) => {
    const cur = get(key)?.milestoneStatus ?? "pending";
    const next =
      cur === "pending" ? "done" : cur === "done" ? "waived" : "pending";
    onSaveItem(key, { milestoneStatus: next });
  };

  const memberSince = contact.confirmedAt
    ? `Miembro por ${formatTimeSince(contact.confirmedAt)}`
    : contact.createdAt
      ? `En seguimiento hace ${formatTimeSince(contact.createdAt)}`
      : null;

  if (loading)
    return (
      <p className="text-sm text-muted-foreground py-4">
        Cargando senda de los convenios…
      </p>
    );

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="space-y-0.5">
        <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
          Progreso de la senda de los convenios
        </p>
        <p className="text-xs text-muted-foreground">
          {contact.personType === "less_active"
            ? "Menos activo"
            : "Miembro nuevo"}
        </p>
        {memberSince && (
          <p className="text-xs text-muted-foreground/70">{memberSince}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* ── Left column ──────────────────────────── */}
        <div className="space-y-6">
          {/* 1. Attendance */}
          <SundayAttendanceTracker
            rows={attendance}
            onAdd={onAddAttendance}
            onRemove={onRemoveAttendance}
          />

          {/* 2. Friends in church */}
          <DashSection
            title="Amigos en la Iglesia"
            icon={<Heart className="h-3.5 w-3.5" />}
          >
            {get("friendship_members") ? (
              <HitoRow
                label="Entablar amistad con miembros de su barrio"
                status={get("friendship_members")!.milestoneStatus}
                onCycle={() => cycleMilestone("friendship_members")}
              />
            ) : null}
            {get("friendship_members")?.notes && (
              <p className="text-xs text-muted-foreground pl-1">
                {get("friendship_members")!.notes}
              </p>
            )}
          </DashSection>

          {/* 3. Priesthood ordination */}
          <DashSection
            title="Ordenación en el sacerdocio"
            icon={<Star className="h-3.5 w-3.5" />}
          >
            {CP_ORDINATION.map((key) => {
              const item = get(key);
              if (!item) return null;
              return (
                <HitoRow
                  key={key}
                  label={item.title}
                  status={item.milestoneStatus}
                  onCycle={() => cycleMilestone(key)}
                />
              );
            })}
          </DashSection>

          {/* 4. Calling */}
          <DashSection
            title="Llamamiento"
            icon={<Sparkles className="h-3.5 w-3.5" />}
          >
            {CP_CALLING.map((key) => {
              const item = get(key);
              if (!item) return null;
              return (
                <HitoRow
                  key={key}
                  label={item.title}
                  status={
                    item.commitmentStatus === "committed"
                      ? "done"
                      : item.milestoneStatus
                  }
                  onCycle={() => cycleMilestone(key)}
                />
              );
            })}
          </DashSection>

          {/* 5. Help needed */}
          {get("overcome_discouragement") && (
            <DashSection
              title="Ayuda que se precisa"
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
            >
              <HitoRow
                label="Superar el desánimo y los contratiempos"
                status={
                  get("overcome_discouragement")!.commitmentStatus ===
                  "committed"
                    ? "done"
                    : "pending"
                }
                onCycle={() => {
                  const cur = get("overcome_discouragement")!.commitmentStatus;
                  onSaveItem("overcome_discouragement", {
                    commitmentStatus:
                      cur === "committed" ? "pending" : "committed",
                  });
                }}
              />
              {get("overcome_discouragement")?.notes && (
                <p className="text-xs text-muted-foreground pl-1">
                  {get("overcome_discouragement")!.notes}
                </p>
              )}
            </DashSection>
          )}
        </div>

        {/* ── Right column ─────────────────────────── */}
        <div className="space-y-6">
          {/* 6. Temple */}
          <DashSection
            title="Ordenanzas y experiencias del templo"
            icon={<Sparkles className="h-3.5 w-3.5" />}
          >
            {CP_TEMPLE.map((key) => {
              const item = get(key);
              if (!item) return null;
              return (
                <HitoRow
                  key={key}
                  label={item.title}
                  status={item.milestoneStatus}
                  onCycle={() => cycleMilestone(key)}
                />
              );
            })}
          </DashSection>

          {/* 7. Principles taught */}
          <DashSection
            title="Principios que se enseñaron"
            icon={<BookOpen className="h-3.5 w-3.5" />}
          >
            {CP_PRINCIPLES.map((key) => {
              const item = get(key);
              if (!item) return null;
              const ls = item.lessonStatus;
              const dot =
                ls === "completed"
                  ? "bg-green-500"
                  : ls === "taught"
                    ? "bg-blue-400"
                    : "bg-muted-foreground/25";
              return (
                <button
                  key={key}
                  onClick={() => cycleLesson(key)}
                  className="w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs text-left hover:bg-muted/40 transition-colors"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot}`}
                  />
                  <span className="flex-1 leading-snug">{item.title}</span>
                  {ls !== "not_started" && (
                    <span
                      className={`shrink-0 text-[10px] font-medium ${ls === "completed" ? "text-green-700" : "text-blue-600"}`}
                    >
                      {ls === "completed" ? "Completado" : "Enseñado"}
                    </span>
                  )}
                </button>
              );
            })}
          </DashSection>

          {/* 8. Self-reliance */}
          <DashSection
            title="Clases de autosuficiencia completadas"
            icon={<GraduationCap className="h-3.5 w-3.5" />}
          >
            {get("self_reliance") ? (
              <HitoRow
                label="Ser autosuficiente"
                status={get("self_reliance")!.milestoneStatus}
                onCycle={() => cycleMilestone("self_reliance")}
              />
            ) : null}
            {/* Static self-reliance classes */}
            {[
              "Resiliencia emocional",
              "Las finanzas personales",
              "Inicia tu negocio y hazlo crecer",
              "Educación para un mejor empleo",
              "Buscar un mejor empleo",
            ].map((cls) => (
              <div
                key={cls}
                className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs bg-muted/20"
              >
                <span className="h-2 w-2 rounded-full bg-muted-foreground/25 shrink-0" />
                <span className="flex-1 text-muted-foreground">{cls}</span>
              </div>
            ))}
          </DashSection>
        </div>
      </div>
    </div>
  );
}

// ─── Friend Dashboard ─────────────────────────────────────────────────────────

const FRIEND_LESSON_KEYS: Array<[string, string]> = [
  ["restoration", "Mensaje de la Restauración"],
  ["plan_salvation", "El plan de salvación del Padre Celestial"],
  ["gospel_of_jesus", "El evangelio de Jesucristo"],
  ["commandments", "Llegar a ser discípulos de Jesucristo"],
  ["laws_ordinances", "Leyes y Ordenanzas"],
  ["pre_baptism_review", "Repaso pre-bautismal"],
];

const FRIEND_BASIC_COMMITMENT_LABELS: Record<string, string> = {
  praysPersonally: "Ora personalmente",
  readsBoM: "Lee el Libro de Mormón",
  attendsChurch: "Asiste a la iglesia",
  keepsSabbath: "Guarda el día de reposo",
  willingToRepent: "Dispuesto a arrepentirse",
  desiresFollowChrist: "Desea seguir a Cristo",
};

function FriendDashboard({
  contact,
  sections,
  attendance,
  loading,
  onSaveSection,
  onAddAttendance,
  onRemoveAttendance,
}: {
  contact: any;
  sections: Array<{ sectionKey: string; data: any; updatedAt?: string }>;
  attendance: Array<{ attendedAt: string }>;
  loading: boolean;
  onSaveSection: (key: string, data: any) => void;
  onAddAttendance: (date: string) => void;
  onRemoveAttendance: (date: string) => void;
}) {
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [friendSlot, setFriendSlot] = useState<
    "friendMember1" | "friendMember2"
  >("friendMember1");

  const sectionMap = useMemo(
    () => new Map(sections.map((s) => [s.sectionKey, s.data ?? {}])),
    [sections],
  );
  const s = (key: string): any => sectionMap.get(key) ?? {};

  const startDate = contact.createdAt;
  const tracking = startDate
    ? `En seguimiento hace ${formatTimeSince(startDate)}`
    : null;

  // Interview status color
  const interviewStatus = s("s7_interview").status ?? "not_ready";
  const baptismGoal = s("s8_baptism").goalStatus ?? "initial_interest";
  const INTERVIEW_LABELS: Record<string, string> = {
    not_ready: "No listo para entrevistar",
    ready: "Listo para entrevistar",
    scheduled: "Entrevista programada",
    approved: "Entrevista aprobada",
  };
  const BAPTISM_GOAL_LABELS: Record<string, string> = {
    initial_interest: "Interés inicial",
    progressing: "En progreso",
    date_set: "Fecha bautismal definida",
    interview_passed: "Entrevista aprobada",
    baptized: "Bautizado",
  };

  if (loading)
    return (
      <p className="text-sm text-muted-foreground py-4">
        Cargando progreso del amigo…
      </p>
    );

  const s1 = s("s1_friendship");
  const s3 = s("s3_prayer");
  const s4 = s("s4_lessons");
  const s5 = s("s5_commitments");
  const s6 = s("s6_support");
  const s7 = s("s7_interview");
  const s8 = s("s8_baptism");
  const s9 = s("s9_post_baptism");

  const friendNames = [s1.friendMember1, s1.friendMember2].filter(Boolean);
  const basicCommitments = s5.basicCommitments ?? {};
  const lessons = s4.lessons ?? {};

  function saveSupportToggle(key: string) {
    onSaveSection("s6_support", { ...s6, [key]: !Boolean(s6[key]) });
  }

  function saveLessonToggle(key: string) {
    const current = lessons[key] ?? {};
    const nextReceived = !Boolean(current.received);
    onSaveSection("s4_lessons", {
      ...s4,
      lessons: {
        ...lessons,
        [key]: {
          ...current,
          received: nextReceived,
          date: nextReceived
            ? current.date || new Date().toISOString().slice(0, 10)
            : "",
        },
      },
    });
  }

  function saveCommitmentToggle(key: string) {
    onSaveSection("s5_commitments", {
      ...s5,
      basicCommitments: {
        ...basicCommitments,
        [key]: !Boolean(basicCommitments[key]),
      },
    });
  }

  function savePrayerToggle(key: string) {
    onSaveSection("s3_prayer", { ...s3, [key]: !Boolean(s3[key]) });
  }

  function assignChurchFriend(name: string) {
    const next = { ...s1, [friendSlot]: name };
    if (!next.mainFriendMember) next.mainFriendMember = name;
    onSaveSection("s1_friendship", next);
    setAddFriendOpen(false);
  }

  // Progress summary
  const lessonsDone = Object.values(lessons).filter(
    (l: any) => l?.received,
  ).length;
  const commitsDone = Object.values(basicCommitments).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="space-y-0.5">
        <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">
          Seguimiento del amigo
        </p>
        {tracking && (
          <p className="text-xs text-muted-foreground/70">{tracking}</p>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Asistencias", value: attendance.length },
          { label: "Lecciones", value: `${lessonsDone}/6` },
          { label: "Compromisos", value: `${commitsDone}/6` },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border bg-muted/20 p-2.5 text-center"
          >
            <p className="text-lg font-bold leading-tight">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* ── Left column ──────────────────────────── */}
        <div className="space-y-6">
          {/* 1. Attendance */}
          <SundayAttendanceTracker
            rows={attendance}
            onAdd={onAddAttendance}
            onRemove={onRemoveAttendance}
          />

          {/* 2. Friends in church */}
          <DashSection
            title="Amigos en la Iglesia"
            icon={<Heart className="h-3.5 w-3.5" />}
            action={
              <button
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                onClick={() => {
                  setFriendSlot(
                    s1.friendMember1 ? "friendMember2" : "friendMember1",
                  );
                  setAddFriendOpen(true);
                }}
              >
                <Plus className="h-3 w-3" /> Agregar amigo
              </button>
            }
          >
            {friendNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {friendNames.map((name: string) => (
                  <span
                    key={name}
                    className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin amigos miembros asignados aún.
              </p>
            )}
          </DashSection>

          {/* 3. Support */}
          <DashSection
            title="Apoyo del barrio"
            icon={<Sparkles className="h-3.5 w-3.5" />}
          >
            {[
              ["bishopKnowsFriend", "Obispo conoce al amigo"],
              ["missionLeaderAssigned", "Líder misional asignado"],
              ["memberCompanionAssigned", "Miembro acompañante asignado"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => saveSupportToggle(k)}
                className={`flex items-center gap-2 text-xs rounded-lg border px-3 py-2 ${s6[k] ? "border-green-200 bg-green-50 text-green-800" : "border-border bg-muted/20 text-muted-foreground"}`}
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${s6[k] ? "bg-green-500" : "bg-muted-foreground/30"}`}
                />
                {l}
              </button>
            ))}
            {s6.mainFriendMember && (
              <p className="text-xs text-muted-foreground pl-1">
                Miembro principal: {s6.mainFriendMember}
              </p>
            )}
          </DashSection>

          {/* 4. Interview & Baptism status */}
          <DashSection
            title="Estado hacia el bautismo"
            icon={<Star className="h-3.5 w-3.5" />}
          >
            <div
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                interviewStatus === "approved"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : interviewStatus === "scheduled"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : interviewStatus === "ready"
                      ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                      : "border-border bg-muted/20 text-muted-foreground"
              }`}
            >
              Entrevista: {INTERVIEW_LABELS[interviewStatus] ?? interviewStatus}
            </div>
            <div
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                baptismGoal === "baptized"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : baptismGoal === "date_set"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-border bg-muted/20 text-muted-foreground"
              }`}
            >
              Objetivo: {BAPTISM_GOAL_LABELS[baptismGoal] ?? baptismGoal}
            </div>
            {s8.confirmedDate && (
              <p className="text-xs text-muted-foreground pl-1">
                Fecha:{" "}
                {new Date(s8.confirmedDate + "T12:00:00").toLocaleDateString(
                  "es-ES",
                )}
              </p>
            )}
          </DashSection>
        </div>

        {/* ── Right column ─────────────────────────── */}
        <div className="space-y-6">
          {/* 5. Principles taught */}
          <DashSection
            title="Principios que se enseñaron"
            icon={<BookOpen className="h-3.5 w-3.5" />}
          >
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
              <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />{" "}
              Miembro presente
            </p>
            {FRIEND_LESSON_KEYS.map(([key, label]) => {
              const lesson = lessons[key] ?? {};
              const done = Boolean(lesson.received);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => saveLessonToggle(key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${done ? "border-green-200 bg-green-50 text-green-800" : "border-border bg-muted/20 text-muted-foreground"}`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${done ? "bg-green-500" : "bg-muted-foreground/25"}`}
                  />
                  <span className="flex-1 leading-snug">{label}</span>
                  {lesson.date && (
                    <span className="opacity-60 shrink-0">
                      {new Date(lesson.date + "T12:00:00").toLocaleDateString(
                        "es-ES",
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </DashSection>

          {/* 6. Basic commitments */}
          <DashSection
            title="Compromisos básicos"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          >
            {Object.entries(FRIEND_BASIC_COMMITMENT_LABELS).map(
              ([key, label]) => {
                const done = Boolean(basicCommitments[key]);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => saveCommitmentToggle(key)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${done ? "border-green-200 bg-green-50 text-green-800" : "border-border bg-muted/20 text-muted-foreground"}`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${done ? "bg-green-500" : "bg-muted-foreground/25"}`}
                    />
                    {label}
                  </button>
                );
              },
            )}
          </DashSection>

          {/* 7. Prayer & scripture habits */}
          <DashSection
            title="Oración y Escrituras"
            icon={<Sparkles className="h-3.5 w-3.5" />}
          >
            {[
              ["praysPersonally", "Ora personalmente"],
              ["hasBoM", "Tiene Libro de Mormón"],
              ["startedReading", "Empezó a leer"],
              ["understandsReading", "Entiende la lectura"],
            ].map(([k, l]) => {
              const done = Boolean(s3[k]);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => savePrayerToggle(k)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${done ? "border-green-200 bg-green-50 text-green-800" : "border-border bg-muted/20 text-muted-foreground"}`}
                >
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${done ? "bg-green-500" : "bg-muted-foreground/25"}`}
                  />
                  {l}
                </button>
              );
            })}
          </DashSection>
        </div>
      </div>

      <DirectoryMemberPickerDialog
        open={addFriendOpen}
        onOpenChange={setAddFriendOpen}
        title="Seleccionar amigo miembro"
        onSelect={(m) => assignChurchFriend(m.name)}
      />
    </div>
  );
}

// ─── Less Active Tab ──────────────────────────────────────────────────────────

function LessActiveTab({
  rows,
  onSelect,
  onCreated,
}: {
  rows: any[];
  onSelect: (id: string) => void;
  onCreated: () => void;
}) {
  const [selectOpen, setSelectOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setSelectOpen(true)}>
          + Seleccionar miembro del directorio
        </Button>
      </div>
      <ContactList title="Menos activos" rows={rows} onSelect={onSelect} />
      <SelectMemberDialog
        open={selectOpen}
        onOpenChange={setSelectOpen}
        personType="less_active"
        buttonLabel="Agregar como menos activo"
        onCreated={() => {
          onCreated();
          setSelectOpen(false);
        }}
      />
    </div>
  );
}

function DirectoryMemberPickerDialog({
  open,
  onOpenChange,
  title,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  onSelect: (member: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    memberUserId?: string | null;
    organizationName?: string | null;
  }) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const members = useQuery<
    Array<{
      id: string;
      name: string;
      phone?: string | null;
      email?: string | null;
      memberUserId?: string | null;
      organizationName?: string | null;
    }>
  >({
    queryKey: ["/api/mission/directory-members", "friend", debouncedSearch],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/mission/directory-members?personType=friend&q=${encodeURIComponent(debouncedSearch)}`,
      ),
    enabled: open,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSearch("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar miembro del directorio…"
            className="h-9"
            autoFocus
          />
          <div className="max-h-64 overflow-y-auto space-y-1 rounded border">
            {members.isLoading && (
              <p className="p-3 text-sm text-muted-foreground">Buscando…</p>
            )}
            {!members.isLoading && (members.data || []).length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                Sin resultados.
              </p>
            )}
            {(members.data || []).map((m) => (
              <button
                key={m.id}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                onClick={() => onSelect(m)}
              >
                <span className="font-medium">{m.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {m.organizationName ?? "Directorio"}
                </span>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectMemberDialog({
  open,
  onOpenChange,
  onCreated,
  personType,
  buttonLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
  personType: "friend" | "less_active" | "recent_convert";
  buttonLabel: string;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<{
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    memberUserId?: string | null;
    organizationName?: string | null;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const members = useQuery<
    Array<{
      id: string;
      name: string;
      phone?: string | null;
      email?: string | null;
      memberUserId?: string | null;
      organizationName?: string | null;
    }>
  >({
    queryKey: ["/api/mission/directory-members", personType, debouncedSearch],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/mission/directory-members?personType=${personType}&q=${encodeURIComponent(debouncedSearch)}`,
      ),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (member: {
      id: string;
      name: string;
      phone?: string | null;
      email?: string | null;
      memberUserId?: string | null;
    }) =>
      apiRequest("POST", "/api/mission/contacts", {
        fullName: member.name,
        personType,
        stage: "new",
        phone: member.phone ?? undefined,
        email: member.email ?? undefined,
        memberUserId: member.memberUserId ?? undefined,
        sourceMemberId: member.id,
      }),
    onSuccess: () => {
      onCreated();
      toast({ title: "Contacto creado" });
      setSelectedMember(null);
      setSearch("");
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err?.message,
        variant: "destructive",
      }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setSearch("");
          setSelectedMember(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seleccionar miembro del directorio</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            className="h-9"
            autoFocus
          />
          <div className="max-h-64 overflow-y-auto space-y-1 rounded border">
            {members.isLoading && (
              <p className="p-3 text-sm text-muted-foreground">Buscando…</p>
            )}
            {!members.isLoading && (members.data || []).length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                Sin resultados.
              </p>
            )}
            {(members.data || []).map((m) => (
              <button
                key={m.id}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors ${selectedMember?.id === m.id ? "bg-muted" : ""}`}
                onClick={() => setSelectedMember(m)}
              >
                <span className="font-medium">{m.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {m.organizationName ?? "Directorio"}
                </span>
              </button>
            ))}
          </div>
          {selectedMember && (
            <p className="text-sm text-muted-foreground">
              Seleccionado: <strong>{selectedMember.name}</strong>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!selectedMember || create.isPending}
            onClick={() => selectedMember && create.mutate(selectedMember)}
          >
            {create.isPending ? "Creando…" : buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Covenant Path Section ────────────────────────────────────────────────────

const LESSON_STATUS_CYCLE = ["not_started", "taught", "completed"] as const;
const COMMITMENT_STATUS_CYCLE = [
  "pending",
  "committed",
  "not_committed",
] as const;
const MILESTONE_STATUS_CYCLE = ["pending", "done", "waived"] as const;

const LESSON_STATUS_LABELS_CP: Record<string, string> = {
  not_started: "Sin iniciar",
  taught: "Enseñado",
  completed: "Completado",
};
const COMMITMENT_STATUS_LABELS_CP: Record<string, string> = {
  pending: "Pendiente",
  committed: "Comprometido",
  not_committed: "No comprometido",
};
const MILESTONE_STATUS_LABELS_CP: Record<string, string> = {
  pending: "Pendiente",
  done: "Hecho",
  waived: "Dispensado",
};

function cpStatusColor(
  val: string,
  type: "lesson" | "commitment" | "milestone",
) {
  if (type === "lesson") {
    if (val === "completed")
      return "bg-green-100 text-green-700 border-green-300";
    if (val === "taught") return "bg-blue-100 text-blue-700 border-blue-300";
    return "bg-muted text-muted-foreground border-border";
  }
  if (type === "commitment") {
    if (val === "committed")
      return "bg-green-100 text-green-700 border-green-300";
    if (val === "not_committed")
      return "bg-red-100 text-red-700 border-red-300";
    return "bg-muted text-muted-foreground border-border";
  }
  if (val === "done") return "bg-green-100 text-green-700 border-green-300";
  if (val === "waived")
    return "bg-yellow-100 text-yellow-700 border-yellow-300";
  return "bg-muted text-muted-foreground border-border";
}

function cycleValue<T extends readonly string[]>(
  cycle: T,
  current: string,
): T[number] {
  const idx = cycle.indexOf(current as T[number]);
  return cycle[(idx + 1) % cycle.length];
}

function CovenantPathSection({
  items,
  loading,
  onSaveItem,
}: {
  items: any[];
  loading: boolean;
  onSaveItem: (
    itemKey: string,
    data: {
      lessonStatus?: string;
      commitmentStatus?: string;
      milestoneStatus?: string;
    },
  ) => void;
}) {
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");

  if (loading)
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Senda de los convenios</h3>
        <p className="text-xs text-muted-foreground">Cargando…</p>
      </div>
    );

  const completed = items.filter(
    (i) => i.milestoneStatus === "done" || i.lessonStatus === "completed",
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Senda de los convenios</h3>
        <span className="text-xs text-muted-foreground">
          {completed}/{items.length}
        </span>
      </div>
      <Progress
        value={
          items.length > 0 ? Math.round((completed / items.length) * 100) : 0
        }
        className="h-1.5"
      />
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.key} className="rounded border p-2 text-sm">
            <div className="flex items-start gap-2">
              <p className="flex-1 text-xs leading-snug font-medium min-w-0">
                {item.order + 1}. {item.title}
              </p>
              <button
                className="text-xs text-muted-foreground hover:underline shrink-0"
                onClick={() => {
                  setNotesOpen(notesOpen === item.key ? null : item.key);
                  setNotesText(item.notes ?? "");
                }}
              >
                Notas
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <button
                className={`rounded border px-2 py-0.5 text-xs transition-colors ${cpStatusColor(item.lessonStatus, "lesson")}`}
                onClick={() =>
                  onSaveItem(item.key, {
                    lessonStatus: cycleValue(
                      LESSON_STATUS_CYCLE,
                      item.lessonStatus,
                    ),
                  })
                }
                title="Lección — clic para cambiar"
              >
                L:{" "}
                {LESSON_STATUS_LABELS_CP[item.lessonStatus] ??
                  item.lessonStatus}
              </button>
              <button
                className={`rounded border px-2 py-0.5 text-xs transition-colors ${cpStatusColor(item.commitmentStatus, "commitment")}`}
                onClick={() =>
                  onSaveItem(item.key, {
                    commitmentStatus: cycleValue(
                      COMMITMENT_STATUS_CYCLE,
                      item.commitmentStatus,
                    ),
                  })
                }
                title="Compromiso — clic para cambiar"
              >
                C:{" "}
                {COMMITMENT_STATUS_LABELS_CP[item.commitmentStatus] ??
                  item.commitmentStatus}
              </button>
              <button
                className={`rounded border px-2 py-0.5 text-xs transition-colors ${cpStatusColor(item.milestoneStatus, "milestone")}`}
                onClick={() =>
                  onSaveItem(item.key, {
                    milestoneStatus: cycleValue(
                      MILESTONE_STATUS_CYCLE,
                      item.milestoneStatus,
                    ),
                  })
                }
                title="Hito — clic para cambiar"
              >
                H:{" "}
                {MILESTONE_STATUS_LABELS_CP[item.milestoneStatus] ??
                  item.milestoneStatus}
              </button>
            </div>
            {notesOpen === item.key && (
              <div className="mt-2 flex gap-2">
                <Input
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Notas…"
                  className="h-7 text-xs flex-1"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    onSaveItem(item.key, { notes: notesText });
                    setNotesOpen(null);
                  }}
                >
                  Guardar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Friend Progress Section ──────────────────────────────────────────────────

const FRIEND_SECTION_LABELS: Record<string, string> = {
  s1_friendship: "1. Amistad y acercamiento",
  s2_attendance: "2. Asistencia a la iglesia",
  s3_prayer: "3. Oración y Escrituras",
  s4_lessons: "4. Lecciones",
  s5_commitments: "5. Compromisos",
  s6_support: "6. Apoyo del barrio",
  s7_interview: "7. Entrevista bautismal",
  s8_baptism: "8. Bautismo",
  s9_post_baptism: "9. Post bautismo",
};

function FriendProgressSection({
  sections,
  loading,
  onSaveSection,
}: {
  sections: Array<{ sectionKey: string; data: any; updatedAt?: string }>;
  loading: boolean;
  onSaveSection: (sectionKey: string, data: any) => void;
}) {
  const sectionMap = useMemo(
    () => new Map(sections.map((s) => [s.sectionKey, s])),
    [sections],
  );
  const completed = sections.filter((s) => {
    const d = s.data as any;
    if (s.sectionKey === "s7_interview") return d.status === "approved";
    if (s.sectionKey === "s8_baptism") return d.hasBaptismDate === true;
    if (s.sectionKey === "s9_post_baptism")
      return d.receivedConfirmation === true;
    return false;
  }).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Progreso del amigo</h3>
        {!loading && (
          <span className="text-xs text-muted-foreground">
            {sections.length} secciones
          </span>
        )}
      </div>
      {loading && <p className="text-xs text-muted-foreground">Cargando…</p>}
      {Object.entries(FRIEND_SECTION_LABELS).map(([key, label]) => {
        const section = sectionMap.get(key);
        return (
          <FriendSectionCard
            key={key}
            sectionKey={key}
            label={label}
            data={section?.data ?? {}}
            updatedAt={section?.updatedAt}
            onSave={(data) => onSaveSection(key, data)}
          />
        );
      })}
    </div>
  );
}

function FriendSectionCard({
  sectionKey,
  label,
  data,
  updatedAt,
  onSave,
}: {
  sectionKey: string;
  label: string;
  data: any;
  updatedAt?: string;
  onSave: (d: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>(data);

  // Sync draft when data changes
  useEffect(() => {
    setDraft(data);
  }, [data]);

  function toggle(key: string) {
    setDraft((prev: any) => ({ ...prev, [key]: !prev[key] }));
  }
  function setField(key: string, value: any) {
    setDraft((prev: any) => ({ ...prev, [key]: value }));
  }
  function toggleNested(parentKey: string, childKey: string) {
    setDraft((prev: any) => ({
      ...prev,
      [parentKey]: {
        ...(prev[parentKey] ?? {}),
        [childKey]: !prev[parentKey]?.[childKey],
      },
    }));
  }

  // Section-specific summary
  function getSummary() {
    const boolKeys = Object.keys(data).filter(
      (k) => typeof data[k] === "boolean" && data[k] === true,
    );
    if (boolKeys.length > 0)
      return `${boolKeys.length} marcado${boolKeys.length > 1 ? "s" : ""}`;
    if (sectionKey === "s7_interview")
      return data.status === "approved"
        ? "Aprobada"
        : (data.status ?? "Sin estado");
    if (sectionKey === "s8_baptism") return data.goalStatus ?? "Sin estado";
    return updatedAt
      ? new Date(updatedAt).toLocaleDateString("es-ES")
      : "Sin datos";
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="text-sm font-medium">{label}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {getSummary()}
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 space-y-3">
            <FriendSectionForm
              sectionKey={sectionKey}
              draft={draft}
              onToggle={toggle}
              onSetField={setField}
              onToggleNested={toggleNested}
            />
            <Button size="sm" className="w-full" onClick={() => onSave(draft)}>
              Guardar sección
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function FriendSectionForm({
  sectionKey,
  draft,
  onToggle,
  onSetField,
  onToggleNested,
}: {
  sectionKey: string;
  draft: any;
  onToggle: (k: string) => void;
  onSetField: (k: string, v: any) => void;
  onToggleNested: (parent: string, child: string) => void;
}) {
  // Render simple bool + string fields for each section
  const renderBool = (key: string, label: string) => (
    <label key={key} className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={Boolean(draft[key])}
        onChange={() => onToggle(key)}
        className="rounded border h-4 w-4"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
  const renderText = (key: string, label: string, placeholder?: string) => (
    <div key={key} className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={draft[key] ?? ""}
        onChange={(e) => onSetField(key, e.target.value)}
        placeholder={placeholder ?? ""}
        className="h-8 text-sm"
      />
    </div>
  );
  const renderDate = (key: string, label: string) => (
    <div key={key} className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="date"
        value={draft[key] ?? ""}
        onChange={(e) => onSetField(key, e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );
  const renderNestedBool = (
    parentKey: string,
    childKey: string,
    label: string,
  ) => {
    const parent = draft[parentKey] ?? {};
    return (
      <label
        key={`${parentKey}.${childKey}`}
        className="flex items-center gap-2 cursor-pointer"
      >
        <input
          type="checkbox"
          checked={Boolean(parent[childKey])}
          onChange={() => onToggleNested(parentKey, childKey)}
          className="rounded border h-4 w-4"
        />
        <span className="text-sm">{label}</span>
      </label>
    );
  };

  if (sectionKey === "s1_friendship")
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {renderText("referredBy", "Referido por")}
          {renderDate("firstContactDate", "Primer contacto")}
        </div>
        <div className="space-y-1.5">
          {renderBool("knowsMember", "Conoce a un miembro")}
          {renderBool("hasChurchFriend", "Tiene amigo en la iglesia")}
          {renderBool(
            "conversedOutsideLessons",
            "Ha conversado fuera de lecciones",
          )}
          {renderBool("invitedToActivity", "Invitado a actividad")}
          {renderBool("attendedActivity", "Asistió a actividad")}
          {renderBool("knowsBishop", "Conoce al Obispo")}
          {renderBool("knowsMissionLeader", "Conoce al Líder Misional")}
          {renderBool("comfortableAtChapel", "Cómodo en la capilla")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {renderText("friendMember1", "Amigo miembro 1")}
          {renderText("friendMember2", "Amigo miembro 2")}
          {renderText("assignedLeader", "Líder asignado")}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Observaciones</Label>
          <Textarea
            value={draft.socialObservations ?? ""}
            onChange={(e) => onSetField("socialObservations", e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />
        </div>
      </div>
    );

  if (sectionKey === "s2_attendance")
    return (
      <div className="space-y-2">
        {renderDate("firstSacramentalDate", "Primera sacramental")}
        {renderDate("nextSundayCommitted", "Próximo domingo comprometido")}
        {renderText("reasonIfAbsent", "Razón si no asistió")}
      </div>
    );

  if (sectionKey === "s3_prayer")
    return (
      <div className="space-y-2">
        <div className="space-y-1.5">
          {renderBool("knowsHowToPray", "Sabe orar")}
          {renderBool("praysPersonally", "Ora personalmente")}
          {renderBool("praysMorning", "Ora por la mañana")}
          {renderBool("praysEvening", "Ora por la noche")}
          {renderBool("hasBoM", "Tiene Libro de Mormón")}
          {renderBool("startedReading", "Comenzó a leer")}
          {renderBool("understandsReading", "Entiende la lectura")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {renderDate("readingStartDate", "Inicio de lectura")}
          {renderText("lastChapterRead", "Último capítulo leído")}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Dudas</Label>
          <Textarea
            value={draft.doubts ?? ""}
            onChange={(e) => onSetField("doubts", e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />
        </div>
      </div>
    );

  if (sectionKey === "s4_lessons") {
    const lessons = draft.lessons ?? {};
    const lessonNames: Record<string, string> = {
      restoration: "Restauración",
      plan_salvation: "Plan de Salvación",
      gospel_of_jesus: "Evangelio de Jesucristo",
      commandments: "Mandamientos",
      laws_ordinances: "Leyes y Ordenanzas",
      pre_baptism_review: "Repaso pre-bautismal",
    };
    return (
      <div className="space-y-3">
        {Object.entries(lessonNames).map(([lKey, lLabel]) => {
          const lesson = lessons[lKey] ?? {};
          return (
            <div key={lKey} className="rounded border p-2 space-y-1.5">
              <p className="text-xs font-semibold">{lLabel}</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(lesson.received)}
                  onChange={() => {
                    const updated = {
                      ...lessons,
                      [lKey]: { ...lesson, received: !lesson.received },
                    };
                    onSetField("lessons", updated as any);
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Recibida</span>
              </label>
              {lesson.received && (
                <Input
                  type="date"
                  value={lesson.date ?? ""}
                  onChange={(e) => {
                    const updated = {
                      ...lessons,
                      [lKey]: { ...lesson, date: e.target.value },
                    };
                    onSetField("lessons", updated as any);
                  }}
                  className="h-7 text-xs"
                  placeholder="Fecha"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (sectionKey === "s5_commitments") {
    const basic = draft.basicCommitments ?? {};
    const basicLabels: Record<string, string> = {
      praysPersonally: "Ora personalmente",
      readsBoM: "Lee el Libro de Mormón",
      attendsChurch: "Asiste a la iglesia",
      keepsSabbath: "Guarda el día de reposo",
      willingToRepent: "Dispuesto a arrepentirse",
      desiresFollowChrist: "Desea seguir a Cristo",
    };
    const laws: Array<[string, string]> = [
      ["wordOfWisdom", "Ley de Salud"],
      ["lawOfChastity", "Ley de Castidad"],
      ["tithing", "Diezmo"],
      ["sabbathDay", "Día de Reposo"],
    ];
    return (
      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold mb-1.5">Compromisos básicos</p>
          <div className="space-y-1.5">
            {Object.entries(basicLabels).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(basic[k])}
                  onChange={() =>
                    onSetField("basicCommitments", {
                      ...basic,
                      [k]: !basic[k],
                    } as any)
                  }
                  className="h-4 w-4"
                />
                <span className="text-sm">{l}</span>
              </label>
            ))}
          </div>
        </div>
        {laws.map(([lawKey, lawLabel]) => {
          const law = (draft[lawKey] ?? {}) as any;
          return (
            <div key={lawKey} className="rounded border p-2 space-y-1">
              <p className="text-xs font-semibold">{lawLabel}</p>
              {(["explained", "understood", "living"] as const).map((field) => (
                <label
                  key={field}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(law[field])}
                    onChange={() =>
                      onSetField(lawKey, {
                        ...law,
                        [field]: !law[field],
                      } as any)
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm capitalize">
                    {field === "explained"
                      ? "Explicada"
                      : field === "understood"
                        ? "Entendida"
                        : "Viviendo"}
                  </span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  if (sectionKey === "s6_support")
    return (
      <div className="space-y-2">
        <div className="space-y-1.5">
          {renderBool("bishopKnowsFriend", "El Obispo conoce al amigo")}
          {renderBool("missionLeaderAssigned", "Líder misional asignado")}
          {renderBool(
            "memberCompanionAssigned",
            "Miembro acompañante asignado",
          )}
          {renderBool(
            "participatesInCoordination",
            "Participa en coordinación misional",
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {renderText("bishop", "Obispo")}
          {renderText("wardMissionLeader", "Líder misional del barrio")}
          {renderText("mainFriendMember", "Miembro amigo principal")}
          {renderDate("nextVisit", "Próxima visita")}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Comentarios de coordinación</Label>
          <Textarea
            value={draft.coordinationComments ?? ""}
            onChange={(e) => onSetField("coordinationComments", e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />
        </div>
      </div>
    );

  if (sectionKey === "s7_interview")
    return (
      <div className="space-y-2">
        <div className="space-y-1.5">
          {renderBool(
            "receivedMainLessons",
            "Recibió las lecciones principales",
          )}
          {renderBool("attendsChurch", "Asiste a la iglesia")}
          {renderBool("praysReadsRegularly", "Ora y lee regularmente")}
          {renderBool(
            "livesBasicCommandments",
            "Vive los mandamientos básicos",
          )}
          {renderBool("showedRepentance", "Muestra arrepentimiento")}
          {renderBool("desiresHonestBaptism", "Desea bautizarse honestamente")}
          {renderBool(
            "understandsBaptismalCovenant",
            "Entiende el convenio bautismal",
          )}
        </div>
        {renderDate("tentativeInterviewDate", "Fecha tentativa de entrevista")}
        {renderText("interviewer", "Entrevistador")}
        <div className="space-y-1">
          <Label className="text-xs">Estado de entrevista</Label>
          <Select
            value={draft.status ?? "not_ready"}
            onValueChange={(v) => onSetField("status", v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_ready">No listo</SelectItem>
              <SelectItem value="ready">Listo para entrevistar</SelectItem>
              <SelectItem value="scheduled">Entrevista programada</SelectItem>
              <SelectItem value="approved">Entrevista aprobada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Dudas u obstáculos</Label>
          <Textarea
            value={draft.pendingDoubts ?? ""}
            onChange={(e) => onSetField("pendingDoubts", e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />
        </div>
      </div>
    );

  if (sectionKey === "s8_baptism")
    return (
      <div className="space-y-2">
        {renderBool("hasBaptismDate", "Tiene fecha de bautismo")}
        {renderDate("proposedDate", "Fecha propuesta")}
        {renderDate("confirmedDate", "Fecha confirmada")}
        {renderText("location", "Lugar del bautismo")}
        {renderText("baptizedBy", "Bautizado por")}
        {renderBool("programPrepared", "Programa preparado")}
        {renderBool("invitationsSent", "Invitaciones enviadas")}
        {renderBool("clothingReady", "Ropa bautismal lista")}
        {renderBool("recordPrepared", "Registro preparado")}
        <div className="space-y-1">
          <Label className="text-xs">Estado del objetivo bautismal</Label>
          <Select
            value={draft.goalStatus ?? "initial_interest"}
            onValueChange={(v) => onSetField("goalStatus", v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="initial_interest">Interés inicial</SelectItem>
              <SelectItem value="progressing">En progreso</SelectItem>
              <SelectItem value="date_set">Fecha definida</SelectItem>
              <SelectItem value="interview_passed">
                Entrevista aprobada
              </SelectItem>
              <SelectItem value="baptized">Bautizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );

  if (sectionKey === "s9_post_baptism") {
    const monthly = draft.monthlyTracking ?? {};
    return (
      <div className="space-y-2">
        <div className="space-y-1.5">
          {renderBool("receivedConfirmation", "Recibió la confirmación")}
          {renderBool("hasFriends", "Tiene amigos en la iglesia")}
          {renderBool("attendsEveryWeek", "Asiste cada semana")}
          {renderBool("studiesGospel", "Estudia el Evangelio")}
          {renderBool(
            "receivedCallingOrService",
            "Recibió llamamiento o servicio",
          )}
          {renderBool("hasLeaderSupport", "Tiene apoyo de líder")}
          {renderBool(
            "proxyBaptismRecommend",
            "Recomendación para bautismo por representación",
          )}
          {renderBool("familyHistoryStarted", "Comenzó historia familiar")}
          {renderBool(
            "preparingPatriarchalBlessing",
            "Preparándose para bendición patriarcal",
          )}
        </div>
        <div>
          <p className="text-xs font-semibold mb-1.5">
            Seguimiento mensual (6 meses)
          </p>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5, 6].map((m) => (
              <label
                key={m}
                className="flex items-center gap-1 cursor-pointer text-xs"
              >
                <input
                  type="checkbox"
                  checked={Boolean(monthly[`month${m}`])}
                  onChange={() =>
                    onSetField("monthlyTracking", {
                      ...monthly,
                      [`month${m}`]: !monthly[`month${m}`],
                    } as any)
                  }
                  className="h-3.5 w-3.5"
                />
                Mes {m}
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Generic fallback for any section
  return (
    <div className="space-y-2">
      {Object.entries(draft).map(([key, value]) => {
        if (typeof value === "boolean") return renderBool(key, key);
        if (typeof value === "string") return renderText(key, key);
        return null;
      })}
    </div>
  );
}

// ─── Reject Dialog ────────────────────────────────────────────────────────────

function RejectDialog({
  open,
  onOpenChange,
  onReject,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onReject: (comment: string) => void;
  saving: boolean;
}) {
  const [comment, setComment] = useState("");

  function submit() {
    if (!comment.trim()) return;
    onReject(comment.trim());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setComment("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar agenda</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Indica qué debe corregirse. El líder misional verá este mensaje.
          </p>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ej: Falta el nombre del bautizador, hay que añadir la oración de apertura…"
            rows={3}
            className="text-sm resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={saving || !comment.trim()}
          >
            {saving ? "Enviando…" : "Rechazar y notificar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
