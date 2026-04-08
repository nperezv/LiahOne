import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, CalendarDays, MapPin, Users, DollarSign, Trash2,
  ChevronDown, ChevronRight, Send, CheckCircle2, XCircle, Clock, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import {
  useQuarterlyPlans, useQuarterlyPlan,
  useCreateQuarterlyPlan, useDeleteQuarterlyPlan,
  useSubmitQuarterlyPlan, useReviewQuarterlyPlan,
  useCreateQuarterlyPlanItem, useUpdateQuarterlyPlanItem, useDeleteQuarterlyPlanItem,
  type QuarterlyPlan, type QuarterlyPlanItem,
} from "@/hooks/use-api";

// ── helpers ──────────────────────────────────────────────────────────────────

const QUARTER_LABELS = ["Q1 (Ene–Mar)", "Q2 (Abr–Jun)", "Q3 (Jul–Sep)", "Q4 (Oct–Dic)"];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:     { label: "Borrador",  color: "secondary", icon: <FileText className="h-3 w-3" /> },
  submitted: { label: "Enviado",   color: "default",   icon: <Clock className="h-3 w-3" /> },
  approved:  { label: "Aprobado",  color: "default",   icon: <CheckCircle2 className="h-3 w-3 text-green-600" /> },
  rejected:  { label: "Rechazado", color: "destructive", icon: <XCircle className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "secondary", icon: null };
  return (
    <Badge variant={cfg.color as any} className="gap-1">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

function canManage(role?: string) {
  return [
    "presidente_organizacion", "consejero_organizacion", "secretario_organizacion",
    "lider_actividades", "technology_specialist",
    "obispo", "consejero_obispo", "secretario", "secretario_ejecutivo",
  ].includes(role ?? "");
}

function canApprove(role?: string) {
  return ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"].includes(role ?? "");
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const newPlanSchema = z.object({
  quarter: z.string(),
  year: z.string(),
});

const itemSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  activityDate: z.string().min(1, "La fecha es requerida"),
  location: z.string().optional(),
  estimatedAttendance: z.string().optional(),
  budget: z.string().optional(),
  notes: z.string().optional(),
});

type NewPlanValues = z.infer<typeof newPlanSchema>;
type ItemValues = z.infer<typeof itemSchema>;

// ── Item form dialog ──────────────────────────────────────────────────────────

