import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { fetchWithAuthRetry, getAuthHeaders } from "@/lib/auth-tokens";
import { PushNotificationSettings } from "@/components/push-notification-settings";
import { getStoredTheme, setStoredTheme, type ThemePreference } from "@/lib/theme";

const profileSchema = z.object({
  apellidos: z.string().min(1, "Los apellidos son requeridos"),
  nombre: z.string().min(1, "El nombre es requerido"),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  username: z.string().min(3, "El usuario debe tener al menos 3 caracteres"),
  requireEmailOtp: z.boolean().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "La contraseña actual es requerida"),
  newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
  confirmPassword: z.string().min(6, "Confirma tu contraseña"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

// Compress + resize avatar client-side → data URL stored directly in DB
// Avoids ephemeral-disk loss on cloud deployments
function compressAvatar(file: File, maxPx = 240, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not available"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
    img.src = objectUrl;
  });
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => getStoredTheme());
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user?.requirePasswordChange) {
      setIsChangingPassword(true);
      setIsEditing(false);
    }
  }, [user?.requirePasswordChange]);

  const parsedName = useMemo(() => {
    const raw = user?.name || "";
    const commaIdx = raw.indexOf(", ");
    if (commaIdx !== -1) {
      return { apellidos: raw.slice(0, commaIdx), nombre: raw.slice(commaIdx + 2) };
    }
    return { apellidos: "", nombre: raw };
  }, [user?.name]);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      apellidos: parsedName.apellidos,
      nombre: parsedName.nombre,
      phone: user?.phone || "",
      email: user?.email || "",
      username: user?.username || "",
      requireEmailOtp: user?.requireEmailOtp ?? false,
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: ProfileFormValues) => {
    try {
      let avatarUrl = user?.avatarUrl ?? null;
      if (removeAvatar) {
        avatarUrl = null;
      }

      if (avatarFile) {
        // Compress client-side and store as data URL in DB — avoids ephemeral disk loss
        avatarUrl = await compressAvatar(avatarFile);
      }

      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ nombre: data.nombre, apellidos: data.apellidos, phone: data.phone, email: data.email, username: data.username, requireEmailOtp: data.requireEmailOtp, avatarUrl }),
      });

      if (!response.ok) throw new Error("Error al actualizar perfil");
      
      toast({ title: "Éxito", description: "Perfil actualizado correctamente" });
      setIsEditing(false);
      window.location.reload();
    } catch (error) {
      toast({ title: "Error", description: "No se pudo actualizar el perfil", variant: "destructive" });
    }
  };

  const onPasswordSubmit = async (data: PasswordFormValues) => {
    try {
      const response = await fetch("/api/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al cambiar la contraseña");
      }

      toast({ title: "Éxito", description: "Contraseña cambiada correctamente" });
      if (user?.requirePasswordChange) {
        window.location.reload();
        return;
      }

      setIsChangingPassword(false);
      passwordForm.reset();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "No se pudo cambiar la contraseña", variant: "destructive" });
    }
  };

  const roleLabels: Record<string, string> = {
    obispo: "Obispo",
    consejero_obispo: "Consejero del Obispo",
    secretario: "Secretario",
    presidente_organizacion: "Presidente de Organización",
    secretario_organizacion: "Secretario de Organización",
    consejero_organizacion: "Consejero de Organización",
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const avatarPreview = useMemo(() => {
    if (avatarFile) {
      return URL.createObjectURL(avatarFile);
    }
    if (removeAvatar) {
      return null;
    }
    return user?.avatarUrl ?? null;
  }, [avatarFile, removeAvatar, user?.avatarUrl]);

  useEffect(() => {
    if (!avatarFile || !avatarPreview) {
      return;
    }

    return () => {
      URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarFile, avatarPreview]);

  const handleAvatarSelect = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarRemove = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAvatarFile(null);
    setRemoveAvatar(true);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  };

  const handleThemeChange = (value: string) => {
    if (!value) return;
    const nextTheme = value as ThemePreference;
    setThemePreference(nextTheme);
    setStoredTheme(nextTheme);
  };

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Mi Perfil</h1>
          <p className="text-muted-foreground mt-1">Gestiona la información de tu cuenta</p>
        </div>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => setLocation("/dashboard")}
          data-testid="button-back-to-dashboard"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="flex items-start gap-6">
            <button
              type="button"
              className="relative h-20 w-20 rounded-full"
              onClick={isEditing ? handleAvatarSelect : undefined}
              aria-label="Cambiar foto de perfil"
            >
              <Avatar className="h-20 w-20">
                {avatarPreview && <AvatarImage src={avatarPreview} alt={user?.name} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {user ? getInitials(user.name) : "U"}
                </AvatarFallback>
              </Avatar>
              {isEditing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/50 text-[10px] font-semibold text-white opacity-0 transition-opacity hover:opacity-100">
                  <span>{avatarPreview ? "Cambiar" : "Subir"}</span>
                  {avatarPreview && (
                    <button
                      type="button"
                      className="text-[10px] underline"
                      onClick={handleAvatarRemove}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              )}
            </button>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{user?.name || "Usuario"}</h3>
              <p className="text-sm text-muted-foreground">
                {user ? roleLabels[user.role] || user.role : "Rol"}
              </p>
              {isEditing && (
                <p className="text-xs text-muted-foreground mt-2">
                  Haz clic en el círculo para subir, cambiar o quitar tu foto.
                </p>
              )}
            </div>
          </div>

          {user?.requirePasswordChange && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              Por seguridad, debes actualizar tu contraseña temporal antes de continuar.
            </div>
          )}

          <div className="rounded-lg border border-border/80 bg-card/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold">Tema</h4>
                <p className="text-xs text-muted-foreground">
                  Elige cómo quieres ver la app en tu dispositivo.
                </p>
              </div>
              <ToggleGroup
                type="single"
                value={themePreference}
                onValueChange={handleThemeChange}
                className="w-full flex-wrap justify-start rounded-2xl bg-muted/40 p-1 sm:w-auto"
              >
                <ToggleGroupItem value="light" aria-label="Tema claro">
                  Claro
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" aria-label="Tema oscuro">
                  Oscuro
                </ToggleGroupItem>
                <ToggleGroupItem value="system" aria-label="Tema del sistema">
                  Sistema
                </ToggleGroupItem>
                <ToggleGroupItem value="white-black" aria-label="Tema white and black">
                  White & Black
                </ToggleGroupItem>
                <ToggleGroupItem value="blue-black" aria-label="Tema black and blue">
                  Black & Blue
                </ToggleGroupItem>
                <ToggleGroupItem value="terracotta" aria-label="Tema terracota soft">
                  Terracota Soft
                </ToggleGroupItem>
                <ToggleGroupItem value="graphite-mint" aria-label="Tema graphite and mint">
                  Graphite & Mint
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {!isEditing && !isChangingPassword && !user?.requirePasswordChange ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Email</label>
                <p className="text-sm text-muted-foreground mt-1">{user?.email || "No disponible"}</p>
              </div>
              {user?.phone && (
                <div>
                  <label className="text-sm font-medium">Teléfono</label>
                  <p className="text-sm text-muted-foreground mt-1">{user.phone}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Usuario</label>
                <p className="text-sm text-muted-foreground mt-1">{user?.username || "No disponible"}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Código por email</label>
                <p className="text-sm text-muted-foreground mt-1">
                  {user?.requireEmailOtp
                    ? "Siempre requerido"
                    : "Solo en dispositivos nuevos o cambios sospechosos"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setIsEditing(true)} data-testid="button-edit-profile">
                  Editar Perfil
                </Button>
                <Button variant="outline" onClick={() => setIsChangingPassword(true)} data-testid="button-change-password">
                  Cambiar Contraseña
                </Button>
              </div>
            </div>
          ) : isChangingPassword || user?.requirePasswordChange ? (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña Actual</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPasswords.current ? "text" : "password"}
                            {...field}
                            data-testid="input-current-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                            className="absolute right-3 top-2.5"
                          >
                            {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nueva Contraseña</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPasswords.new ? "text" : "password"}
                            {...field}
                            data-testid="input-new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                            className="absolute right-3 top-2.5"
                          >
                            {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar Contraseña</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPasswords.confirm ? "text" : "password"}
                            {...field}
                            data-testid="input-confirm-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                            className="absolute right-3 top-2.5"
                          >
                            {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button type="submit" data-testid="button-save-password">
                    Cambiar Contraseña
                  </Button>
                  {!user?.requirePasswordChange && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsChangingPassword(false);
                        passwordForm.reset();
                      }}
                      data-testid="button-cancel-password"
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="apellidos"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apellidos</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-apellidos" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-nombre" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setAvatarFile(file);
                    setRemoveAvatar(false);
                  }}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-email" />
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
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input type="tel" {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Usuario</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requireEmailOtp"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="text-sm font-normal">Requerir código por email en cada inicio</FormLabel>
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button type="submit" data-testid="button-save-profile">
                    Guardar Cambios
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      form.reset();
                      setAvatarFile(null);
                      setRemoveAvatar(false);
                    }}
                    data-testid="button-cancel-edit"
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <PushNotificationSettings />
      </div>
    </div>
  );
}
