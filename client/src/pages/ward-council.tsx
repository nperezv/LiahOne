import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Download, Edit, Trash2 } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";

import {
  useWardCouncils,
  useCreateWardCouncil,
  useUpdateWardCouncil,
  useDeleteWardCouncil,
} from "@/hooks/use-api";

import { useAuth } from "@/lib/auth";
import { generateWardCouncilPDF } from "@/lib/pdf-utils";
import { exportWardCouncils } from "@/lib/export";

/* =========================
   Schema
========================= */

const councilSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  agenda: z.string().optional(),
  notes: z.string().optional(),
});

type CouncilFormValues = z.infer<typeof councilSchema>;

/* =========================
   Component
========================= */

export default function WardCouncilPage() {
  const { user } = useAuth();

  const canManage =
    user?.role === "obispo" ||
    user?.role === "consejero_obispo" ||
    user?.role === "secretario" ||
    user?.role === "secretario_ejecutivo";

  const { data: councils = [], isLoading } = useWardCouncils();
  const createMutation = useCreateWardCouncil();
  const updateMutation = useUpdateWardCouncil();
  const deleteMutation = useDeleteWardCouncil();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCouncil, setEditingCouncil] = useState<any>(null);

  /* =========================
     Forms
  ========================= */

  const createForm = useForm<CouncilFormValues>({
    resolver: zodResolver(councilSchema),
    defaultValues: { date: "", agenda: "", notes: "" },
  });

  const editForm = useForm<CouncilFormValues>({
    resolver: zodResolver(councilSchema),
  });

  /* =========================
     Handlers
  ========================= */

  const onCreate = (data: CouncilFormValues) => {
    createMutation.mutate(
      {
        ...data,
        agenda: data.agenda || "",
        notes: data.notes || "",
        attendance: [],
        agreements: [],
        assignments: [],
      },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          createForm.reset();
        },
      }
    );
  };

  const onEdit = (data: CouncilFormValues) => {
    if (!editingCouncil) return;

    updateMutation.mutate(
      {
        id: editingCouncil.id,
        data: {
          ...data,
          agenda: data.agenda || "",
          notes: data.notes || "",
        },
      },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setEditingCouncil(null);
          editForm.reset();
        },
      }
    );
  };

  const startEdit = (council: any) => {
    setEditingCouncil(council);
    editForm.reset({
      date: council.date,
      agenda: council.agenda || "",
      notes: council.notes || "",
    });
    setIsEditOpen(true);
  };

  const removeCouncil = (id: string) => {
    if (!confirm("¿Eliminar este consejo de barrio?")) return;
    deleteMutation.mutate(id);
  };

  /* =========================
     Loading
  ========================= */

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  /* =========================
     Render
  ========================= */

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold">Consejo de Barrio</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona las agendas y acuerdos del consejo
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          <Button variant="outline" onClick={() => exportWardCouncils(councils)}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>

          {canManage && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Consejo
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Crear Consejo de Barrio</DialogTitle>
                  <DialogDescription>
                    Programa una nueva reunión
                  </DialogDescription>
                </DialogHeader>

                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="agenda"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Agenda</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notas</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreateOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={createMutation.isPending}>
                        Crear
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Councils */}
      {councils.length ? (
        councils.map((c: any) => (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>
                    Consejo –{" "}
                    {new Date(c.date).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </CardTitle>

                  {c.agenda && (
                    <CardDescription className="mt-2 whitespace-pre-wrap">
                      {c.agenda}
                    </CardDescription>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateWardCouncilPDF(c)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>

                  {canManage && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(c)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeCouncil(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>

            {c.notes && (
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {c.notes}
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

      {/* Edit dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Consejo de Barrio</DialogTitle>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="agenda"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agenda</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  Guardar
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
