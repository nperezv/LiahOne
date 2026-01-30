import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function DirectoryPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Directorio</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los miembros del barrio y sus datos de contacto.
          </p>
        </div>
        <Button onClick={() => setLocation("/birthdays")}>Ver cumpleaños</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Miembros del barrio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Estamos preparando el directorio con los datos del CSV.</p>
          <p>
            Una vez cargados, aquí podrás llamar, enviar correo o WhatsApp, y
            agendar entrevistas directamente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
