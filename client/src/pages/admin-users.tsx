import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Edit, Trash2, Key } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth-tokens";

const createUserSchema = z.object({
  username: z.string().min(3, "El usuario debe tener al menos 3 caracteres"),
  name: z.string().min(1, "El nombre es requerido"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional().or(z.literal("")),
  role: z.enum(["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero", "presidente_organizacion", "secretario_organizacion", "consejero_organizacion"]),
  organizationId: z.string().optional(),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const editUserSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  username: z.string().min(3, "El usuario debe tener al menos 3 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  role: z.enum(["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo", "secretario_financiero", "presidente_organizacion", "secretario_organizacion", "consejero_organizacion"]),
  organizationId: z.string().optional(),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
type EditUserFormValues = z.infer<typeof editUserSchema>;

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  organizationId?: string;
}

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface AdminSession {
  id: string;
  userId: string;
  username?: string;
  name?: string;
  role?: string;
  ipAddress?: string;
  country?: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
}

interface AccessLogEntry {
  id: string;
  userId?: string;
  username?: string;
  name?: string;
  role?: string;
  ipAddress?: string;
  country?: string;
  userAgent?: string;
  success: boolean;
  reason?: string;
  createdAt: string;
}

interface AccessRequest {
  id: string;
  name: string;
  email: string;
  calling?: string | null;
  phone?: string | null;
  contactConsent: boolean;
  status: "pendiente" | "aprobada" | "rechazada";
  createdAt: string;
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [prefilledRequestId, setPrefilledRequestId] = useState<string | null>(null);

  // Verificar que solo obispo/consejeros puedan acceder
  const isAdmin =
    user?.role === "obispo" ||
    user?.role === "consejero_obispo" ||
    user?.role === "secretario_ejecutivo";

  if (!isAdmin) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Acceso Denegado</h2>
          <p className="text-muted-foreground mb-4">
            No tienes permiso para acceder a este panel de administración.
          </p>
          <Button onClick={() => setLocation("/dashboard")}>
            Volver al Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const { data: users = [], isLoading, refetch } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
    enabled: isAdmin,
  });

  const { data: sessions = [], refetch: refetchSessions } = useQuery<AdminSession[]>({
    queryKey: ["/api/admin/sessions"],
    enabled: isAdmin,
  });

  const { data: accessLog = [] } = useQuery<AccessLogEntry[]>({
    queryKey: ["/api/admin/access-log"],
    enabled: isAdmin,
  });

  const requestId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("requestId");
  }, [location]);

  const { data: accessRequest } = useQuery<AccessRequest | null>({
    queryKey: ["/api/access-requests", requestId],
    enabled: isAdmin && Boolean(requestId),
    queryFn: async () => {
      if (!requestId) return null;
      const response = await fetch(`/api/access-requests/${requestId}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
  });

  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: "",
      name: "",
      email: "",
      phone: "",
      role: "secretario",
      organizationId: "",
    },
  });

  useEffect(() => {
    if (!accessRequest || prefilledRequestId === accessRequest.id) {
      return;
    }

    const suggestedUsername = accessRequest.email
      ? accessRequest.email.split("@")[0]
      : accessRequest.name
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ".");

      createForm.reset({
        username: suggestedUsername,
        name: accessRequest.name,
        email: accessRequest.email,
        phone: accessRequest.phone || "",
        role: "secretario",
      organizationId: "",
    });

    setPrefilledRequestId(accessRequest.id);
    setIsCreateDialogOpen(true);
  }, [accessRequest, createForm, prefilledRequestId]);

  const resetPasswordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: "",
    },
  });

  const editUserForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      phone: "",
      role: "secretario",
      organizationId: "",
    },
  });

  const selectedRole = createForm.watch("role");
  const selectedEditRole = editUserForm.watch("role");

  const onCreateUser = async (data: CreateUserFormValues) => {
    try {
      // Clean up data - don't send empty organizationId
      const cleanData = {
        ...data,
        organizationId: data.organizationId || undefined,
        email: data.email || undefined,
        phone: data.phone || undefined,
        accessRequestId: accessRequest?.id,
      };

      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(cleanData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Error al crear usuario");
      }

      toast({ title: "Éxito", description: "Usuario creado correctamente" });
      setIsCreateDialogOpen(false);
      createForm.reset();
      refetch();
      if (accessRequest?.id) {
        setPrefilledRequestId(accessRequest.id);
        setLocation("/admin/users");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el usuario",
        variant: "destructive"
      });
    }
  };

  const onResetPassword = async (data: ResetPasswordFormValues) => {
    if (!resetPasswordUser) return;

    try {
      const response = await fetch(`/api/users/${resetPasswordUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ newPassword: data.newPassword }),
      });

      if (!response.ok) throw new Error("Error al resetear contraseña");

      toast({ title: "Éxito", description: "Contraseña resetada correctamente" });
      setResetPasswordUser(null);
      resetPasswordForm.reset();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo resetear la contraseña", variant: "destructive" });
    }
  };

  const onEditUser = async (data: EditUserFormValues) => {
    if (!editUser) return;

    try {
      const response = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          ...data,
          organizationId: data.organizationId || undefined,
          email: data.email || undefined,
          phone: data.phone || undefined,
        }),
      });

      if (!response.ok) throw new Error("Error al actualizar usuario");

      toast({ title: "Éxito", description: "Usuario actualizado correctamente" });
      setEditUser(null);
      editUserForm.reset();
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo actualizar el usuario", variant: "destructive" });
    }
  };

  const onDeleteUser = async (userId: string) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este usuario?")) return;

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!response.ok) throw new Error("Error al eliminar usuario");

      toast({ title: "Éxito", description: "Usuario eliminado correctamente" });
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo eliminar el usuario", variant: "destructive" });
    }
  };

  const onRevokeSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}/revoke`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Error al revocar sesión");
      toast({ title: "Éxito", description: "Sesión revocada correctamente" });
      refetchSessions();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo revocar la sesión", variant: "destructive" });
    }
  };

  const roleLabels: Record<string, string> = {
    obispo: "Obispo",
    consejero_obispo: "Consejero del Obispo",
    secretario: "Secretario",
    secretario_ejecutivo: "Secretario Ejecutivo",
    secretario_financiero: "Secretario Financiero",
    presidente_organizacion: "Presidente",
    consejero_organizacion: "Consejero",
  };

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation("/dashboard")}
        className="mb-6"
        data-testid="button-back-to-dashboard"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver al Dashboard
      </Button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Usuarios</h1>
          <p className="text-muted-foreground mt-1">
            Administra todos los usuarios del sistema
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-user">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Crear Nuevo Usuario</DialogTitle>
              <DialogDescription>
                Se generará una contraseña temporal y se enviará al correo.
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateUser)} className="space-y-4">
                {accessRequest && (
                  <div className="rounded-lg border border-muted-foreground/20 bg-muted/20 p-4 text-sm space-y-2">
                    <div className="font-medium">Solicitud de acceso pendiente</div>
                    <div>
                      <span className="text-muted-foreground">Llamamiento:</span>{" "}
                      {accessRequest.calling || "No especificado"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Teléfono:</span>{" "}
                      {accessRequest.phone || "No especificado"}
                    </div>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-create-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Usuario</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-create-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} data-testid="input-create-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono (Opcional)</FormLabel>
                        <FormControl>
                          <Input type="tel" {...field} data-testid="input-create-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={createForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Rol</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-create-role">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="obispo">Obispo</SelectItem>
                            <SelectItem value="consejero_obispo">Consejero del Obispo</SelectItem>
                            <SelectItem value="secretario">Secretario</SelectItem>
                            <SelectItem value="secretario_ejecutivo">Secretario Ejecutivo</SelectItem>
                            <SelectItem value="secretario_financiero">Secretario Financiero</SelectItem>
                            <SelectItem value="presidente_organizacion">Presidente de Organización</SelectItem>
                            <SelectItem value="secretario_organizacion">Secretario de Organización</SelectItem>
                            <SelectItem value="consejero_organizacion">Consejero de Organización</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(selectedRole) && (
                    <FormField
                      control={createForm.control}
                      name="organizationId"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Organización</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-create-organization">
                                <SelectValue placeholder="Selecciona una organización" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {organizations.map((org) => (
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
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button type="submit" data-testid="button-submit-create-user">
                    Crear Usuario
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios del Sistema</CardTitle>
          <CardDescription>
            Total: {users.length} usuarios registrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.username}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {roleLabels[u.role] || u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.phone || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Dialog open={resetPasswordUser?.id === u.id} onOpenChange={(open) => !open && setResetPasswordUser(null)}>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setResetPasswordUser(u)}
                                data-testid={`button-reset-password-${u.id}`}
                              >
                                <Key className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            {resetPasswordUser?.id === u.id && (
                              <DialogContent className="max-w-sm">
                                <DialogHeader>
                                  <DialogTitle>Resetear Contraseña</DialogTitle>
                                  <DialogDescription>
                                    Resetea la contraseña para {u.name}
                                  </DialogDescription>
                                </DialogHeader>
                                <Form {...resetPasswordForm}>
                                  <form onSubmit={resetPasswordForm.handleSubmit(onResetPassword)} className="space-y-4">
                                    <FormField
                                      control={resetPasswordForm.control}
                                      name="newPassword"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Nueva Contraseña</FormLabel>
                                          <FormControl>
                                            <Input type="password" {...field} data-testid="input-reset-password" />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    <div className="flex gap-2 justify-end">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                          setResetPasswordUser(null);
                                          resetPasswordForm.reset();
                                        }}
                                        data-testid="button-cancel-reset"
                                      >
                                        Cancelar
                                      </Button>
                                      <Button type="submit" data-testid="button-submit-reset">
                                        Resetear
                                      </Button>
                                    </div>
                                  </form>
                                </Form>
                              </DialogContent>
                            )}
                          </Dialog>

                          <Dialog open={editUser?.id === u.id} onOpenChange={(open) => !open && setEditUser(null)}>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditUser(u);
                                  editUserForm.reset({
                                    name: u.name,
                                    username: u.username,
                                    email: u.email || "",
                                    phone: u.phone || "",
                                    role: u.role as EditUserFormValues["role"],
                                    organizationId: u.organizationId || "",
                                  });
                                }}
                                data-testid={`button-edit-user-${u.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            {editUser?.id === u.id && (
                              <DialogContent className="max-w-lg">
                                <DialogHeader>
                                  <DialogTitle>Editar Usuario</DialogTitle>
                                  <DialogDescription>
                                    Modifica los datos de {u.name}
                                  </DialogDescription>
                                </DialogHeader>
                                <Form {...editUserForm}>
                                  <form onSubmit={editUserForm.handleSubmit(onEditUser)} className="space-y-4">
                                    <FormField
                                      control={editUserForm.control}
                                      name="name"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Nombre</FormLabel>
                                          <FormControl>
                                            <Input {...field} data-testid="input-edit-name" />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    <FormField
                                      control={editUserForm.control}
                                      name="username"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Usuario</FormLabel>
                                          <FormControl>
                                            <Input {...field} data-testid="input-edit-username" />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    <FormField
                                      control={editUserForm.control}
                                      name="email"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Email (Opcional)</FormLabel>
                                          <FormControl>
                                            <Input type="email" {...field} data-testid="input-edit-email" />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    <FormField
                                      control={editUserForm.control}
                                      name="phone"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Teléfono (Opcional)</FormLabel>
                                          <FormControl>
                                            <Input type="tel" {...field} data-testid="input-edit-phone" />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    <FormField
                                      control={editUserForm.control}
                                      name="role"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Rol</FormLabel>
                                          <Select value={field.value} onValueChange={field.onChange}>
                                            <FormControl>
                                              <SelectTrigger data-testid="select-edit-role">
                                                <SelectValue />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                              <SelectItem value="obispo">Obispo</SelectItem>
                                              <SelectItem value="consejero_obispo">Consejero del Obispo</SelectItem>
                                              <SelectItem value="secretario">Secretario</SelectItem>
                                              <SelectItem value="secretario_ejecutivo">Secretario Ejecutivo</SelectItem>
                                              <SelectItem value="secretario_financiero">Secretario Financiero</SelectItem>
                                              <SelectItem value="presidente_organizacion">Presidente de Organización</SelectItem>
                                              <SelectItem value="secretario_organizacion">Secretario de Organización</SelectItem>
                                              <SelectItem value="consejero_organizacion">Consejero de Organización</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />

                                    {["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(selectedEditRole) && (
                                      <FormField
                                        control={editUserForm.control}
                                        name="organizationId"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Organización</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                              <FormControl>
                                                <SelectTrigger data-testid="select-edit-organization">
                                                  <SelectValue placeholder="Selecciona una organización" />
                                                </SelectTrigger>
                                              </FormControl>
                                              <SelectContent>
                                                {organizations.map((org) => (
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
                                    )}

                                    <div className="flex gap-2 justify-end">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                          setEditUser(null);
                                          editUserForm.reset();
                                        }}
                                        data-testid="button-cancel-edit"
                                      >
                                        Cancelar
                                      </Button>
                                      <Button type="submit" data-testid="button-submit-edit">
                                        Guardar
                                      </Button>
                                    </div>
                                  </form>
                                </Form>
                              </DialogContent>
                            )}
                          </Dialog>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDeleteUser(u.id)}
                            data-testid={`button-delete-user-${u.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Sesiones activas</CardTitle>
          <CardDescription>
            Revoca accesos activos y revisa desde qué dispositivos se conectan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No hay sesiones activas registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div className="font-medium">{session.name || session.username || "Usuario"}</div>
                        <div className="text-xs text-muted-foreground">{session.role}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{session.country || "Sin país"}</div>
                        <div className="text-xs text-muted-foreground">{session.ipAddress || "IP desconocida"}</div>
                      </TableCell>
                      <TableCell>{new Date(session.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{new Date(session.expiresAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRevokeSession(session.id)}
                        >
                          Revocar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Últimos accesos</CardTitle>
          <CardDescription>
            Registro reciente de inicios de sesión para auditoría básica.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessLog.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No hay accesos registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  accessLog.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="font-medium">{entry.name || entry.username || "Desconocido"}</div>
                        <div className="text-xs text-muted-foreground">{entry.role}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.success ? "default" : "destructive"}>
                          {entry.success ? "Éxito" : "Fallido"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{entry.country || "Sin país"}</div>
                        <div className="text-xs text-muted-foreground">{entry.ipAddress || "IP desconocida"}</div>
                      </TableCell>
                      <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.reason || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
