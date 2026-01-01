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
import { useToast } from "@/hooks/use-toast";

const requestAccessSchema = z.object({
  name: z
    .string()
    .min(3, "Ingresa tu nombre completo")
    .refine((value) => value.trim().split(/\s+/).length >= 2, "Incluye nombre y apellido"),
  email: z.string().email("Email inválido"),
  calling: z.string().min(2, "Indica tu llamamiento"),
  phone: z.string().optional(),
  contactConsent: z.boolean().optional(),
});

type RequestAccessFormValues = z.infer<typeof requestAccessSchema>;

export default function RequestAccessPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<RequestAccessFormValues>({
    resolver: zodResolver(requestAccessSchema),
    defaultValues: {
      name: "",
      email: "",
      calling: "",
      phone: "",
      contactConsent: false,
    },
  });

  const onSubmit = async (values: RequestAccessFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          phone: values.phone || undefined,
          contactConsent: Boolean(values.contactConsent),
        }),
      });

      if (!response.ok) {
        throw new Error("No se pudo enviar la solicitud.");
      }

      setIsSubmitted(true);
      form.reset();
      toast({
        title: "Solicitud enviada",
        description: "El obispo recibirá tu solicitud y se pondrá en contacto.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo enviar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Solicitar acceso</CardTitle>
          <CardDescription>
            Completa el formulario y revisaremos tu solicitud.
          </CardDescription>
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
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre y apellido" {...field} />
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
                  name="calling"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Llamamiento</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Ej. Secretario de barrio"
                          {...field}
                          className="min-h-[90px]"
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
                      <FormLabel>Teléfono (opcional)</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+34 600 000 000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactConsent"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="text-sm font-normal">
                        Acepto ser contactado por email y WhatsApp.
                      </FormLabel>
                    </FormItem>
                  )}
                />

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
