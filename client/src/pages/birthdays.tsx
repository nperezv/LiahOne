import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Cake, Send, Mail, Pencil, Trash2 } from "lucide-react";

// Random birthday greetings and images
const BIRTHDAY_PHRASES = [
  "¡Feliz cumpleaños! Que este día sea lleno de alegría y bendiciones.",
  "¡Que tengas un día maravilloso! Muchas bendiciones en tu cumpleaños.",
  "¡Feliz cumpleaños! Que el Señor te guíe en este nuevo año de vida.",
  "¡Un día especial para una persona especial! ¡Feliz cumpleaños!",
  "Que este cumpleaños marque el inicio de un año lleno de éxitos.",
  "¡Feliz cumpleaños! Que disfrutes de cada momento al máximo.",
  "Que Dios te bendiga en este día y siempre. ¡Feliz cumpleaños!",
  "¡Hoy es tu día! Que sea memorable y lleno de alegría.",
  "¡Feliz cumpleaños! Agradecemos tu fe y dedicación al barrio.",
  "Que este año traiga salud, felicidad y muchas bendiciones.",
];

const BIRTHDAY_IMAGES = [
  "🎉", "🎂", "🎈", "🌟", "💝", "🎊", "🎁", "✨", "🎀", "🎭"
];
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useBirthdays, useCreateBirthday } from "@/hooks/use-api";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const birthdaySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  birthDate: z.string().min(1, "La fecha es requerida"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  organizationId: z.string().optional().or(z.literal("")),
});

type BirthdayFormValues = z.infer<typeof birthdaySchema>;

