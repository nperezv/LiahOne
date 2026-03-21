import { useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Upload, Trash2, PenLine, RotateCcw, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateBudgetRequest, useOrganizations } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth-tokens";

// ── Types ──────────────────────────────────────────────────────────────────

type ReceiptCategory = "plan" | "receipt" | "expense" | "signed_plan" | "bank_justificante";

interface Organization {
  id: string;
  name: string;
  type: string;
  presidentId?: string;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const allowedDocumentExtensions = [".jpg", ".jpeg", ".pdf", ".doc", ".docx"];

const isAllowedDocument = (file: File) => {
  const fileName = file.name.toLowerCase();
  return allowedDocumentExtensions.some((ext) => fileName.endsWith(ext));
};

const BUDGET_CATEGORY_OPTIONS = [
  { value: "actividades", label: "Actividades" },
  { value: "administracion", label: "Administración" },
  { value: "asignacion_presupuesto", label: "Asignación de Presupuesto" },
  { value: "curriculo", label: "Currículo" },
  { value: "centro_distribucion", label: "Centro de Distribución" },
  { value: "quorum_elderes", label: "Quórum Élderes" },
  { value: "historia_familiar", label: "Centro de Historia Familiar" },
  { value: "pfj", label: "PFJ" },
  { value: "biblioteca", label: "Biblioteca" },
  { value: "miscelaneo", label: "Misceláneo" },
  { value: "primaria", label: "Primaria" },
  { value: "sociedad_socorro", label: "Sociedad de Socorro" },
  { value: "adultos_solteros", label: "Adultos Solteros" },
  { value: "jovenes_adultos_solteros", label: "Jóvenes Adultos Solteros" },
  { value: "escuela_dominical", label: "Escuela Dominical" },
  { value: "hombres_jovenes", label: "Hombres Jóvenes" },
  { value: "mujeres_jovenes", label: "Mujeres Jóvenes" },
  { value: "obra_misional", label: "Obra Misional" },
  { value: "otros", label: "Otros" },
] as const;

const ORG_CATEGORY_MAP: Record<string, string[]> = {
  cuorum_elderes:    ["quorum_elderes", "obra_misional", "historia_familiar"],
  sociedad_socorro:  ["sociedad_socorro", "obra_misional", "historia_familiar"],
  jas:               ["jovenes_adultos_solteros"],
  as:                ["adultos_solteros"],
  hombres_jovenes:   ["hombres_jovenes"],
  mujeres_jovenes:   ["mujeres_jovenes"],
  primaria:          ["primaria"],
  escuela_dominical: ["escuela_dominical"],
};

// ── Helpers ────────────────────────────────────────────────────────────────

const BudgetCurrencyInput = ({ className, ...props }: ComponentProps<typeof Input>) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
    <Input
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      className={["pl-8", className].filter(Boolean).join(" ")}
      {...props}
    />
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

// ── Schema ─────────────────────────────────────────────────────────────────

const budgetCategorySchema = z.object({
  category: z.string().min(1, "Selecciona una categoría"),
  amount: z.string().min(1, "El monto es requerido"),
  detail: z.string().optional(),
});

const budgetSchema = z.object({
  description: z.string().min(1, "La descripción es requerida"),
  category: z.enum(["actividades", "materiales", "otros"]),
  requestType: z.enum(["reembolso", "pago_adelantado"]),
  activityDate: z.string().min(1, "La fecha prevista es requerida"),
  notes: z.string().optional(),
  requestingOrganizationId: z.string().optional(),
  budgetCategories: z.array(budgetCategorySchema).min(1, "Añade al menos una categoría"),
  pagarA: z.string().min(1, "El nombre del beneficiario es requerido"),
  bankInSystem: z.boolean({ required_error: "Indica si los datos bancarios están en el sistema de la Iglesia" }),
  swift: z.string().optional(),
  iban: z.string().optional(),
  bankJustificanteFile: z
    .instanceof(File)
    .optional()
    .refine((file) => !file || isAllowedDocument(file), {
      message: "Adjunta un archivo .jpg, .jpeg o .pdf válido.",
    }),
  receiptFile: z
    .instanceof(File)
    .optional()
    .refine((file) => !file || isAllowedDocument(file), {
      message: "Adjunta un archivo .jpg, .doc, .docx o .pdf válido.",
    }),
}).superRefine((data, ctx) => {
  if (data.requestType === "reembolso" && !data.receiptFile) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["receiptFile"], message: "Adjunta el comprobante para solicitudes de reembolso." });
  }
  data.budgetCategories.forEach((cat, i) => {
    if (cat.category === "otros" && !cat.detail?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["budgetCategories", i, "detail"], message: "Especifica el detalle para la categoría Otros." });
    }
  });
  if (data.bankInSystem === false) {
    if (!data.iban?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["iban"], message: "El IBAN es requerido." });
    }
    if (!data.bankJustificanteFile) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankJustificanteFile"], message: "Adjunta el justificante de titularidad." });
    }
  }
});

