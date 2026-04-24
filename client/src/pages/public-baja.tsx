import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const schema = z.object({
  apellidos: z.string().min(1, "Los apellidos son requeridos"),
  nombre: z.string().min(1, "El nombre es requerido"),
  email: z.string().email("Email inválido"),
  motivo: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function PublicBajaPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { apellidos: "", nombre: "", email: "", motivo: ""  },
  });

  const onSubmit = async (data: FormValues) => {
    setError(null);
    try {
      const res = await fetch("/api/public/baja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, motivo: data.motivo || null }),
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
          <h1 className="text-2xl font-semibold">Solicitud recibida</h1>
          <p className="text-muted-foreground">
            Hemos recibido tu solicitud de baja. Un líder del barrio la procesará en un plazo máximo de 30 días, conforme al RGPD.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Solicitud de baja del directorio</h1>
          <p className="text-sm text-muted-foreground">
            Puedes ejercer tu derecho de supresión (RGPD Art. 17) solicitando que eliminemos tus datos del directorio del barrio. Procesaremos tu solicitud en un máximo de 30 días.
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

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="correo@ejemplo.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="Puedes indicar el motivo si lo deseas..." rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" variant="destructive" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Enviando..." : "Solicitar eliminación de mis datos"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