export default function BirthdaysPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showOnly30Days, setShowOnly30Days] = useState(false);
  const [editingBirthdayId, setEditingBirthdayId] = useState<string | null>(null);
  
  const { user } = useAuth();
  const { data: birthdays = [], isLoading } = useBirthdays();
  const createMutation = useCreateBirthday();
  const { toast } = useToast();
  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ["/api/organizations"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const form = useForm<BirthdayFormValues>({
    resolver: zodResolver(birthdaySchema),
    defaultValues: {
      name: "",
      birthDate: "",
      email: "",
      phone: "",
      organizationId: user?.organizationId || "",
    },
  });

  const handleEditBirthday = (birthday: any) => {
    setEditingBirthdayId(birthday.id);
    form.reset({
      name: birthday.name,
      birthDate: new Date(birthday.birthDate).toISOString().split('T')[0],
      email: birthday.email || "",
      phone: birthday.phone || "",
      organizationId: birthday.organizationId || "",
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBirthdayId(null);
    form.reset({
      name: "",
      birthDate: "",
      email: "",
      phone: "",
      organizationId: user?.organizationId || "",
    });
  };

  const onSubmit = (data: BirthdayFormValues) => {
    const payload = {
      name: data.name,
      birthDate: data.birthDate,
      email: data.email || "",
      phone: data.phone || "",
      organizationId: data.organizationId || null,
    };

    if (editingBirthdayId) {
      // Update existing birthday
      apiRequest("PUT", `/api/birthdays/${editingBirthdayId}`, payload).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/birthdays"] });
        handleCloseDialog();
        toast({
          title: "Cumpleaño actualizado",
          description: "El cumpleaño ha sido actualizado exitosamente.",
        });
      }).catch(() => {
        toast({
          title: "Error",
          description: "No se pudo actualizar el cumpleaño. Intenta nuevamente.",
          variant: "destructive",
        });
      });
    } else {
      // Create new birthday
      createMutation.mutate(payload, {
        onSuccess: () => {
          handleCloseDialog();
        },
      });
    }
  };

  const calculateDaysUntil = (birthDate: string) => {
    const today = new Date();
    const birthday = new Date(birthDate);
    const thisYearBirthday = new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate());
    
    if (thisYearBirthday < today) {
      thisYearBirthday.setFullYear(today.getFullYear() + 1);
    }
    
    const diffTime = thisYearBirthday.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const birthdaysWithDays = birthdays.map((b: any) => ({
    ...b,
    daysUntil: calculateDaysUntil(b.birthDate),
  }));

  const allBirthdaysSorted = birthdaysWithDays.sort(
    (a: any, b: any) => a.daysUntil - b.daysUntil
  );
  
  const upcomingBirthdays = showOnly30Days
    ? allBirthdaysSorted.filter((b: any) => b.daysUntil <= 30)
    : allBirthdaysSorted;

  const todaysBirthdays = birthdaysWithDays.filter((b: any) => b.daysUntil === 0);

  // Get random phrase and image for a birthday (deterministic by name)
  const getRandomGreeting = (name: string) => {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const phraseIndex = hash % BIRTHDAY_PHRASES.length;
    const imageIndex = hash % BIRTHDAY_IMAGES.length;
    return {
      phrase: BIRTHDAY_PHRASES[phraseIndex],
      image: BIRTHDAY_IMAGES[imageIndex],
    };
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Cumpleaños</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona y envía felicitaciones automáticas de cumpleaños
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-birthday">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Cumpleaños
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingBirthdayId ? "Editar Cumpleaños" : "Agregar Cumpleaños"}</DialogTitle>
                <DialogDescription>
                  {editingBirthdayId 
                    ? "Actualiza los detalles del cumpleaños"
                    : "Registra un cumpleaños para enviar felicitaciones"
                  }
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Juan Pérez"
                            {...field}
                            data-testid="input-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                <FormField
                  control={form.control}
                  name="birthDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha de Nacimiento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-birth-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="juan@example.com"
                          {...field}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="+1 (555) 000-0000"
                          {...field}
                          data-testid="input-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="organizationId"
                  render={({ field }) => {
                    const isOrgMember = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(user?.role || "");
                    const userOrgName = organizations.find((org: any) => org.id === user?.organizationId)?.name;
                    
                    return (
                      <FormItem>
                        <FormLabel>Organización {isOrgMember ? "" : "(Opcional)"}</FormLabel>
                        {isOrgMember ? (
                          <FormControl>
                            <Input
                              value={userOrgName || ""}
                              disabled
                              data-testid="input-organization-display"
                            />
                          </FormControl>
                        ) : (
                          <Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)}>
                            <FormControl>
                              <SelectTrigger data-testid="select-organization">
                                <SelectValue placeholder="Seleccionar organización" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Sin organización</SelectItem>
                              {organizations.map((org: any) => (
                                <SelectItem key={org.id} value={org.id}>
                                  {org.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
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
                    {createMutation.isPending ? "Agregando..." : "Agregar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {todaysBirthdays.length > 0 && (
        <div className="mb-6">
          <Card className="border-2 border-primary bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950 dark:to-rose-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cake className="h-5 w-5" />
                Cumpleaños de Hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {todaysBirthdays.map((birthday: any) => {
                  const greeting = getRandomGreeting(birthday.name);
                  return (
                    <div
                      key={birthday.id}
                      className="flex items-start justify-between p-4 bg-white dark:bg-slate-900 rounded-md border-l-4 border-pink-500"
                      data-testid={`today-birthday-${birthday.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{greeting.image}</span>
                          <span className="font-bold text-lg">{birthday.name}</span>
                        </div>
                        <p className="text-sm text-pink-700 dark:text-pink-300 italic">{greeting.phrase}</p>
                      </div>
                      <Button size="sm" variant="default" data-testid={`button-greet-${birthday.id}`}>
                        <Send className="h-4 w-4 mr-1" />
                        Enviar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Todos los Cumpleaños</CardTitle>
            <CardDescription>
              {showOnly30Days ? "Mostrando próximos 30 días" : "Mostrando todos los cumpleaños"}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant={showOnly30Days ? "default" : "outline"}
            onClick={() => setShowOnly30Days(!showOnly30Days)}
            data-testid="button-filter-30-days"
          >
            {showOnly30Days ? "Ver todos" : "Próximos 30 días"}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Días Restantes</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcomingBirthdays.length > 0 ? (
                upcomingBirthdays.map((birthday: any) => (
                  <TableRow key={birthday.id} data-testid={`row-birthday-${birthday.id}`}>
                    <TableCell className="font-medium">{birthday.name}</TableCell>
                    <TableCell>
                      {new Date(birthday.birthDate).toLocaleDateString("es-ES", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {birthday.phone || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={birthday.daysUntil === 0 ? "default" : "outline"}>
                        {birthday.daysUntil === 0 ? "Hoy" : `${birthday.daysUntil} días`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleEditBirthday(birthday)}
                          data-testid={`button-edit-${birthday.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            apiRequest("DELETE", `/api/birthdays/${birthday.id}`).then(() => {
                              queryClient.invalidateQueries({ queryKey: ["/api/birthdays"] });
                              toast({
                                title: "Cumpleaño eliminado",
                                description: "El cumpleaño ha sido eliminado exitosamente.",
                              });
                            }).catch(() => {
                              toast({
                                title: "Error",
                                description: "No se pudo eliminar el cumpleaño. Intenta nuevamente.",
                                variant: "destructive",
                              });
                            });
                          }}
                          data-testid={`button-delete-${birthday.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {(birthday.email || birthday.phone) && (
                          <Button size="sm" variant="outline" data-testid={`button-send-${birthday.id}`}>
                            {birthday.phone ? (
                              <>
                                <Send className="h-4 w-4 mr-1" />
                                WhatsApp
                              </>
                            ) : (
                              <>
                                <Mail className="h-4 w-4 mr-1" />
                                Email
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No hay cumpleaños próximos
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
