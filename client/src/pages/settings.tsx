import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bell, FileText } from "lucide-react";

const templateSchema = z.object({
  wardName: z.string().min(1, "El nombre del barrio es requerido"),
  stakeName: z.string().optional(),
  country: z.string().optional(),
  sacramentMeetingTime: z.string().optional(),
  headerColor: z.string().min(1, "El color de encabezado es requerido"),
  accentColor: z.string().min(1, "El color de acento es requerido"),
  logoUrl: z.string().optional(),
  footerText: z.string().optional(),
  bizumPhone: z.string().optional(),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"templates" | "reminders">("templates");

  // Fetch current template - always get fresh data from server
  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ["/api/pdf-template"],
    queryFn: () => apiRequest("GET", "/api/pdf-template"),
    refetchOnMount: true, // Always fetch fresh data when component mounts
    staleTime: 0, // Data is immediately stale
  });

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      wardName: template?.wardName || "Barrio",
      stakeName: template?.stakeName || "Estaca",
      country: template?.country || "País",
      sacramentMeetingTime: template?.sacramentMeetingTime || "10:00",
      headerColor: template?.headerColor || "1F2937",
      accentColor: template?.accentColor || "3B82F6",
      logoUrl: template?.logoUrl || "",
      footerText: template?.footerText || "© Barrio - Todos los derechos reservados",
      bizumPhone: template?.bizumPhone || "",
    },
  });

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: (data: TemplateFormValues) =>
      apiRequest("PATCH", "/api/pdf-template", data),
    onSuccess: async (response) => {
      // Update React Query cache with new data
      queryClient.setQueryData(["/api/pdf-template"], response);
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      
      toast({
        title: "Éxito",
        description: "Plantilla PDF actualizada correctamente",
      });
    },
    onError: (error) => {
      console.error("Template update error:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la plantilla",
        variant: "destructive",
      });
    },
  });

  // Send reminders mutation
  const reminderMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/reminders/send"),
    onSuccess: (data) => {
      toast({
        title: "Recordatorios Enviados",
        description: `${data.data.upcomingInterviews} entrevistas próximas y ${data.data.pendingAssignments} asignaciones pendientes`,
      });
    },
    onError: (error) => {
      console.error("Reminders error:", error);
      toast({
        title: "Error",
        description: "No se pudieron enviar los recordatorios",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TemplateFormValues) => {
    updateMutation.mutate(data);
  };

  // Update form defaults when template loads
  useEffect(() => {
    if (template) {
      form.reset({
        wardName: template.wardName || "Barrio",
        stakeName: template.stakeName || "Estaca",
        country: template.country || "País",
        sacramentMeetingTime: template.sacramentMeetingTime || "10:00",
        headerColor: template.headerColor || "1F2937",
        accentColor: template.accentColor || "3B82F6",
        logoUrl: template.logoUrl || "",
        footerText: template.footerText || "© Barrio - Todos los derechos reservados",
        bizumPhone: template.bizumPhone || "",
      }, { keepValues: false });
    }
  }, [template]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Personaliza plantillas PDF y gestiona recordatorios automáticos
        </p>
      </div>

      <div className="flex gap-4 mb-6">
        <Button
          variant={activeTab === "templates" ? "default" : "outline"}
          onClick={() => setActiveTab("templates")}
          data-testid="button-tab-templates"
        >
          <FileText className="h-4 w-4 mr-2" />
          Plantillas PDF
        </Button>
        <Button
          variant={activeTab === "reminders" ? "default" : "outline"}
          onClick={() => setActiveTab("reminders")}
          data-testid="button-tab-reminders"
        >
          <Bell className="h-4 w-4 mr-2" />
          Recordatorios
        </Button>
      </div>

      {activeTab === "templates" && (
        <Card>
          <CardHeader>
            <CardTitle>Personalizar Plantilla PDF</CardTitle>
            <CardDescription>
              Personaliza los colores, logo y pie de página para tus documentos PDF
            </CardDescription>
          </CardHeader>
          <CardContent>
            {templateLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="wardName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del Barrio</FormLabel>
                        <FormControl>
                          <Input placeholder="Barrio" {...field} data-testid="input-ward-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="stakeName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre de la Estaca</FormLabel>
                          <FormControl>
                            <Input placeholder="Estaca" {...field} data-testid="input-stake-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>País</FormLabel>
                          <FormControl>
                            <Input placeholder="País" {...field} data-testid="input-country" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="sacramentMeetingTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hora de la Reunión Sacramental</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} data-testid="input-sacrament-time" />
                        </FormControl>
                        <FormDescription>
                          Define la hora que mostrará el calendario para la reunión sacramental.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bizumPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número Bizum para donaciones públicas</FormLabel>
                        <FormControl>
                          <Input placeholder="+34612345678" {...field} data-testid="input-bizum-phone" />
                        </FormControl>
                        <FormDescription>
                          Este número se usará en la página pública de donaciones (mismo dominio).
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="headerColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color de Encabezado</FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                type="color"
                                placeholder="#1F2937"
                                {...field}
                                className="h-10 w-16 cursor-pointer"
                                data-testid="input-header-color"
                              />
                              <Input
                                placeholder="1F2937"
                                {...field}
                                className="flex-1"
                                data-testid="input-header-color-text"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="accentColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color de Acento</FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                type="color"
                                placeholder="#3B82F6"
                                {...field}
                                className="h-10 w-16 cursor-pointer"
                                data-testid="input-accent-color"
                              />
                              <Input
                                placeholder="3B82F6"
                                {...field}
                                className="flex-1"
                                data-testid="input-accent-color-text"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="logoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL del Logo (Opcional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://ejemplo.com/logo.png"
                            {...field}
                            data-testid="input-logo-url"
                          />
                        </FormControl>
                        <FormDescription>
                          Proporciona la URL completa del logo para incluir en los PDFs
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="footerText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pie de Página</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="© Barrio - Todos los derechos reservados"
                            {...field}
                            data-testid="input-footer-text"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    data-testid="button-save-template"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Guardando..." : "Guardar Plantilla"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "reminders" && (
        <Card>
          <CardHeader>
            <CardTitle>Recordatorios Automáticos</CardTitle>
            <CardDescription>
              Envía recordatorios de entrevistas programadas y asignaciones pendientes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta función prepara recordatorios para:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>Recordatorio: entrevistas del día siguiente (10:00)</li>
              <li>Seguimiento: entrevistas de hoy (08:00 o 5 horas antes)</li>
              <li>Asignaciones pendientes que aún no se han completado</li>
            </ul>
            <Button
              onClick={() => reminderMutation.mutate()}
              disabled={reminderMutation.isPending}
              data-testid="button-send-reminders"
            >
              {reminderMutation.isPending ? "Enviando..." : "Enviar Recordatorios Ahora"}
            </Button>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
