import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Share, PlusSquare, MoreVertical, Download, Smartphone, Monitor, CheckCircle2 } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";

interface PwaInstallDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PwaInstallDialog({ trigger, open, onOpenChange }: PwaInstallDialogProps) {
  const { canPromptInstall, promptInstall } = usePwaInstall();
  const [installedSuccess, setInstalledSuccess] = useState(false);

  const handleInstallClick = async () => {
    try {
      await promptInstall();
      setInstalledSuccess(true);
    } catch (e) {
      console.error(e);
    }
  };

  const isIos = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="text-center sm:text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Smartphone className="h-5 w-5 text-primary" />
            Cómo instalar Zendapp
          </DialogTitle>
          <DialogDescription>
            Instala la aplicación en tu dispositivo para acceder rápidamente como una app nativa sin necesidad de descargar desde la App Store.
          </DialogDescription>
        </DialogHeader>

        {canPromptInstall && !installedSuccess && (
          <div className="my-2 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold block">Instalación automática disponible</span>
              <span className="text-muted-foreground text-xs">Tu navegador permite instalar Zendapp con 1 solo toque.</span>
            </div>
            <Button size="sm" onClick={handleInstallClick} className="gap-1.5 shrink-0">
              <Download className="h-4 w-4" />
              Instalar Ahora
            </Button>
          </div>
        )}

        {installedSuccess && (
          <div className="my-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">¡Solicitud de instalación enviada! Revisa la pantalla de inicio de tu dispositivo.</span>
          </div>
        )}

        <Tabs defaultValue={isIos ? "ios" : "android"} className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ios" className="text-xs sm:text-sm">iPhone / iPad</TabsTrigger>
            <TabsTrigger value="android" className="text-xs sm:text-sm">Android</TabsTrigger>
            <TabsTrigger value="desktop" className="text-xs sm:text-sm">PC / Mac</TabsTrigger>
          </TabsList>

          <TabsContent value="ios" className="space-y-3 pt-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              En Safari (iPhone / iPad):
            </div>
            
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border">
              <div className="bg-primary/10 text-primary p-2 rounded-md shrink-0">
                <Share className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">1. Presiona "Compartir"</p>
                <p className="text-xs text-muted-foreground">Toca el icono de compartir en la barra inferior de Safari.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border">
              <div className="bg-primary/10 text-primary p-2 rounded-md shrink-0">
                <PlusSquare className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">2. "Agregar a inicio"</p>
                <p className="text-xs text-muted-foreground">Desliza el menú hacia abajo y selecciona <strong>Agregar a pantalla de inicio</strong>.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border">
              <div className="bg-primary/10 text-primary p-2 rounded-md shrink-0 font-bold text-sm h-9 w-9 flex items-center justify-center">
                3
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">3. Confirma "Agregar"</p>
                <p className="text-xs text-muted-foreground">Toca "Agregar" arriba a la derecha. ¡Listo! Tendrás el icono en tu pantalla.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="android" className="space-y-3 pt-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              En Chrome / Navegador Android:
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border">
              <div className="bg-primary/10 text-primary p-2 rounded-md shrink-0">
                <MoreVertical className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">1. Toca el menú de 3 puntos (⋮)</p>
                <p className="text-xs text-muted-foreground">Está ubicado en la esquina superior derecha del navegador Chrome.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border">
              <div className="bg-primary/10 text-primary p-2 rounded-md shrink-0">
                <Download className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">2. Selecciona la opción de Instalación</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Según la versión de tu móvil, busca una de estas 3 opciones:
                </p>
                <ul className="text-xs font-medium text-foreground list-disc list-inside pt-1 space-y-0.5">
                  <li><strong>"Instalar aplicación"</strong></li>
                  <li><strong>"Agregar a la pantalla principal"</strong></li>
                  <li><strong>"Crear acceso directo"</strong></li>
                </ul>
              </div>
            </div>

            {canPromptInstall && (
              <Button onClick={handleInstallClick} className="w-full mt-2 gap-2" variant="default">
                <Download className="h-4 w-4" />
                Presiona aquí para intentar instalación directa
              </Button>
            )}
          </TabsContent>

          <TabsContent value="desktop" className="space-y-3 pt-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              En Chrome / Edge (Computadora):
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border">
              <div className="bg-primary/10 text-primary p-2 rounded-md shrink-0">
                <Monitor className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Icono en la barra de navegación</p>
                <p className="text-xs text-muted-foreground">Haz clic en el icono de instalación (una pantalla con flecha) situado al lado derecho de la barra de dirección del navegador.</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
