import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CheckCircle2, Clock, AlertCircle, FileText, Download, Euro, Edit2, Upload } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  useBudgetRequests,
  useCreateBudgetRequest,
  useUpdateBudgetRequest,
  useApproveBudgetRequest,
  useDeleteBudgetRequest,
  useWardBudget,
  useUpdateWardBudget,
  useOrganizationBudgets,
  useCreateOrganizationBudget,
  useUpdateOrganizationBudget,
  useOrganizations,
} from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { exportBudgetRequests } from "@/lib/export";
import { getAuthHeaders } from "@/lib/auth-tokens";

const allowedDocumentExtensions = [".jpg", ".jpeg", ".pdf", ".doc", ".docx"];

const isAllowedDocument = (file: File) => {
  const fileName = file.name.toLowerCase();
  return allowedDocumentExtensions.some((ext) => fileName.endsWith(ext));
};

const budgetSchema = z.object({
  description: z.string().min(1, "La descripción es requerida"),
  amount: z.string().min(1, "El monto es requerido"),
  notes: z.string().optional(),
  receiptFile: z
    .instanceof(File)
    .optional()
    .refine((file) => !file || isAllowedDocument(file), {
      message: "Adjunta un archivo .jpg, .doc, .docx o .pdf válido.",
    }),
  activityPlanFile: z
    .instanceof(File, { message: "El plan de actividades es requerido." })
    .refine(isAllowedDocument, {
      message: "Adjunta un archivo .jpg, .doc, .docx o .pdf válido.",
    }),
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
  amount: z.string().min(1, "El monto es requerido"),
});

const orgBudgetAssignSchema = z.object({
  amount: z.string().min(1, "El monto es requerido"),
});

type BudgetFormValues = z.infer<typeof budgetSchema>;
type ExpenseReceiptsValues = z.infer<typeof expenseReceiptsSchema>;
type WardBudgetValues = z.infer<typeof wardBudgetSchema>;
type OrgBudgetAssignValues = z.infer<typeof orgBudgetAssignSchema>;

type ReceiptCategory = "plan" | "receipt" | "expense";

interface BudgetRequest {
  id: string;
  description: string;
  amount: number;
  status: "solicitado" | "aprobado" | "en_proceso" | "completado";
  requestedBy: string;
  approvedBy?: string;
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

  const { user } = useAuth();
  const { data: requests = [] as any[], isLoading: requestsLoading } = useBudgetRequests();
  const { data: wardBudget, isLoading: wardBudgetLoading } = useWardBudget();
  const { data: organizations = [] as Organization[], isLoading: orgsLoading } = useOrganizations();

  const createMutation = useCreateBudgetRequest();
  const updateMutation = useUpdateBudgetRequest();
  const approveMutation = useApproveBudgetRequest();
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
  const orgBudgetsByOrg: Record<string, any> = {};
  (organizations as Organization[]).forEach((org: Organization) => {
    const { data: budgets = [] as any[] } = useOrganizationBudgets(org.id);
    orgBudgetsByOrg[org.id] = budgets;
  });

  // Filter requests based on user role
  const filteredRequests = isOrgMember
    ? (requests as any[]).filter((r: any) => r.organizationId === user?.organizationId)
    : requests;

  // Calculate budget stats
  const totalAssignedToOrgs = Object.values(orgBudgetsByOrg).flat().reduce((sum: number, b: any) => sum + (b?.amount || 0), 0);
  const globalBudget = wardBudget?.amount || 0;
  const remainingGlobalBudget = globalBudget - totalAssignedToOrgs;
  const globalUtilizationPercent = globalBudget > 0 ? Math.round((totalAssignedToOrgs / globalBudget) * 100) : 0;

