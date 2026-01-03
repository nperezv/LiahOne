import { Link, Redirect, useLocation } from "wouter";
import { useEffect, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import logoImage from "@assets/liahonapplogo2.svg";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function WelcomePage() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const storedPrompt = (window as Window & { deferredPwaPrompt?: BeforeInstallPromptEvent })
      .deferredPwaPrompt;
    if (storedPrompt) {
      setDeferredPrompt(storedPrompt);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleLoginClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } finally {
        (window as Window & { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt = undefined;
        setDeferredPrompt(null);
      }
    }
    setLocation("/login");
  };

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
            <Link href="/login" onClick={handleLoginClick}>Tengo cuenta</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/request-access">No tengo cuenta, solicitar acceso</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
