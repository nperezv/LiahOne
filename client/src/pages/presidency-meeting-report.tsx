import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizations, usePresidencyMeetings, useUsers, useCreateAssignment } from "@/hooks/use-api";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const organizationSlugs: Record<string, string> = {
  "hombres-jovenes": "hombres_jovenes",
  "mujeres-jovenes": "mujeres_jovenes",
  "sociedad-socorro": "sociedad_socorro",
  primaria: "primaria",
  "escuela-dominical": "escuela_dominical",
  jas: "jas",
  "cuorum-elderes": "cuorum_elderes",
};

const navigateWithTransition = (navigate: (path: string) => void, path: string) => {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as any).startViewTransition(() => navigate(path));
    return;
  }
  navigate(path);
};

const formSchema = z.object({
  reviewedPreviousAgenda: z.string().optional(),
  meetingNotes: z.string().optional(),
  agreements: z.array(z.object({
    description: z.string().min(1, "Escribe un acuerdo"),
    followUp: z.boolean().default(true),
    responsible: z.string().optional(),
    dueDate: z.string().optional(),
  })).default([{ description: "", followUp: true, responsible: "", dueDate: "" }]),
});

type FormValues = z.infer<typeof formSchema>;

export default function PresidencyMeetingReportPage() {
  const [, params] = useRoute("/presidency/:org/meeting/:meetingId/report");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: organizations = [] } = useOrganizations();
  const orgType = params?.org ? organizationSlugs[params.org] : undefined;
  const organization = (organizations as any[]).find((org: any) => org.type === orgType);
  const organizationId = organization?.id;

  const { data: meetings = [], isLoading: meetingsLoading } = usePresidencyMeetings(organizationId);
  const { data: users = [] } = useUsers();
  const createAssignmentMutation = useCreateAssignment();

  const meeting = useMemo(
    () => (meetings as any[]).find((item: any) => item.id === params?.meetingId),
    [meetings, params?.meetingId],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reviewedPreviousAgenda: "",
      meetingNotes: "",
      agreements: [{ description: "", followUp: true, responsible: "", dueDate: "" }],
    },
  });

  const agreements = form.watch("agreements") || [];

  const addAgreement = () => {
    const current = form.getValues("agreements") || [];
    form.setValue("agreements", [...current, { description: "", followUp: true, responsible: "", dueDate: "" }]);
  };

  const removeAgreement = (index: number) => {
    const current = form.getValues("agreements") || [];
    form.setValue("agreements", current.filter((_, idx) => idx !== index));
  };

  const onSubmit = async (values: FormValues) => {
    if (!meeting) return;
    try {
      const cleanedAgreements = values.agreements
        .map((item) => ({
          description: item.description.trim(),
          followUp: Boolean(item.followUp),
          responsible: item.responsible || "",
          dueDate: item.dueDate || "",
        }))
        .filter((item) => item.description.length > 0);

      for (const agreement of cleanedAgreements) {
        if (!agreement.followUp || !agreement.responsible) continue;
        await createAssignmentMutation.mutateAsync({
          title: agreement.description,
          description: `Asignación creada desde el informe de la reunión (${new Date(meeting.date).toLocaleDateString("es-ES")}).`,
          assignedTo: agreement.responsible,
          dueDate: agreement.dueDate ? new Date(agreement.dueDate).toISOString() : new Date().toISOString(),
          status: "pendiente",
          relatedTo: `presidency_meeting:${meeting.id}`,
        });
      }

      const existingNotes = (meeting.notes || "").trim();
      const reportSection = [
        `REVISIÓN DE AGENDA ANTERIOR:\n${values.reviewedPreviousAgenda || "Sin revisión detallada."}`,
        `NOTAS DE LA REUNIÓN:\n${values.meetingNotes || "Sin notas registradas."}`,
      ].join("\n\n");

      await apiRequest("PUT", `/api/presidency-meetings/${meeting.id}`, {
        notes: [existingNotes, reportSection].filter(Boolean).join("\n\n---\n\n"),
        agreements: cleanedAgreements.map((item) => ({
          description: item.description,
          responsible: item.followUp
            ? ((users as any[]).find((u: any) => u.id === item.responsible)?.name || "Por asignar")
            : "Sin seguimiento",
        })),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/presidency-meetings", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Informe guardado", description: "El informe y acuerdos se guardaron correctamente." });
      navigateWithTransition(setLocation, `/presidency/${params?.org ?? ""}/manage`);
    } catch {
      toast({ title: "Error", description: "No se pudo guardar el informe", variant: "destructive" });
    }
  };

  if (!organizationId || meetingsLoading || !meeting) {
    return (
      <div className="space-y-4 p-4 md:p-6 xl:p-8">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 xl:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Reunión de presidencia</p>
          <h1 className="text-2xl font-bold">Informe de la reunión</h1>
        </div>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => navigateWithTransition(setLocation, `/presidency/${params?.org ?? ""}/manage`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>

      <Card className="rounded-3xl border-border/70 bg-card/95">
        <CardHeader>
          <CardTitle>Datos de la reunión</CardTitle>
          <CardDescription>Se completa al crear la reunión</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="font-medium">Fecha:</span> {new Date(meeting.date).toLocaleString("es-ES")}</p>
          <p><span className="font-medium">Agenda:</span></p>
          <pre className="whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-xs">{meeting.agenda || "Sin agenda"}</pre>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-border/70 bg-card/95">
        <CardHeader>
          <CardTitle>Redacción del informe</CardTitle>
          <CardDescription>Usa este formulario al iniciar la reunión para tomar notas y acuerdos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="reviewedPreviousAgenda" render={({ field }) => (
                <FormItem>
                  <FormLabel>Repaso de la reunión anterior</FormLabel>
                  <FormControl><Textarea placeholder="Qué se revisó de la agenda anterior" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="meetingNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas de la reunión</FormLabel>
                  <FormControl><Textarea placeholder="Notas en vivo de la reunión" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel>Acuerdos</FormLabel>
                  <Button type="button" variant="outline" size="sm" onClick={addAgreement}><Plus className="mr-1 h-4 w-4" />Agregar</Button>
                </div>
                {agreements.map((_, index) => (
                  <div key={`agreement-${index}`} className="space-y-2 rounded-xl border border-border/70 p-3">
                    <FormField control={form.control} name={`agreements.${index}.description`} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Acuerdo</FormLabel>
                        <FormControl><Input placeholder="Acuerdo a tomar" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid gap-2 md:grid-cols-2">
                      <FormField control={form.control} name={`agreements.${index}.responsible`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Responsable (opcional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {(users as any[]).map((u: any) => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name={`agreements.${index}.dueDate`} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha límite (opcional)</FormLabel>
                          <FormControl><Input type="datetime-local" {...field} /></FormControl>
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name={`agreements.${index}.followUp`} render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 space-y-0">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} /></FormControl>
                        <FormLabel className="m-0">Crear asignación de seguimiento</FormLabel>
                      </FormItem>
                    )} />
                    {agreements.length > 1 ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeAgreement(index)}><Trash2 className="mr-1 h-4 w-4" />Quitar</Button>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={createAssignmentMutation.isPending}>Guardar informe</Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
