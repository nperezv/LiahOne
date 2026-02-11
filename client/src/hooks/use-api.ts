import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const REALTIME_QUERY_OPTIONS = {
  refetchInterval: 5000,
  refetchOnWindowFocus: true,
  staleTime: 3000,
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
  sex: string;
  birthday: string;
  phone?: string | null;
  email?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationType?: string | null;
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
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la solicitud. Intenta nuevamente.",
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
        title: "Presupuesto aprobado",
        description: "La solicitud ha sido aprobada exitosamente.",
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
// ACTIVITIES
// ========================================

export interface Activity {
  id: string;
  title: string;
  description?: string;
  date: string;
  location?: string;
  organizationId?: string | null;
  responsiblePerson?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
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
// ASSIGNMENTS
// ========================================

export function useAssignments() {
  return useQuery<any>({
    queryKey: ["/api/assignments"],
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

export function useUpsertOrganizationAttendance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: { organizationId: string; weekStartDate: string; attendeesCount: number }) =>
      apiRequest("POST", "/api/organization-attendance", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organization-attendance", variables.organizationId] });
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
