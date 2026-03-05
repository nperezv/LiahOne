import { useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent } from "react";
import { useQueries } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CheckCircle2, Clock, AlertCircle, FileText, Download, Euro, Edit2, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { IconBadge } from "@/components/ui/icon-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useBudgetRequests, useCreateBudgetRequest, useUpdateBudgetRequest,
  useApproveBudgetRequest, useSignBudgetRequestAsBishop,
  useReviewBudgetRequestAsBishop, useDeleteBudgetRequest,
  useWardBudget, useUpdateWardBudget, useCreateOrganizationBudget,
  useUpdateOrganizationBudget, useOrganizations,
} from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { exportBudgetRequests } from "@/lib/export";
import { getAuthHeaders } from "@/lib/auth-tokens";
import { useSearch } from "wouter";

// ─────────────────────────────────────────────────────────────
// Constants & helpers  (unchanged from original)
// ─────────────────────────────────────────────────────────────
const allowedDocumentExtensions = [".jpg", ".jpeg", ".pdf", ".doc", ".docx"];

const BudgetCurrencyInput = ({ className, ...props }: ComponentProps<typeof Input>) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
    <Input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
      className={["pl-8", className].filter(Boolean).join(" ")} {...props} />
  </div>
);

const formatCurrencyInputValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return trimmed;
  return parsed.toFixed(2);
};

const parseBudgetNumber = (value: string) => {
  const normalized = value.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;
const formatBudgetValue = (value: number) => roundToTwoDecimals(value).toFixed(2);

const toBudgetNumber = (value?: number | string | null) => {
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  if (typeof value === "string") { const p = Number.parseFloat(value); return Number.isNaN(p) ? 0 : p; }
  return 0;
};

const isAllowedDocument = (file: File) =>
  allowedDocumentExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

// ─────────────────────────────────────────────────────────────
// Zod schemas  (unchanged from original)
// ─────────────────────────────────────────────────────────────
const budgetSchema = z.object({
  description: z.string().min(1, "La descripción es requerida"),
  amount: z.string().min(1, "El monto es requerido"),
  category: z.enum(["actividades", "materiales", "otros"]),
  requestType: z.enum(["reembolso", "pago_adelantado"]),
  activityDate: z.string().min(1, "La fecha prevista es requerida"),
  notes: z.string().optional(),
  requestingOrganizationId: z.string().optional(),
  receiptFile: z.instanceof(File).optional().refine((f) => !f || isAllowedDocument(f), {
    message: "Adjunta un archivo .jpg, .doc, .docx o .pdf válido.",
  }),
  activityPlanFile: z.instanceof(File).optional().refine((f) => !f || isAllowedDocument(f), {
    message: "Adjunta un archivo .jpg, .doc, .docx o .pdf válido.",
  }),
}).superRefine((data, ctx) => {
  if (data.requestType === "reembolso" && !data.receiptFile)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["receiptFile"], message: "Adjunta el comprobante para solicitudes de reembolso." });
  if (data.requestType === "reembolso" && !data.activityPlanFile)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["activityPlanFile"], message: "Adjunta la solicitud de gastos para solicitudes de reembolso." });
  if (data.requestType === "pago_adelantado" && !data.activityPlanFile)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["activityPlanFile"], message: "Adjunta la solicitud de gasto para pagos por adelantado." });
});

const expenseReceiptsSchema = z.object({
  expenseReceipts: z.array(z.instanceof(File))
    .min(1, "Adjunta al menos un comprobante de gasto.")
    .refine((files) => files.every((f) => isAllowedDocument(f)), {
      message: "Adjunta archivos .jpg, .doc, .docx o .pdf válidos.",
    }),
});

const wardBudgetSchema = z.object({
  annualAmount: z.string().min(1, "El monto anual es requerido"),
  q1Amount: z.string().min(1, "El monto del trimestre 1 es requerido"),
  q2Amount: z.string().min(1, "El monto del trimestre 2 es requerido"),
  q3Amount: z.string().min(1, "El monto del trimestre 3 es requerido"),
  q4Amount: z.string().min(1, "El monto del trimestre 4 es requerido"),
});

const orgBudgetAssignSchema = z.object({ amount: z.string().min(1, "El monto es requerido") });

type BudgetFormValues      = z.infer<typeof budgetSchema>;
type ExpenseReceiptsValues = z.infer<typeof expenseReceiptsSchema>;
type WardBudgetValues      = z.infer<typeof wardBudgetSchema>;
type OrgBudgetAssignValues = z.infer<typeof orgBudgetAssignSchema>;
type ReceiptCategory       = "plan" | "receipt" | "expense" | "signed_plan";

interface BudgetRequest {
  id: string; description: string; amount: number;
  category?: "actividades" | "materiales" | "otros";
  status: "solicitado" | "aprobado_financiero" | "pendiente_firma_obispo" | "aprobado" | "en_proceso" | "completado" | "rechazada";
  requestedBy: string; approvedBy?: string; activityDate?: string;
  bishopSignedPlanFilename?: string; bishopSignedPlanUrl?: string;
  organizationId?: string; notes?: string;
  receipts?: { filename: string; url: string; category?: ReceiptCategory }[];
  createdAt: string;
}
interface Organization { id: string; name: string; type: string; presidentId?: string; createdAt: string; }

