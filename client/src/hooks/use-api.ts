import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const REALTIME_QUERY_OPTIONS = {
  refetchInterval: 30000,
  refetchOnWindowFocus: true,
  staleTime: 15000,
};

// ========================================
// DASHBOARD
// ========================================

export interface DashboardStats {
  pendingAssignments: number;
  upcomingInterviews: number;
  budgetRequests: {
    pending: number;
    approved: number;
    total: number;
  };
  goals: {
    completed: number;
    total: number;
    percentage: number;
  };
  organizationGoals?: {
    items: Array<{
      id: string;
      title: string;
      description?: string;
      currentValue: number;
      targetValue: number;
      percentage: number;
    }>;
    completed: number;
    total: number;
    percentage: number;
  };
  upcomingBirthdays: Array<{ name: string; date: string }>;
  organizationHealth: Array<{
    name: string;
    status: "healthy" | "warning" | "critical";
  }>;
  upcomingActivities: Array<{ title: string; date: string; location: string }>;
  userRole?: string;
  pendingServiceTasks?: number;
  pendingBaptismDrafts?: number;
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    ...REALTIME_QUERY_OPTIONS,
  });
}

// ========================================
// DIRECTORY MEMBERS
// ========================================

export interface DirectoryMember {
  id: string;
  nameSurename: string;
  nombre?: string | null;
  apellidos?: string | null;
  sex: string;
  birthday: string;
  phone?: string | null;
  email?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationType?: string | null;
  memberStatus?: string | null;
  emailConsentGranted?: boolean | null;
  createdAt: string;
}

export interface MemberCalling {
  id: string;
  memberId: string;
  organizationId?: string | null;
  organizationName?: string | null;
  callingName: string;
  callingType?: string | null;
  callingOrder?: number | null;
  isActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
}

export interface DirectoryMemberCallingWithMember extends MemberCalling {
  memberName?: string | null;
}

export function useMembers(options?: { enabled?: boolean }) {
  return useQuery<DirectoryMember[]>({
    queryKey: ["/api/members"],
    staleTime: 1000 * 60,
    enabled: options?.enabled ?? true,
  });
}

export function usePendingMembers(options?: { enabled?: boolean }) {
  return useQuery<DirectoryMember[]>({
    queryKey: ["/api/members/pending"],
    staleTime: 1000 * 30,
    enabled: options?.enabled ?? true,
  });
}

export function useApproveMember() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/members/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Miembro aprobado", description: "El miembro ha sido activado en el directorio." });
    },
    onError: () => {
      toast({ title: "Error al aprobar", variant: "destructive" });
    },
  });
}

export function useOrganizationMembers(organizationId?: string, options?: { enabled?: boolean }) {
  return useQuery<DirectoryMember[]>({
    queryKey: ["/api/organizations", organizationId, "members"],
    enabled: options?.enabled ?? Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      return apiRequest("GET", `/api/organizations/${organizationId}/members`);
    },
    staleTime: 1000 * 30,
  });
}