  const budgetForm = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      description: "",
      amount: "",
      notes: "",
      receiptFile: undefined,
      activityPlanFile: undefined,
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
      amount: wardBudget?.amount?.toString() || "0",
    },
  });

  const orgBudgetForm = useForm<OrgBudgetAssignValues>({
    resolver: zodResolver(orgBudgetAssignSchema),
    defaultValues: {
      amount: "",
    },
  });

  const onSubmitBudgetRequest = async (data: BudgetFormValues) => {
    const uploadedReceipts: { filename: string; url: string; category: ReceiptCategory }[] = [];

    if (data.receiptFile) {
      try {
        const uploadedReceipt = await uploadReceiptFile(data.receiptFile);
        uploadedReceipts.push({
          filename: uploadedReceipt.filename,
          url: uploadedReceipt.url,
          category: "receipt",
        });
      } catch (error) {
        console.error(error);
        alert("No se pudo subir el comprobante. Intenta nuevamente.");
        return;
      }
    }

    if (data.activityPlanFile) {
      try {
        const uploadedPlan = await uploadReceiptFile(data.activityPlanFile);
        uploadedReceipts.push({
          filename: uploadedPlan.filename,
          url: uploadedPlan.url,
          category: "plan",
        });
      } catch (error) {
        console.error(error);
        alert("No se pudo subir el plan de actividades. Intenta nuevamente.");
        return;
      }
    }

    createMutation.mutate(
      {
        description: data.description,
        amount: parseFloat(data.amount),
        status: "solicitado",
        notes: data.notes || "",
        receipts: uploadedReceipts,
        organizationId: user?.organizationId,
      },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
          budgetForm.reset();
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
    updateWardBudgetMutation.mutate({
      amount: parseFloat(data.amount),
    }, {
      onSuccess: () => {
        setIsBudgetDialogOpen(false);
        wardBudgetForm.reset();
      },
    });
  };

  const onSubmitOrgBudgetAssign = (data: OrgBudgetAssignValues) => {
    const amount = parseFloat(data.amount);

    // Validar que no exceda el presupuesto global
    if (amount > remainingGlobalBudget) {
      alert(`El monto excede el presupuesto disponible. Disponible: €${remainingGlobalBudget.toFixed(2)}`);
      return;
    }

    if (selectedOrgId) {
      // Check if budget already exists for current quarter
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

      const existingBudget = (orgBudgetsByOrg[selectedOrgId] || []).find(
        (b: any) => b.year === currentYear && b.quarter === currentQuarter
      );

      if (existingBudget) {
        // Update existing
        updateOrgBudgetMutation.mutate({
          id: existingBudget.id,
          data: { amount },
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
          amount,
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

  const handleDelete = (requestId: string) => {
    if (window.confirm("¿Está seguro de que desea eliminar esta solicitud?")) {
      deleteMutation.mutate(requestId);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive", label: string, icon: JSX.Element }> = {
      solicitado: {
        variant: "outline",
        label: "Solicitado",
        icon: <Clock className="h-3 w-3 mr-1" />,
      },
      aprobado: {
        variant: "default",
        label: "Aprobado",
        icon: <CheckCircle2 className="h-3 w-3 mr-1" />,
      },
      en_proceso: {
        variant: "secondary",
        label: "En Proceso",
        icon: <AlertCircle className="h-3 w-3 mr-1" />,
      },
      completado: {
        variant: "default",
        label: "Completado",
        icon: <CheckCircle2 className="h-3 w-3 mr-1" />,
      },
    };

    const config = variants[status] || variants.solicitado;

    return (
      <Badge variant={config.variant} className="flex items-center w-fit">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const getOrganizationLabel = (type: string) => {
    const labels: Record<string, string> = {
      "hombres_jovenes": "Hombres Jóvenes",
      "mujeres_jovenes": "Mujeres Jóvenes",
      "sociedad_socorro": "Sociedad de Socorro",
      "primaria": "Primaria",
      "escuela_dominical": "Escuela Dominical",
      "jas": "JAS",
      "cuorum_elderes": "Cuórum de Élderes",
      "obispado": "Obispado",
    };
    return labels[type] || type;
  };

  const getReceiptLabel = (receipt?: { filename: string; category?: ReceiptCategory }) => {
    if (receipt?.category === "plan") {
      return "Plan de actividades";
    }
    if (receipt?.category === "expense") {
      return "Comprobante de gasto";
    }
    if (receipt?.category === "receipt") {
      return "Comprobante de compra";
    }
    return "Adjunto";
  };

  const hasExpenseReceipts = (request: BudgetRequest) =>
    (request.receipts ?? []).some((receipt) => receipt.category === "expense");

  const downloadReceipt = async (receipt: { filename: string; url?: string }) => {
    if (!receipt.url) {
      return;
    }

    const link = document.createElement("a");
    link.href = receipt.url;
    link.download = receipt.filename;
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
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
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Presupuestos</h1>
          <p className="text-sm text-muted-foreground">
            {isOrgMember ? "Control de presupuesto de tu organización" : "Gestiona presupuestos globales y asignaciones"}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          <Button
            variant="outline"
            onClick={() => exportBudgetRequests(filteredRequests)}
            data-testid="button-export-budget"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          {isObispado && (
            <Dialog open={isBudgetDialogOpen} onOpenChange={setIsBudgetDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-edit-ward-budget">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Presupuesto Global
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Presupuesto Global del Barrio</DialogTitle>
                  <DialogDescription>
                    Define el monto total del presupuesto para el barrio (en euros)
                  </DialogDescription>
                </DialogHeader>
                <Form {...wardBudgetForm}>
                  <form onSubmit={wardBudgetForm.handleSubmit(onSubmitWardBudget)} className="space-y-4">
                    <FormField
                      control={wardBudgetForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monto Total (€)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              {...field}
                              data-testid="input-ward-budget-amount"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
              <Button data-testid="button-create-request">
                <Plus className="h-4 w-4 mr-2" />
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
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monto (€)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                            data-testid="input-amount"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={budgetForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas (Opcional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Detalles adicionales sobre la solicitud"
                            {...field}
                            data-testid="textarea-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={budgetForm.control}
                    name="receiptFile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comprobantes de compra (Opcional)</FormLabel>
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
                          Formatos permitidos: JPG, Word (DOC/DOCX) o PDF.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={budgetForm.control}
                    name="activityPlanFile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plan de actividades</FormLabel>
                        <FormControl>
                          <div className="flex flex-col gap-2">
                            <Input
                              id="budget-activity-plan-file"
                              type="file"
                              accept={allowedDocumentExtensions.join(",")}
                              onChange={(event) => field.onChange(event.target.files?.[0] ?? undefined)}
                              onBlur={field.onBlur}
                              ref={field.ref}
                              className="hidden"
                              data-testid="input-activity-plan-file"
                            />
                            <Button type="button" variant="outline" className="w-fit" asChild>
                              <label htmlFor="budget-activity-plan-file" className="cursor-pointer">
                                <Upload className="h-4 w-4 mr-2" />
                                Subir plan de actividades
                              </label>
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {field.value ? `Archivo seleccionado: ${field.value.name}` : "Ningún archivo seleccionado"}
                            </span>
                          </div>
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Formatos permitidos: JPG, Word (DOC/DOCX) o PDF. Este documento es obligatorio.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

      {/* Organization Member Budget Card */}
      {isOrgMember && user?.organizationId && (
        (() => {
          const myOrg = (organizations as Organization[]).find((o) => o.id === user.organizationId);
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
          const myBudget = (orgBudgetsByOrg[user.organizationId] || []).find(
            (b: any) => b.year === currentYear && b.quarter === currentQuarter
          );
          const assignedAmount = myBudget?.amount || 0;

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
                <Euro className="h-6 w-6 text-muted-foreground" />
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
      {isObispado && (
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-lg">Presupuesto Global del Barrio</CardTitle>
              <CardDescription>Monto total asignado</CardDescription>
            </div>
            <Euro className="h-6 w-6 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="text-4xl font-bold" data-testid="text-ward-budget">
                  €{globalBudget.toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Presupuesto disponible para todas las organizaciones
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Asignado a organizaciones</span>
                  <span className="font-semibold">€{totalAssignedToOrgs.toFixed(2)} ({globalUtilizationPercent}%)</span>
                </div>
                <Progress value={globalUtilizationPercent} className="h-2" />
              </div>

              <div className="flex justify-between text-sm">
                <span>Disponible para asignar</span>
                <span className={`font-semibold ${remainingGlobalBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  €{remainingGlobalBudget.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Organization Budget Cards - Only for Obispado */}
      {isObispado && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">Presupuestos por Organización</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(organizations as Organization[]).map((org: Organization) => {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
              const currentBudget = (orgBudgetsByOrg[org.id] || []).find(
                (b: any) => b.year === currentYear && b.quarter === currentQuarter
              );
              const assignedAmount = currentBudget?.amount || 0;

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
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      {...field}
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

      {/* Stats Cards for Obispado */}
      {isObispado && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Solicitado</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-solicited">
                €{totalSolicited.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {(requests as any[]).filter((r: any) => r.status === "solicitado").length} solicitudes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Aprobado</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-approved">
                €{totalApproved.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {(requests as any[]).filter((r: any) => r.status === "aprobado" || r.status === "completado").length} aprobadas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Solicitudes</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-requests">
                {(requests as any[]).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                solicitudes totales
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Solicitudes de Presupuesto</CardTitle>
          <CardDescription>
            Todas las solicitudes de presupuesto del barrio (en euros)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Adjuntos</TableHead>
                <TableHead>Fecha</TableHead>
                {showActionsColumn && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.length > 0 ? (
                (filteredRequests as any[]).map((request: any) => {
                  const org = (organizations as Organization[]).find((o) => o.id === request.organizationId);
                  return (
                  <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{request.description}</span>
                        {org && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-org-${request.id}`}>
                            {org.name}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>€{request.amount.toFixed(2)}</TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell>
                      {request.receipts && request.receipts.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {request.receipts.map((receipt: any, index: number) =>
                            receipt.url ? (
                              <button
                                key={`${request.id}-receipt-${index}`}
                                type="button"
                                onClick={() => void downloadReceipt(receipt)}
                                className="text-left text-xs text-blue-600 hover:underline"
                              >
                                {getReceiptLabel(receipt)}: {receipt.filename}
                              </button>
                            ) : (
                              <span
                                key={`${request.id}-receipt-${index}`}
                                className="text-xs text-muted-foreground"
                              >
                                {getReceiptLabel(receipt)}: {receipt.filename}
                              </span>
                            )
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin adjuntos</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(request.createdAt).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    {showActionsColumn && (
                      <TableCell>
                        <div className="flex gap-2">
                          {canApprove && request.status === "solicitado" && (
                            <Button
                              size="sm"
                              onClick={() => handleApprove(request.id)}
                              data-testid={`button-approve-${request.id}`}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Aprobar
                            </Button>
                          )}
                          {request.status === "aprobado" &&
                            request.requestedBy === user?.id &&
                            !hasExpenseReceipts(request) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReceiptsDialog(request)}
                              data-testid={`button-add-expense-receipts-${request.id}`}
                            >
                              Adjuntar comprobantes
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(request.id)}
                              data-testid={`button-delete-budget-${request.id}`}
                              disabled={deleteMutation.isPending}
                            >
                              Eliminar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })
              ) : (
                <TableRow key="empty">
                  <TableCell colSpan={showActionsColumn ? 6 : 5} className="text-center py-8 text-muted-foreground">
                    No hay solicitudes de presupuesto
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