function ItemFormDialog({
  planId,
  item,
  open,
  onClose,
}: {
  planId: string;
  item?: QuarterlyPlanItem;
  open: boolean;
  onClose: () => void;
}) {
  const createItem = useCreateQuarterlyPlanItem();
  const updateItem = useUpdateQuarterlyPlanItem();

  const form = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      title: item?.title ?? "",
      description: item?.description ?? "",
      activityDate: item?.activityDate ?? "",
      location: item?.location ?? "",
      estimatedAttendance: item?.estimatedAttendance?.toString() ?? "",
      budget: item?.budget ?? "",
      notes: item?.notes ?? "",
    },
  });

  function onSubmit(vals: ItemValues) {
    const payload = {
      title: vals.title,
      description: vals.description || null,
      activityDate: vals.activityDate,
      location: vals.location || null,
      estimatedAttendance: vals.estimatedAttendance ? parseInt(vals.estimatedAttendance) : null,
      budget: vals.budget || null,
      notes: vals.notes || null,
    };

    if (item) {
      updateItem.mutate({ planId, itemId: item.id, data: payload }, { onSuccess: onClose });
    } else {
      createItem.mutate({ planId, data: payload }, { onSuccess: onClose });
    }
  }

  const isPending = createItem.isPending || updateItem.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Editar actividad" : "Agregar actividad"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Título *</FormLabel>
                <FormControl><Input {...field} placeholder="Nombre de la actividad" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="activityDate" render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha *</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="location" render={({ field }) => (
              <FormItem>
                <FormLabel>Lugar</FormLabel>
                <FormControl><Input {...field} placeholder="Lugar de la actividad" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="estimatedAttendance" render={({ field }) => (
                <FormItem>
                  <FormLabel>Asistencia estimada</FormLabel>
                  <FormControl><Input type="number" {...field} placeholder="0" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="budget" render={({ field }) => (
                <FormItem>
                  <FormLabel>Presupuesto</FormLabel>
                  <FormControl><Input {...field} placeholder="0.00" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción</FormLabel>
                <FormControl><Textarea {...field} rows={2} placeholder="Descripción breve" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notas</FormLabel>
                <FormControl><Textarea {...field} rows={2} placeholder="Notas adicionales" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando..." : item ? "Guardar cambios" : "Agregar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Plan detail view ──────────────────────────────────────────────────────────

function PlanDetail({
  planId,
  onBack,
  userRole,
}: {
  planId: string;
  onBack: () => void;
  userRole?: string;
}) {
  const { data: plan, isLoading } = useQuarterlyPlan(planId);
  const submitPlan = useSubmitQuarterlyPlan();
  const reviewPlan = useReviewQuarterlyPlan();
  const deleteItem = useDeleteQuarterlyPlanItem();
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item?: QuarterlyPlanItem }>({ open: false });
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; action?: "approved" | "rejected" }>({ open: false });
  const [reviewComment, setReviewComment] = useState("");

  if (isLoading) return <div className="p-6"><Skeleton className="h-48 w-full" /></div>;
  if (!plan) return <div className="p-6 text-muted-foreground">Plan no encontrado.</div>;

  const editable = (plan.status === "draft" || plan.status === "rejected");
  const canSubmit = editable && (plan.items?.length ?? 0) > 0;
  const isApprover = canApprove(userRole);

  function handleReview(action: "approved" | "rejected") {
    setReviewDialog({ open: true, action });
  }

  function confirmReview() {
    if (!reviewDialog.action) return;
    reviewPlan.mutate(
      { id: plan!.id, action: reviewDialog.action, comment: reviewComment || undefined },
      { onSuccess: () => { setReviewDialog({ open: false }); setReviewComment(""); } }
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Volver</Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">
              {plan.organizationName ?? "Barrio"} — {QUARTER_LABELS[plan.quarter - 1]} {plan.year}
            </h2>
            <StatusBadge status={plan.status} />
          </div>
          {plan.reviewComment && (
            <p className="text-sm text-muted-foreground mt-1">Comentario: {plan.reviewComment}</p>
          )}
        </div>
        <div className="flex gap-2">
          {editable && (
            <Button size="sm" onClick={() => setItemDialog({ open: true })}>
              <Plus className="h-4 w-4 mr-1" /> Agregar actividad
            </Button>
          )}
          {canSubmit && !isApprover && (
            <Button size="sm" variant="outline" onClick={() => submitPlan.mutate(plan.id)} disabled={submitPlan.isPending}>
              <Send className="h-4 w-4 mr-1" /> Enviar para aprobación
            </Button>
          )}
          {isApprover && plan.status === "submitted" && (
            <>
              <Button size="sm" variant="outline" className="border-green-500 text-green-700" onClick={() => handleReview("approved")}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar
              </Button>
              <Button size="sm" variant="outline" className="border-red-500 text-red-700" onClick={() => handleReview("rejected")}>
                <XCircle className="h-4 w-4 mr-1" /> Rechazar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Items */}
      {(!plan.items || plan.items.length === 0) ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No hay actividades planificadas aún.</p>
            {editable && (
              <Button className="mt-4" onClick={() => setItemDialog({ open: true })}>
                <Plus className="h-4 w-4 mr-1" /> Agregar primera actividad
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plan.items.map((item) => (
            <Card key={item.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <p className="font-medium">{item.title}</p>
                    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(item.activityDate + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                      {item.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {item.location}
                        </span>
                      )}
                      {item.estimatedAttendance && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {item.estimatedAttendance} personas
                        </span>
                      )}
                      {item.budget && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" /> ${item.budget}
                        </span>
                      )}
                    </div>
                    {item.notes && <p className="text-xs text-muted-foreground mt-1 italic">{item.notes}</p>}
                  </div>
                  {editable && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setItemDialog({ open: true, item })}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteItem.mutate({ planId: plan.id, itemId: item.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Item dialog */}
      {itemDialog.open && (
        <ItemFormDialog
          planId={plan.id}
          item={itemDialog.item}
          open={itemDialog.open}
          onClose={() => setItemDialog({ open: false })}
        />
      )}

      {/* Review dialog */}
      <Dialog open={reviewDialog.open} onOpenChange={(o) => !o && setReviewDialog({ open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewDialog.action === "approved" ? "Aprobar plan" : "Rechazar plan"}</DialogTitle>
            <DialogDescription>
              {reviewDialog.action === "approved"
                ? "Se generarán tareas de logística 14 días antes de cada actividad."
                : "El plan regresará a borrador para que el líder lo corrija."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Comentario (opcional)</label>
            <Textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Agregar comentario para la organización..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog({ open: false })}>Cancelar</Button>
            <Button
              variant={reviewDialog.action === "approved" ? "default" : "destructive"}
              onClick={confirmReview}
              disabled={reviewPlan.isPending}
            >
              {reviewPlan.isPending ? "Guardando..." : reviewDialog.action === "approved" ? "Confirmar aprobación" : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QuarterlyPlansPage() {
  const { user } = useAuth();
  const { data: plans, isLoading } = useQuarterlyPlans();
  const createPlan = useCreateQuarterlyPlan();
  const deletePlan = useDeleteQuarterlyPlan();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [newPlanDialog, setNewPlanDialog] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const newPlanForm = useForm<NewPlanValues>({
    resolver: zodResolver(newPlanSchema),
    defaultValues: {
      quarter: String(Math.ceil((now.getMonth() + 1) / 3)),
      year: String(currentYear),
    },
  });

  function handleCreatePlan(vals: NewPlanValues) {
    createPlan.mutate(
      { quarter: parseInt(vals.quarter), year: parseInt(vals.year) },
      { onSuccess: () => { setNewPlanDialog(false); newPlanForm.reset(); } }
    );
  }

  if (!canManage(user?.role) && !canApprove(user?.role)) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No tienes permiso para ver esta sección.
      </div>
    );
  }

  if (selectedPlanId) {
    return (
      <div className="p-4 md:p-6">
        <PlanDetail
          planId={selectedPlanId}
          onBack={() => setSelectedPlanId(null)}
          userRole={user?.role}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planes Trimestrales</h1>
          <p className="text-muted-foreground text-sm">Planificación de actividades por organización</p>
        </div>
        {canManage(user?.role) && (
          <Button onClick={() => setNewPlanDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo plan
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !plans || plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No hay planes trimestrales</p>
            {canManage(user?.role) && (
              <Button className="mt-4" onClick={() => setNewPlanDialog(true)}>
                <Plus className="h-4 w-4 mr-1" /> Crear primer plan
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedPlanId(plan.id)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{plan.organizationName ?? "Barrio"}</span>
                      <StatusBadge status={plan.status} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {QUARTER_LABELS[plan.quarter - 1]} {plan.year}
                      {plan.itemCount !== undefined && ` · ${plan.itemCount} actividad${plan.itemCount !== 1 ? "es" : ""}`}
                    </p>
                    {plan.reviewComment && plan.status === "rejected" && (
                      <p className="text-xs text-red-600 mt-1">{plan.reviewComment}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New plan dialog */}
      <Dialog open={newPlanDialog} onOpenChange={setNewPlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear plan trimestral</DialogTitle>
          </DialogHeader>
          <Form {...newPlanForm}>
            <form onSubmit={newPlanForm.handleSubmit(handleCreatePlan)} className="space-y-4">
              <FormField control={newPlanForm.control} name="quarter" render={({ field }) => (
                <FormItem>
                  <FormLabel>Trimestre</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {QUARTER_LABELS.map((label, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={newPlanForm.control} name="year" render={({ field }) => (
                <FormItem>
                  <FormLabel>Año</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNewPlanDialog(false)}>Cancelar</Button>
                <Button type="submit" disabled={createPlan.isPending}>
                  {createPlan.isPending ? "Creando..." : "Crear plan"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
