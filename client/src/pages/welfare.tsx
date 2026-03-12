import { useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Euro, Paperclip, PenLine, RotateCcw, Trash2, Upload, Heart, Loader2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useWelfareRequests,
  useCreateWelfareRequest,
  useUpdateWelfareRequest,
  useSignWelfareRequestAsBishop,
  useReviewWelfareRequestAsBishop,
  useDeleteWelfareRequest,
  useOrganizations,
  useMembers,
  useUsers,
} from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth-tokens";
import { useSearch } from "wouter";

const allowedDocumentExtensions = [".jpg", ".jpeg", ".pdf", ".doc", ".docx"];

const MemberAutocomplete = ({
  value, options, placeholder, onChange, onBlur, testId,
}: {
  value: string; options: string[]; placeholder?: string;
  onChange: (v: string) => void; onBlur?: () => void; testId?: string;
}) => {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return options.slice(0, 50);
    return options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 50);
  }, [options, value]);

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        data-testid={testId}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 150); onBlur?.(); }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg text-sm">
          {filtered.map((name) => (
            <li
              key={name}
              className="px-3 py-2 cursor-pointer hover:bg-accent truncate"
              onMouseDown={(e) => { e.preventDefault(); onChange(name); setOpen(false); }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const WelfareCurrencyInput = ({ className, ...props }: ComponentProps<typeof Input>) => (
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

const parseWelfareNumber = (value: string) => {
  const normalized = value.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isAllowedDocument = (file: File) => {
  const fileName = file.name.toLowerCase();
  return allowedDocumentExtensions.some((ext) => fileName.endsWith(ext));
};

const WELFARE_CATEGORY_OPTIONS = [
  { value: "gastos_comida",      label: "Ofrendas de Ayuno - Gastos Comida" },
  { value: "gastos_alojamiento", label: "Ofrendas de Ayuno - Gastos Alojamiento" },
  { value: "gastos_medicos",     label: "Ofrendas de Ayuno - Gastos Médicos" },
  { value: "otros_gastos",       label: "Ofrendas de Ayuno - Otros Gastos" },
  { value: "gastos_servicios",   label: "Ofrendas de Ayuno - Gastos Agua, Gas, Electricidad" },
] as const;

const welfareCategorySchema = z.object({
  category: z.string().min(1, "Selecciona una categoría"),
  amount: z.string().min(1, "El monto es requerido"),
  detail: z.string().optional(),
});

const welfareSchema = z.object({
  description: z.string().min(1, "La descripción es requerida"),
  requestType: z.enum(["reembolso", "pago_adelantado"]),
  activityDate: z.string().min(1, "La fecha prevista es requerida"),
  notes: z.string().optional(),
  welfareCategories: z.array(welfareCategorySchema).min(1, "Añade al menos una categoría"),
  favorDe: z.string().min(1, "Selecciona el miembro a favor de quien se solicita"),
  solicitarANombreDe: z.string().optional(),
  bankInSystem: z.boolean({ required_error: "Indica si los datos bancarios están en el sistema de la Iglesia" }),
  swift: z.string().optional(),
  iban: z.string().optional(),
  bankJustificanteFile: z
    .instanceof(File)
    .optional()
    .refine((file) => !file || isAllowedDocument(file), {
      message: "Adjunta un archivo .jpg, .jpeg o .pdf válido.",
    }),
  selfSufficiencyPlanFile: z
    .instanceof(File, { message: "El plan de autosuficiencia es requerido" })
    .refine((file) => isAllowedDocument(file), {
      message: "Adjunta un archivo .jpg, .jpeg, .pdf, .doc o .docx válido.",
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
  data.welfareCategories.forEach((cat, i) => {
    if (cat.category === "otros_gastos" && !cat.detail?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["welfareCategories", i, "detail"],
        message: "Especifica el detalle para la categoría Otros Gastos.",
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

type WelfareFormValues = z.infer<typeof welfareSchema>;

type ReceiptCategory = "autosuficiencia" | "receipt" | "bank_justificante";

interface WelfareRequest {
  id: string;
  description: string;
  amount: number | string;
  status: "solicitado" | "aprobado" | "rechazada";
  requestedBy: string;
  organizationId?: string;
  activityDate?: string;
  bishopSignedPlanFilename?: string;
  bishopSignedPlanUrl?: string;
  notes?: string;
  receipts?: { filename: string; url: string; category?: ReceiptCategory }[];
  welfareCategoriesJson?: { category: string; amount: string; detail?: string }[];
  pagarA?: string;
  favorDe?: string;
  bankData?: { bankInSystem: boolean; swift?: string; iban?: string };
  applicantSignatureDataUrl?: string;
  createdAt: string;
}

export default function WelfarePage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSignDialogOpen, setIsSignDialogOpen] = useState(false);
  const [signingRequestId, setSigningRequestId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [activeSection, setActiveSection] = useState<"resumen" | "solicitudes">("resumen");
  const [requestStatusFilter, setRequestStatusFilter] = useState<"todas" | "pendientes" | "aprobadas" | "rechazadas">("todas");
  const [attachmentsDialogRequest, setAttachmentsDialogRequest] = useState<WelfareRequest | null>(null);
  const [welfareUploadState, setWelfareUploadState] = useState<{
    selfSufficiency: "idle" | "uploading" | "done";
    receipt: "idle" | "uploading" | "done";
    bankJustificante: "idle" | "uploading" | "done";
  }>({ selfSufficiency: "idle", receipt: "idle", bankJustificante: "idle" });
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
  const { data: requests = [] as WelfareRequest[], isLoading: requestsLoading } = useWelfareRequests();
  const { data: organizations = [] as any[] } = useOrganizations();
  const { data: allMembers = [] as any[] } = useMembers();
  const { data: allUsers = [] as any[] } = useUsers();

  const createMutation = useCreateWelfareRequest();
  const updateMutation = useUpdateWelfareRequest();
  const signMutation = useSignWelfareRequestAsBishop();
  const reviewMutation = useReviewWelfareRequestAsBishop();
  const deleteMutation = useDeleteWelfareRequest();

  const isObispo = user?.role === "obispo";
  const isOrgPresident = user?.role === "presidente_organizacion";
  const isSecretarioFinanciero = user?.role === "secretario_financiero";

  const userOrg = useMemo(() => (organizations as any[]).find((o: any) => o.id === user?.organizationId), [organizations, user?.organizationId]);
  const isWelfareOrg = userOrg?.type === "sociedad_socorro" || userOrg?.type === "cuorum_elderes";
  const canCreate = isObispo || (isOrgPresident && isWelfareOrg);

  const memberOptions = useMemo(
    () => (allMembers as any[]).map((m: any) => m.nameSurename ?? m.name ?? "").filter(Boolean) as string[],
    [allMembers]
  );

  const welfareOrgPresidents = useMemo(() => {
    const welfareOrgIds = (organizations as any[])
      .filter((o: any) => o.type === "sociedad_socorro" || o.type === "cuorum_elderes")
      .map((o: any) => o.id);
    return (allUsers as any[]).filter(
      (u: any) => u.role === "presidente_organizacion" && welfareOrgIds.includes(u.organizationId)
    );
  }, [organizations, allUsers]);

  const filteredRequests = useMemo(() => {
    if (isObispo || isSecretarioFinanciero) return requests as WelfareRequest[];
    return (requests as WelfareRequest[]).filter((r) => r.organizationId === user?.organizationId);
  }, [requests, isObispo, user?.organizationId]);

  useEffect(() => {
    if (!highlightedRequestId) return;
    setActiveSection("solicitudes");
    const row = document.querySelector(`[data-request-id="${highlightedRequestId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedRequestId, filteredRequests]);

  const visibleRequests = filteredRequests.filter((request) => {
    switch (requestStatusFilter) {
      case "pendientes": return request.status === "solicitado";
      case "aprobadas": return request.status === "aprobado";
      case "rechazadas": return request.status === "rechazada";
      default: return true;
    }
  });

  const actionRequests = filteredRequests.filter((r) => r.status === "solicitado").slice(0, 5);

  const totalSolicited = filteredRequests.filter((r) => r.status === "solicitado").reduce((sum, r) => sum + Number(r.amount), 0);
  const totalApproved = filteredRequests.filter((r) => r.status === "aprobado").reduce((sum, r) => sum + Number(r.amount), 0);
  const totalRechazadas = filteredRequests.filter((r) => r.status === "rechazada").length;

  const welfareForm = useForm<WelfareFormValues>({
    resolver: zodResolver(welfareSchema),
    defaultValues: {
      description: "",
      requestType: "pago_adelantado",
      activityDate: "",
      notes: "",
      welfareCategories: [{ category: "", amount: "", detail: "" }],
      favorDe: "",
      solicitarANombreDe: "",
      bankInSystem: undefined,
      swift: "",
      iban: "",
      bankJustificanteFile: undefined,
      selfSufficiencyPlanFile: undefined,
      receiptFile: undefined,
    },
  });

  const watchedRequestType = welfareForm.watch("requestType");
  const watchedCategories = welfareForm.watch("welfareCategories");
  const watchedBankInSystem = welfareForm.watch("bankInSystem");

  const uploadFile = async (file: File) => {
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

  // Requester signature canvas helpers
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

  useEffect(() => {
    if (!isDialogOpen) return;
    const timer = setTimeout(() => initRequesterCanvas(), 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen]);

  const onSubmitWelfareRequest = async (data: WelfareFormValues) => {
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

    const parsedAmount = data.welfareCategories.reduce((sum, cat) => sum + parseWelfareNumber(cat.amount), 0);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      alert("El importe total debe ser mayor que cero.");
      return;
    }

    const uploadedReceipts: { filename: string; url: string; category: ReceiptCategory }[] = [];

    // Always upload self-sufficiency plan
    try {
      setWelfareUploadState(s => ({ ...s, selfSufficiency: "uploading" }));
      const uploaded = await uploadFile(data.selfSufficiencyPlanFile);
      setWelfareUploadState(s => ({ ...s, selfSufficiency: "done" }));
      uploadedReceipts.push({ filename: uploaded.filename, url: uploaded.url, category: "autosuficiencia" });
    } catch {
      setWelfareUploadState(s => ({ ...s, selfSufficiency: "idle" }));
      alert("No se pudo subir el plan de autosuficiencia. Intenta nuevamente.");
      return;
    }

    if (data.requestType === "reembolso" && data.receiptFile) {
      try {
        setWelfareUploadState(s => ({ ...s, receipt: "uploading" }));
        const uploaded = await uploadFile(data.receiptFile);
        setWelfareUploadState(s => ({ ...s, receipt: "done" }));
        uploadedReceipts.push({ filename: uploaded.filename, url: uploaded.url, category: "receipt" });
      } catch {
        setWelfareUploadState(s => ({ ...s, receipt: "idle" }));
        alert("No se pudo subir el comprobante. Intenta nuevamente.");
        return;
      }
    }

    if (!data.bankInSystem && data.bankJustificanteFile) {
      try {
        setWelfareUploadState(s => ({ ...s, bankJustificante: "uploading" }));
        const uploaded = await uploadFile(data.bankJustificanteFile);
        setWelfareUploadState(s => ({ ...s, bankJustificante: "done" }));
        uploadedReceipts.push({ filename: uploaded.filename, url: uploaded.url, category: "bank_justificante" });
      } catch {
        setWelfareUploadState(s => ({ ...s, bankJustificante: "idle" }));
        alert("No se pudo subir el justificante bancario. Intenta nuevamente.");
        return;
      }
    }

    createMutation.mutate(
      {
        description: data.description,
        amount: String(parsedAmount),
        status: "solicitado",
        activityDate: data.activityDate ? new Date(`${data.activityDate}T00:00:00`) : null,
        notes: data.notes || "",
        receipts: uploadedReceipts,
        applicantSignatureDataUrl: signatureDataUrl,
        requestType: data.requestType,
        welfareCategoriesJson: data.welfareCategories,
        bankData: {
          bankInSystem: data.bankInSystem ?? false,
          swift: data.swift || undefined,
          iban: data.iban || undefined,
        },
        pagarA: (isObispo && data.solicitarANombreDe) ? data.solicitarANombreDe : (user?.name || undefined),
        favorDe: data.favorDe || undefined,
      },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
          clearRequesterSignatureCanvas();
          welfareForm.reset({
            description: "",
            requestType: "pago_adelantado",
            activityDate: "",
            notes: "",
            welfareCategories: [{ category: "", amount: "", detail: "" }],
            favorDe: "",
            solicitarANombreDe: "",
            bankInSystem: undefined,
            swift: "",
            iban: "",
            bankJustificanteFile: undefined,
            selfSufficiencyPlanFile: undefined,
            receiptFile: undefined,
          });
        },
      }
    );
  };

  // Bishop sign canvas helpers
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

  const handleSignAsBishop = (requestId: string) => {
    setSigningRequestId(requestId);
    setSignerName(user?.name || "");
    setIsSignDialogOpen(true);
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

  const handleReviewByBishop = (requestId: string, action: "rechazar" | "enmendar") => {
    const label = action === "rechazar" ? "rechazo" : "enmienda";
    const reason = window.prompt(`Indica el motivo de ${label} (mínimo 10 caracteres):`);
    if (!reason || reason.trim().length < 10) return;
    reviewMutation.mutate({ requestId, action, reason: reason.trim() });
  };

  const handleDelete = (requestId: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar esta solicitud?")) {
      deleteMutation.mutate(requestId);
    }
  };

  const downloadFile = async (file: { filename: string; url?: string }) => {
    if (!file.url) return;
    try {
      const response = await fetch(file.url, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      alert("No se pudo descargar el archivo.");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      solicitado: { label: "Solicitado", className: "border-amber-500/30 bg-amber-500/15 text-amber-300" },
      aprobado: { label: "Aprobado", className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" },
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

  const getReceiptLabel = (category?: string) => {
    if (category === "autosuficiencia") return "Plan de Autosuficiencia";
    if (category === "receipt") return "Comprobante de compra";
    if (category === "bank_justificante") return "Justificante de titularidad bancaria";
    return "Adjunto";
  };

  if (requestsLoading) {
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

  if (!canCreate && !isObispo && !isSecretarioFinanciero) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Heart className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">Sin acceso al módulo de Bienestar</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Solo el obispo, el secretario financiero y los presidentes de Sociedad de Socorro o Cuórum de Élderes pueden acceder a este módulo.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight md:text-5xl">
            Bienestar
          </h1>
          <p className="text-xs text-slate-400 md:text-sm">
            Solicitudes de ayuda con Ofrendas de Ayuno
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          {canCreate && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setWelfareUploadState({ selfSufficiency: "idle", receipt: "idle", bankJustificante: "idle" }); }}>
              <DialogTrigger asChild>
                <Button
                  data-testid="button-create-welfare-request"
                  className="h-9 rounded-lg border border-primary/40 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.45)] transition-all duration-200 hover:brightness-110"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Solicitud
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Solicitar Ayuda de Bienestar</DialogTitle>
                  <DialogDescription>
                    Crea una nueva solicitud de ayuda con Ofrendas de Ayuno (en euros)
                  </DialogDescription>
                </DialogHeader>
                <Form {...welfareForm}>
                  <form onSubmit={welfareForm.handleSubmit(onSubmitWelfareRequest)} className="space-y-4">
                    {/* 0. Solicitar a nombre de (bishop only) */}
                    {isObispo && (
                      <FormField
                        control={welfareForm.control}
                        name="solicitarANombreDe"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Solicitar a nombre de</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-welfare-solicitar-nombre">
                                  <SelectValue placeholder="Selecciona un líder..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {welfareOrgPresidents.map((u: any) => (
                                  <SelectItem key={u.id} value={u.name}>
                                    {u.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">El nombre del líder seleccionado aparecerá como solicitante y perceptor de la transferencia.</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* 0b. Solicitud a favor de */}
                    <FormField
                      control={welfareForm.control}
                      name="favorDe"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Solicitud a favor de <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <MemberAutocomplete
                              value={field.value}
                              options={memberOptions}
                              placeholder="Buscar miembro..."
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              testId="input-welfare-favor-de"
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">Miembro que solicita la ayuda.</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 1. Description */}
                    <FormField
                      control={welfareForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción del caso</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe brevemente el caso y la necesidad..."
                              {...field}
                              data-testid="input-welfare-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 2. Categories and amounts */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Categorías y montos</p>
                      {watchedCategories.map((_, index) => (
                        <div key={index} className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <FormField
                              control={welfareForm.control}
                              name={`welfareCategories.${index}.category`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Categoría</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Selecciona..." />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {WELFARE_CATEGORY_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={welfareForm.control}
                              name={`welfareCategories.${index}.amount`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Monto (€)</FormLabel>
                                  <FormControl>
                                    <WelfareCurrencyInput
                                      {...field}
                                      onBlur={(e) => {
                                        field.onChange(formatCurrencyInputValue(e.target.value));
                                        field.onBlur();
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          {watchedCategories[index]?.category === "otros_gastos" && (
                            <FormField
                              control={welfareForm.control}
                              name={`welfareCategories.${index}.detail`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Especifique</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Detalla el concepto..." {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                          {watchedCategories.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive"
                              onClick={() => {
                                const current = welfareForm.getValues("welfareCategories");
                                welfareForm.setValue("welfareCategories", current.filter((_, i) => i !== index));
                              }}
                            >
                              <Trash2 className="mr-1 h-3 w-3" /> Eliminar
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          const current = welfareForm.getValues("welfareCategories");
                          welfareForm.setValue("welfareCategories", [...current, { category: "", amount: "", detail: "" }]);
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Añadir categoría
                      </Button>
                      {welfareForm.formState.errors.welfareCategories && (
                        <p className="text-xs text-destructive">{welfareForm.formState.errors.welfareCategories.message}</p>
                      )}
                    </div>

                    {/* 3. Request type */}
                    <FormField
                      control={welfareForm.control}
                      name="requestType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de solicitud</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-welfare-request-type">
                                <SelectValue placeholder="Selecciona tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pago_adelantado">Pago por adelantado</SelectItem>
                              <SelectItem value="reembolso">Reembolso</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 4. Activity date */}
                    <FormField
                      control={welfareForm.control}
                      name="activityDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha prevista del gasto</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-welfare-activity-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 6. Bank data */}
                    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3">
                      <p className="text-sm font-medium">Datos bancarios</p>
                      <FormField
                        control={welfareForm.control}
                        name="bankInSystem"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">¿Los datos bancarios están en el sistema de la Iglesia (LCR/CUFS)?</FormLabel>
                            <Select
                              onValueChange={(v) => field.onChange(v === "true")}
                              value={field.value === undefined ? "" : String(field.value)}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="true">Sí, están registrados</SelectItem>
                                <SelectItem value="false">No, los introduzco manualmente</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {watchedBankInSystem === false && (
                        <>
                          <FormField
                            control={welfareForm.control}
                            name="swift"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">SWIFT / BIC (opcional)</FormLabel>
                                <FormControl>
                                  <Input placeholder="XXXXESXX" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={welfareForm.control}
                            name="iban"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">IBAN</FormLabel>
                                <FormControl>
                                  <Input placeholder="ES00 0000 0000 00 0000000000" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={welfareForm.control}
                            name="bankJustificanteFile"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Justificante de titularidad bancaria</FormLabel>
                                <FormControl>
                                  <div className="flex flex-col gap-2">
                                    <Input
                                      id="welfare-bank-justificante-file"
                                      type="file"
                                      accept=".jpg,.jpeg,.pdf"
                                      onChange={(e) => field.onChange(e.target.files?.[0])}
                                      className="hidden"
                                    />
                                    <Button
                                      type="button"
                                      variant={welfareUploadState.bankJustificante === "done" ? "default" : "outline"}
                                      className="w-fit"
                                      disabled={welfareUploadState.bankJustificante === "uploading"}
                                      onClick={() => (document.getElementById("welfare-bank-justificante-file") as HTMLInputElement)?.click()}
                                    >
                                      {welfareUploadState.bankJustificante === "uploading" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                                      {welfareUploadState.bankJustificante === "uploading" ? "Subiendo..." : "Seleccionar justificante"}
                                    </Button>
                                    <span className="text-xs text-muted-foreground">
                                      {field.value ? `Archivo seleccionado: ${(field.value as File).name}` : "Ningún archivo seleccionado"}
                                    </span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}
                    </div>

                    {/* 7. Notes */}
                    <FormField
                      control={welfareForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Observaciones (opcional)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Información adicional..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 8. Self-sufficiency plan (always required) */}
                    <FormField
                      control={welfareForm.control}
                      name="selfSufficiencyPlanFile"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            <Paperclip className="h-3.5 w-3.5" />
                            Plan de Autosuficiencia <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <div className="flex flex-col gap-2">
                              <Input
                                id="welfare-self-sufficiency-plan-file"
                                type="file"
                                accept={allowedDocumentExtensions.join(",")}
                                onChange={(e) => field.onChange(e.target.files?.[0])}
                                data-testid="input-welfare-self-sufficiency-plan"
                                className="hidden"
                              />
                              <Button
                                type="button"
                                variant={welfareUploadState.selfSufficiency === "done" || createMutation.isPending ? "default" : "outline"}
                                className="w-fit"
                                disabled={welfareUploadState.selfSufficiency === "uploading" || createMutation.isPending}
                                onClick={() => (document.getElementById("welfare-self-sufficiency-plan-file") as HTMLInputElement)?.click()}
                              >
                                {welfareUploadState.selfSufficiency === "uploading" || createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Paperclip className="h-4 w-4 mr-2" />}
                                {welfareUploadState.selfSufficiency === "uploading" ? "Subiendo..." : createMutation.isPending ? "Enviando..." : "Seleccionar plan"}
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                {field.value ? `Archivo seleccionado: ${(field.value as File).name}` : "Ningún archivo seleccionado"}
                              </span>
                            </div>
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Adjunta el plan de autosuficiencia del beneficiario. Formatos permitidos: JPG, Word (DOC/DOCX) o PDF.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 9. Receipts (required only for reembolso) */}
                    {watchedRequestType === "reembolso" && (
                      <FormField
                        control={welfareForm.control}
                        name="receiptFile"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-1">
                              <Upload className="h-3.5 w-3.5" />
                              Comprobante de compra <span className="text-destructive">*</span>
                            </FormLabel>
                            <p className="text-xs text-muted-foreground">Requerido para solicitudes de reembolso</p>
                            <FormControl>
                              <div className="flex flex-col gap-2">
                                <Input
                                  id="welfare-receipt-file"
                                  type="file"
                                  accept={allowedDocumentExtensions.join(",")}
                                  onChange={(e) => field.onChange(e.target.files?.[0])}
                                  data-testid="input-welfare-receipt"
                                  className="hidden"
                                />
                                <Button
                                  type="button"
                                  variant={welfareUploadState.receipt === "done" || createMutation.isPending ? "default" : "outline"}
                                  className="w-fit"
                                  disabled={welfareUploadState.receipt === "uploading" || createMutation.isPending}
                                  onClick={() => (document.getElementById("welfare-receipt-file") as HTMLInputElement)?.click()}
                                >
                                  {welfareUploadState.receipt === "uploading" || createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                                  {welfareUploadState.receipt === "uploading" ? "Subiendo..." : createMutation.isPending ? "Enviando..." : "Seleccionar comprobante"}
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                  {field.value ? `Archivo seleccionado: ${(field.value as File).name}` : "Ningún archivo seleccionado"}
                                </span>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* 10. Requester signature */}
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
                        />
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <PenLine className="h-3 w-3" />
                        Firma en el recuadro para confirmar la solicitud
                      </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-welfare-request">
                        {createMutation.isPending ? "Enviando..." : "Enviar solicitud"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as "resumen" | "solicitudes")} className="mb-6">
        <TabsList className="rounded-xl">
          <TabsTrigger value="resumen" className="rounded-lg">Resumen</TabsTrigger>
          <TabsTrigger value="solicitudes" className="rounded-lg">Solicitudes</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeSection === "resumen" && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="rounded-2xl border-border/60">
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
                    <Euro className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Solicitado</p>
                    <p className="text-xl font-bold">€{totalSolicited.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{filteredRequests.filter((r) => r.status === "solicitado").length} solicitudes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/60">
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
                    <Heart className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Aprobado</p>
                    <p className="text-xl font-bold">€{totalApproved.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{filteredRequests.filter((r) => r.status === "aprobado").length} solicitudes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/60">
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15">
                    <Trash2 className="h-5 w-5 text-rose-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rechazadas</p>
                    <p className="text-xl font-bold">{totalRechazadas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action items for bishop */}
          {isObispo && actionRequests.length > 0 && (
            <Card className="rounded-2xl border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pendientes de firma</CardTitle>
                <CardDescription>Solicitudes que requieren tu firma</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {actionRequests.map((request) => (
                  <div key={request.id} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{request.description}</p>
                      <p className="text-xs text-muted-foreground">€{Number(request.amount).toFixed(2)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={() => handleSignAsBishop(request.id)}
                        disabled={!request.applicantSignatureDataUrl}
                      >
                        <PenLine className="mr-1 h-3.5 w-3.5" /> Firmar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => handleReviewByBishop(request.id, "enmendar")}
                      >
                        Enmendar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="rounded-full"
                        onClick={() => handleReviewByBishop(request.id, "rechazar")}
                      >
                        Rechazar
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {filteredRequests.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 py-16 text-center">
              <Heart className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No hay solicitudes de bienestar aún.</p>
              {canCreate && (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Nueva solicitud
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {activeSection === "solicitudes" && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex flex-wrap gap-2">
            {(["todas", "pendientes", "aprobadas", "rechazadas"] as const).map((filter) => (
              <Button
                key={filter}
                variant={requestStatusFilter === filter ? "default" : "outline"}
                size="sm"
                className="rounded-full capitalize"
                onClick={() => setRequestStatusFilter(filter)}
              >
                {filter}
              </Button>
            ))}
          </div>

          {visibleRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 py-16 text-center">
              <Heart className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No hay solicitudes que mostrar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleRequests.map((request) => {
                const accent = request.status === "aprobado"
                  ? "from-emerald-500/45"
                  : request.status === "rechazada"
                    ? "from-rose-500/45"
                    : "from-amber-500/45";
                const attachmentCount = (request.receipts?.length ?? 0) + (request.bishopSignedPlanUrl ? 1 : 0);
                return (
                  <Card
                    key={request.id}
                    data-request-id={request.id}
                    className={highlightedRequestId === request.id ? "ring-2 ring-white/70" : ""}
                  >
                    <div className="p-6">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {getStatusBadge(request.status)}
                            {request.favorDe && (
                              <span className="text-sm text-slate-500">{request.favorDe}</span>
                            )}
                          </div>
                          <p className="text-lg font-semibold leading-tight text-foreground md:text-xl">{request.description}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground md:text-sm">
                            <span>{new Date(request.createdAt).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "numeric" })}</span>
                            {attachmentCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setAttachmentsDialogRequest(request)}
                                className="inline-flex items-center gap-1.5 text-primary transition-colors hover:opacity-90"
                              >
                                <Paperclip className="h-3.5 w-3.5" />
                                <span>{attachmentCount} adjunto{attachmentCount > 1 ? "s" : ""}</span>
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-3xl font-extrabold tracking-tight text-slate-100 md:text-4xl">€{Number(request.amount).toFixed(2)}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {isObispo && request.status === "solicitado" && (
                          <>
                            <Button
                              size="sm"
                              className="bg-primary text-primary-foreground hover:bg-primary/90"
                              onClick={() => handleSignAsBishop(request.id)}
                              disabled={!request.applicantSignatureDataUrl || signMutation.isPending}
                              title={!request.applicantSignatureDataUrl ? "Falta la firma del solicitante" : undefined}
                            >
                              <PenLine className="mr-1 h-3.5 w-3.5" /> Firmar
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleReviewByBishop(request.id, "enmendar")}
                              disabled={reviewMutation.isPending}
                            >
                              Enmendar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReviewByBishop(request.id, "rechazar")}
                              disabled={reviewMutation.isPending}
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                        {(isObispo || (isOrgPresident && isWelfareOrg && request.status === "solicitado" && request.organizationId === user?.organizationId)) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(request.id)}
                            data-testid={`button-delete-welfare-${request.id}`}
                            disabled={deleteMutation.isPending}
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>

                      <div className={`mt-5 h-px bg-gradient-to-r ${accent} to-transparent`} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Attachments dialog */}
      <Dialog open={Boolean(attachmentsDialogRequest)} onOpenChange={(open) => { if (!open) setAttachmentsDialogRequest(null); }}>
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
                onClick={() => downloadFile({ filename: attachmentsDialogRequest.bishopSignedPlanFilename ?? "bienestar-firmado.pdf", url: attachmentsDialogRequest.bishopSignedPlanUrl })}
                className="flex w-full items-start gap-2 rounded-md border border-slate-700/50 bg-[#171b26] px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-[#1f2534]"
              >
                <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate">Solicitud firmada: {attachmentsDialogRequest.bishopSignedPlanFilename ?? "bienestar-firmado.pdf"}</span>
              </button>
            )}
            {attachmentsDialogRequest?.receipts?.length ? (
              attachmentsDialogRequest.receipts.map((receipt, index) => (
                <button
                  key={`${attachmentsDialogRequest.id}-dialog-receipt-${index}`}
                  type="button"
                  onClick={() => downloadFile(receipt)}
                  className="flex w-full items-start gap-2 rounded-md border border-slate-700/50 bg-[#171b26] px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-[#1f2534]"
                >
                  <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 truncate">{getReceiptLabel(receipt.category)}: {receipt.filename}</span>
                </button>
              ))
            ) : !attachmentsDialogRequest?.bishopSignedPlanUrl ? (
              <p className="text-sm text-muted-foreground">No hay adjuntos disponibles.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bishop sign dialog */}
      <Dialog open={isSignDialogOpen} onOpenChange={setIsSignDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Firmar solicitud de bienestar</DialogTitle>
            <DialogDescription>
              Firma en el recuadro para aprobar la solicitud. Se generará el PDF firmado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nombre del obispo</label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Nombre completo"
                data-testid="input-bishop-name"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Firma del obispo</p>
              <div className="relative rounded-xl border border-border/60 bg-white overflow-hidden">
                <canvas
                  ref={signatureCanvasRef}
                  width={600}
                  height={140}
                  className="w-full touch-none cursor-crosshair"
                  onPointerDown={startDrawing}
                  onPointerMove={drawSignature}
                  onPointerUp={stopDrawing}
                  onPointerLeave={stopDrawing}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full text-xs"
                onClick={clearSignatureCanvas}
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Limpiar
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSignDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmSignature} disabled={signMutation.isPending} data-testid="button-confirm-bishop-signature">
                {signMutation.isPending ? "Firmando..." : "Confirmar firma"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
