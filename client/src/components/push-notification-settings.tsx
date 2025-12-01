import { Bell, BellOff, BellRing, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useToast } from "@/hooks/use-toast";

export function PushNotificationSettings() {
  const { toast } = useToast();
  const {
    isSupported,
    permission,
    isConfigured,
    isSubscribed,
    isLoading,
    isSubscribing,
    isUnsubscribing,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const handleSubscribe = async () => {
    try {
      await subscribe();
      toast({
        title: "Notificaciones activadas",
        description: "Recibirás alertas incluso cuando la app esté cerrada.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudieron activar las notificaciones",
        variant: "destructive",
      });
    }
  };

  const handleUnsubscribe = async () => {
    try {
      await unsubscribe();
      toast({
        title: "Notificaciones desactivadas",
        description: "Ya no recibirás alertas push.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudieron desactivar las notificaciones",
        variant: "destructive",
      });
    }
  };

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Notificaciones Push
          </CardTitle>
          <CardDescription>
            Tu navegador no soporta notificaciones push. Prueba con Chrome, Firefox o Edge.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificaciones Push
          </CardTitle>
          <CardDescription>
            Las notificaciones push no están configuradas en el servidor.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (permission === "denied") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-destructive" />
            Notificaciones Bloqueadas
          </CardTitle>
          <CardDescription>
            Has bloqueado las notificaciones. Para activarlas, cambia los permisos de este sitio en la configuración de tu navegador.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isSubscribed ? (
            <BellRing className="h-5 w-5 text-green-500" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          Notificaciones Push
        </CardTitle>
        <CardDescription>
          {isSubscribed
            ? "Recibirás alertas en tu dispositivo incluso cuando la app esté cerrada."
            : "Activa las notificaciones para recibir alertas importantes en tu dispositivo."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Button disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando...
          </Button>
        ) : isSubscribed ? (
          <Button
            variant="outline"
            onClick={handleUnsubscribe}
            disabled={isUnsubscribing}
            data-testid="button-unsubscribe-push"
          >
            {isUnsubscribing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <BellOff className="mr-2 h-4 w-4" />
            )}
            Desactivar Notificaciones
          </Button>
        ) : (
          <Button
            onClick={handleSubscribe}
            disabled={isSubscribing}
            data-testid="button-subscribe-push"
          >
            {isSubscribing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Smartphone className="mr-2 h-4 w-4" />
            )}
            Activar Notificaciones
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