// ─────────────────────────────────────────────────────────────
// Design primitives — same dot pattern as dashboard.tsx
// ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  solicitado:             { dot: "bg-amber-400",   text: "text-amber-700 dark:text-amber-300",     bg: "bg-amber-500/10 border-amber-500/20",     label: "Solicitado"           },
  aprobado_financiero:    { dot: "bg-blue-400",    text: "text-blue-700 dark:text-blue-300",       bg: "bg-blue-500/10 border-blue-500/20",       label: "Aprobación financiera" },
  pendiente_firma_obispo: { dot: "bg-violet-400",  text: "text-violet-700 dark:text-violet-300",   bg: "bg-violet-500/10 border-violet-500/20",   label: "Pendiente firma"      },
  aprobado:               { dot: "bg-emerald-400", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Aprobado"             },
  en_proceso:             { dot: "bg-indigo-400",  text: "text-indigo-700 dark:text-indigo-300",   bg: "bg-indigo-500/10 border-indigo-500/20",   label: "En proceso"           },
  completado:             { dot: "bg-emerald-300", text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Completado"           },
  rechazada:              { dot: "bg-rose-400",    text: "text-rose-700 dark:text-rose-300",       bg: "bg-rose-500/10 border-rose-500/20",       label: "Rechazada"            },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.solicitado;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

function MiniProgress({ value }: { value: number }) {
  const color = value > 90 ? "bg-rose-500" : value > 70 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

const getOrganizationLabel = (type: string) => {
  const labels: Record<string, string> = {
    hombres_jovenes: "Cuórum del Sacerdocio Aarónico",
    mujeres_jovenes: "Mujeres Jóvenes",
    sociedad_socorro: "Sociedad de Socorro",
    primaria: "Primaria",
    escuela_dominical: "Escuela Dominical",
    jas: "Liderazgo JAS",
    cuorum_elderes: "Cuórum de Élderes",
    obispado: "Obispado",
  };
  return labels[type] || type;
};

// ─────────────────────────────────────────────────────────────
// Tab: Resumen
// ─────────────────────────────────────────────────────────────
function ResumenTab({ annualBudget, currentQuarter, currentYear, currentQuarterBudget, quarterBudgets, globalBudget, totalAssignedToOrgs, remainingGlobalBudget, globalUtilizationPercent, totalSolicited, totalApproved, requests, isObispado, onApprove, onSign, approvePending, signPending }: any) {
  const urgentes = (requests as BudgetRequest[]).filter(r =>
    r.status === "solicitado" || r.status === "pendiente_firma_obispo"
  );

  return (
    <div className="space-y-4">

      {/* Hero presupuesto anual */}
      <GlassCard>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-1">
              Presupuesto anual {currentYear}
            </p>
            <p className="text-4xl font-extrabold tracking-tight" data-testid="text-ward-budget-annual">
              €{annualBudget.toFixed(2)}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {([1, 2, 3, 4] as const).map(q => (
              <div key={q} className={`rounded-xl border p-3 ${q === currentQuarter ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30"}`}>
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">T{q}</p>
                <p className={`text-base font-extrabold ${q === currentQuarter ? "text-primary" : ""}`}>
                  €{quarterBudgets[q].toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4 px-5">
            <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-1">Trimestre {currentQuarter}</p>
            <p className="text-2xl font-extrabold tracking-tight" data-testid="text-ward-budget-quarter">€{globalBudget.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Presupuesto actual</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-5">
            <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-1">Solicitado</p>
            <p className="text-2xl font-extrabold tracking-tight text-amber-500 dark:text-amber-400" data-testid="text-total-solicited">€{totalSolicited.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(requests as any[]).filter((r: any) => r.status === "solicitado").length} pendientes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-5">
            <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-1">Aprobado</p>
            <p className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400" data-testid="text-total-approved">€{totalApproved.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(requests as any[]).filter((r: any) => r.status === "aprobado" || r.status === "completado").length} aprobadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Uso global + total solicitudes — sólo Obispado */}
      {isObispado && (
        <>
          <Card>
            <CardContent className="py-4 px-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Uso trimestre actual</p>
                <span className="text-sm font-extrabold text-primary">{globalUtilizationPercent}%</span>
              </div>
              <MiniProgress value={globalUtilizationPercent} />
              <div className="flex justify-between pt-0.5 text-xs">
                <span className="text-muted-foreground">
                  Asignado a orgs: <span className="font-semibold text-foreground">€{totalAssignedToOrgs.toFixed(2)}</span>
                </span>
                <span className={`font-semibold ${remainingGlobalBudget < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                  Disponible: €{remainingGlobalBudget.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 px-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-1">Total solicitudes</p>
                  <p className="text-2xl font-extrabold tracking-tight" data-testid="text-total-requests">{(requests as any[]).length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">solicitudes totales</p>
                </div>
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Requieren acción */}
      {urgentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground/70">Requieren acción ⚡</p>
          {urgentes.map((r: BudgetRequest) => (
            <GlassCard key={r.id} data-testid={`urgent-row-${r.id}`}>
              <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-sm font-semibold truncate">{r.description}</p>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="text-lg font-extrabold">€{r.amount.toFixed(2)}</p>
                  {r.status === "solicitado" && (
                    <Button size="sm" onClick={() => onApprove(r.id)} disabled={approvePending} data-testid={`button-approve-urgent-${r.id}`}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
                    </Button>
                  )}
                  {r.status === "pendiente_firma_obispo" && (
                    <Button size="sm" variant="secondary" onClick={() => onSign(r.id)} disabled={signPending} data-testid={`button-sign-urgent-${r.id}`}>
                      Firmar
                    </Button>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Solicitudes
// ─────────────────────────────────────────────────────────────
type SolicitudFilter = "todas" | "solicitado" | "aprobado" | "completado" | "rechazada";

const FILTERS: { key: SolicitudFilter; label: string }[] = [
  { key: "todas",      label: "Todas"       },
  { key: "solicitado", label: "Pendientes"  },
  { key: "aprobado",   label: "Aprobadas"   },
  { key: "completado", label: "Completadas" },
  { key: "rechazada",  label: "Rechazadas"  },
];

function SolicitudesTab({ requests, organizations, user, canApprove, canDelete, showActionsColumn, highlightedRequestId, onApprove, onSign, onReview, onDelete, onOpenReceipts, approvePending, signPending, reviewPending, deletePending, downloadReceipt, getReceiptLabel, shouldShowAddExpenseReceipts }: any) {
  const [filter, setFilter] = useState<SolicitudFilter>("todas");

  const filtered: BudgetRequest[] = filter === "todas"
    ? requests
    : requests.filter((r: BudgetRequest) => r.status === filter);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => {
          const count = f.key === "todas" ? requests.length : requests.filter((r: BudgetRequest) => r.status === f.key).length;
          const active = filter === f.key;
          return (
            <Button key={f.key} size="sm" variant={active ? "default" : "outline"} onClick={() => setFilter(f.key)} className="gap-1.5">
              {f.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? "bg-white/20" : "bg-secondary"}`}>{count}</span>
              )}
            </Button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No hay solicitudes en esta vista.</p>
        )}
        {filtered.map((request: BudgetRequest) => {
          const org = (organizations as Organization[]).find(o => o.id === request.organizationId);
          const isHighlighted = highlightedRequestId === request.id;
          return (
            <GlassCard key={request.id} data-testid={`row-request-${request.id}`}
              className={isHighlighted ? "ring-2 ring-amber-400/60 transition-all duration-700" : ""}>
              <div className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-4">

                  {/* Left */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={request.status} />
                      {org && (
                        <span className="inline-flex items-center rounded-full border border-border/40 bg-secondary/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                          data-testid={`badge-org-${request.id}`}>
                          {org.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold">{request.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(request.createdAt).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                    {/* Adjuntos */}
                    {((request.receipts ?? []).length > 0 || request.bishopSignedPlanUrl) && (
                      <div className="flex flex-col gap-1 pt-0.5">
                        {(request.receipts ?? []).map((receipt: any, index: number) =>
                          receipt.url ? (
                            <button key={`${request.id}-receipt-${index}`} type="button"
                              onClick={() => void downloadReceipt(receipt)}
                              className="text-left text-xs text-blue-500 hover:underline">
                              {getReceiptLabel(receipt)}: {receipt.filename}
                            </button>
                          ) : (
                            <span key={`${request.id}-receipt-${index}`} className="text-xs text-muted-foreground">
                              {getReceiptLabel(receipt)}: {receipt.filename}
                            </span>
                          )
                        )}
                        {request.bishopSignedPlanUrl && (
                          <button type="button"
                            onClick={() => void downloadReceipt({ filename: request.bishopSignedPlanFilename || "solicitud-firmada.pdf", url: request.bishopSignedPlanUrl })}
                            className="text-left text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
                            Solicitud de gasto firmada: {request.bishopSignedPlanFilename || "Descargar"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right */}
                  <div className="flex flex-col items-end gap-3 flex-shrink-0">
                    <p className="text-xl font-extrabold tracking-tight">€{request.amount.toFixed(2)}</p>
                    {showActionsColumn && (
                      <div className="flex flex-wrap gap-2 justify-end">
                        {canApprove && request.status === "solicitado" && (
                          <Button size="sm" onClick={() => onApprove(request.id)} disabled={approvePending} data-testid={`button-approve-${request.id}`}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar
                          </Button>
                        )}
                        {user?.role === "obispo" && request.status === "pendiente_firma_obispo" && (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => onSign(request.id)} disabled={signPending || reviewPending} data-testid={`button-sign-budget-${request.id}`}>Firmar solicitud</Button>
                            <Button size="sm" variant="outline" onClick={() => onReview(request.id, "enmendar")} disabled={signPending || reviewPending} data-testid={`button-amend-budget-${request.id}`}>Enmendar</Button>
                            <Button size="sm" variant="destructive" onClick={() => onReview(request.id, "rechazar")} disabled={signPending || reviewPending} data-testid={`button-reject-budget-${request.id}`}>Rechazar</Button>
                          </>
                        )}
                        {request.status === "aprobado" && request.requestedBy === user?.id && shouldShowAddExpenseReceipts(request) && (
                          <Button size="sm" variant="outline" onClick={() => onOpenReceipts(request)} data-testid={`button-add-expense-receipts-${request.id}`}>
                            Adjuntar comprobantes
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="sm" variant="destructive" onClick={() => onDelete(request.id)} disabled={deletePending} data-testid={`button-delete-budget-${request.id}`}>
                            <Trash2 className="h-4 w-4 lg:mr-1" />
                            <span className="sr-only lg:not-sr-only">Eliminar</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Accent bottom line */}
                <div className={`h-px rounded-full ${
                  request.status === "rechazada" ? "bg-gradient-to-r from-rose-500/30 to-transparent"
                  : request.status === "aprobado" || request.status === "completado" ? "bg-gradient-to-r from-emerald-500/30 to-transparent"
                  : request.status === "solicitado" ? "bg-gradient-to-r from-amber-500/30 to-transparent"
                  : request.status === "pendiente_firma_obispo" ? "bg-gradient-to-r from-violet-500/30 to-transparent"
                  : "bg-gradient-to-r from-border to-transparent"
                }`} />
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Organizaciones
// ─────────────────────────────────────────────────────────────
function OrgsTab({ organizations, orgBudgetsByOrg, requests, currentYear, currentQuarter, remainingGlobalBudget, assignDialogOpen, selectedOrgId, setAssignDialogOpen, setSelectedOrgId, openAssignDialog, orgBudgetForm, onSubmitOrgBudgetAssign, createPending, updatePending }: any) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {(organizations as Organization[]).map((org: Organization) => {
        const currentBudget = (orgBudgetsByOrg[org.id] || []).find(
          (b: any) => b.year === currentYear && b.quarter === currentQuarter
        );
        const assignedAmount = toBudgetNumber(currentBudget?.amount);
        const orgSpending = (requests as any[])
          .filter((r: any) => r.organizationId === org.id && (r.status === "aprobado" || r.status === "completado"))
          .reduce((sum: number, r: any) => sum + r.amount, 0);
        const available = assignedAmount - orgSpending;
        const spendingPercent = assignedAmount > 0 ? Math.round((orgSpending / assignedAmount) * 100) : 0;

        return (
          <Card key={org.id} className="flex flex-col" data-testid={`card-org-budget-${org.id}`}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div className="flex-1">
                <CardTitle className="text-base">{org.name}</CardTitle>
                <CardDescription className="text-xs">{getOrganizationLabel(org.type)}</CardDescription>
              </div>
              <Dialog open={assignDialogOpen && selectedOrgId === org.id} onOpenChange={(open) => {
                if (!open) setSelectedOrgId(null);
                setAssignDialogOpen(open);
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={() => openAssignDialog(org.id)}
                    data-testid={`button-assign-budget-${org.id}`} className="h-8 w-8 p-0">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Asignar Presupuesto a {org.name}</DialogTitle>
                    <DialogDescription>
                      Monto disponible para asignar: €{remainingGlobalBudget.toFixed(2)}
                      {assignedAmount > 0 && ` (actualmente asignado: €${assignedAmount.toFixed(2)})`}
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...orgBudgetForm}>
                    <form onSubmit={orgBudgetForm.handleSubmit(onSubmitOrgBudgetAssign)} className="space-y-4">
                      <FormField control={orgBudgetForm.control} name="amount" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monto a Asignar (€)</FormLabel>
                          <FormControl>
                            <BudgetCurrencyInput {...field} onBlur={(e) => { field.onChange(formatCurrencyInputValue(e.target.value)); field.onBlur(); }}
                              data-testid={`input-assign-amount-${org.id}`} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">Máximo disponible: €{(remainingGlobalBudget + assignedAmount).toFixed(2)}</p>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)} data-testid={`button-cancel-assign-${org.id}`}>Cancelar</Button>
                        <Button type="submit" disabled={createPending || updatePending} data-testid={`button-save-assign-${org.id}`}>
                          {createPending || updatePending ? "Guardando..." : "Guardar"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Presupuesto Asignado</p>
                <p className="text-2xl font-bold" data-testid={`text-org-amount-${org.id}`}>€{assignedAmount.toFixed(2)}</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gastos Aprobados ({spendingPercent}%)</span>
                  <span className="font-semibold" data-testid={`text-org-spending-${org.id}`}>€{orgSpending.toFixed(2)}</span>
                </div>
                <MiniProgress value={spendingPercent} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Disponible</span>
                <span className={`font-semibold ${available < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
                  data-testid={`text-org-available-${org.id}`}>
                  €{available.toFixed(2)}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default function BudgetPage() {
  const [isDialogOpen, setIsDialogOpen]               = useState(false);
  const [isBudgetDialogOpen, setIsBudgetDialogOpen]   = useState(false);
  const [selectedOrgId, setSelectedOrgId]             = useState<string | null>(null);
  const [assignDialogOpen, setAssignDialogOpen]       = useState(false);
  const [isReceiptsDialogOpen, setIsReceiptsDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest]         = useState<BudgetRequest | null>(null);
  const [isSignDialogOpen, setIsSignDialogOpen]       = useState(false);
  const [signingRequestId, setSigningRequestId]       = useState<string | null>(null);
  const [signerName, setSignerName]                   = useState("");
  const [activeTab, setActiveTab]                     = useState("resumen");
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef       = useRef(false);
  const search             = useSearch();

  const highlightedRequestId = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("highlight");
  }, [search]);

  const { user } = useAuth();
  const { data: requests = [] as any[], isLoading: requestsLoading } = useBudgetRequests();
  const { data: wardBudget, isLoading: wardBudgetLoading }           = useWardBudget();
  const { data: organizations = [] as Organization[], isLoading: orgsLoading } = useOrganizations();

  const createMutation           = useCreateBudgetRequest();
  const updateMutation           = useUpdateBudgetRequest();
  const approveMutation          = useApproveBudgetRequest();
  const signMutation             = useSignBudgetRequestAsBishop();
  const reviewMutation           = useReviewBudgetRequestAsBishop();
  const deleteMutation           = useDeleteBudgetRequest();
  const updateWardBudgetMutation = useUpdateWardBudget();
  const createOrgBudgetMutation  = useCreateOrganizationBudget();
  const updateOrgBudgetMutation  = useUpdateOrganizationBudget();

  const uploadReceiptFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/uploads", { method: "POST", headers: getAuthHeaders(), body: formData });
    if (!response.ok) throw new Error("No se pudo subir el archivo");
    return response.json() as Promise<{ filename: string; url: string }>;
  };

  const isObispado  = ["obispo", "consejero_obispo", "secretario_financiero"].includes(user?.role || "");
  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const canApprove  = isObispado;
  const canDelete   = isObispado;
  const showActionsColumn = canApprove || canDelete || isOrgMember;

  const orgBudgetQueries = useQueries({
    queries: (organizations as Organization[]).map((org) => ({
      queryKey: ["/api/organization-budgets", org.id],
      enabled: Boolean(org.id) && (isObispado || org.id === user?.organizationId),
    })),
  });

  const orgBudgetsByOrg = (organizations as Organization[]).reduce<Record<string, any[]>>((acc, org, index) => {
    acc[org.id] = (orgBudgetQueries[index]?.data as any[]) ?? [];
    return acc;
  }, {});

  const filteredRequests = isOrgMember
    ? (requests as any[]).filter((r: any) => r.organizationId === user?.organizationId)
    : requests;

  useEffect(() => {
    if (!highlightedRequestId) return;
    setActiveTab("solicitudes");
    const row = document.querySelector(`[data-testid="row-request-${highlightedRequestId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedRequestId, filteredRequests]);

  const now            = new Date();
  const currentYear    = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  const quarterBudgets = useMemo(() => ({
    1: toBudgetNumber(wardBudget?.q1Amount ?? (currentQuarter === 1 ? wardBudget?.amount ?? 0 : 0)),
    2: toBudgetNumber(wardBudget?.q2Amount ?? (currentQuarter === 2 ? wardBudget?.amount ?? 0 : 0)),
    3: toBudgetNumber(wardBudget?.q3Amount ?? (currentQuarter === 3 ? wardBudget?.amount ?? 0 : 0)),
    4: toBudgetNumber(wardBudget?.q4Amount ?? (currentQuarter === 4 ? wardBudget?.amount ?? 0 : 0)),
  }), [currentQuarter, wardBudget?.amount, wardBudget?.q1Amount, wardBudget?.q2Amount, wardBudget?.q3Amount, wardBudget?.q4Amount]);

  const quarterBudgetValues = useMemo(() => Object.values(quarterBudgets), [quarterBudgets]);

  const annualBudget = useMemo(() => {
    const annualAmount = toBudgetNumber(wardBudget?.annualAmount);
    if (annualAmount > 0) return annualAmount;
    return quarterBudgetValues.some((v) => v > 0)
      ? quarterBudgetValues.reduce((sum, v) => sum + v, 0)
      : toBudgetNumber(wardBudget?.amount);
  }, [quarterBudgetValues, wardBudget?.amount, wardBudget?.annualAmount]);

  const currentQuarterBudget     = quarterBudgets[currentQuarter as 1 | 2 | 3 | 4] || 0;
  const globalBudget             = currentQuarterBudget;
  const totalAssignedToOrgs      = Object.values(orgBudgetsByOrg).flat()
    .filter((b: any) => b?.year === currentYear && b?.quarter === currentQuarter)
    .reduce((sum: number, b: any) => sum + toBudgetNumber(b?.amount), 0);
  const remainingGlobalBudget    = globalBudget - totalAssignedToOrgs;
  const globalUtilizationPercent = globalBudget > 0 ? Math.round((totalAssignedToOrgs / globalBudget) * 100) : 0;
  const totalSolicited           = filteredRequests.filter((r: any) => r.status === "solicitado").reduce((sum: number, r: any) => sum + r.amount, 0);
  const totalApproved            = filteredRequests.filter((r: any) => r.status === "aprobado" || r.status === "completado").reduce((sum: number, r: any) => sum + r.amount, 0);
  const pendingCount             = filteredRequests.filter((r: any) => r.status === "solicitado" || r.status === "pendiente_firma_obispo").length;

  // ── Forms ──────────────────────────────────────────────────
  const budgetForm = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: { description: "", amount: "", category: "otros", requestType: "pago_adelantado", activityDate: "", notes: "", requestingOrganizationId: "", receiptFile: undefined, activityPlanFile: undefined },
  });

  const expenseReceiptsForm = useForm<ExpenseReceiptsValues>({
    resolver: zodResolver(expenseReceiptsSchema),
    defaultValues: { expenseReceipts: [] },
  });

  const wardBudgetForm = useForm<WardBudgetValues>({
    resolver: zodResolver(wardBudgetSchema),
    defaultValues: { annualAmount: formatBudgetValue(annualBudget), q1Amount: formatBudgetValue(quarterBudgets[1]), q2Amount: formatBudgetValue(quarterBudgets[2]), q3Amount: formatBudgetValue(quarterBudgets[3]), q4Amount: formatBudgetValue(quarterBudgets[4]) },
  });

  useEffect(() => {
    wardBudgetForm.reset({ annualAmount: formatBudgetValue(annualBudget), q1Amount: formatBudgetValue(quarterBudgets[1]), q2Amount: formatBudgetValue(quarterBudgets[2]), q3Amount: formatBudgetValue(quarterBudgets[3]), q4Amount: formatBudgetValue(quarterBudgets[4]) });
  }, [annualBudget, quarterBudgets, wardBudgetForm]);

  const annualAmountValue = wardBudgetForm.watch("annualAmount");
  const annualAmountDirty = wardBudgetForm.formState.dirtyFields.annualAmount;

  useEffect(() => {
    if (!annualAmountDirty) return;
    const parsedAnnual = parseBudgetNumber(annualAmountValue);
    const baseQuarter = roundToTwoDecimals(parsedAnnual / 4);
    const q4 = roundToTwoDecimals(parsedAnnual - baseQuarter * 3);
    wardBudgetForm.setValue("q1Amount", formatBudgetValue(baseQuarter), { shouldDirty: true });
    wardBudgetForm.setValue("q2Amount", formatBudgetValue(baseQuarter), { shouldDirty: true });
    wardBudgetForm.setValue("q3Amount", formatBudgetValue(baseQuarter), { shouldDirty: true });
    wardBudgetForm.setValue("q4Amount", formatBudgetValue(q4), { shouldDirty: true });
  }, [annualAmountDirty, annualAmountValue, wardBudgetForm]);

  const budgetRequestType = budgetForm.watch("requestType");
  const requestableOrganizations = useMemo(() =>
    (organizations as Organization[]).filter((org) => org.type !== "barrio"),
  [organizations]);

  const orgBudgetForm = useForm<OrgBudgetAssignValues>({
    resolver: zodResolver(orgBudgetAssignSchema),
    defaultValues: { amount: "" },
  });

  useEffect(() => {
    if (!isDialogOpen) return;
    if (isObispado) {
      const currentSelection = budgetForm.getValues("requestingOrganizationId");
      if (!currentSelection && requestableOrganizations.length > 0)
        budgetForm.setValue("requestingOrganizationId", requestableOrganizations[0].id);
      return;
    }
    budgetForm.setValue("requestingOrganizationId", user?.organizationId ?? "");
  }, [isDialogOpen, isObispado, requestableOrganizations, budgetForm, user?.organizationId]);

  // ── Submit handlers ────────────────────────────────────────
  const onSubmitBudgetRequest = async (data: BudgetFormValues) => {
    const parsedAmount = parseBudgetNumber(data.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { alert("Ingresa un monto válido. Puedes usar coma o punto para decimales."); return; }
    const targetOrganizationId = isObispado ? data.requestingOrganizationId : user?.organizationId;
    if (!targetOrganizationId) { budgetForm.setError("requestingOrganizationId", { type: "manual", message: "Selecciona la organización a nombre de la cual se solicita el presupuesto." }); return; }

    const uploadedReceipts: { filename: string; url: string; category: ReceiptCategory }[] = [];
    if (data.requestType === "reembolso" && data.receiptFile) {
      try { const u = await uploadReceiptFile(data.receiptFile); uploadedReceipts.push({ ...u, category: "receipt" }); }
      catch (error) { console.error(error); alert("No se pudo subir el comprobante. Intenta nuevamente."); return; }
    }
    if ((data.requestType === "pago_adelantado" || data.requestType === "reembolso") && data.activityPlanFile) {
      try { const u = await uploadReceiptFile(data.activityPlanFile); uploadedReceipts.push({ ...u, category: "plan" }); }
      catch (error) { console.error(error); alert("No se pudo subir la solicitud de gasto. Intenta nuevamente."); return; }
    }

    createMutation.mutate({
      description: data.description, amount: parsedAmount, category: data.category,
      status: "solicitado", activityDate: data.activityDate ? new Date(`${data.activityDate}T00:00:00`) : null,
      notes: data.notes || "", receipts: uploadedReceipts, organizationId: targetOrganizationId,
    }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        budgetForm.reset({ description: "", amount: "", category: "otros", requestType: "pago_adelantado", activityDate: "", notes: "", requestingOrganizationId: isObispado ? "" : user?.organizationId ?? "", receiptFile: undefined, activityPlanFile: undefined });
      },
    });
  };

  const onSubmitExpenseReceipts = async (data: ExpenseReceiptsValues) => {
    if (!selectedRequest) return;
    let uploadedReceipts: { filename: string; url: string; category: ReceiptCategory }[] = [];
    try {
      uploadedReceipts = await Promise.all(data.expenseReceipts.map(async (file) => {
        const uploaded = await uploadReceiptFile(file);
        return { filename: uploaded.filename, url: uploaded.url, category: "expense" as ReceiptCategory };
      }));
    } catch (error) { console.error(error); alert("No se pudo subir los comprobantes. Intenta nuevamente."); return; }
    const existingReceipts = selectedRequest.receipts ?? [];
    updateMutation.mutate({ id: selectedRequest.id, data: { receipts: [...existingReceipts, ...uploadedReceipts] } }, {
      onSuccess: () => { setIsReceiptsDialogOpen(false); setSelectedRequest(null); expenseReceiptsForm.reset(); },
    });
  };

  const onSubmitWardBudget = (data: WardBudgetValues) => {
    const annualAmountRaw = roundToTwoDecimals(parseBudgetNumber(data.annualAmount));
    const q1 = roundToTwoDecimals(parseBudgetNumber(data.q1Amount));
    const q2 = roundToTwoDecimals(parseBudgetNumber(data.q2Amount));
    const q3 = roundToTwoDecimals(parseBudgetNumber(data.q3Amount));
    const q4 = roundToTwoDecimals(parseBudgetNumber(data.q4Amount));
    const quartersTotal = roundToTwoDecimals(q1 + q2 + q3 + q4);
    if (quartersTotal > annualAmountRaw + 0.01) { alert(`La suma de los trimestres (€${quartersTotal.toFixed(2)}) excede el presupuesto anual.`); return; }
    const quarterAmounts = [q1, q2, q3, q4];
    const currentQuarterAmount = quarterAmounts[currentQuarter - 1] ?? 0;
    updateWardBudgetMutation.mutate({
      annualAmount: formatBudgetValue(annualAmountRaw), year: currentYear,
      q1Amount: formatBudgetValue(q1), q2Amount: formatBudgetValue(q2),
      q3Amount: formatBudgetValue(q3), q4Amount: formatBudgetValue(q4),
      amount: formatBudgetValue(currentQuarterAmount),
    }, { onSuccess: () => { setIsBudgetDialogOpen(false); wardBudgetForm.reset(); } });
  };

  const onSubmitOrgBudgetAssign = (data: OrgBudgetAssignValues) => {
    const amount = roundToTwoDecimals(parseBudgetNumber(data.amount));
    if (selectedOrgId) {
      const existingBudget = (orgBudgetsByOrg[selectedOrgId] || []).find((b: any) => b.year === currentYear && b.quarter === currentQuarter);
      const existingAmount = toBudgetNumber(existingBudget?.amount);
      const maxAssignable = remainingGlobalBudget + existingAmount;
      if (amount > maxAssignable) { alert(`El monto excede el presupuesto disponible. Disponible: €${maxAssignable.toFixed(2)}`); return; }
      const cb = () => { setAssignDialogOpen(false); setSelectedOrgId(null); orgBudgetForm.reset(); };
      if (existingBudget) updateOrgBudgetMutation.mutate({ id: existingBudget.id, data: { amount: formatBudgetValue(amount) }, organizationId: selectedOrgId }, { onSuccess: cb });
      else createOrgBudgetMutation.mutate({ organizationId: selectedOrgId, amount: formatBudgetValue(amount), year: currentYear, quarter: currentQuarter }, { onSuccess: cb });
    }
  };

  // ── Action handlers ────────────────────────────────────────
  const handleApprove = (requestId: string) => { approveMutation.mutate(requestId); };

  const handleSignAsBishop = (requestId: string) => { setSigningRequestId(requestId); setSignerName(user?.name || ""); setIsSignDialogOpen(true); };

  const handleReviewByBishop = (requestId: string, action: "rechazar" | "enmendar") => {
    const label = action === "rechazar" ? "rechazo" : "enmienda";
    const reason = window.prompt(`Indica el motivo de ${label} (mínimo 10 caracteres):`);
    if (!reason || reason.trim().length < 10) return;
    reviewMutation.mutate({ requestId, action, reason: reason.trim() });
  };

  const handleDelete = (requestId: string) => {
    if (window.confirm("¿Está seguro de que desea eliminar esta solicitud?")) deleteMutation.mutate(requestId);
  };

  // ── Signature canvas ───────────────────────────────────────
  const clearSignatureCanvas = () => {
    const canvas = signatureCanvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current; if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  };

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    const { x, y } = getCanvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true; context.beginPath(); context.moveTo(x, y);
  };

  const drawSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    const { x, y } = getCanvasPoint(event); context.lineTo(x, y); context.stroke();
  };

  const stopDrawing = () => { isDrawingRef.current = false; };

  const confirmSignature = () => {
    if (!signingRequestId) return;
    const normalizedName = signerName.trim();
    if (!normalizedName) { alert("Debes indicar el nombre del obispo."); return; }
    const canvas = signatureCanvasRef.current; if (!canvas) return;
    const signatureDataUrl = canvas.toDataURL("image/png");
    signMutation.mutate({ requestId: signingRequestId, signatureDataUrl, signerName: normalizedName }, {
      onSuccess: () => { setIsSignDialogOpen(false); setSigningRequestId(null); },
    });
  };

  useEffect(() => {
    if (!isSignDialogOpen) return;
    const canvas = signatureCanvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    context.lineWidth = 2.8; context.lineJoin = "round"; context.lineCap = "round"; context.strokeStyle = "#111827";
    clearSignatureCanvas();
  }, [isSignDialogOpen]);

  // ── Receipt helpers ────────────────────────────────────────
  const getReceiptLabel = (receipt?: { filename: string; category?: ReceiptCategory }) => {
    if (receipt?.category === "plan") return "Formulario de Solicitud de gastos";
    if (receipt?.category === "expense") return "Comprobante de gasto";
    if (receipt?.category === "signed_plan") return "Solicitud de gasto firmada";
    if (receipt?.category === "receipt") return "Comprobante de compra";
    return "Adjunto";
  };

  const hasExpenseReceipts           = (request: BudgetRequest) => (request.receipts ?? []).some((r) => r.category === "expense");
  const hasAdvanceRequestDocument    = (request: BudgetRequest) => (request.receipts ?? []).some((r) => r.category === "plan");
  const isReimbursementRequest       = (request: BudgetRequest) => (request.receipts ?? []).some((r) => r.category === "receipt") && !hasAdvanceRequestDocument(request);
  const shouldShowAddExpenseReceipts = (request: BudgetRequest) => !hasExpenseReceipts(request) && !isReimbursementRequest(request);

  const downloadReceipt = async (receipt: { filename: string; url?: string }) => {
    if (!receipt.url) return;
    const link = document.createElement("a");
    link.href = receipt.url; link.download = receipt.filename; link.rel = "noopener noreferrer";
    document.body.appendChild(link); link.click(); link.remove();
  };

  const openAssignDialog = (orgId: string) => {
    setSelectedOrgId(orgId);
    const existingBudget = (orgBudgetsByOrg[orgId] || []).find((b: any) => b.year === currentYear && b.quarter === currentQuarter);
    if (existingBudget) orgBudgetForm.setValue("amount", existingBudget.amount.toString());
    else orgBudgetForm.reset();
    setAssignDialogOpen(true);
  };

  const openReceiptsDialog = (request: BudgetRequest) => { setSelectedRequest(request); setIsReceiptsDialogOpen(true); expenseReceiptsForm.reset({ expenseReceipts: [] }); };

  // ── Org member budget ──────────────────────────────────────
  const myOrg     = isOrgMember ? (organizations as Organization[]).find((o) => o.id === user?.organizationId) : null;
  const myBudget  = isOrgMember && user?.organizationId ? (orgBudgetsByOrg[user.organizationId] || []).find((b: any) => b.year === currentYear && b.quarter === currentQuarter) : null;
  const myAssigned = toBudgetNumber(myBudget?.amount);
  const mySpending = isOrgMember
    ? (requests as any[]).filter((r: any) => r.organizationId === user?.organizationId && (r.status === "aprobado" || r.status === "completado")).reduce((sum: number, r: any) => sum + r.amount, 0)
    : 0;
  const myAvailable       = myAssigned - mySpending;
  const mySpendingPercent = myAssigned > 0 ? Math.round((mySpending / myAssigned) * 100) : 0;

  // ── Loading ────────────────────────────────────────────────
  if (requestsLoading || wardBudgetLoading || orgsLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Presupuestos</h1>
          <p className="text-sm text-muted-foreground">
            {isOrgMember ? "Control de presupuesto de tu organización" : "Gestiona presupuestos globales y asignaciones"}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">

          <Button variant="outline" onClick={() => exportBudgetRequests(filteredRequests)} data-testid="button-export-budget">
            <Download className="h-4 w-4 lg:mr-2" />
            <span className="sr-only lg:not-sr-only">Exportar</span>
          </Button>

          {isObispado && (
            <Dialog open={isBudgetDialogOpen} onOpenChange={setIsBudgetDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-edit-ward-budget">
                  <Edit2 className="h-4 w-4 mr-2" /> Presupuesto Global
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Presupuesto anual y trimestral</DialogTitle>
                  <DialogDescription>Define el presupuesto anual y su desglose por trimestre (en euros)</DialogDescription>
                </DialogHeader>
                <Form {...wardBudgetForm}>
                  <form onSubmit={wardBudgetForm.handleSubmit(onSubmitWardBudget)} className="space-y-4">
                    <FormField control={wardBudgetForm.control} name="annualAmount" render={({ field }) => (
                      <FormItem><FormLabel>Presupuesto anual (€)</FormLabel><FormControl>
                        <BudgetCurrencyInput {...field} onBlur={(event) => { field.onChange(formatCurrencyInputValue(event.target.value)); field.onBlur(); }} data-testid="input-ward-budget-annual" />
                      </FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid gap-4 md:grid-cols-2">
                      {(["q1Amount", "q2Amount", "q3Amount", "q4Amount"] as const).map((name, i) => (
                        <FormField key={name} control={wardBudgetForm.control} name={name} render={({ field }) => (
                          <FormItem><FormLabel>Trimestre {i + 1} (€)</FormLabel><FormControl>
                            <BudgetCurrencyInput {...field} onBlur={(event) => { field.onChange(formatCurrencyInputValue(event.target.value)); field.onBlur(); }} data-testid={`input-ward-budget-q${i + 1}`} />
                          </FormControl><FormMessage /></FormItem>
                        )} />
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsBudgetDialogOpen(false)} data-testid="button-cancel-ward-budget">Cancelar</Button>
                      <Button type="submit" data-testid="button-save-ward-budget" disabled={updateWardBudgetMutation.isPending}>
                        {updateWardBudgetMutation.isPending ? "Guardando..." : "Guardar"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-request"><Plus className="h-4 w-4 mr-2" /> Nueva Solicitud</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Solicitar Presupuesto</DialogTitle>
                <DialogDescription>Crea una nueva solicitud de presupuesto (en euros)</DialogDescription>
              </DialogHeader>
              <Form {...budgetForm}>
                <form onSubmit={budgetForm.handleSubmit(onSubmitBudgetRequest)} className="space-y-4">
                  <FormField control={budgetForm.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Descripción</FormLabel><FormControl>
                      <Input placeholder="Ej: Material para actividad ..." {...field} data-testid="input-description" />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={budgetForm.control} name="amount" render={({ field }) => (
                    <FormItem><FormLabel>Monto (€)</FormLabel><FormControl>
                      <BudgetCurrencyInput {...field} onBlur={(event) => { field.onChange(formatCurrencyInputValue(event.target.value)); field.onBlur(); }} data-testid="input-amount" />
                    </FormControl><p className="text-xs text-muted-foreground">Ingresa el monto con decimales (ej: 125.50).</p><FormMessage /></FormItem>
                  )} />
                  <FormField control={budgetForm.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Categoría</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}><FormControl>
                        <SelectTrigger data-testid="select-budget-category"><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
                      </FormControl><SelectContent>
                        <SelectItem value="actividades">Actividades</SelectItem>
                        <SelectItem value="materiales">Materiales</SelectItem>
                        <SelectItem value="otros">Otros</SelectItem>
                      </SelectContent></Select><FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={budgetForm.control} name="requestingOrganizationId" render={({ field }) => (
                    <FormItem><FormLabel>Solicitar a nombre de</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""} disabled={!isObispado}><FormControl>
                        <SelectTrigger data-testid="select-requesting-organization"><SelectValue placeholder="Selecciona una organización" /></SelectTrigger>
                      </FormControl><SelectContent>
                        {requestableOrganizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                      </SelectContent></Select>
                      {isObispado
                        ? <p className="text-xs text-muted-foreground">Elige si la solicitud se presenta como Obispado o como Cuórum del Sacerdocio Aarónico (u otra organización).</p>
                        : <p className="text-xs text-muted-foreground">Las solicitudes se registran automáticamente a nombre de tu organización.</p>
                      }
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={budgetForm.control} name="requestType" render={({ field }) => (
                    <FormItem><FormLabel>Tipo de solicitud</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}><FormControl>
                        <SelectTrigger data-testid="select-request-type"><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
                      </FormControl><SelectContent>
                        <SelectItem value="reembolso">Reembolso</SelectItem>
                        <SelectItem value="pago_adelantado">Pago por adelantado</SelectItem>
                      </SelectContent></Select><FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={budgetForm.control} name="activityDate" render={({ field }) => (
                    <FormItem><FormLabel>Fecha prevista de la actividad o gasto</FormLabel><FormControl>
                      <Input type="date" {...field} data-testid="input-activity-date" />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={budgetForm.control} name="notes" render={({ field }) => (
                    <FormItem><FormLabel>Notas (Opcional)</FormLabel><FormControl>
                      <Textarea placeholder="Detalles adicionales sobre la solicitud" {...field} data-testid="textarea-notes" />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                  {budgetRequestType === "reembolso" && (
                    <FormField control={budgetForm.control} name="receiptFile" render={({ field }) => (
                      <FormItem><FormLabel>Adjuntar comprobantes</FormLabel><FormControl>
                        <div className="flex flex-col gap-2">
                          <Input id="budget-receipt-file" type="file" accept={allowedDocumentExtensions.join(",")} onChange={(event) => field.onChange(event.target.files?.[0] ?? undefined)} onBlur={field.onBlur} ref={field.ref} className="hidden" data-testid="input-receipt-file" />
                          <Button type="button" variant="outline" className="w-fit" asChild>
                            <label htmlFor="budget-receipt-file" className="cursor-pointer"><Upload className="h-4 w-4 mr-2" /> Seleccionar comprobante</label>
                          </Button>
                          <span className="text-xs text-muted-foreground">{field.value ? `Archivo seleccionado: ${field.value.name}` : "Ningún archivo seleccionado"}</span>
                        </div>
                      </FormControl><p className="text-xs text-muted-foreground">Formatos permitidos: JPG, Word (DOC/DOCX) o PDF. Este documento es obligatorio para reembolso.</p><FormMessage /></FormItem>
                    )} />
                  )}
                  {(budgetRequestType === "pago_adelantado" || budgetRequestType === "reembolso") && (
                    <FormField control={budgetForm.control} name="activityPlanFile" render={({ field }) => (
                      <FormItem><FormLabel>Solicitud de gastos</FormLabel><FormControl>
                        <div className="flex flex-col gap-2">
                          <Input id="budget-activity-plan-file" type="file" accept={allowedDocumentExtensions.join(",")} onChange={(event) => field.onChange(event.target.files?.[0] ?? undefined)} onBlur={field.onBlur} ref={field.ref} className="hidden" data-testid="input-activity-plan-file" />
                          <Button type="button" variant="outline" className="w-fit" asChild>
                            <label htmlFor="budget-activity-plan-file" className="cursor-pointer"><Upload className="h-4 w-4 mr-2" /> Subir solicitud de gasto</label>
                          </Button>
                          <span className="text-xs text-muted-foreground">{field.value ? `Archivo seleccionado: ${field.value.name}` : "Ningún archivo seleccionado"}</span>
                        </div>
                      </FormControl><p className="text-xs text-muted-foreground">Formatos permitidos: JPG, Word (DOC/DOCX) o PDF. Este documento es obligatorio para pago por adelantado.</p><FormMessage /></FormItem>
                    )} />
                  )}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">Cancelar</Button>
                    <Button type="submit" data-testid="button-submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Creando..." : "Crear Solicitud"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Org member: mi presupuesto */}
      {isOrgMember && user?.organizationId && (
        <Card className="mb-6" data-testid={`card-my-budget-${user.organizationId}`}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">Mi Presupuesto</CardTitle>
              <CardDescription>{myOrg?.name}</CardDescription>
            </div>
            <IconBadge tone="violet"><Euro className="h-4 w-4 text-white" /></IconBadge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Presupuesto Asignado</div>
                <div className="text-2xl font-bold" data-testid="text-my-assigned">€{myAssigned.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Gastos Aprobados ({mySpendingPercent}%)</div>
                <div className="text-2xl font-bold" data-testid="text-my-spending">€{mySpending.toFixed(2)}</div>
                <Progress value={mySpendingPercent} className="h-1 mt-2" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Disponible</div>
                <div className={`text-2xl font-bold ${myAvailable < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`} data-testid="text-my-available">
                  €{myAvailable.toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="solicitudes" className="gap-1.5">
            Solicitudes
            {pendingCount > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-bold text-primary">{pendingCount}</span>
            )}
          </TabsTrigger>
          {isObispado && <TabsTrigger value="orgs">Organizaciones</TabsTrigger>}
        </TabsList>

        <TabsContent value="resumen" className="mt-4">
          <ResumenTab
            annualBudget={annualBudget} currentQuarter={currentQuarter} currentYear={currentYear}
            currentQuarterBudget={currentQuarterBudget} quarterBudgets={quarterBudgets}
            globalBudget={globalBudget} totalAssignedToOrgs={totalAssignedToOrgs}
            remainingGlobalBudget={remainingGlobalBudget} globalUtilizationPercent={globalUtilizationPercent}
            totalSolicited={totalSolicited} totalApproved={totalApproved}
            requests={filteredRequests} isObispado={isObispado}
            onApprove={handleApprove} onSign={handleSignAsBishop}
            approvePending={approveMutation.isPending} signPending={signMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="solicitudes" className="mt-4">
          <SolicitudesTab
            requests={filteredRequests} organizations={organizations} user={user}
            canApprove={canApprove} canDelete={canDelete} showActionsColumn={showActionsColumn}
            highlightedRequestId={highlightedRequestId}
            onApprove={handleApprove} onSign={handleSignAsBishop} onReview={handleReviewByBishop}
            onDelete={handleDelete} onOpenReceipts={openReceiptsDialog}
            approvePending={approveMutation.isPending} signPending={signMutation.isPending}
            reviewPending={reviewMutation.isPending} deletePending={deleteMutation.isPending}
            downloadReceipt={downloadReceipt} getReceiptLabel={getReceiptLabel}
            shouldShowAddExpenseReceipts={shouldShowAddExpenseReceipts}
          />
        </TabsContent>

        {isObispado && (
          <TabsContent value="orgs" className="mt-4">
            <OrgsTab
              organizations={organizations} orgBudgetsByOrg={orgBudgetsByOrg}
              requests={requests} currentYear={currentYear} currentQuarter={currentQuarter}
              remainingGlobalBudget={remainingGlobalBudget}
              assignDialogOpen={assignDialogOpen} selectedOrgId={selectedOrgId}
              setAssignDialogOpen={setAssignDialogOpen} setSelectedOrgId={setSelectedOrgId}
              openAssignDialog={openAssignDialog} orgBudgetForm={orgBudgetForm}
              onSubmitOrgBudgetAssign={onSubmitOrgBudgetAssign}
              createPending={createOrgBudgetMutation.isPending}
              updatePending={updateOrgBudgetMutation.isPending}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Adjuntar comprobantes dialog */}
      <Dialog open={isReceiptsDialogOpen} onOpenChange={(open) => { setIsReceiptsDialogOpen(open); if (!open) { setSelectedRequest(null); expenseReceiptsForm.reset({ expenseReceipts: [] }); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Adjuntar comprobantes de gasto</DialogTitle>
            <DialogDescription>Sube los comprobantes de gasto asociados a esta solicitud aprobada.</DialogDescription>
          </DialogHeader>
          <Form {...expenseReceiptsForm}>
            <form onSubmit={expenseReceiptsForm.handleSubmit(onSubmitExpenseReceipts)} className="space-y-4">
              <FormField control={expenseReceiptsForm.control} name="expenseReceipts" render={({ field }) => (
                <FormItem><FormLabel>Comprobantes de gasto</FormLabel><FormControl>
                  <div className="flex flex-col gap-2">
                    <Input id="expense-receipts" type="file" multiple accept={allowedDocumentExtensions.join(",")} onChange={(event) => field.onChange(Array.from(event.target.files ?? []))} onBlur={field.onBlur} ref={field.ref} className="hidden" data-testid="input-expense-receipts" />
                    <Button type="button" variant="outline" className="w-fit" asChild>
                      <label htmlFor="expense-receipts" className="cursor-pointer"><Upload className="h-4 w-4 mr-2" /> Adjuntar comprobantes</label>
                    </Button>
                    <span className="text-xs text-muted-foreground">{field.value?.length ? `Archivos seleccionados: ${field.value.length}` : "Ningún archivo seleccionado"}</span>
                  </div>
                </FormControl><p className="text-xs text-muted-foreground">Formatos permitidos: JPG, Word (DOC/DOCX) o PDF.</p><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsReceiptsDialogOpen(false)} data-testid="button-cancel-expense-receipts">Cancelar</Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-expense-receipts">
                  {updateMutation.isPending ? "Guardando..." : "Adjuntar"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Firma obispo dialog */}
      <Dialog open={isSignDialogOpen} onOpenChange={(open) => { setIsSignDialogOpen(open); if (!open) setSigningRequestId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Firmar solicitud de gasto</DialogTitle>
            <DialogDescription>Dibuja la firma en el recuadro. Se estampará en la posición fija del PDF junto al nombre y fecha.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre del obispo</label>
              <Input value={signerName} onChange={(event) => setSignerName(event.target.value)} />
            </div>
            <div className="rounded-md border border-dashed p-3">
              <canvas ref={signatureCanvasRef} width={700} height={220}
                className="h-44 w-full rounded border bg-white"
                style={{ touchAction: "none" }}
                onPointerDown={startDrawing} onPointerMove={drawSignature}
                onPointerUp={stopDrawing} onPointerLeave={stopDrawing}
                data-testid="canvas-bishop-signature"
              />
            </div>
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" onClick={clearSignatureCanvas}>Limpiar firma</Button>
              <Button type="button" onClick={confirmSignature} disabled={signMutation.isPending || !signingRequestId}>
                {signMutation.isPending ? "Firmando..." : "Confirmar firma"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
