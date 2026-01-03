import { Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import logoImage from "@assets/liahonapplogo2.svg";

export default function WelcomePage() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2 text-center pt-6">
          <div className="flex justify-center">
            <img
              src={logoImage}
              alt="Liahonapp Logo"
              className="h-28 w-auto object-contain"
            />
          </div>
          <CardTitle className="text-2xl">Bienvenido a Liahonapp</CardTitle>
          <CardDescription>
            Elige una opción para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/login">Tengo cuenta</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/request-access">No tengo cuenta, solicitar acceso</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
