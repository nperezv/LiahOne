import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { LogIn } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/liahonapplogo2.svg";

const loginSchema = z.object({
  username: z.string().min(1, "El nombre de usuario es requerido"),
  password: z.string().min(1, "La contraseña es requerida"),
  rememberDevice: z.boolean().default(false),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

interface LoginPageProps {
  onLogin: (credentials: LoginFormValues) => Promise<{ requiresEmailCode?: boolean; otpId?: string; email?: string }>;
  onVerify: (payload: { otpId: string; code: string; rememberDevice: boolean }) => Promise<void>;
}

export default function LoginPage({ onLogin, onVerify }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [otpState, setOtpState] = useState<{ otpId: string; email: string; rememberDevice: boolean } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const { toast } = useToast();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberDevice: false,
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const response = await onLogin(data);
      if (response?.requiresEmailCode && response.otpId && response.email) {
        setOtpState({
          otpId: response.otpId,
          email: response.email,
          rememberDevice: data.rememberDevice,
        });
        return;
      }
    } catch (error) {
      toast({
        title: "Error de autenticación",
        description: "Credenciales inválidas. Por favor, intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onVerifyCode = async () => {
    if (!otpState) return;
    setIsLoading(true);
    try {
      await onVerify({
        otpId: otpState.otpId,
        code: otpCode,
        rememberDevice: otpState.rememberDevice,
      });
      setOtpState(null);
      setOtpCode("");
    } catch (error) {
      toast({
        title: "Error de autenticación",
        description: "No se pudo verificar el código. Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onRecoverAccess = async () => {
    const trimmedEmail = recoveryEmail.trim();
    if (!trimmedEmail) {
      toast({
        title: "Email requerido",
        description: "Introduce el correo con el que te registraste.",
        variant: "destructive",
      });
      return;
    }

    setIsRecovering(true);
    try {
      await apiRequest("POST", "/api/login/recover", { email: trimmedEmail });
      toast({
        title: "Recuperación enviada",
        description: "Si el correo existe, se han enviado a ese correo tus credenciales temporales.",
      });
      setRecoveryEmail("");
    } catch (error) {
      toast({
        title: "No se pudo procesar",
        description: "Intenta nuevamente en unos minutos.",
        variant: "destructive",
      });
    } finally {
      setIsRecovering(false);
    }
  };

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
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      (window as Window & { deferredPwaPrompt?: BeforeInstallPromptEvent }).deferredPwaPrompt = undefined;
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center pt-4 pb-2">
          <div className="flex justify-center">
            <img
              src={logoImage}
              alt="Liahonapp Logo"
              className="h-32 w-auto object-contain"
              data-testid="img-logo"
            />
          </div>

          <CardDescription className="text-sm text-muted-foreground">
            Sistema de Gestión Administrativa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {!showRecoveryForm && !otpState && (
                <>
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Usuario</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ingresa tu usuario"
                            {...field}
                            data-testid="input-username"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Ingresa tu contraseña"
                            {...field}
                            data-testid="input-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="rememberDevice"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">Recuerda este dispositivo</FormLabel>
                      </FormItem>
                    )}
                  />
                </>
              )}

              {otpState && (
                <div className="rounded-lg border border-muted-foreground/20 bg-muted/20 p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Te enviamos un código al correo <strong>{otpState.email}</strong>.
                  </p>
                  <Input
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value)}
                    placeholder="Código de 6 dígitos"
                    maxLength={6}
                    data-testid="input-otp"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={onVerifyCode}
                    disabled={isLoading || otpCode.length < 6}
                  >
                    Verificar código
                  </Button>
                </div>
              )}

              {!otpState && !showRecoveryForm && (
                <Button
                  type="button"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-login"
                  onClick={form.handleSubmit(onSubmit)}
                >
                  {isLoading ? (
                    "Iniciando sesión..."
                  ) : (
                    <>
                      <LogIn className="mr-2 h-4 w-4" />
                      Iniciar Sesión
                    </>
                  )}
                </Button>
              )}

              {!otpState && (
                <div className="space-y-3">
                  {!showRecoveryForm ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto w-full p-0 text-sm"
                      onClick={() => setShowRecoveryForm(true)}
                      data-testid="toggle-recovery-form"
                    >
                      ¿Has olvidado tu usuario o contraseña?
                    </Button>
                  ) : (
                    <div className="rounded-lg border border-muted-foreground/20 bg-muted/20 p-4 space-y-3">
                      <Input
                        type="email"
                        value={recoveryEmail}
                        onChange={(event) => setRecoveryEmail(event.target.value)}
                        placeholder="Correo con el que te diste de alta"
                        data-testid="input-recovery-email"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={onRecoverAccess}
                        disabled={isRecovering}
                        data-testid="button-recover-access"
                      >
                        {isRecovering ? "Enviando..." : "Recuperar acceso"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => setShowRecoveryForm(false)}
                        data-testid="button-back-login"
                      >
                        Volver a iniciar sesión
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {deferredPrompt && !showRecoveryForm && !otpState && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={handleInstallClick}
                  data-testid="button-install-app"
                >
                  Instalar aplicación
                </Button>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