export function useAllMemberCallings(options?: { enabled?: boolean }) {
  return useQuery<DirectoryMemberCallingWithMember[]>({
    queryKey: ["/api/member-callings"],
    staleTime: 1000 * 60,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/members", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({
        title: "Miembro agregado",
        description: "El miembro ha sido agregado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo agregar el miembro. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: { id: string; payload: any }) =>
      apiRequest("PUT", `/api/members/${data.id}`, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({
        title: "Miembro actualizado",
        description: "El miembro ha sido actualizado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el miembro. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({
        title: "Miembro eliminado",
        description: "El miembro ha sido eliminado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el miembro. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useMemberCallings(memberId?: string, options?: { enabled?: boolean }) {
  return useQuery<MemberCalling[]>({
    queryKey: ["/api/members", memberId, "callings"],
    enabled: options?.enabled ?? Boolean(memberId),
    queryFn: async () => {
      if (!memberId) {
        return [];
      }
      return apiRequest("GET", `/api/members/${memberId}/callings`);
    },
  });
}

export function useCreateMemberCalling(memberId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/members/${memberId}/callings`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members", memberId, "callings"] });
      toast({
        title: "Llamamiento agregado",
        description: "El llamamiento ha sido agregado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo agregar el llamamiento. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateMemberCalling(memberId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: { callingId: string; payload: any }) =>
      apiRequest("PUT", `/api/members/${memberId}/callings/${data.callingId}`, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members", memberId, "callings"] });
      toast({
        title: "Llamamiento actualizado",
        description: "El llamamiento ha sido actualizado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el llamamiento. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteMemberCalling(memberId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (callingId: string) =>
      apiRequest("DELETE", `/api/members/${memberId}/callings/${callingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members", memberId, "callings"] });
      toast({
        title: "Llamamiento eliminado",
        description: "El llamamiento ha sido eliminado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el llamamiento. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// SACRAMENTAL MEETINGS
// ========================================

export function useSacramentalMeetings() {
  return useQuery<any>({
    queryKey: ["/api/sacramental-meetings"],
    ...REALTIME_QUERY_OPTIONS,    
  });
}

export function useCreateSacramentalMeeting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/sacramental-meetings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sacramental-meetings"] });
      toast({
        title: "Reunión creada",
        description: "La reunión sacramental ha sido creada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la reunión. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// HYMNS
// ========================================

export function useHymns() {
  return useQuery<any>({
    queryKey: ["/api/hymns"],
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
}

// ========================================
// WARD COUNCILS
// ========================================

export function useWardCouncils() {
  return useQuery<any>({
    queryKey: ["/api/ward-councils"],
    ...REALTIME_QUERY_OPTIONS,    
  });
}

export function useCreateWardCouncil() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/ward-councils", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ward-councils"] });
      toast({
        title: "Consejo creado",
        description: "El consejo de barrio ha sido creado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear el consejo. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateWardCouncil() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      data,
      silent,
    }: {
      id: string;
      data: any;
      silent?: boolean;
    }) => {
      return apiRequest("PUT", `/api/ward-councils/${id}`, data);
    },
    onSuccess: (_data, variables) => {
      if (!variables?.silent) {
        queryClient.invalidateQueries({ queryKey: ["/api/ward-councils"] });
        toast({
          title: "Consejo actualizado",
          description: "El consejo de barrio ha sido actualizado correctamente.",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el consejo.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteWardCouncil() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/ward-councils/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ward-councils"] });
      toast({
        title: "Consejo eliminado",
        description: "El consejo de barrio ha sido eliminado.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el consejo.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// PRESIDENCY MEETINGS
// ========================================

export function usePresidencyMeetings(organizationId?: string) {
  return useQuery<any>({
    queryKey: organizationId ? ["/api/presidency-meetings", organizationId] : ["/api/presidency-meetings"],
    enabled: !!organizationId,
    ...REALTIME_QUERY_OPTIONS,    
  });
}

export function useCreatePresidencyMeeting(organizationId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/presidency-meetings", data),
    onSuccess: () => {
      // Invalidate the specific organization's meetings query
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/presidency-meetings", organizationId] });
      }
      // Also invalidate all presidency meetings queries
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-meetings"] });
      toast({
        title: "Reunión creada",
        description: "La reunión de presidencia ha sido creada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la reunión. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}


export interface PresidencyResource {
  id: string;
  title: string;
  placeholderName: string;
  description?: string | null;
  fileName: string;
  fileUrl: string;
  category: "manuales" | "plantillas" | "capacitacion";
  resourceType: "documento" | "video" | "plantilla";
  organizationId?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PresidencyResourcesFilters {
  organizationId?: string;
  category?: "manuales" | "plantillas" | "capacitacion";
}

export interface CreatePresidencyResourcePayload {
  placeholderName: string;
  description?: string;
  fileName: string;
  fileUrl: string;
  category: "manuales" | "plantillas" | "capacitacion";
  resourceType: "documento" | "video" | "plantilla";
  organizationId?: string | null;
}

const buildPresidencyResourcesUrl = (filters?: PresidencyResourcesFilters) => {
  const params = new URLSearchParams();
  if (filters?.organizationId) params.set("organizationId", filters.organizationId);
  if (filters?.category) params.set("category", filters.category);
  const query = params.toString();
  return query ? `/api/presidency-resources?${query}` : "/api/presidency-resources";
};

export function usePresidencyResources(filters?: PresidencyResourcesFilters) {
  return useQuery<PresidencyResource[]>({
    queryKey: ["/api/presidency-resources", filters?.organizationId ?? "all", filters?.category ?? "all"],
    queryFn: () => apiRequest("GET", buildPresidencyResourcesUrl(filters)),
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useCreatePresidencyResource(filters?: PresidencyResourcesFilters) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreatePresidencyResourcePayload) => apiRequest("POST", "/api/presidency-resources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-resources", filters?.organizationId ?? "all", filters?.category ?? "all"] });
      toast({
        title: "Recurso publicado",
        description: "El recurso se publicó correctamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo publicar el recurso.",
        variant: "destructive",
      });
    },
  });
}

export function useDeletePresidencyResource(filters?: PresidencyResourcesFilters) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (resourceId: string) => apiRequest("DELETE", `/api/presidency-resources/${resourceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-resources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-resources", filters?.organizationId ?? "all", filters?.category ?? "all"] });
      toast({
        title: "Recurso eliminado",
        description: "El recurso se eliminó correctamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el recurso.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// BUDGET REQUESTS
// ========================================

export function useBudgetRequests() {
  return useQuery<any>({
    queryKey: ["/api/budget-requests"],
    ...REALTIME_QUERY_OPTIONS,    
  });
}

export function useCreateBudgetRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/budget-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });      
      toast({
        title: "Solicitud creada",
        description: "La solicitud de presupuesto ha sido enviada.",
      });
    },
    onError: (error: any) => {
      let title = "Error al solicitar presupuesto";
      let message = "No se pudo crear la solicitud. Intenta nuevamente.";
      const payload = error?.payload as any;
      if (payload?.code === "OVERDUE_BUDGET_RECEIPTS") {
        title = "Comprobantes pendientes";
        const items: string[] = (payload.overdueAssignments ?? []).map((a: any) => {
          const parts: string[] = [];
          if (a.title) parts.push(a.title);
          if (a.amount != null) parts.push(`€${a.amount}`);
          if (a.dueDate) {
            const d = new Date(a.dueDate);
            if (!isNaN(d.getTime())) parts.push(`vence ${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`);
          }
          return parts.join(" · ");
        });
        message = items.length > 0
          ? `Debes adjuntar los comprobantes de:\n${items.map(i => `• ${i}`).join("\n")}`
          : payload.error;
      }
      toast({
        title,
        description: message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateBudgetRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/budget-requests/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });      
      toast({
        title: "Solicitud actualizada",
        description: "Los comprobantes se han adjuntado correctamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudieron adjuntar los comprobantes. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useApproveBudgetRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (requestId: string) => apiRequest("POST", `/api/budget-requests/${requestId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Aprobación financiera completada",
        description: "La solicitud quedó pendiente de firma del obispo.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo aprobar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}


export function useReviewBudgetRequestAsBishop() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ requestId, action, reason }: { requestId: string; action: "rechazar" | "enmendar"; reason: string }) =>
      apiRequest("POST", `/api/budget-requests/${requestId}/review`, { action, reason }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: variables.action === "rechazar" ? "Solicitud rechazada" : "Solicitud devuelta para enmienda",
        description: "Se notificó al solicitante y se cerró la tarea de firma.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo revisar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useSignBudgetRequestAsBishop() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ requestId, signatureDataUrl, signerName }: { requestId: string; signatureDataUrl: string; signerName: string }) =>
      apiRequest("POST", `/api/budget-requests/${requestId}/sign`, { signatureDataUrl, signerName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Solicitud firmada",
        description: "La firma del obispo se registró y se creó la asignación de comprobantes.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo firmar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// WELFARE REQUESTS
// ========================================

export function useWelfareRequests() {
  return useQuery<any>({
    queryKey: ["/api/welfare-requests"],
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useCreateWelfareRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/welfare-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/welfare-requests"] });
      toast({
        title: "Solicitud creada",
        description: "La solicitud de bienestar ha sido enviada.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateWelfareRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PUT", `/api/welfare-requests/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/welfare-requests"] });
      toast({
        title: "Solicitud actualizada",
        description: "La solicitud de bienestar ha sido actualizada.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useSignWelfareRequestAsBishop() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ requestId, signatureDataUrl, signerName }: { requestId: string; signatureDataUrl: string; signerName: string }) =>
      apiRequest("POST", `/api/welfare-requests/${requestId}/sign`, { signatureDataUrl, signerName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/welfare-requests"] });
      toast({
        title: "Solicitud firmada",
        description: "La firma del obispo se registró y la solicitud fue aprobada.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo firmar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useReviewWelfareRequestAsBishop() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ requestId, action, reason }: { requestId: string; action: "rechazar" | "enmendar"; reason: string }) =>
      apiRequest("POST", `/api/welfare-requests/${requestId}/review`, { action, reason }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/welfare-requests"] });
      toast({
        title: variables.action === "rechazar" ? "Solicitud rechazada" : "Solicitud devuelta para enmienda",
        description: "Se notificó al solicitante.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo revisar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteWelfareRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/welfare-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/welfare-requests"] });
      toast({
        title: "Solicitud eliminada",
        description: "La solicitud de bienestar ha sido eliminada.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// INTERVIEWS
// ========================================

export function useInterviews() {
  return useQuery<any>({
    queryKey: ["/api/interviews"],
    ...REALTIME_QUERY_OPTIONS,
    refetchOnMount: true,
  });
}

export function useCreateInterview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/interviews", data),
    onSuccess: (createdInterview) => {
      if (createdInterview) {
        queryClient.setQueryData(
          ["/api/interviews"],
          (old: any[] | undefined) => {
            if (!old) return [createdInterview];
            if (old.some((item) => item.id === createdInterview.id)) {
              return old;
            }
            return [createdInterview, ...old];
          }
        );
      }	    
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.refetchQueries({ queryKey: ["/api/interviews"] });      
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Entrevista programada",
        description: "La entrevista ha sido programada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo programar la entrevista. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useCompleteInterview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (interviewId: string) =>
      apiRequest("PUT", `/api/interviews/${interviewId}`, { status: "completada" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });      
      toast({
        title: "Entrevista completada",
        description: "La entrevista ha sido marcada como completada.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo completar la entrevista. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateInterview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: { id: string; [key: string]: any }) => {
      const { id, ...updateData } = data;
      return apiRequest("PUT", `/api/interviews/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });      
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Entrevista actualizada",
        description: "La entrevista ha sido actualizada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la entrevista. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateInterviewAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: { id: string; weeklyAvailability: any[] }) =>
      apiRequest("PATCH", `/api/interviews/${data.id}/availability`, { weeklyAvailability: data.weeklyAvailability }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      toast({
        title: "Disponibilidad actualizada",
        description: "La disponibilidad semanal ha sido actualizada.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la disponibilidad.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// ORGANIZATION INTERVIEWS
// ========================================

export function useOrganizationInterviews() {
  return useQuery<any>({
    queryKey: ["/api/organization-interviews"],
    ...REALTIME_QUERY_OPTIONS,
    refetchOnMount: true,
  });
}

export function useCreateOrganizationInterview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/organization-interviews", data),
    onSuccess: (createdInterview) => {
      if (createdInterview) {
        queryClient.setQueryData(
          ["/api/organization-interviews"],
          (old: any[] | undefined) => {
            if (!old) return [createdInterview];
            if (old.some((item) => item.id === createdInterview.id)) {
              return old;
            }
            return [createdInterview, ...old];
          }
        );
      }
      queryClient.invalidateQueries({
        queryKey: ["/api/organization-interviews"],
      });
      queryClient.refetchQueries({
        queryKey: ["/api/organization-interviews"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/dashboard/stats"],
      });
      toast({
        title: "Entrevista programada",
        description: "La entrevista ha sido programada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description:
          "No se pudo programar la entrevista. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useCompleteOrganizationInterview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (interviewId: string) =>
      apiRequest(
        "PUT",
        `/api/organization-interviews/${interviewId}`,
        { status: "completada" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/organization-interviews"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/dashboard/stats"],
      });
      toast({
        title: "Entrevista completada",
        description:
          "La entrevista ha sido marcada como completada.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description:
          "No se pudo completar la entrevista. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateOrganizationInterview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: { id: string; [key: string]: any }) => {
      const { id, ...updateData } = data;
      return apiRequest(
        "PUT",
        `/api/organization-interviews/${id}`,
        updateData
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/organization-interviews"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/dashboard/stats"],
      });
      toast({
        title: "Entrevista actualizada",
        description:
          "La entrevista ha sido actualizada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description:
          "No se pudo actualizar la entrevista. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteOrganizationInterview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(
        "DELETE",
        `/api/organization-interviews/${id}`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/organization-interviews"],
      });
      toast({
        title: "Entrevista eliminada",
        description:
          "La entrevista ha sido eliminada correctamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description:
          "No se pudo eliminar la entrevista.",
        variant: "destructive",
      });
    },
  });
}


// ========================================
// GOALS
// ========================================

export function useGoals() {
  return useQuery<any>({
    queryKey: ["/api/goals"],
    ...REALTIME_QUERY_OPTIONS,    
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/goals", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Meta creada",
        description: "La meta ha sido creada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la meta. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// BIRTHDAYS
// ========================================

export function useBirthdays() {
  return useQuery<any>({
    queryKey: ["/api/birthdays"],
    ...REALTIME_QUERY_OPTIONS,    
  });
}

export function useCreateBirthday() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/birthdays", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/birthdays"] });
      toast({
        title: "Cumpleaños agregado",
        description: "El cumpleaños ha sido agregado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo agregar el cumpleaños. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// ORGANIZATIONS
// ========================================

export interface Organization {
  id: string;
  name: string;
  type: string;
  presidentId?: string | null;
}

export function useOrganizations() {
  return useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    ...REALTIME_QUERY_OPTIONS,    
  });
}

// ========================================
// USERS
// ========================================

export function useUsers() {
  return useQuery<any>({
    queryKey: ["/api/users"],
    ...REALTIME_QUERY_OPTIONS,    
  });
}

// ========================================
// FAMILIES
// ========================================

export interface FamilyMemberEntry {
  id: string;
  familyId: string;
  memberId: string;
  role: "cabeza_familia" | "conyuge" | "hijo";
  createdAt: string;
  member: {
    id: string;
    nameSurename: string;
    sex: string;
    birthday: string;
    phone?: string | null;
    email?: string | null;
    organizationId?: string | null;
    maritalStatus?: string | null;
  };
}

export interface FamilyData {
  id: string;
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  createdAt: string;
  members: FamilyMemberEntry[];
}

export function useFamilies() {
  return useQuery<FamilyData[]>({
    queryKey: ["/api/families"],
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useCreateFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; address?: string; phone?: string }) =>
      apiRequest("POST", "/api/families", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/families"] }),
  });
}

export function useUpdateFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; address?: string; phone?: string } }) =>
      apiRequest("PUT", `/api/families/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/families"] }),
  });
}

export function useDeleteFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/families/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/families"] }),
  });
}

export function useAddFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, memberId, role }: { familyId: string; memberId: string; role: string }) =>
      apiRequest("POST", `/api/families/${familyId}/members`, { memberId, role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/families"] }),
  });
}

export function useUpdateFamilyMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, memberId, role }: { familyId: string; memberId: string; role: string }) =>
      apiRequest("PATCH", `/api/families/${familyId}/members/${memberId}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/families"] }),
  });
}

export function useRemoveFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ familyId, memberId }: { familyId: string; memberId: string }) =>
      apiRequest("DELETE", `/api/families/${familyId}/members/${memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/families"] }),
  });
}

// ========================================
// ACTIVITIES
// ========================================

export interface ActivityChecklistItem {
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

export interface Activity {
  id: string;
  title: string;
  description?: string;
  date: string;
  location?: string;
  type: "servicio_bautismal" | "deportiva" | "capacitacion" | "fiesta" | "hermanamiento" | "otro";
  status: "borrador" | "en_preparacion" | "listo" | "realizado";
  baptismServiceId?: string | null;
  organizationId?: string | null;
  responsiblePerson?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  checklistItems?: ActivityChecklistItem[];
}

export function useActivities() {
  return useQuery<Activity[]>({
    queryKey: ["/api/activities"],
    ...REALTIME_QUERY_OPTIONS,    
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/activities", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Actividad creada",
        description: "La actividad ha sido creada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la actividad. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// AGENDA
// ========================================

export interface AgendaEvent {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  sourceType: "manual" | "activity" | "interview";
  sourceId?: string | null;
}

export interface AgendaTask {
  id: string;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  earliestStartAt?: string | null;
  durationMinutes: number;
  priority: "P1" | "P2" | "P3" | "P4";
  status: "open" | "done" | "canceled";
  metadata?: Record<string, unknown>;
}


export interface AgendaAvailability {
  timezone: string;
  workDays: number[];
  workStartTime: string;
  workEndTime: string;
  bufferMinutes: number;
  minBlockMinutes: number;
  doNotDisturbWindows?: Array<{ start: string; end: string }> | null;
  reminderChannels: Array<"push" | "email">;
}

export interface AgendaLogEntry {
  id: string;
  endpoint: string;
  requestText?: string | null;
  intent?: string | null;
  confidence?: string | null;
  resultRecordType?: string | null;
  resultRecordId?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
export function useAgendaData() {
  return useQuery<{ events: AgendaEvent[]; tasks: AgendaTask[]; plans: any[] }>({
    queryKey: ["/api/agenda"],
    ...REALTIME_QUERY_OPTIONS,
  });
}


export function useAgendaAvailability() {
  return useQuery<AgendaAvailability>({
    queryKey: ["/api/agenda/availability"],
    staleTime: 1000 * 30,
  });
}

export function useUpdateAgendaAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: Partial<AgendaAvailability>) => apiRequest("PUT", "/api/agenda/availability", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/availability"] });
      toast({ title: "Preferencias guardadas", description: "Quiet hours y canales actualizados." });
    },
    onError: () => toast({ title: "Error", description: "No se pudo guardar preferencias.", variant: "destructive" }),
  });
}

export function useAgendaLogs(limit = 20) {
  return useQuery<AgendaLogEntry[]>({
    queryKey: ["/api/agenda/logs", limit],
    queryFn: () => apiRequest("GET", `/api/agenda/logs?limit=${limit}`),
    staleTime: 10_000,
  });
}

export function useUpdateAgendaTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; status: "open" | "done" | "canceled" }) =>
      apiRequest("PATCH", `/api/agenda/tasks/${payload.id}/status`, { status: payload.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/logs"] });
    },
  });
}

export function useCreateAgendaTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: { title: string; description?: string; dueAt?: string | null }) =>
      apiRequest("POST", "/api/agenda/tasks", {
        title: payload.title,
        description: payload.description ?? payload.title,
        dueAt: payload.dueAt ?? null,
        earliestStartAt: null,
        durationMinutes: 30,
        priority: "P3",
        status: "open",
        eventId: null,
        metadata: { capturedBy: "voice" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/logs"] });
      toast({ title: "Tarea creada", description: "Se agregó la tarea dictada correctamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la tarea dictada.", variant: "destructive" });
    },
  });
}
export function useRunAgendaPlanner() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => apiRequest("POST", "/api/agenda/plan/run", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/plan"] });
      toast({ title: "Planificador ejecutado", description: "Tu semana fue planificada automáticamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo ejecutar el planificador.", variant: "destructive" });
    },
  });
}

export function useAgendaCapture(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { text: string; idempotencyKey?: string }) =>
      apiRequest("POST", "/api/agenda/capture", { text: payload.text }, payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/plan"] });
      options?.onSuccess?.();
    },
  });
}

// ========================================
// ASSIGNMENTS
// ========================================

export function usePendingAssignmentsByArea() {
  return useQuery<Record<string, any[]>>({
    queryKey: ["/api/assignments/pending-by-area"],
    staleTime: 30_000,
  });
}

export function useAssignments() {
  return useQuery<any>({
    queryKey: ["/api/assignments"],
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useMyTasks() {
  return useQuery<any[]>({
    queryKey: ["/api/my-tasks"],
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/assignments", data),
    onSuccess: (_data, variables) => {
      if (!variables?.silent) {
        queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        toast({
          title: "Asignación creada",
          description: "La asignación ha sido creada exitosamente.",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la asignación. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/assignments/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda"] });
      toast({
        title: "Asignación actualizada",
        description: "La asignación ha sido actualizada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la asignación. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/assignments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Asignación eliminada",
        description: "La asignación ha sido eliminada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la asignación. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateSacramentalMeeting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/sacramental-meetings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sacramental-meetings"] });
      toast({
        title: "Reunión actualizada",
        description: "La reunión sacramental ha sido actualizada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la reunión. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteSacramentalMeeting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sacramental-meetings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sacramental-meetings"] });
      toast({
        title: "Reunión eliminada",
        description: "La reunión sacramental ha sido eliminada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la reunión. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteBudgetRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/budget-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Presupuesto eliminado",
        description: "La solicitud de presupuesto ha sido eliminada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/activities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Actividad eliminada",
        description: "La actividad ha sido eliminada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la actividad. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateActivityChecklistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      activityId,
      itemId,
      data,
    }: {
      activityId: string;
      itemId: string;
      data: { completed?: boolean; notes?: string };
    }) => apiRequest("PATCH", `/api/activities/${activityId}/checklist/${itemId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    },
  });
}

export function useDeleteInterview() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/interviews/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Entrevista cancelada",
        description: "La entrevista ha sido cancelada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo cancelar la entrevista. Intenta nuevamente.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// WARD BUDGETS
// ========================================

export function useWardBudget() {
  return useQuery<any>({
    queryKey: ["/api/ward-budget"],
    ...REALTIME_QUERY_OPTIONS,    
  });
}

export function useUpdateWardBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: {
      amount?: string;
      annualAmount?: string;
      year?: number;
      q1Amount?: string;
      q2Amount?: string;
      q3Amount?: string;
      q4Amount?: string;
    }) => apiRequest("PATCH", "/api/ward-budget", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ward-budget"] });
      toast({
        title: "Presupuesto actualizado",
        description: "El presupuesto global ha sido actualizado.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el presupuesto.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// ORGANIZATION BUDGETS
// ========================================

export function useOrganizationBudgets(organizationId?: string) {
  return useQuery<any>({
    queryKey: ["/api/organization-budgets", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      return apiRequest("GET", `/api/organization-budgets/${organizationId}`);
    },
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useCreateOrganizationBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/organization-budgets", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization-budgets", variables.organizationId] });
      toast({
        title: "Presupuesto creado",
        description: "El presupuesto ha sido asignado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear el presupuesto.",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateOrganizationBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any; organizationId?: string }) =>
      apiRequest("PATCH", `/api/organization-budgets/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization-budgets"] });
      if (variables.organizationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/organization-budgets", variables.organizationId] });
      }
      toast({
        title: "Presupuesto actualizado",
        description: "El presupuesto ha sido actualizado.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el presupuesto.",
        variant: "destructive",
      });
    },
  });
}


export function useOrganizationAttendance() {
  return useQuery<any[]>({
    queryKey: ["/api/organization-attendance"],
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useOrganizationAttendanceByOrg(organizationId?: string) {
  return useQuery<any[]>({
    queryKey: ["/api/organization-attendance", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      return apiRequest("GET", `/api/organization-attendance/${organizationId}`);
    },
    ...REALTIME_QUERY_OPTIONS,
  });
}


export function useOrganizationAttendanceSnapshots(organizationId?: string, year?: number) {
  return useQuery<any[]>({
    queryKey: ["/api/organization-attendance-snapshots", organizationId, year],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const query = typeof year === "number" ? `?year=${year}` : "";
      return apiRequest("GET", `/api/organization-attendance-snapshots/${organizationId}${query}`);
    },
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useUpsertOrganizationAttendance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: { organizationId: string; weekStartDate: string; attendeesCount: number; attendeeMemberIds?: string[]; totalMembers?: number }) =>
      apiRequest("POST", "/api/organization-attendance", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organization-attendance", variables.organizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/organization-attendance-snapshots", variables.organizationId] });
      toast({
        title: "Asistencia guardada",
        description: "Se registró la asistencia semanal.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar la asistencia.",
        variant: "destructive",
      });
    },
  });
}

// ========================================
// INVENTORY
// ========================================

export interface InventoryCategory {
  id: string;
  name: string;
  prefix: string;
  description?: string | null;
}

export interface InventoryLocation {
  id: string;
  name: string;
  code: string;
  parentId?: string | null;
  description?: string | null;
}

export interface InventoryItem {
  id: string;
  assetCode: string;
  name: string;
  description?: string | null;
  status: "available" | "loaned" | "maintenance";
  photoUrl?: string | null;
  qrUrl: string;
  trackerId?: string | null;
  categoryId: string;
  locationId?: string | null;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string | null;
}

export function useInventoryItems(search?: string) {
  return useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory", search ?? ""],
    queryFn: async () => apiRequest("GET", `/api/inventory${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });
}

export function useInventoryItem(assetCode?: string) {
  return useQuery<any>({
    queryKey: ["/api/inventory", assetCode ?? ""],
    enabled: Boolean(assetCode),
    queryFn: async () => {
      if (!assetCode) return null;
      return apiRequest("GET", `/api/inventory/${assetCode}`);
    },
  });
}

export function useInventoryCategories() {
  return useQuery<InventoryCategory[]>({ queryKey: ["/api/inventory/categories"] });
}

export function useInventoryLocations() {
  return useQuery<InventoryLocation[]>({ queryKey: ["/api/inventory/locations"] });
}

export function useCreateInventoryCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<InventoryCategory>) => apiRequest("POST", "/api/inventory/categories", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/inventory/categories"] }),
  });
}

export function useCreateInventoryLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<InventoryLocation>) => apiRequest("POST", "/api/inventory/locations", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/inventory/locations"] }),
  });
}

export function useCreateInventoryItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/inventory", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Item creado", description: "El activo se registró correctamente." });
    },
    onError: () => toast({ title: "Error", description: "No se pudo crear el item.", variant: "destructive" }),
  });
}

export function useMoveInventoryItem(assetCode: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { toLocation: string; note?: string }) => apiRequest("POST", `/api/inventory/${assetCode}/move`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory", assetCode] });
    },
  });
}

export function useMoveByScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { item_asset_code?: string; item_nfc_uid?: string; location_code?: string; location_nfc_uid?: string; note?: string }) => apiRequest("POST", "/inventory/move-by-scan", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }),
  });
}

