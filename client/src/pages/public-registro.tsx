import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  apellidos: z.string().min(1, "Los apellidos son requeridos").max(80),
  nombre: z.string().min(1, "El nombre es requerido").max(60),
  sex: z.enum(["M", "F"], { required_error: "Selecciona el sexo" }),
  birthday: z.string().min(1, "La fecha de nacimiento es requerida"),
  maritalStatus: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").or(z.literal("")).optional(),
  organizationId: z.string().optional(),
  consentEmail: z.boolean().default(false),
  consentPhone: z.boolean().default(false),
}).refine((d) => d.consentEmail || d.consentPhone, {
  message: "Debes aceptar al menos un tipo de contacto",
  path: ["consentEmail"],
});

type FormValues = z.infer<typeof schema>;
type Org = { id: string; name: string; type: string };

function calcAge(birthday: string): number {
  const birth = new Date(birthday + "T12:00:00");
  return Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export default function PublicRegistroPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMinor, setIsMinor] = useState(false);

  useEffect(() => {
    fetch("/api/public/organizations").then((r) => r.json()).then(setOrgs).catch(() => {});
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      apellidos: "",
      nombre: "",
      sex: undefined,
      birthday: "",
      maritalStatus: "",
      phone: "",
      email: "",
      organizationId: "",
      consentEmail: false,
      consentPhone: false,
    },
  });

  const watchBirthday = form.watch("birthday");
  useEffect(() => {
    if (watchBirthday) setIsMinor(calcAge(watchBirthday) < 14);
  }, [watchBirthday]);

  const onSubmit = async (data: FormValues) => {
    setError(null);
    try {
      const res = await fetch("/api/public/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          maritalStatus: data.maritalStatus || null,
          phone: data.phone || null,
          email: data.email || null,
          organizationId: data.organizationId || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Error al enviar. Inténtalo de nuevo.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl font-bold text-primary">✓</div>
          <h1 className="text-2xl font-semibold">¡Solicitud enviada!</h1>
          <p className="text-muted-foreground">
            Tus datos han sido recibidos. Un líder del barrio los revisará y te confirmará la incorporación al directorio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Registro en el directorio</h1>
          <p className="text-sm text-muted-foreground">
            Tus datos serán revisados por un líder antes de añadirte al directorio. Solo los líderes con acceso autorizado podrán verlos.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="apellidos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellidos</FormLabel>
                    <FormControl><Input placeholder="García López" {...field} /></FormControl>
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
                    <FormControl><Input placeholder="María Jesús" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sexo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="F">Femenino</SelectItem>
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
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isMinor && (
              <div className="rounded-md border border-yellow-500 bg-yellow-50 dark:bg-yellow-950 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                Los menores de 14 años deben ser registrados por sus padres o tutores. Contacta directamente al secretario del barrio.
              </div>
            )}

            <FormField
              control={form.control}
              name="maritalStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado civil <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                  <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Sin definir" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">Sin definir</SelectItem>
                      <SelectItem value="soltero">Soltero/a</SelectItem>
                      <SelectItem value="casado">Casado/a</SelectItem>
                      <SelectItem value="divorciado">Divorciado/a</SelectItem>
                      <SelectItem value="viudo">Viudo/a</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl><Input placeholder="+34 600 000 000" {...field} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl><Input type="email" placeholder="correo@ejemplo.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {orgs.length > 0 && (
              <FormField
                control={form.control}
                name="organizationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organización <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {orgs.map((org) => (
                          <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            )}

            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">Consentimiento de contacto</p>
              <p className="text-xs text-muted-foreground">
                Tus datos se usarán únicamente para coordinación pastoral interna del barrio. Solo los líderes autorizados tienen acceso. Puedes solicitar la eliminación de tus datos en cualquier momento en <strong>/baja</strong>.
              </p>
              <FormField
                control={form.control}
                name="consentEmail"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="font-normal cursor-pointer">
                      Acepto que el barrio me contacte por <strong>correo electrónico</strong>
                    </FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="consentPhone"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="font-normal cursor-pointer">
                      Acepto que el barrio me contacte por <strong>teléfono</strong>
                    </FormLabel>
                  </FormItem>
                )}
              />
              {form.formState.errors.consentEmail && (
                <p className="text-sm text-destructive">{form.formState.errors.consentEmail.message}</p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || isMinor}>
              {form.formState.isSubmitting ? "Enviando..." : "Solicitar registro"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
