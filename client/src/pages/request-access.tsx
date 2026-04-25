import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const requestAccessSchema = z
  .object({
    nombre: z.string().min(1, "El nombre es requerido"),
    apellidos: z.string().min(1, "Los apellidos son requeridos"),
    sex: z.enum(["M", "F"], { required_error: "Indica tu sexo" }),
    birthday: z.string().min(1, "La fecha de nacimiento es requerida"),
    email: z.string().email("Email inválido"),
    calling: z.string().min(2, "Indica tu llamamiento"),
    phone: z.string().optional(),
    consentEmail: z.boolean().optional(),
    consentPhone: z.boolean().optional(),
  })
  .refine((data) => data.consentEmail || data.consentPhone, {
    message: "Acepta al menos un tipo de contacto",
    path: ["consentEmail"],
  });

type RequestAccessFormValues = z.infer<typeof requestAccessSchema>;

export default function RequestAccessPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<RequestAccessFormValues>({
    resolver: zodResolver(requestAccessSchema),
    defaultValues: {
      nombre: "",
      apellidos: "",
      sex: undefined,
      birthday: "",
      email: "",
      calling: "",
      phone: "",
      consentEmail: false,
      consentPhone: false,
    },
  });

  const onSubmit = async (values: RequestAccessFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: values.nombre.trim(),
          apellidos: values.apellidos.trim(),
          name: `${values.nombre.trim()} ${values.apellidos.trim()}`,
          sex: values.sex,
          birthday: values.birthday,
          email: values.email,
          calling: values.calling,
          phone: values.phone || undefined,
          consentEmail: Boolean(values.consentEmail),
          consentPhone: Boolean(values.consentPhone),
          contactConsent: Boolean(values.consentEmail || values.consentPhone),
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("Ya existe una cuenta con ese correo. Ve a iniciar sesión o recupera tu acceso.");
        }
        throw new Error("No se pudo enviar la solicitud.");
      }

      setIsSubmitted(true);
      form.reset();
      toast({
        title: "Solicitud enviada",
        description: "El obispo recibirá tu solicitud y se pondrá en contacto.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo enviar la solicitud. Intenta nuevamente.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Solicitar acceso</CardTitle>
          <CardDescription>Completa el formulario y revisaremos tu solicitud.</CardDescription>
        </CardHeader>
        <CardContent>
          {isSubmitted ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                ¡Gracias! Recibimos tu solicitud. Te contactaremos pronto.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/welcome">Volver a la bienvenida</Link>
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="nombre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input placeholder="Nombre" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="apellidos"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apellidos</FormLabel>
                        <FormControl>
                          <Input placeholder="Apellidos" {...field} />
                        </FormControl>
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="M">Hombre</SelectItem>
                            <SelectItem value="F">Mujer</SelectItem>
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

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="correo@ejemplo.com" {...field} />
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
                        <Input type="tel" placeholder="+34 600 000 000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="calling"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Llamamiento</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Ej. Secretario de barrio"
                          {...field}
                          className="min-h-[80px]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <p className="text-sm font-medium">Consentimiento de contacto</p>
                  <p className="text-xs text-muted-foreground">Acepta al menos una opción para que podamos contactarte.</p>
                  <FormField
                    control={form.control}
                    name="consentEmail"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">
                          Acepto ser contactado por correo electrónico
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="consentPhone"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">
                          Acepto ser contactado por teléfono / WhatsApp
                        </FormLabel>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.formState.errors.consentEmail && (
                    <p className="text-sm text-destructive">{form.formState.errors.consentEmail.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Enviando..." : "Enviar solicitud"}
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link href="/welcome">Cancelar</Link>
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