type BudgetFormValues = z.infer<typeof budgetSchema>;

// ── Component ──────────────────────────────────────────────────────────────

interface BudgetRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDescription?: string;
}

export function BudgetRequestDialog({ open, onOpenChange, defaultDescription }: BudgetRequestDialogProps) {
  const { user } = useAuth();
  const { data: organizations = [] as Organization[] } = useOrganizations();
  const createMutation = useCreateBudgetRequest();

  const isObispado = ["obispo", "consejero_obispo", "secretario_financiero"].includes(user?.role || "");

  const [budgetUploadState, setBudgetUploadState] = useState<{
    receipt: "idle" | "uploading" | "done";
    bankJustificante: "idle" | "uploading" | "done";
  }>({ receipt: "idle", bankJustificante: "idle" });

  const requesterSignatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isRequesterDrawingRef = useRef(false);

  const requestableOrganizations = useMemo(() =>
    (organizations as Organization[]).filter((org) => org.type !== "barrio"),
  [organizations]);

  const budgetForm = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      description: defaultDescription ?? "",
      category: "actividades",
      requestType: "pago_adelantado",
      activityDate: "",
      notes: "",
      requestingOrganizationId: "",
      budgetCategories: [{ category: "", amount: "", detail: "" }],
      pagarA: "",
      bankInSystem: undefined,
      swift: "",
      iban: "",
      bankJustificanteFile: undefined,
      receiptFile: undefined,
    },
  });

  const budgetRequestType = budgetForm.watch("requestType");
  const watchedCategories = budgetForm.watch("budgetCategories");
  const watchedBankInSystem = budgetForm.watch("bankInSystem");
  const watchedOrgId = budgetForm.watch("requestingOrganizationId");

  const availablePdfCategories = useMemo(() => {
    const orgId = watchedOrgId || (isObispado ? null : user?.organizationId);
    const orgType = (organizations as Organization[]).find(o => o.id === orgId)?.type ?? "";
    const restricted = ORG_CATEGORY_MAP[orgType];
    if (!restricted) return BUDGET_CATEGORY_OPTIONS;
    return BUDGET_CATEGORY_OPTIONS.filter(o => restricted.includes(o.value));
  }, [watchedOrgId, organizations, user?.organizationId, isObispado]);

  // Set org when dialog opens
  useEffect(() => {
    if (!open) return;
    if (isObispado) {
      const currentSelection = budgetForm.getValues("requestingOrganizationId");
      if (!currentSelection && requestableOrganizations.length > 0) {
        budgetForm.setValue("requestingOrganizationId", requestableOrganizations[0].id);
      }
      return;
    }
    budgetForm.setValue("requestingOrganizationId", user?.organizationId ?? "");
  }, [open, isObispado, requestableOrganizations, budgetForm, user?.organizationId]);

  // Pre-fill description when dialog opens
  useEffect(() => {
    if (!open) return;
    if (defaultDescription) {
      budgetForm.setValue("description", defaultDescription);
    }
  }, [open, defaultDescription, budgetForm]);

  // Init canvas when dialog opens
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => initRequesterCanvas(), 100);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-set PDF category when org changes
  useEffect(() => {
    if (availablePdfCategories.length === 1) {
      const current = budgetForm.getValues("budgetCategories");
      const updated = current.map(cat => ({ ...cat, category: availablePdfCategories[0].value }));
      budgetForm.setValue("budgetCategories", updated);
    } else {
      budgetForm.setValue("budgetCategories", [{ category: "", amount: "", detail: "" }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedOrgId]);

  // ── Canvas helpers ──────────────────────────────────────────────────────

  const clearRequesterSignatureCanvas = () => {
    const canvas = requesterSignatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const initRequesterCanvas = () => {
    const canvas = requesterSignatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.lineWidth = 2.8;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "#111827";
    clearRequesterSignatureCanvas();
  };

  const getRequesterCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = requesterSignatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startRequesterDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = requesterSignatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const { x, y } = getRequesterCanvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    isRequesterDrawingRef.current = true;
    context.beginPath();
    context.moveTo(x, y);
  };

  const drawRequesterSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isRequesterDrawingRef.current) return;
    const canvas = requesterSignatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const { x, y } = getRequesterCanvasPoint(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const stopRequesterDrawing = () => {
    isRequesterDrawingRef.current = false;
  };

  // ── Upload helper ───────────────────────────────────────────────────────

  const uploadReceiptFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });
    if (!response.ok) throw new Error("No se pudo subir el archivo");
    return response.json() as Promise<{ filename: string; url: string }>;
  };

  // ── Submit ──────────────────────────────────────────────────────────────

  const onSubmitBudgetRequest = async (data: BudgetFormValues) => {
    const targetOrganizationId = isObispado ? data.requestingOrganizationId : user?.organizationId;

    if (!targetOrganizationId) {
      budgetForm.setError("requestingOrganizationId", {
        type: "manual",
        message: "Selecciona la organización a nombre de la cual se solicita el presupuesto.",
      });
      return;
    }

    const requesterCanvas = requesterSignatureCanvasRef.current;
    if (!requesterCanvas) { alert("Error al acceder al campo de firma."); return; }
    const signatureDataUrl = requesterCanvas.toDataURL("image/png");
    const ctx = requesterCanvas.getContext("2d");
    const pixelData = ctx?.getImageData(0, 0, requesterCanvas.width, requesterCanvas.height).data;
    const hasSignature = pixelData ? Array.from(pixelData).some((v, i) => i % 4 !== 3 && v < 250) : false;
    if (!hasSignature) { alert("Por favor, añade tu firma antes de enviar la solicitud."); return; }

    const parsedAmount = data.budgetCategories.reduce((sum, cat) => sum + parseBudgetNumber(cat.amount), 0);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { alert("El importe total debe ser mayor que cero."); return; }

    const uploadedReceipts: { filename: string; url: string; category: ReceiptCategory }[] = [];

    if (data.requestType === "reembolso" && data.receiptFile) {
      try {
        setBudgetUploadState(s => ({ ...s, receipt: "uploading" }));
        const uploaded = await uploadReceiptFile(data.receiptFile);
        setBudgetUploadState(s => ({ ...s, receipt: "done" }));
        uploadedReceipts.push({ filename: uploaded.filename, url: uploaded.url, category: "receipt" });
      } catch {
        setBudgetUploadState(s => ({ ...s, receipt: "idle" }));
        alert("No se pudo subir el comprobante. Intenta nuevamente.");
        return;
      }
    }

    if (!data.bankInSystem && data.bankJustificanteFile) {
      try {
        setBudgetUploadState(s => ({ ...s, bankJustificante: "uploading" }));
        const uploaded = await uploadReceiptFile(data.bankJustificanteFile);
        setBudgetUploadState(s => ({ ...s, bankJustificante: "done" }));
        uploadedReceipts.push({ filename: uploaded.filename, url: uploaded.url, category: "bank_justificante" });
      } catch {
        setBudgetUploadState(s => ({ ...s, bankJustificante: "idle" }));
        alert("No se pudo subir el justificante bancario. Intenta nuevamente.");
        return;
      }
    }

    createMutation.mutate(
      {
        description: data.description,
        amount: parsedAmount,
        category: data.category,
        status: "solicitado",
        activityDate: data.activityDate ? new Date(`${data.activityDate}T00:00:00`) : null,
        notes: data.notes || "",
        receipts: uploadedReceipts,
        organizationId: targetOrganizationId,
        applicantSignatureDataUrl: signatureDataUrl,
        requestType: data.requestType,
        budgetCategoriesJson: data.budgetCategories,
        bankData: {
          bankInSystem: data.bankInSystem ?? false,
          swift: data.swift || undefined,
          iban: data.iban || undefined,
        },
        pagarA: data.pagarA || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          clearRequesterSignatureCanvas();
          budgetForm.reset({
            description: defaultDescription ?? "",
            category: "actividades",
            requestType: "pago_adelantado",
            activityDate: "",
            notes: "",
            requestingOrganizationId: isObispado ? "" : user?.organizationId ?? "",
            budgetCategories: [{ category: "", amount: "", detail: "" }],
            pagarA: "",
            bankInSystem: undefined,
            swift: "",
            iban: "",
            bankJustificanteFile: undefined,
            receiptFile: undefined,
          });
        },
      }
    );
  };

  // ── JSX ─────────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setBudgetUploadState({ receipt: "idle", bankJustificante: "idle" });
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Solicitar Presupuesto</DialogTitle>
          <DialogDescription>Crea una nueva solicitud de presupuesto (en euros)</DialogDescription>
        </DialogHeader>

        <Form {...budgetForm}>
          <form onSubmit={budgetForm.handleSubmit(onSubmitBudgetRequest)} className="space-y-4">

            {/* Descripción */}
            <FormField
              control={budgetForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Material para actividad ..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tipo de gasto */}
            <FormField
              control={budgetForm.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de gasto</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Selecciona tipo" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="actividades">Actividades</SelectItem>
                      <SelectItem value="materiales">Materiales</SelectItem>
                      <SelectItem value="otros">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Organización solicitante */}
            <FormField
              control={budgetForm.control}
              name="requestingOrganizationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Solicitar a nombre de</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} disabled={!isObispado}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Selecciona una organización" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {requestableOrganizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isObispado ? (
                    <p className="text-xs text-muted-foreground">
                      Elige si la solicitud se presenta como Obispado o como otra organización.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Las solicitudes se registran automáticamente a nombre de tu organización.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Categorías y montos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Categorías y montos</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const current = budgetForm.getValues("budgetCategories");
                    budgetForm.setValue("budgetCategories", [...current, { category: "", amount: "", detail: "" }]);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Añadir categoría
                </Button>
              </div>

              {watchedCategories.map((cat, index) => (
                <div key={index} className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1">
                      <FormField
                        control={budgetForm.control}
                        name={`budgetCategories.${index}.category`}
                        render={({ field }) => (
                          <FormItem>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Selecciona categoría" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-52 overflow-y-auto">
                                {availablePdfCategories.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="w-28 space-y-1">
                      <FormField
                        control={budgetForm.control}
                        name={`budgetCategories.${index}.amount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <BudgetCurrencyInput
                                {...field}
                                className="h-8 text-sm"
                                onBlur={(e) => { field.onChange(formatCurrencyInputValue(e.target.value)); field.onBlur(); }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {watchedCategories.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => {
                          const current = budgetForm.getValues("budgetCategories");
                          budgetForm.setValue("budgetCategories", current.filter((_, i) => i !== index));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {cat.category === "otros" && (
                    <FormField
                      control={budgetForm.control}
                      name={`budgetCategories.${index}.detail`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Especifique..." className="h-8 text-sm" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              ))}

              {watchedCategories.some(c => c.amount) && (
                <div className="flex justify-end pr-1">
                  <span className="text-xs text-muted-foreground mr-2 self-center">Total:</span>
                  <span className="text-sm font-semibold">
                    € {watchedCategories.reduce((sum, c) => sum + parseBudgetNumber(c.amount), 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Tipo de solicitud */}
            <FormField
              control={budgetForm.control}
              name="requestType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de solicitud</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="reembolso">Reembolso</SelectItem>
                      <SelectItem value="pago_adelantado">Pago por adelantado</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Fecha */}
            <FormField
              control={budgetForm.control}
              name="activityDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha prevista de la actividad o gasto</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pagar a */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-3">Pagar a</p>
              <FormField
                control={budgetForm.control}
                name="pagarA"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del beneficiario <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre completo de quien recibe el pago" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Puede ser distinto al solicitante. Se usará como titular en la sección bancaria del PDF.</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Datos bancarios */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-3">Datos bancarios del beneficiario</p>
              <FormField
                control={budgetForm.control}
                name="bankInSystem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>¿Tiene datos bancarios registrados en el sistema de la Iglesia (LCR/CUFS)? <span className="text-destructive">*</span></FormLabel>
                    <div className="grid grid-cols-2 gap-3 mt-1">
                      {([
                        [true, "✓", "Sí, están registrados"],
                        [false, "✗", "No, los introduzco ahora"],
                      ] as [boolean, string, string][]).map(([val, icon, txt]) => (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => field.onChange(val)}
                          className={[
                            "flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition-colors",
                            field.value === val
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:border-muted-foreground",
                          ].join(" ")}
                        >
                          <span className="text-base font-bold">{icon}</span>
                          <span className="font-medium">{txt}</span>
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchedBankInSystem === true && (
                <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-400">
                  ✓ El PDF indicará que los datos están verificados en el sistema LCR/CUFS. El titular se tomará del campo "Pagar a".
                </div>
              )}

              {watchedBankInSystem === false && (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={budgetForm.control}
                      name="swift"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SWIFT / BIC</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej: CAIXESBB" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={budgetForm.control}
                      name="iban"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IBAN <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="ES00 0000 0000 0000 0000 0000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={budgetForm.control}
                    name="bankJustificanteFile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Justificante de titularidad <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <div className="flex flex-col gap-2">
                            <Input
                              id="brd-bank-justificante-file"
                              type="file"
                              accept=".jpg,.jpeg,.pdf,.png"
                              onChange={(e) => field.onChange(e.target.files?.[0] ?? undefined)}
                              onBlur={field.onBlur}
                              ref={field.ref}
                              className="sr-only"
                            />
                            <Button
                              type="button"
                              variant={budgetUploadState.bankJustificante === "done" ? "default" : "outline"}
                              className="w-fit"
                              disabled={budgetUploadState.bankJustificante === "uploading"}
                              onClick={() => (document.getElementById("brd-bank-justificante-file") as HTMLInputElement)?.click()}
                            >
                              {budgetUploadState.bankJustificante === "uploading"
                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                : <Upload className="h-4 w-4 mr-2" />}
                              {budgetUploadState.bankJustificante === "uploading" ? "Subiendo..." : "Seleccionar justificante"}
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {field.value ? `✓ ${field.value.name}` : "Ningún archivo seleccionado — JPG, PNG o PDF"}
                            </span>
                          </div>
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Captura o PDF del banco que acredite la titularidad de la cuenta.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Notas */}
            <FormField
              control={budgetForm.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Propósito del gasto (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Detalla el propósito del gasto..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Comprobante (solo reembolso) */}
            {budgetRequestType === "reembolso" && (
              <FormField
                control={budgetForm.control}
                name="receiptFile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjuntar comprobantes</FormLabel>
                    <FormControl>
                      <div className="flex flex-col gap-2">
                        <Input
                          id="brd-receipt-file"
                          type="file"
                          accept={allowedDocumentExtensions.join(",")}
                          onChange={(e) => field.onChange(e.target.files?.[0] ?? undefined)}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          className="hidden"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant={field.value ? "default" : "outline"}
                            className="w-fit"
                            disabled={createMutation.isPending}
                            onClick={() => (document.getElementById("brd-receipt-file") as HTMLInputElement)?.click()}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {field.value ? "Comprobante adjunto" : "Seleccionar comprobante"}
                          </Button>
                          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          {!createMutation.isPending && field.value && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {field.value ? `Archivo seleccionado: ${field.value.name}` : "Ningún archivo seleccionado"}
                        </span>
                      </div>
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Formatos permitidos: JPG, Word (DOC/DOCX) o PDF. Este documento es obligatorio para reembolso.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Firma del solicitante */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-none">
                  Firma del solicitante <span className="text-destructive">*</span>
                </label>
                <button
                  type="button"
                  onClick={clearRequesterSignatureCanvas}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Limpiar
                </button>
              </div>
              <div className="rounded-md border border-dashed border-slate-600 bg-[#0d1117] p-2">
                <canvas
                  ref={requesterSignatureCanvasRef}
                  width={700}
                  height={180}
                  className="h-36 w-full rounded border border-slate-200 bg-white"
                  style={{ touchAction: "none" }}
                  onPointerDown={startRequesterDrawing}
                  onPointerMove={drawRequesterSignature}
                  onPointerUp={stopRequesterDrawing}
                  onPointerLeave={stopRequesterDrawing}
                />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <PenLine className="h-3 w-3" />
                Esta firma quedará registrada en el formulario de solicitud de gastos generado automáticamente.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creando..." : "Crear Solicitud"}
              </Button>
            </div>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