export function useCreateAudit() {
  return useMutation({
    mutationFn: (data: { name: string }) => apiRequest("POST", "/api/inventory/audits", data),
  });
}

export function useVerifyAuditItem(auditId: string) {
  return useMutation({
    mutationFn: (assetCode: string) => apiRequest("POST", `/api/inventory/audits/${auditId}/verify`, { assetCode }),
  });
}

export function useInventoryByNfc(uid?: string) {
  return useQuery<any>({
    queryKey: ["/api/inventory/by-nfc", uid ?? ""],
    enabled: Boolean(uid),
    queryFn: async () => apiRequest("GET", `/inventory/by-nfc/${uid}`),
  });
}

export function useRegisterItemNfc() {
  return useMutation({
    mutationFn: (data: { asset_code: string; nfc_uid: string }) => apiRequest("POST", "/inventory/nfc/register-item", data),
  });
}

export function useRegisterLocationNfc() {
  return useMutation({
    mutationFn: (data: { location_id?: string; location_code?: string; nfc_uid: string }) => apiRequest("POST", "/inventory/nfc/register-location", data),
  });
}

export function useInventoryLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/inventory/loan", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/by-nfc"] });
    },
  });
}

export function useInventoryReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { loanId: string; returnHasIncident?: boolean; returnIncidentNotes?: string }) => apiRequest("POST", "/api/inventory/return", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/by-nfc"] });
    },
  });
}


