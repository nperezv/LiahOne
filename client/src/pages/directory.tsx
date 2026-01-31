import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import {
  useCreateMember,
  useDeleteMember,
  useMembers,
  useOrganizations,
  useUpdateMember,
} from "@/hooks/use-api";
import { CalendarPlus, Mail, Pencil, Phone, Search, Send, Trash2, Users } from "lucide-react";

const memberSchema = z.object({
  nameSurename: z.string().min(1, "El nombre es requerido"),
  sex: z.string().min(1, "El sexo es requerido"),
  birthday: z.string().min(1, "La fecha de nacimiento es requerida"),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  organizationId: z.string().optional().or(z.literal("")),
});

type MemberFormValues = z.infer<typeof memberSchema>;

const formatDateForInput = (value?: string | Date | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function DirectoryPage() {
  const [, setLocation] = useLocation();
  const { data: members = [], isLoading } = useMembers();
  const { data: organizations = [] } = useOrganizations();
  const createMemberMutation = useCreateMember();
  const updateMemberMutation = useUpdateMember();
  const deleteMemberMutation = useDeleteMember();
  const [query, setQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      nameSurename: "",
      sex: "",
      birthday: "",
      phone: "",
      email: "",
      organizationId: "",
    },
  });

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) => {
      const haystack = [
        member.nameSurename,
        member.phone ?? "",
        member.email ?? "",
        member.organizationName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [members, query]);

  const formatAge = (birthday: string) => {
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }
    return age;
  };

  const buildWhatsappLink = (phone?: string | null) => {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "";
  };

  const handleOpenCreate = () => {
    setEditingMember(null);
    form.reset({
      nameSurename: "",
      sex: "",
      birthday: "",
      phone: "",
      email: "",
      organizationId: "",
    });
    setIsDialogOpen(true);
  };

  const handleEditMember = (member: any) => {
    setEditingMember(member);
    form.reset({
      nameSurename: member.nameSurename,
      sex: member.sex,
      birthday: formatDateForInput(member.birthday),
      phone: member.phone ?? "",
      email: member.email ?? "",
      organizationId: member.organizationId ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmitMember = (data: MemberFormValues) => {
    const payload = {
      ...data,
      birthday: new Date(data.birthday).toISOString(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      organizationId: data.organizationId || null,
    };

    if (editingMember) {
      updateMemberMutation.mutate(
        { id: editingMember.id, payload },
        {
          onSuccess: () => {
            setIsDialogOpen(false);
            setEditingMember(null);
            form.reset();
          },
        }
      );
    } else {
      createMemberMutation.mutate(payload, {
        onSuccess: () => {
          setIsDialogOpen(false);
          form.reset();
        },
      });
    }
  };

  const handleRequestDelete = (member: any) => {
    setDeleteCandidate(member);
    setDeleteConfirmText("");
  };

  const handleConfirmDelete = () => {
    if (!deleteCandidate) return;
    deleteMemberMutation.mutate(deleteCandidate.id, {
      onSuccess: () => {
        setDeleteCandidate(null);
        setDeleteConfirmText("");
      },
    });
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Directorio</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los miembros del barrio y sus datos de contacto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setLocation("/birthdays")}>
            Ver cumpleaños
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenCreate}>Agregar miembro</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingMember ? "Editar miembro" : "Agregar miembro"}</DialogTitle>
                <DialogDescription>
                  {editingMember
                    ? "Actualiza los datos del miembro del barrio."
                    : "Registra un nuevo miembro del barrio en el directorio."}
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmitMember)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="nameSurename"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre y Apellido</FormLabel>
                        <FormControl>
                          <Input placeholder="María López" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="sex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sexo</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="masculino">Masculino</SelectItem>
                              <SelectItem value="femenino">Femenino</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="birthday"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha de nacimiento</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Teléfono (opcional)</FormLabel>
                          <FormControl>
                            <Input placeholder="+56 9 1111 2222" {...field} />
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
                          <FormLabel>Email (opcional)</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="correo@ejemplo.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="organizationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organización (opcional)</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona una organización" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">Sin organización</SelectItem>
                            {organizations.map((org: any) => (
                              <SelectItem key={org.id} value={org.id}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createMemberMutation.isPending || updateMemberMutation.isPending}>
                      {editingMember ? "Guardar cambios" : "Agregar miembro"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Miembros del barrio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, teléfono o correo"
                className="pl-9"
              />
            </div>
            <Badge variant="outline" className="self-start sm:self-auto">
              {filteredMembers.length} miembros
            </Badge>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-32" />
                </div>
              ))}
            </div>
          ) : filteredMembers.length > 0 ? (
            <div className="space-y-3">
              {filteredMembers.map((member) => {
                const whatsappLink = buildWhatsappLink(member.phone);
                return (
                  <div
                    key={member.id}
                    className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold">{member.nameSurename}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatAge(member.birthday)} años</span>
                        <span>•</span>
                        <span>{member.organizationName ?? "Sin organización"}</span>
                        {member.email && (
                          <>
                            <span>•</span>
                            <span>{member.email}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {member.phone && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`tel:${member.phone}`}>
                            <Phone className="mr-1 h-4 w-4" />
                            Llamar
                          </a>
                        </Button>
                      )}
                      {whatsappLink && (
                        <Button asChild size="sm" variant="outline">
                          <a href={whatsappLink} target="_blank" rel="noreferrer">
                            <Send className="mr-1 h-4 w-4" />
                            WhatsApp
                          </a>
                        </Button>
                      )}
                      {member.email && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`mailto:${member.email}`}>
                            <Mail className="mr-1 h-4 w-4" />
                            Email
                          </a>
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setLocation(`/interviews?memberId=${member.id}`)}>
                        <CalendarPlus className="mr-1 h-4 w-4" />
                        Agendar entrevista
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleEditMember(member)}>
                        <Pencil className="mr-1 h-4 w-4" />
                        Editar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleRequestDelete(member)}>
                        <Trash2 className="mr-1 h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
              No hay miembros para mostrar con ese filtro.
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por eliminar a <strong>{deleteCandidate?.nameSurename}</strong>. Esta acción no se puede
              deshacer. Escribe <strong>ELIMINAR</strong> para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-3">
            <Input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder="Escribe ELIMINAR"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteCandidate(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmText.trim().toUpperCase() !== "ELIMINAR"}
              onClick={handleConfirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
