import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, FileText, Download, Edit } from "lucide-react";
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
import { useWardCouncils, useCreateWardCouncil } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { generateWardCouncilPDF } from "@/lib/pdf-utils";
import { exportWardCouncils } from "@/lib/export";

const councilSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  agenda: z.string().optional(),
  notes: z.string().optional(),
});

type CouncilFormValues = z.infer<typeof councilSchema>;

export default function WardCouncilPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { user } = useAuth();
  const { data: councils = [], isLoading } = useWardCouncils();
  const createMutation = useCreateWardCouncil();
  
  const canManage = user?.role === "obispo" || user?.role === "consejero_obispo" || user?.role === "secretario";

  const form = useForm<CouncilFormValues>({
    resolver: zodResolver(councilSchema),
    defaultValues: {
      date: "",
      agenda: "",
      notes: "",
    },
  });

  const onSubmit = (data: CouncilFormValues) => {
    createMutation.mutate({
      ...data,
      agenda: data.agenda || "",
      attendance: [],
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

  if (isLoading) {
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Consejo de Barrio</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona las agendas y acuerdos del consejo de barrio
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => exportWardCouncils(councils)}
            data-testid="button-export-council"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          {canManage && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-council">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Consejo
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Crear Consejo de Barrio</DialogTitle>
                <DialogDescription>
                  Programa una nueva reunión del consejo de barrio
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
                            placeholder="Notas adicionales"
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
                      {createMutation.isPending ? "Creando..." : "Crear Consejo"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {councils.length > 0 ? (
          councils.map((council: any) => (
            <Card key={council.id} className="hover-elevate" data-testid={`card-council-${council.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">
                      Consejo - {new Date(council.date).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </CardTitle>
                    {council.agenda && (
                      <CardDescription className="mt-2 whitespace-pre-wrap">
                        {council.agenda}
                      </CardDescription>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => generateWardCouncilPDF(council)}
                    data-testid={`button-export-${council.id}`}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Exportar PDF
                  </Button>
                </div>
              </CardHeader>
              {council.notes && (
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {council.notes}
                  </p>
                </CardContent>
              )}
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No hay consejos programados
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