export function useInventoryHistory() {
  return useQuery<any[]>({ queryKey: ["/api/inventory/history"] });
}

export function useInventoryLocationDetail(locationCode?: string) {
  return useQuery<any>({
    queryKey: ["/loc", locationCode ?? ""],
    enabled: Boolean(locationCode),
    queryFn: async () => apiRequest("GET", `/loc/${locationCode}`),
  });
}

// ========================================
// QUARTERLY PLANS
// ========================================

export interface QuarterlyPlanItem {
  id: string;
  quarterlyPlanId: string;
  title: string;
  description?: string | null;
  activityDate: string; // YYYY-MM-DD
  location?: string | null;
  estimatedAttendance?: number | null;
  budget?: string | null;
  notes?: string | null;
  order: number;
  activityId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuarterlyPlan {
  id: string;
  organizationId?: string | null;
  organizationName?: string | null;
  quarter: number;
  year: number;
  status: "draft" | "submitted" | "approved" | "rejected";
  submittedAt?: string | null;
  submittedByName?: string | null;
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  reviewComment?: string | null;
  itemCount?: number;
  items?: QuarterlyPlanItem[];
  createdAt: string;
  updatedAt: string;
}

export interface QuarterlyPlanSemaphore {
  quarter: number;
  year: number;
  plans: Array<QuarterlyPlan & { semaphore: "green" | "yellow" | "red" }>;
}

export function useQuarterlyPlans() {
  return useQuery<QuarterlyPlan[]>({
    queryKey: ["/api/quarterly-plans"],
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useQuarterlyPlan(id?: string) {
  return useQuery<QuarterlyPlan>({
    queryKey: ["/api/quarterly-plans", id],
    enabled: Boolean(id),
    queryFn: async () => apiRequest("GET", `/api/quarterly-plans/${id}`),
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useQuarterlyPlanSemaphore() {
  return useQuery<QuarterlyPlanSemaphore>({
    queryKey: ["/api/quarterly-plans/dashboard/semaphore"],
    ...REALTIME_QUERY_OPTIONS,
  });
}

export function useCreateQuarterlyPlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: { organizationId?: string | null; quarter: number; year: number }) =>
      apiRequest("POST", "/api/quarterly-plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-plans"] });
      toast({ title: "Plan creado", description: "El plan trimestral ha sido creado." });
    },
    onError: (err: any) => {
      const msg = err?.message ?? "No se pudo crear el plan.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });
}

export function useSubmitQuarterlyPlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/quarterly-plans/${id}/submit`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-plans"] });
      toast({ title: "Plan enviado", description: "El plan fue enviado para revisión." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "No se pudo enviar el plan.", variant: "destructive" });
    },
  });
}

export function useReviewQuarterlyPlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, action, comment }: { id: string; action: "approved" | "rejected"; comment?: string }) =>
      apiRequest("PATCH", `/api/quarterly-plans/${id}/review`, { action, comment }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-plans"] });
      const msg = vars.action === "approved" ? "Plan aprobado." : "Plan rechazado.";
      toast({ title: "Revisión guardada", description: msg });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "No se pudo revisar el plan.", variant: "destructive" });
    },
  });
}

export function useDeleteQuarterlyPlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/quarterly-plans/${id}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-plans"] });
      toast({ title: "Plan eliminado" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "No se pudo eliminar el plan.", variant: "destructive" });
    },
  });
}

export function useCreateQuarterlyPlanItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ planId, data }: { planId: string; data: Omit<QuarterlyPlanItem, "id" | "quarterlyPlanId" | "order" | "activityId" | "createdAt" | "updatedAt"> }) =>
      apiRequest("POST", `/api/quarterly-plans/${planId}/items`, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-plans", vars.planId] });
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-plans"] });
      toast({ title: "Actividad agregada" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "No se pudo agregar la actividad.", variant: "destructive" });
    },
  });
}

export function useUpdateQuarterlyPlanItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ planId, itemId, data }: { planId: string; itemId: string; data: Partial<QuarterlyPlanItem> }) =>
      apiRequest("PUT", `/api/quarterly-plans/${planId}/items/${itemId}`, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-plans", vars.planId] });
      toast({ title: "Actividad actualizada" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "No se pudo actualizar la actividad.", variant: "destructive" });
    },
  });
}

export function useDeleteQuarterlyPlanItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ planId, itemId }: { planId: string; itemId: string }) =>
      apiRequest("DELETE", `/api/quarterly-plans/${planId}/items/${itemId}`, undefined),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-plans", vars.planId] });
      queryClient.invalidateQueries({ queryKey: ["/api/quarterly-plans"] });
      toast({ title: "Actividad eliminada" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message ?? "No se pudo eliminar la actividad.", variant: "destructive" });
    },
  });
}
