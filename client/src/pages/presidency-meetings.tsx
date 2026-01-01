import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRoute, useLocation } from "wouter";
import { Plus, FileText, Edit, Target, Download, FileJson, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { useAuth } from "@/lib/auth";
import { usePresidencyMeetings, useCreatePresidencyMeeting, useOrganizations } from "@/hooks/use-api";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const meetingSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  agenda: z.string().optional(),
  notes: z.string().optional(),
});

type MeetingFormValues = z.infer<typeof meetingSchema>;

export default function PresidencyMeetingsPage() {
  const { user } = useAuth();
  const [, params] = useRoute("/presidency/:org");
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | undefined>();

  const { data: organizations = [] } = useOrganizations();
  const { data: meetings = [], isLoading } = usePresidencyMeetings(organizationId);
  const createMutation = useCreatePresidencyMeeting(organizationId);
  const { toast } = useToast();
  
  // Organization members can only see their own presidency
  const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
  const isObispado = user?.role === "obispo" || user?.role === "consejero_obispo";
  const canCreate = !isOrgMember || organizationId === user?.organizationId;
  const canDelete = isObispado || isOrgMember;

  const organizationSlugs: Record<string, string> = {
    "hombres-jovenes": "hombres_jovenes",
    "mujeres-jovenes": "mujeres_jovenes",
    "sociedad-socorro": "sociedad_socorro",
    "primaria": "primaria",
    "escuela-dominical": "escuela_dominical",
    "jas": "jas",
    "cuorum-elderes": "cuorum_elderes",
  };

  const organizationNames: Record<string, string> = {
    "hombres-jovenes": "Hombres Jóvenes",
    "mujeres-jovenes": "Mujeres Jóvenes",
    "sociedad-socorro": "Sociedad de Socorro",
    "primaria": "Primaria",
    "escuela-dominical": "Escuela Dominical",
    "jas": "JAS",
    "cuorum-elderes": "Cuórum de Élderes",
  };

  useEffect(() => {
    if (params?.org && organizations.length > 0) {
      const slug = organizationSlugs[params.org];
      const org = organizations.find((o: any) => o.type === slug);
      setOrganizationId(org?.id);
    }
  }, [params?.org, organizations]);

  const orgName = params?.org ? organizationNames[params.org] || params.org : "Presidencia";

  // PDF export handler for meeting minutes
  const handleExportMeetingPDF = (meeting: any) => {
    const meetingDate = new Date(meeting.date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    
    // Create a document with meeting details
    const content = `REUNIÓN DE PRESIDENCIA - ${orgName.toUpperCase()}
    
Fecha: ${meetingDate}

AGENDA:
${meeting.agenda || "No hay agenda registrada"}

NOTAS:
${meeting.notes || "No hay notas registradas"}

---
Documento generado desde Liahonaap - Sistema Administrativo de Barrio`;

    // Create a simple text file and trigger download
    const element = document.createElement("a");
    const file = new Blob([content], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `reunion_${orgName.replace(/\s+/g, "_").toLowerCase()}_${new Date(meeting.date).getTime()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      date: "",
      agenda: "",
      notes: "",
    },
  });

  const onSubmit = (data: MeetingFormValues) => {
    if (!organizationId) return;

    createMutation.mutate({
      ...data,
      organizationId,
      agenda: data.agenda || "",
      agreements: [],
      assignments: [],
      notes: data.notes || "",
    }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
      },
    });
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      await apiRequest("DELETE", `/api/presidency-meetings/${meetingId}`, {});
      
      queryClient.invalidateQueries({ queryKey: ["/api/presidency-meetings", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      toast({
        title: "Reunión eliminada",
        description: "La reunión de presidencia ha sido eliminada exitosamente.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la reunión. Intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  if (isLoading || !organizationId) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Presidencia de {orgName}</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona las reuniones y acuerdos de presidencia
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          {canCreate && (
            <>
              <Button 
                variant="outline"
                onClick={() => setLocation("/goals")}
                data-testid="button-org-goals"
              >
                <Target className="h-4 w-4 mr-2" />
                Metas de Organización
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-meeting">
                    <Plus className="h-4 w-4 mr-2" />
                    Nueva Reunión
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Crear Reunión de Presidencia</DialogTitle>
                    <DialogDescription>
                      Registra la reunión de presidencia de {orgName}
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-date" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="agenda"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Agenda (Opcional)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Puntos a tratar en la reunión"
                                {...field}
                                data-testid="textarea-agenda"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notas (Opcional)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Notas de la reunión"
                                {...field}
                                data-testid="textarea-notes"
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
                          onClick={() => setIsDialogOpen(false)}
                          data-testid="button-cancel"
                        >
                          Cancelar
                        </Button>
                        <Button type="submit" data-testid="button-submit" disabled={createMutation.isPending}>
                          {createMutation.isPending ? "Creando..." : "Crear Reunión"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {meetings.length > 0 ? (
          meetings.map((meeting: any) => (
            <Card key={meeting.id} className="hover-elevate" data-testid={`card-meeting-${meeting.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">
                      Reunión - {new Date(meeting.date).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </CardTitle>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleExportMeetingPDF(meeting)}
                      data-testid={`button-export-pdf-${meeting.id}`}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Informe
                    </Button>
                    {canDelete && (
                      <Button 
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteMeeting(meeting.id)}
                        data-testid={`button-delete-meeting-${meeting.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Agenda Section */}
                {meeting.agenda && (
                  <div data-testid={`meeting-agenda-${meeting.id}`}>
                    <h4 className="font-semibold text-sm mb-2">Agenda</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-md bg-muted/50 p-3">
                      {meeting.agenda}
                    </p>
                  </div>
                )}
                
                {/* Notes/Apuntes Section */}
                {meeting.notes && (
                  <div data-testid={`meeting-notes-${meeting.id}`}>
                    <h4 className="font-semibold text-sm mb-2">Apuntes y Notas</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-md bg-muted/50 p-3">
                      {meeting.notes}
                    </p>
                  </div>
                )}
                
                {/* Empty state */}
                {!meeting.agenda && !meeting.notes && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No hay detalles de esta reunión
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No hay reuniones programadas para esta presidencia
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
