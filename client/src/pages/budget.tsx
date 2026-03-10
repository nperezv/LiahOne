import { useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent } from "react";
import { useQueries } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Euro, Edit2, Upload, Trash2, Settings, Paperclip, PenLine, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBudgetRequests,
  useCreateBudgetRequest,
  useUpdateBudgetRequest,
  useApproveBudgetRequest,
  useSignBudgetRequestAsBishop,
  useReviewBudgetRequestAsBishop,
  useDeleteBudgetRequest,
  useWardBudget,
  useUpdateWardBudget,
  useCreateOrganizationBudget,
  useUpdateOrganizationBudget,
  useOrganizations,
} from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth-tokens";
import { useSearch } from "wouter";

const allowedDocumentExtensions = [".jpg", ".jpeg", ".pdf", ".doc", ".docx"];

const BudgetCurrencyInput = ({ className, ...props }: ComponentProps<typeof Input>) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
    <Input
      type="number"
      step="0.01"
      min="0"
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

const roundToTwoDecimals = (value: number) => Math.round(value * 100) / 100;

const formatBudgetValue = (value: number) => roundToTwoDecimals(value).toFixed(2);

const toBudgetNumber = (value?: number | string | null) => {
  if (typeof value === "number") {
    return Number.isNaN(value) ? 0 : value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

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

// Categories available per organization type
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
// obispado and barrio → all categories (no restriction)

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
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["receiptFile"],
      message: "Adjunta el comprobante para solicitudes de reembolso.",
    });
  }
  data.budgetCategories.forEach((cat, i) => {
    if (cat.category === "otros" && !cat.detail?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetCategories", i, "detail"],
        message: "Especifica el detalle para la categoría Otros.",
      });
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

const expenseReceiptsSchema = z.object({
  expenseReceipts: z
    .array(z.instanceof(File))
    .min(1, "Adjunta al menos un comprobante de gasto.")
    .refine((files) => files.every((file) => isAllowedDocument(file)), {
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

const orgBudgetAssignSchema = z.object({
  amount: z.string().min(1, "El monto es requerido"),
});

type BudgetFormValues = z.infer<typeof budgetSchema>;
type ExpenseReceiptsValues = z.infer<typeof expenseReceiptsSchema>;
type WardBudgetValues = z.infer<typeof wardBudgetSchema>;
type OrgBudgetAssignValues = z.infer<typeof orgBudgetAssignSchema>;

type ReceiptCategory = "plan" | "receipt" | "expense" | "signed_plan" | "bank_justificante";

interface BudgetRequest {
  id: string;
  description: string;
  amount: number;
  category?: "actividades" | "materiales" | "otros";
  status: "solicitado" | "aprobado_financiero" | "pendiente_firma_obispo" | "aprobado" | "en_proceso" | "completado" | "rechazada";
  requestedBy: string;
  approvedBy?: string;
  activityDate?: string;
  bishopSignedPlanFilename?: string;
  bishopSignedPlanUrl?: string;
  organizationId?: string;
  notes?: string;
  receipts?: { filename: string; url: string; category?: ReceiptCategory }[];
  createdAt: string;
}

interface Organization {
  id: string;
  name: string;
  type: string;
  presidentId?: string;
  createdAt: string;
}

export default function BudgetPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [isReceiptsDialogOpen, setIsReceiptsDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<BudgetRequest | null>(null);
  const [isSignDialogOpen, setIsSignDialogOpen] = useState(false);
  const [attachmentsDialogRequest, setAttachmentsDialogRequest] = useState<BudgetRequest | null>(null);
  const [signingRequestId, setSigningRequestId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const requesterSignatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const isRequesterDrawingRef = useRef(false);
  const search = useSearch();
  const highlightedRequestId = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("highlight");
  }, [search]);

  const { user } = useAuth();
  const { data: requests = [] as any[], isLoading: requestsLoading } = useBudgetRequests();
  const { data: wardBudget, isLoading: wardBudgetLoading } = useWardBudget();
  const { data: organizations = [] as Organization[], isLoading: orgsLoading } = useOrganizations();

  const createMutation = useCreateBudgetRequest();
  const updateMutation = useUpdateBudgetRequest();
  const approveMutation = useApproveBudgetRequest();
  const signMutation = useSignBudgetRequestAsBishop();
  const reviewMutation = useReviewBudgetRequestAsBishop();
  const deleteMutation = useDeleteBudgetRequest();
  const updateWardBudgetMutation = useUpdateWardBudget();
  const createOrgBudgetMutation = useCreateOrganizationBudget();
  const updateOrgBudgetMutation = useUpdateOrganizationBudget();

  const uploadReceiptFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      throw new Error("No se pudo subir el archivo");
    }

    return response.json() as Promise<{ filename: string; url: string }>;
  };

  const isObispado = ["obispo", "consejero_obispo", "secretario_financiero"].includes(user?.role || "");
  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const canApprove = isObispado;
  const canDelete = isObispado;
  const showActionsColumn = canApprove || canDelete || isOrgMember;

  // Get organization budgets for all orgs
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

  // Filter requests based on user role
  const filteredRequests = isOrgMember
    ? (requests as any[]).filter((r: any) => r.organizationId === user?.organizationId)
    : requests;

  useEffect(() => {
    if (!highlightedRequestId) return;
    setActiveSection("solicitudes");
    const row = document.querySelector(`[data-testid="row-request-${highlightedRequestId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedRequestId, filteredRequests]);

  const now = new Date();
  const currentYear = now.getFullYear();
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
    if (annualAmount > 0) {
      return annualAmount;
    }
    return quarterBudgetValues.some((value) => value > 0)
      ? quarterBudgetValues.reduce((sum, value) => sum + value, 0)
      : toBudgetNumber(wardBudget?.amount);
  }, [quarterBudgetValues, wardBudget?.amount, wardBudget?.annualAmount]);
  const currentQuarterBudget = quarterBudgets[currentQuarter as 1 | 2 | 3 | 4] || 0;

  const validOrganizationIds = new Set(
    (organizations as Organization[])
      .filter((org) => org.type !== "barrio")
      .map((org) => org.id)
  );
  const totalAssignedToOrgs = Object.entries(orgBudgetsByOrg)
    .filter(([orgId]) => validOrganizationIds.has(orgId))
    .flatMap(([, budgets]) => budgets)
    .filter((budget: any) => budget?.year === currentYear && budget?.quarter === currentQuarter)
    .reduce((sum: number, budget: any) => sum + toBudgetNumber(budget?.amount), 0);
  const globalBudget = currentQuarterBudget;
  const remainingGlobalBudget = globalBudget - totalAssignedToOrgs;
  const globalUtilizationPercent = globalBudget > 0 ? Math.round((totalAssignedToOrgs / globalBudget) * 100) : 0;

  const budgetForm = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      description: "",
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

  const expenseReceiptsForm = useForm<ExpenseReceiptsValues>({
    resolver: zodResolver(expenseReceiptsSchema),
    defaultValues: {
      expenseReceipts: [],
    },
  });

  const wardBudgetForm = useForm<WardBudgetValues>({
    resolver: zodResolver(wardBudgetSchema),
    defaultValues: {
      annualAmount: formatBudgetValue(annualBudget),
      q1Amount: formatBudgetValue(quarterBudgets[1]),
      q2Amount: formatBudgetValue(quarterBudgets[2]),
      q3Amount: formatBudgetValue(quarterBudgets[3]),
      q4Amount: formatBudgetValue(quarterBudgets[4]),
    },
  });

  useEffect(() => {
    wardBudgetForm.reset({
      annualAmount: formatBudgetValue(annualBudget),
      q1Amount: formatBudgetValue(quarterBudgets[1]),
      q2Amount: formatBudgetValue(quarterBudgets[2]),
      q3Amount: formatBudgetValue(quarterBudgets[3]),
      q4Amount: formatBudgetValue(quarterBudgets[4]),
    });
  }, [annualBudget, quarterBudgets, wardBudgetForm]);

  const annualAmountValue = wardBudgetForm.watch("annualAmount");
  const annualAmountDirty = wardBudgetForm.formState.dirtyFields.annualAmount;

  useEffect(() => {
    if (!annualAmountDirty) {
      return;
    }
    const parsedAnnual = parseBudgetNumber(annualAmountValue);
    const baseQuarter = roundToTwoDecimals(parsedAnnual / 4);
    const q1 = baseQuarter;
    const q2 = baseQuarter;
    const q3 = baseQuarter;
    const q4 = roundToTwoDecimals(parsedAnnual - q1 - q2 - q3);

    wardBudgetForm.setValue("q1Amount", formatBudgetValue(q1), { shouldDirty: true });
    wardBudgetForm.setValue("q2Amount", formatBudgetValue(q2), { shouldDirty: true });
    wardBudgetForm.setValue("q3Amount", formatBudgetValue(q3), { shouldDirty: true });
    wardBudgetForm.setValue("q4Amount", formatBudgetValue(q4), { shouldDirty: true });
  }, [annualAmountDirty, annualAmountValue, wardBudgetForm]);

  const budgetRequestType = budgetForm.watch("requestType");
  const watchedCategories = budgetForm.watch("budgetCategories");
  const watchedBankInSystem = budgetForm.watch("bankInSystem");
  const watchedOrgId = budgetForm.watch("requestingOrganizationId");

  // Derive available PDF categories based on selected organization type
  const availablePdfCategories = useMemo(() => {
    const orgId = watchedOrgId || (isObispado ? null : user?.organizationId);
    const orgType = (organizations as Organization[]).find(o => o.id === orgId)?.type ?? "";
    const restricted = ORG_CATEGORY_MAP[orgType];
    if (!restricted) return BUDGET_CATEGORY_OPTIONS; // obispado/barrio → all
    return BUDGET_CATEGORY_OPTIONS.filter(o => restricted.includes(o.value));
  }, [watchedOrgId, organizations, user?.organizationId, isObispado]);

  const requestableOrganizations = useMemo(() =>
    (organizations as Organization[]).filter((org) => org.type !== "barrio"),
  [organizations]);


  const orgBudgetForm = useForm<OrgBudgetAssignValues>({
    resolver: zodResolver(orgBudgetAssignSchema),
    defaultValues: {
      amount: "",
    },
  });

  useEffect(() => {
    if (!isDialogOpen) return;

    if (isObispado) {
      const currentSelection = budgetForm.getValues("requestingOrganizationId");
      if (!currentSelection && requestableOrganizations.length > 0) {
        budgetForm.setValue("requestingOrganizationId", requestableOrganizations[0].id);
      }
      return;
    }

    budgetForm.setValue("requestingOrganizationId", user?.organizationId ?? "");
  }, [isDialogOpen, isObispado, requestableOrganizations, budgetForm, user?.organizationId]);

  useEffect(() => {
    if (!isDialogOpen) return;
    // Small delay to ensure canvas is mounted
    const timer = setTimeout(() => initRequesterCanvas(), 100);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen]);

  // Auto-set PDF category when org changes and only one option available
  useEffect(() => {
    if (availablePdfCategories.length === 1) {
      const current = budgetForm.getValues("budgetCategories");
      const updated = current.map(cat => ({ ...cat, category: availablePdfCategories[0].value }));
      budgetForm.setValue("budgetCategories", updated);
    } else {
      // Reset categories so user picks from new available list
      budgetForm.setValue("budgetCategories", [{ category: "", amount: "", detail: "" }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedOrgId]);

  const clearRequesterSignatureCanvas = () => {
    const canvas = requesterSignatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const initRequesterCanvas = () => {
    const canvas = requesterSignatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
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
    const context = canvas.getContext("2d");
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
    const context = canvas.getContext("2d");
    if (!context) return;
    const { x, y } = getRequesterCanvasPoint(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const stopRequesterDrawing = () => {
    isRequesterDrawingRef.current = false;
  };


  const onSubmitBudgetRequest = async (data: BudgetFormValues) => {
    const targetOrganizationId = isObispado
      ? data.requestingOrganizationId
      : user?.organizationId;

    if (!targetOrganizationId) {
      budgetForm.setError("requestingOrganizationId", {
        type: "manual",
        message: "Selecciona la organización a nombre de la cual se solicita el presupuesto.",
      });
      return;
    }

    // Validate requester signature
    const requesterCanvas = requesterSignatureCanvasRef.current;
    if (!requesterCanvas) {
      alert("Error al acceder al campo de firma.");
      return;
    }
    const signatureDataUrl = requesterCanvas.toDataURL("image/png");
    const ctx = requesterCanvas.getContext("2d");
    const pixelData = ctx?.getImageData(0, 0, requesterCanvas.width, requesterCanvas.height).data;
    const hasSignature = pixelData ? Array.from(pixelData).some((v, i) => i % 4 !== 3 && v < 250) : false;
    if (!hasSignature) {
      alert("Por favor, añade tu firma antes de enviar la solicitud.");
      return;
    }

    const orgName = (organizations as Organization[]).find((o) => o.id === targetOrganizationId)?.name ?? "";

    // Compute total from all categories
    const parsedAmount = data.budgetCategories.reduce((sum, cat) => sum + parseBudgetNumber(cat.amount), 0);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      alert("El importe total debe ser mayor que cero.");
      return;
    }

    // Map new dynamic categories to legacy 3-value category for metrics/gauges
    const legacyCategory = data.category;

    const uploadedReceipts: { filename: string; url: string; category: ReceiptCategory }[] = [];

    if (data.requestType === "reembolso" && data.receiptFile) {
      try {
        const uploadedReceipt = await uploadReceiptFile(data.receiptFile);
        uploadedReceipts.push({ filename: uploadedReceipt.filename, url: uploadedReceipt.url, category: "receipt" });
      } catch (error) {
        console.error(error);
        alert("No se pudo subir el comprobante. Intenta nuevamente.");
        return;
      }
    }

    if (!data.bankInSystem && data.bankJustificanteFile) {
      try {
        const uploadedJustificante = await uploadReceiptFile(data.bankJustificanteFile);
        uploadedReceipts.push({ filename: uploadedJustificante.filename, url: uploadedJustificante.url, category: "bank_justificante" });
      } catch (error) {
        console.error(error);
        alert("No se pudo subir el justificante bancario. Intenta nuevamente.");
        return;
      }
    }

    createMutation.mutate(
      {
        description: data.description,
        amount: parsedAmount,
        category: legacyCategory,
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
          setIsDialogOpen(false);
          clearRequesterSignatureCanvas();
          budgetForm.reset({
            description: "",
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

  const onSubmitExpenseReceipts = async (data: ExpenseReceiptsValues) => {
    if (!selectedRequest) {
      return;
    }

    let uploadedReceipts: { filename: string; url: string; category: ReceiptCategory }[] = [];

    try {
      uploadedReceipts = await Promise.all(
        data.expenseReceipts.map(async (file) => {
          const uploaded = await uploadReceiptFile(file);
          return {
            filename: uploaded.filename,
            url: uploaded.url,
            category: "expense",
          };
        })
      );
    } catch (error) {
      console.error(error);
      alert("No se pudo subir los comprobantes. Intenta nuevamente.");
      return;
    }

    const existingReceipts = selectedRequest.receipts ?? [];

    updateMutation.mutate(
      {
        id: selectedRequest.id,
        data: {
          receipts: [...existingReceipts, ...uploadedReceipts],
        },
      },
      {
        onSuccess: () => {
          setIsReceiptsDialogOpen(false);
          setSelectedRequest(null);
          expenseReceiptsForm.reset();
        },
      }
    );
  };

  const onSubmitWardBudget = (data: WardBudgetValues) => {
    const annualAmountRaw = roundToTwoDecimals(parseBudgetNumber(data.annualAmount));
    const q1AmountRaw = roundToTwoDecimals(parseBudgetNumber(data.q1Amount));
    const q2AmountRaw = roundToTwoDecimals(parseBudgetNumber(data.q2Amount));
    const q3AmountRaw = roundToTwoDecimals(parseBudgetNumber(data.q3Amount));
    const q4AmountRaw = roundToTwoDecimals(parseBudgetNumber(data.q4Amount));
    const quartersTotal = roundToTwoDecimals(q1AmountRaw + q2AmountRaw + q3AmountRaw + q4AmountRaw);

    if (quartersTotal > annualAmountRaw + 0.01) {
      alert(`La suma de los trimestres (€${quartersTotal.toFixed(2)}) excede el presupuesto anual.`);
      return;
    }

    const quarterAmounts = [q1AmountRaw, q2AmountRaw, q3AmountRaw, q4AmountRaw];
    const currentQuarterAmount = quarterAmounts[currentQuarter - 1] ?? 0;

    updateWardBudgetMutation.mutate({
      annualAmount: formatBudgetValue(annualAmountRaw),
      year: currentYear,
      q1Amount: formatBudgetValue(q1AmountRaw),
      q2Amount: formatBudgetValue(q2AmountRaw),
      q3Amount: formatBudgetValue(q3AmountRaw),
      q4Amount: formatBudgetValue(q4AmountRaw),
      amount: formatBudgetValue(currentQuarterAmount),
    }, {
      onSuccess: () => {
        setIsBudgetDialogOpen(false);
        wardBudgetForm.reset();
      },
    });
  };

  const onSubmitOrgBudgetAssign = (data: OrgBudgetAssignValues) => {
    const amount = roundToTwoDecimals(parseBudgetNumber(data.amount));

    if (selectedOrgId) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

      const existingBudget = (orgBudgetsByOrg[selectedOrgId] || []).find(
        (b: any) => b.year === currentYear && b.quarter === currentQuarter
      );
      const existingAmount = toBudgetNumber(existingBudget?.amount);
      const maxAssignable = remainingGlobalBudget + existingAmount;

      if (amount > maxAssignable) {
        alert(`El monto excede el presupuesto disponible. Disponible: €${maxAssignable.toFixed(2)}`);
        return;
      }

      if (existingBudget) {
        // Update existing
        updateOrgBudgetMutation.mutate({
          id: existingBudget.id,
          data: { amount: formatBudgetValue(amount) },
          organizationId: selectedOrgId,
        }, {
          onSuccess: () => {
            setAssignDialogOpen(false);
            setSelectedOrgId(null);
            orgBudgetForm.reset();
          },
        });
      } else {
        // Create new
        createOrgBudgetMutation.mutate({
          organizationId: selectedOrgId,
          amount: formatBudgetValue(amount),
          year: currentYear,
          quarter: currentQuarter,
        }, {
          onSuccess: () => {
            setAssignDialogOpen(false);
            setSelectedOrgId(null);
            orgBudgetForm.reset();
          },
        });
      }
    }
  };

  const handleApprove = (requestId: string) => {
    approveMutation.mutate(requestId);
  };

  const handleSignAsBishop = (requestId: string) => {
    setSigningRequestId(requestId);
    setSignerName(user?.name || "");
    setIsSignDialogOpen(true);
  };

  const handleReviewByBishop = (requestId: string, action: "rechazar" | "enmendar") => {
    const label = action === "rechazar" ? "rechazo" : "enmienda";
    const reason = window.prompt(`Indica el motivo de ${label} (mínimo 10 caracteres):`);
    if (!reason || reason.trim().length < 10) {
      return;
    }

    reviewMutation.mutate({ requestId, action, reason: reason.trim() });
  };

  const clearSignatureCanvas = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { x, y } = getCanvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    context.beginPath();
    context.moveTo(x, y);
  };

  const drawSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { x, y } = getCanvasPoint(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const confirmSignature = () => {
    if (!signingRequestId) return;
    const normalizedName = signerName.trim();
    if (!normalizedName) {
      alert("Debes indicar el nombre del obispo.");
      return;
    }

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const signatureDataUrl = canvas.toDataURL("image/png");
    signMutation.mutate(
      { requestId: signingRequestId, signatureDataUrl, signerName: normalizedName },
      {
        onSuccess: () => {
          setIsSignDialogOpen(false);
          setSigningRequestId(null);
        },
      }
    );
  };

  useEffect(() => {
    if (!isSignDialogOpen) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineWidth = 2.8;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "#111827";
    clearSignatureCanvas();
  }, [isSignDialogOpen]);

  const handleDelete = (requestId: string) => {
    if (window.confirm("¿Está seguro de que desea eliminar esta solicitud?")) {
      deleteMutation.mutate(requestId);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      solicitado: { label: "Solicitado", className: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
      aprobado_financiero: { label: "Aprobación financiera", className: "border-blue-500/30 bg-blue-500/15 text-blue-300" },
      pendiente_firma_obispo: { label: "Pendiente firma", className: "border-primary/30 bg-primary/15 text-primary" },
      aprobado: { label: "Aprobado", className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
      en_proceso: { label: "En proceso", className: "border-primary/30 bg-primary/15 text-primary" },
      completado: { label: "Completado", className: "border-teal-500/30 bg-teal-500/15 text-teal-300" },
      rechazada: { label: "Rechazada", className: "border-rose-500/30 bg-rose-500/15 text-rose-300" },
    };
    const config = variants[status] || variants.solicitado;
    return (
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${config.className}`}>
        <span className="h-2 w-2 rounded-full bg-current" />
        {config.label}
      </span>
    );
  };

  const getOrganizationLabel = (type: string) => {
    const labels: Record<string, string> = {
      "hombres_jovenes": "Cuórum del Sacerdocio Aarónico",
      "mujeres_jovenes": "Mujeres Jóvenes",
      "sociedad_socorro": "Sociedad de Socorro",
      "primaria": "Primaria",
      "escuela_dominical": "Escuela Dominical",
      "jas": "Liderazgo JAS",
      "cuorum_elderes": "Cuórum de Élderes",
      "obispado": "Obispado",
    };
    return labels[type] || type;
  };

  const getReceiptLabel = (receipt?: { filename: string; category?: ReceiptCategory }) => {
    if (receipt?.category === "plan") {
      return "Formulario de Solicitud de gastos";
    }
    if (receipt?.category === "expense") {
      return "Comprobante de gasto";
    }
  if (receipt?.category === "signed_plan") {
      return "Solicitud de gasto firmada";
    }

    if (receipt?.category === "receipt") {
      return "Comprobante de compra";
    }
    if (receipt?.category === "bank_justificante") {
      return "Justificante de titularidad bancaria";
    }
    return "Adjunto";
  };

  const hasExpenseReceipts = (request: BudgetRequest) =>
    (request.receipts ?? []).some((receipt) => receipt.category === "expense");

  const hasAdvanceRequestDocument = (request: BudgetRequest) =>
    (request.receipts ?? []).some((receipt) => receipt.category === "plan");

  const isReimbursementRequest = (request: BudgetRequest) =>
    (request.receipts ?? []).some((receipt) => receipt.category === "receipt") && !hasAdvanceRequestDocument(request);

  const shouldShowAddExpenseReceipts = (request: BudgetRequest) => {
    if (hasExpenseReceipts(request)) return false;
    if (isReimbursementRequest(request)) return false;
    return true;
  };

  const downloadReceipt = async (receipt: { filename: string; url?: string }) => {
    if (!receipt.url) {
      return;
    }

    try {
      const response = await fetch(receipt.url, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = receipt.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download error:", err);
      alert("No se pudo descargar el archivo.");
    }
  };

  const openAssignDialog = (orgId: string) => {
    setSelectedOrgId(orgId);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

    const existingBudget = (orgBudgetsByOrg[orgId] || []).find(
      (b: any) => b.year === currentYear && b.quarter === currentQuarter
    );

    if (existingBudget) {
      orgBudgetForm.setValue("amount", existingBudget.amount.toString());
    } else {
      orgBudgetForm.reset();
    }

    setAssignDialogOpen(true);
  };

  const openReceiptsDialog = (request: BudgetRequest) => {
    setSelectedRequest(request);
    setIsReceiptsDialogOpen(true);
    expenseReceiptsForm.reset({ expenseReceipts: [] });
  };

  const totalSolicited = filteredRequests.filter((r: any) => r.status === "solicitado").reduce((sum: number, r: any) => sum + r.amount, 0);
  const totalApproved = filteredRequests.filter((r: any) => r.status === "aprobado" || r.status === "completado").reduce((sum: number, r: any) => sum + r.amount, 0);
  const [activeSection, setActiveSection] = useState<"resumen" | "solicitudes" | "organizaciones">("resumen");
  const [requestStatusFilter, setRequestStatusFilter] = useState<"todas" | "pendientes" | "aprobadas" | "completadas" | "rechazadas">("todas");

  const visibleRequests = filteredRequests.filter((request: any) => {
    switch (requestStatusFilter) {
      case "pendientes":
        return ["solicitado", "pendiente_firma_obispo"].includes(request.status);
      case "aprobadas":
        return ["aprobado", "aprobado_financiero"].includes(request.status);
      case "completadas":
        return request.status === "completado";
      case "rechazadas":
        return request.status === "rechazada";
      default:
        return true;
    }
  });

  const actionRequests = (filteredRequests as any[])
    .filter((r: any) => r.status === "solicitado" || r.status === "pendiente_firma_obispo")
    .slice(0, 3);

  if (requestsLoading || wardBudgetLoading || orgsLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight md:text-5xl">Presupuestos</h1>
          <p className="text-xs text-slate-400 md:text-sm">
            {isOrgMember ? "Control de presupuesto de tu organización" : "Gestiona presupuestos globales y asignaciones"}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          {isObispado && (
            <Dialog open={isBudgetDialogOpen} onOpenChange={setIsBudgetDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="button-edit-ward-budget"
                  variant="outline"
                  size="icon"
                  className="rounded-lg border-[#2b3245] bg-[#171b26] text-slate-300 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#202637] hover:text-white"
                >
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Configurar presupuesto global</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Presupuesto anual y trimestral</DialogTitle>
                  <DialogDescription>
                    Define el presupuesto anual y su desglose por trimestre (en euros)
                  </DialogDescription>
                </DialogHeader>
                <Form {...wardBudgetForm}>
                  <form onSubmit={wardBudgetForm.handleSubmit(onSubmitWardBudget)} className="space-y-4">
                    <FormField
                      control={wardBudgetForm.control}
                      name="annualAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Presupuesto anual (€)</FormLabel>
                          <FormControl>
                            <BudgetCurrencyInput
                              {...field}
                              onBlur={(event) => {
                                field.onChange(formatCurrencyInputValue(event.target.value));
                                field.onBlur();
                              }}
                              data-testid="input-ward-budget-annual"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={wardBudgetForm.control}
                        name="q1Amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trimestre 1 (€)</FormLabel>
                            <FormControl>
                              <BudgetCurrencyInput
                                {...field}
                                onBlur={(event) => {
                                  field.onChange(formatCurrencyInputValue(event.target.value));
                                  field.onBlur();
                                }}
                                data-testid="input-ward-budget-q1"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={wardBudgetForm.control}
                        name="q2Amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trimestre 2 (€)</FormLabel>
                            <FormControl>
                              <BudgetCurrencyInput
                                {...field}
                                onBlur={(event) => {
                                  field.onChange(formatCurrencyInputValue(event.target.value));
                                  field.onBlur();
                                }}
                                data-testid="input-ward-budget-q2"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={wardBudgetForm.control}
                        name="q3Amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trimestre 3 (€)</FormLabel>
                            <FormControl>
                              <BudgetCurrencyInput
                                {...field}
                                onBlur={(event) => {
                                  field.onChange(formatCurrencyInputValue(event.target.value));
                                  field.onBlur();
                                }}
                                data-testid="input-ward-budget-q3"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={wardBudgetForm.control}
                        name="q4Amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trimestre 4 (€)</FormLabel>
                            <FormControl>
                              <BudgetCurrencyInput
                                {...field}
                                onBlur={(event) => {
                                  field.onChange(formatCurrencyInputValue(event.target.value));
                                  field.onBlur();
                                }}
                                data-testid="input-ward-budget-q4"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsBudgetDialogOpen(false)}
                        data-testid="button-cancel-ward-budget"
                      >
                        Cancelar
                      </Button>
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
              <Button
                data-testid="button-create-request"
                className="h-9 rounded-lg border border-primary/40 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.45)] transition-all duration-200 hover:brightness-110"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nueva Solicitud
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Solicitar Presupuesto</DialogTitle>
                <DialogDescription>
                  Crea una nueva solicitud de presupuesto (en euros)
                </DialogDescription>
              </DialogHeader>
              <Form {...budgetForm}>
                <form onSubmit={budgetForm.handleSubmit(onSubmitBudgetRequest)} className="space-y-4">
                  <FormField
                    control={budgetForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descripción</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ej: Material para actividad ..."
                            {...field}
                            data-testid="input-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={budgetForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de gasto</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-budget-category-type">
                              <SelectValue placeholder="Selecciona tipo" />
                            </SelectTrigger>
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

                  {/* ── Categorías dinámicas ── */}
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
                                      <SelectTrigger className="h-8 text-sm" data-testid={`select-budget-category-${index}`}>
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
                                      data-testid={`input-budget-amount-${index}`}
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

                        {/* Campo "Especifique" si se selecciona Otros */}
                        {cat.category === "otros" && (
                          <FormField
                            control={budgetForm.control}
                            name={`budgetCategories.${index}.detail`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    placeholder="Especifique..."
                                    className="h-8 text-sm"
                                    {...field}
                                    data-testid={`input-budget-detail-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    ))}

                    {/* Total calculado */}
                    {watchedCategories.some(c => c.amount) && (
                      <div className="flex justify-end pr-1">
                        <span className="text-xs text-muted-foreground mr-2 self-center">Total:</span>
                        <span className="text-sm font-semibold">
                          € {watchedCategories.reduce((sum, c) => sum + parseBudgetNumber(c.amount), 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  <FormField
                    control={budgetForm.control}
                    name="requestingOrganizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Solicitar a nombre de</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ""}
                          disabled={!isObispado}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-requesting-organization">
                              <SelectValue placeholder="Selecciona una organización" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {requestableOrganizations.map((org) => (
                              <SelectItem key={org.id} value={org.id}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isObispado ? (
                          <p className="text-xs text-muted-foreground">
                            Elige si la solicitud se presenta como Obispado o como Cuórum del Sacerdocio Aarónico (u otra organización).
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

                  <FormField
                    control={budgetForm.control}
                    name="requestType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de solicitud</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-request-type">
                              <SelectValue placeholder="Selecciona un tipo" />
                            </SelectTrigger>
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

                  <FormField
                    control={budgetForm.control}
                    name="activityDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha prevista de la actividad o gasto</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-activity-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* ── PAGAR A ── */}
                  <div className="border-t border-border pt-4">
                    <p className="text-sm font-semibold text-foreground mb-3">Pagar a</p>
                    <FormField
                      control={budgetForm.control}
                      name="pagarA"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre del beneficiario <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre completo de quien recibe el pago" {...field} data-testid="input-pagar-a" />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">Puede ser distinto al solicitante. Se usará como titular en la sección bancaria del PDF.</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* ── DATOS BANCARIOS ── */}
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
                                data-testid={`button-bank-in-system-${val}`}
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
                                  <Input placeholder="Ej: CAIXESBB" {...field} data-testid="input-swift" />
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
                                  <Input placeholder="ES00 0000 0000 0000 0000 0000" {...field} data-testid="input-iban" />
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
                                    id="bank-justificante-file"
                                    type="file"
                                    accept=".jpg,.jpeg,.pdf,.png"
                                    onChange={(e) => field.onChange(e.target.files?.[0] ?? undefined)}
                                    onBlur={field.onBlur}
                                    ref={field.ref}
                                    className="hidden"
                                    data-testid="input-bank-justificante"
                                  />
                                  <Button type="button" variant="outline" className="w-fit" asChild>
                                    <label htmlFor="bank-justificante-file" className="cursor-pointer">
                                      <Upload className="h-4 w-4 mr-2" />
                                      Seleccionar justificante
                                    </label>
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


                  <FormField
                    control={budgetForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Propósito del gasto (Opcional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Detalla el propósito del gasto..."
                            {...field}
                            data-testid="textarea-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                                id="budget-receipt-file"
                                type="file"
                                accept={allowedDocumentExtensions.join(",")}
                                onChange={(event) => field.onChange(event.target.files?.[0] ?? undefined)}
                                onBlur={field.onBlur}
                                ref={field.ref}
                                className="hidden"
                                data-testid="input-receipt-file"
                              />
                              <Button type="button" variant="outline" className="w-fit" asChild>
                                <label htmlFor="budget-receipt-file" className="cursor-pointer">
                                  <Upload className="h-4 w-4 mr-2" />
                                  Seleccionar comprobante
                                </label>
                              </Button>
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

                  {(budgetRequestType === "pago_adelantado" || budgetRequestType === "reembolso") && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
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
                          data-testid="canvas-requester-signature"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <PenLine className="h-3 w-3" />
                        Esta firma quedará registrada en el formulario de solicitud de gastos generado automáticamente.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" data-testid="button-submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Creando..." : "Crear Solicitud"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={isReceiptsDialogOpen}
            onOpenChange={(open) => {
              setIsReceiptsDialogOpen(open);
              if (!open) {
                setSelectedRequest(null);
                expenseReceiptsForm.reset({ expenseReceipts: [] });
              }
            }}
          >
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Adjuntar comprobantes de gasto</DialogTitle>
                <DialogDescription>
                  Sube los comprobantes de gasto asociados a esta solicitud aprobada.
                </DialogDescription>
              </DialogHeader>
              <Form {...expenseReceiptsForm}>
                <form onSubmit={expenseReceiptsForm.handleSubmit(onSubmitExpenseReceipts)} className="space-y-4">
                  <FormField
                    control={expenseReceiptsForm.control}
                    name="expenseReceipts"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comprobantes de gasto</FormLabel>
                        <FormControl>
                          <div className="flex flex-col gap-2">
                            <Input
                              id="expense-receipts"
                              type="file"
                              multiple
                              accept={allowedDocumentExtensions.join(",")}
                              onChange={(event) => field.onChange(Array.from(event.target.files ?? []))}
                              onBlur={field.onBlur}
                              ref={field.ref}
                              className="hidden"
                              data-testid="input-expense-receipts"
                            />
                            <Button type="button" variant="outline" className="w-fit" asChild>
                              <label htmlFor="expense-receipts" className="cursor-pointer">
                                <Upload className="h-4 w-4 mr-2" />
                                Adjuntar comprobantes
                              </label>
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {field.value?.length
                                ? `Archivos seleccionados: ${field.value.length}`
                                : "Ningún archivo seleccionado"}
                            </span>
                          </div>
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Formatos permitidos: JPG, Word (DOC/DOCX) o PDF.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsReceiptsDialogOpen(false)}
                      data-testid="button-cancel-expense-receipts"
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-expense-receipts">
                      {updateMutation.isPending ? "Guardando..." : "Adjuntar"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as "resumen" | "solicitudes" | "organizaciones")}>
        <TabsList className={`mb-6 grid h-auto w-full gap-2 overflow-visible bg-transparent p-0 ${isObispado ? "grid-cols-[0.95fr_1.05fr_1.2fr]" : "grid-cols-[1fr_1.1fr]"}`}>
          <TabsTrigger value="resumen" className="min-w-0 rounded-lg border border-transparent bg-[#171922] px-3 py-2 text-center text-sm font-semibold text-slate-300 shadow-none transition-all duration-200 hover:scale-[1.01] hover:bg-[#202637] hover:text-white data-[state=active]:border-primary/40 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_20px_hsl(var(--primary)/0.45)] md:px-4">Resumen</TabsTrigger>
          <TabsTrigger value="solicitudes" className="min-w-0 rounded-lg border border-transparent bg-[#171922] px-2.5 py-2 text-center text-sm font-semibold text-slate-300 shadow-none transition-all duration-200 hover:scale-[1.01] hover:bg-[#202637] hover:text-white data-[state=active]:border-primary/40 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_20px_hsl(var(--primary)/0.45)] md:px-3.5">
            <span className="truncate">Solicitudes</span>
            <span className={`ml-1.5 inline-flex h-5 min-w-[1.3rem] items-center justify-center rounded-md px-1 text-[11px] font-bold leading-none ${activeSection === "solicitudes" ? "bg-white/25 text-white" : "bg-white/12 text-slate-300"}`}>{filteredRequests.length}</span>
          </TabsTrigger>
          {isObispado ? (
            <TabsTrigger value="organizaciones" className="min-w-0 rounded-lg border border-transparent bg-[#171922] px-2.5 py-2 text-center text-sm font-semibold text-slate-300 shadow-none transition-all duration-200 hover:scale-[1.01] hover:bg-[#202637] hover:text-white data-[state=active]:border-primary/40 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_20px_hsl(var(--primary)/0.45)] md:px-3.5">
              <span className="truncate">Organizaciones</span>
            </TabsTrigger>
          ) : null}
        </TabsList>

      {/* Organization Member Budget Card */}
      {activeSection === "resumen" && isOrgMember && user?.organizationId && (
        (() => {
          const myOrg = (organizations as Organization[]).find((o) => o.id === user.organizationId);
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
          const myBudget = (orgBudgetsByOrg[user.organizationId] || []).find(
            (b: any) => b.year === currentYear && b.quarter === currentQuarter
          );
          const assignedAmount = toBudgetNumber(myBudget?.amount);

          const mySpending = (requests as any[])
            .filter((r: any) => r.organizationId === user.organizationId && (r.status === "aprobado" || r.status === "completado"))
            .reduce((sum: number, r: any) => sum + r.amount, 0);

          const myAvailable = assignedAmount - mySpending;
          const mySpendingPercent = assignedAmount > 0 ? Math.round((mySpending / assignedAmount) * 100) : 0;

          return (
            <Card className="mb-6" data-testid={`card-my-budget-${user.organizationId}`}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Mi Presupuesto</CardTitle>
                  <CardDescription>{myOrg?.name}</CardDescription>
                </div>
                <IconBadge tone="violet">
                  <Euro className="h-4 w-4 text-white" />
                </IconBadge>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Presupuesto Asignado</div>
                    <div className="text-2xl font-bold" data-testid="text-my-assigned">
                      €{assignedAmount.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Gastos Aprobados ({mySpendingPercent}%)</div>
                    <div className="text-2xl font-bold" data-testid="text-my-spending">
                      €{mySpending.toFixed(2)}
                    </div>
                    <Progress value={mySpendingPercent} className="h-1 mt-2" />
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Disponible</div>
                    <div className={`text-2xl font-bold ${myAvailable < 0 ? 'text-red-600' : 'text-green-600'}`} data-testid="text-my-available">
                      €{myAvailable.toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()
      )}

      {/* Global Budget Card - Only for Obispado */}
      {activeSection === "resumen" && isObispado && (
        <>
          <Card className="mb-5">
            <CardContent className="p-6 pb-5">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Presupuesto anual {wardBudget?.year ?? currentYear}</p>
              <div className="text-[42px] font-extrabold leading-none tracking-[-0.03em] text-slate-100" data-testid="text-ward-budget-annual">€{annualBudget.toFixed(2)}</div>
              <div className="mt-7 grid grid-cols-4 gap-1">
                {[1, 2, 3, 4].map((quarter) => (
                  <div key={quarter} className="rounded-xl bg-white/5 px-3 py-3">
                    <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">T{quarter}</p>
                    <p className={`mx-auto w-fit whitespace-nowrap text-[12px] font-extrabold leading-none md:text-[14px] ${quarter === currentQuarter ? "text-primary" : "text-slate-100"}`}>€{quarterBudgets[quarter as 1 | 2 | 3 | 4].toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="mb-5 grid grid-cols-[1.14fr_0.93fr_0.93fr] gap-3">
            <Card>
              <CardContent className="px-[18px] py-4">
                <p className="mb-1.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">Trimestre actual</p>
                <p className="whitespace-nowrap text-[18px] font-extrabold leading-none text-slate-100 md:text-[20px]" data-testid="text-ward-budget-quarter">€{globalBudget.toFixed(2)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">T{currentQuarter}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="px-[18px] py-4">
                <p className="mb-1.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">Solicitado</p>
                <p className="whitespace-nowrap text-[18px] font-extrabold leading-none text-amber-400 md:text-[20px]" data-testid="text-total-solicited">€{totalSolicited.toFixed(2)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{(requests as any[]).filter((r: any) => r.status === "solicitado").length} solicitudes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="px-[18px] py-4">
                <p className="mb-1.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">Aprobado</p>
                <p className="whitespace-nowrap text-[18px] font-extrabold leading-none text-emerald-400 md:text-[20px]" data-testid="text-total-approved">€{totalApproved.toFixed(2)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{(requests as any[]).filter((r: any) => r.status === "aprobado" || r.status === "completado").length} aprobadas</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Uso del trimestre actual</p>
                <p className="text-2xl font-extrabold text-primary">{globalUtilizationPercent}%</p>
              </div>
              <Progress value={globalUtilizationPercent} className="h-1.5" />
              <div className="mt-4 flex items-center justify-between text-sm">
                <p className="text-slate-400">Asignado a orgs: <span className="font-bold text-slate-100">€{totalAssignedToOrgs.toFixed(2)}</span></p>
                <p className={`font-bold ${remainingGlobalBudget < 0 ? "text-rose-400" : "text-emerald-400"}`}>Disponible: €{remainingGlobalBudget.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>

          {actionRequests.length > 0 && (
            <div className="mb-6 space-y-3">
              {actionRequests.map((request: any) => {
                const org = (organizations as Organization[]).find((o) => o.id === request.organizationId);
                return (
                  <Card key={`summary-action-${request.id}`} data-testid={`summary-action-${request.id}`}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-[220px] flex-1">
                        <p className="mb-1 text-[13px] font-semibold leading-tight text-slate-100">{request.description}</p>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(request.status)}
                          <span className="text-[11px] text-slate-500">{org?.name || "Sin organización"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-[18px] font-extrabold leading-none text-slate-100">€{request.amount.toFixed(2)}</p>
                        {request.status === "solicitado" ? (
                          <Button size="sm" className="h-7 rounded-lg bg-emerald-700 px-3 text-[11px] text-emerald-200 hover:bg-emerald-600" onClick={() => handleApprove(request.id)} disabled={approveMutation.isPending}>Aprobar</Button>
                        ) : (
                          <Button size="sm" className="h-7 rounded-lg bg-primary px-3 text-[11px] text-primary-foreground hover:bg-primary/90" onClick={() => handleSignAsBishop(request.id)} disabled={signMutation.isPending}>Firmar</Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Organization Budget Cards - Only for Obispado */}
      {activeSection === "organizaciones" && isObispado && (
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(organizations as Organization[]).map((org: Organization) => {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
              const currentBudget = (orgBudgetsByOrg[org.id] || []).find(
                (b: any) => b.year === currentYear && b.quarter === currentQuarter
              );
              const assignedAmount = toBudgetNumber(currentBudget?.amount);

              // Calculate spending for this organization
              const orgSpending = (requests as any[])
                .filter((r: any) => r.organizationId === org.id && (r.status === "aprobado" || r.status === "completado"))
                .reduce((sum: number, r: any) => sum + r.amount, 0);

              const available = assignedAmount - orgSpending;
              const spendingPercent = assignedAmount > 0 ? Math.round((orgSpending / assignedAmount) * 100) : 0;

              return (
                <Card key={org.id} className="flex flex-col" data-testid={`card-org-budget-${org.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="flex-1">
                      <CardTitle className="text-base">{org.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {getOrganizationLabel(org.type)}
                      </CardDescription>
                    </div>
                    <Dialog open={assignDialogOpen && selectedOrgId === org.id} onOpenChange={(open) => {
                      if (!open) {
                        setSelectedOrgId(null);
                      }
                      setAssignDialogOpen(open);
                    }}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openAssignDialog(org.id)}
                          data-testid={`button-assign-budget-${org.id}`}
                        >
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
                            <FormField
                              control={orgBudgetForm.control}
                              name="amount"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Monto a Asignar (€)</FormLabel>
                                  <FormControl>
                                    <BudgetCurrencyInput
                                      {...field}
                                      onBlur={(event) => {
                                        field.onChange(formatCurrencyInputValue(event.target.value));
                                        field.onBlur();
                                      }}
                                      data-testid={`input-assign-amount-${org.id}`}
                                    />
                                  </FormControl>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Máximo disponible: €{(remainingGlobalBudget + assignedAmount).toFixed(2)}
                                  </p>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setAssignDialogOpen(false)}
                                data-testid={`button-cancel-assign-${org.id}`}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="submit"
                                data-testid={`button-save-assign-${org.id}`}
                                disabled={createOrgBudgetMutation.isPending || updateOrgBudgetMutation.isPending}
                              >
                                {createOrgBudgetMutation.isPending || updateOrgBudgetMutation.isPending ? "Guardando..." : "Guardar"}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Presupuesto Asignado</div>
                      <div className="text-2xl font-bold" data-testid={`text-org-amount-${org.id}`}>
                        €{assignedAmount.toFixed(2)}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Gastos Aprobados ({spendingPercent}%)</span>
                        <span className="font-semibold" data-testid={`text-org-spending-${org.id}`}>
                          €{orgSpending.toFixed(2)}
                        </span>
                      </div>
                      <Progress value={spendingPercent} className="h-2" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Disponible</span>
                        <span className={`font-semibold ${available < 0 ? 'text-red-600' : 'text-green-600'}`} data-testid={`text-org-available-${org.id}`}>
                          €{available.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats cards moved into Resumen hero layout */}

      {activeSection === "solicitudes" && (
      <>
      <div className="mb-4 flex w-full items-center justify-between gap-1">
        {[
          ["todas", "Todas"],
          ["pendientes", "Pendientes"],
          ["aprobadas", "Aprobadas"],
          ["completadas", "Completadas"],
          ["rechazadas", "Rechazadas"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setRequestStatusFilter(value as "todas" | "pendientes" | "aprobadas" | "completadas" | "rechazadas")}
            className={requestStatusFilter === value ? "whitespace-nowrap rounded-full border border-primary/70 bg-[#171b26] px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.35)]" : "whitespace-nowrap rounded-full border border-slate-700/60 bg-[#171b26] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition-colors hover:bg-[#1f2534]"}
          >
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {visibleRequests.length > 0 ? (
          (visibleRequests as any[]).map((request: any) => {
            const org = (organizations as Organization[]).find((o) => o.id === request.organizationId);
            const accent = request.status === "aprobado" || request.status === "completado"
              ? "from-emerald-500/45"
              : request.status === "pendiente_firma_obispo"
                ? "from-primary/45"
                : request.status === "rechazada"
                  ? "from-rose-500/45"
                  : "from-amber-500/45";

            return (
              <Card key={request.id} className={highlightedRequestId === request.id ? "ring-2 ring-white/70" : ""} data-testid={`row-request-${request.id}`}>
                <div className="p-6">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {getStatusBadge(request.status)}
                        {org && <span className="text-sm text-slate-500">{org.name}</span>}
                      </div>
                      <p className="text-lg font-semibold leading-tight text-foreground md:text-xl">{request.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground md:text-sm">
                        <span>{new Date(request.createdAt).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "numeric" })}</span>
                        {((request.receipts && request.receipts.length > 0) || request.bishopSignedPlanUrl) && (
                          <button
                            type="button"
                            onClick={() => setAttachmentsDialogRequest(request)}
                            className="inline-flex items-center gap-1.5 text-primary transition-colors hover:opacity-90"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            {(() => {
                              const count = (request.receipts?.length ?? 0) + (request.bishopSignedPlanUrl ? 1 : 0);
                              return <span>{count} adjunto{count > 1 ? "s" : ""}</span>;
                            })()}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-3xl font-extrabold tracking-tight text-slate-100 md:text-4xl">€{request.amount.toFixed(2)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canApprove && request.status === "solicitado" && (
                      <Button size="sm" className="bg-emerald-700 text-emerald-200 hover:bg-emerald-600" onClick={() => handleApprove(request.id)} data-testid={`button-approve-${request.id}`} disabled={approveMutation.isPending}>Aprobar</Button>
                    )}
                    {user?.role === "obispo" && request.status === "pendiente_firma_obispo" && (
                      <>
                        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleSignAsBishop(request.id)} data-testid={`button-sign-budget-${request.id}`} disabled={signMutation.isPending || reviewMutation.isPending}>Firmar</Button>
                        <Button size="sm" variant="secondary" onClick={() => handleReviewByBishop(request.id, "enmendar")} data-testid={`button-amend-budget-${request.id}`} disabled={signMutation.isPending || reviewMutation.isPending}>Enmendar</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleReviewByBishop(request.id, "rechazar")} data-testid={`button-reject-budget-${request.id}`} disabled={signMutation.isPending || reviewMutation.isPending}>Rechazar</Button>
                      </>
                    )}
                    {request.status === "aprobado" && request.requestedBy === user?.id && shouldShowAddExpenseReceipts(request) && (
                      <Button size="sm" variant="secondary" onClick={() => openReceiptsDialog(request)} data-testid={`button-add-expense-receipts-${request.id}`}>Adjuntar comprobante</Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(request.id)} data-testid={`button-delete-budget-${request.id}`} disabled={deleteMutation.isPending}>Eliminar</Button>
                    )}
                  </div>

                  <div className={`mt-5 h-px bg-gradient-to-r ${accent} to-transparent`} />
                </div>
              </Card>
            );
          })
        ) : (
          <Card>
            <div className="p-10 text-center text-sm text-muted-foreground">No hay solicitudes de presupuesto</div>
          </Card>
        )}
      </div>
      </>
      )}
      </Tabs>

      <Dialog
        open={Boolean(attachmentsDialogRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setAttachmentsDialogRequest(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adjuntos de la solicitud</DialogTitle>
            <DialogDescription>
              {attachmentsDialogRequest?.description || "Revisa y descarga los documentos adjuntos."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {attachmentsDialogRequest?.bishopSignedPlanUrl && (
              <button
                type="button"
                onClick={() => void downloadReceipt({
                  filename: attachmentsDialogRequest.bishopSignedPlanFilename ?? "plan_firmado.pdf",
                  url: attachmentsDialogRequest.bishopSignedPlanUrl,
                })}
                className="flex w-full items-start gap-2 rounded-md border border-slate-700/50 bg-[#171b26] px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-[#1f2534]"
              >
                <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate">
                  Plan firmado por obispo: {attachmentsDialogRequest.bishopSignedPlanFilename ?? "plan_firmado.pdf"}
                </span>
              </button>
            )}
            {attachmentsDialogRequest?.receipts?.length ? (
              attachmentsDialogRequest.receipts.map((receipt, index) => (
                <button
                  key={`${attachmentsDialogRequest.id}-dialog-receipt-${index}`}
                  type="button"
                  onClick={() => void downloadReceipt(receipt)}
                  className="flex w-full items-start gap-2 rounded-md border border-slate-700/50 bg-[#171b26] px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-[#1f2534]"
                >
                  <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 truncate">{getReceiptLabel(receipt)}: {receipt.filename}</span>
                </button>
              ))
            ) : !attachmentsDialogRequest?.bishopSignedPlanUrl ? (
              <p className="text-sm text-muted-foreground">No hay adjuntos disponibles.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isSignDialogOpen}
        onOpenChange={(open) => {
          setIsSignDialogOpen(open);
          if (!open) {
            setSigningRequestId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Firmar solicitud de gasto</DialogTitle>
            <DialogDescription>
              Dibuja la firma en el recuadro. Se estampará en la posición fija del PDF junto al nombre y fecha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre del obispo</label>
              <Input value={signerName} onChange={(event) => setSignerName(event.target.value)} />
            </div>

            <div className="rounded-md border border-dashed p-3">
              <canvas
                ref={signatureCanvasRef}
                width={700}
                height={220}
                className="h-44 w-full rounded border bg-white"
                style={{ touchAction: "none" }}
                onPointerDown={startDrawing}
                onPointerMove={drawSignature}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
                data-testid="canvas-bishop-signature"
              />
            </div>

            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" onClick={clearSignatureCanvas}>
                Limpiar firma
              </Button>
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
