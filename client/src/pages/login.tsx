import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { LogIn, KeyRound, Smartphone, HelpCircle, AlertCircle, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PwaInstallDialog } from "@/components/pwa-install-dialog";

const loginSchema = z.object({
  username: z.string().min(1, "El nombre de usuario es requerido"),
  password: z.string().min(1, "La contraseña es requerida"),
  rememberDevice: z.boolean().default(false),
});

type LoginFormValues = z.infer<typeof loginSchema>;

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
  const [recoveredNotice, setRecoveredNotice] = useState(false);
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const [pwaGuideTab, setPwaGuideTab] = useState<"ios" | "android" | "desktop" | "find">("android");

  const { toast } = useToast();
  const { canPromptInstall, promptInstall, isStandalone, isIos } = usePwaInstall();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberDevice: false,
    },
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const usernameParam = params.get("username");
      const isRecovered = params.get("recovered") === "true";

      if (usernameParam) {
        form.setValue("username", usernameParam);
      }
      if (isRecovered) {
        setRecoveredNotice(true);
      }
    }
  }, [form]);

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

  const [recoverySentNotice, setRecoverySentNotice] = useState<string | null>(null);

  const onRecoverAccess = async () => {
    const trimmedEmail = recoveryEmail.trim();
    if (!trimmedEmail) {
      toast({
        title: "Correo requerido",
        description: "Introduce el correo electrónico con el que fuiste dado de alta.",
        variant: "destructive",
      });
      return;
    }

    setIsRecovering(true);
    try {
      await apiRequest("POST", "/api/login/recover", { email: trimmedEmail });
      setRecoverySentNotice(trimmedEmail);
      setRecoveryEmail("");
      setShowRecoveryForm(false);
      toast({
        title: "✉️ Correo de acceso enviado",
        description: "Revisa tu bandeja de entrada.",
      });
    } catch (error) {
      toast({
        title: "No se pudo procesar",
        description: "Intenta nuevamente en unos minutos o contacta a tu secretario.",
        variant: "destructive",
      });
    } finally {
      setIsRecovering(false);
    }
  };

  const handleInstallClick = async () => {
    if (canPromptInstall) {
      try {
        await promptInstall();
      } catch (error) {
        setShowPwaGuide(true);
      }
    } else {
      setShowPwaGuide(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg border-muted-foreground/10">
        <CardHeader className="space-y-1 text-center pt-4 pb-2">
          <div className="flex flex-col items-center gap-2 py-2">
            <img src="/icons/compass.svg" alt="Zendapp" className="h-16 w-16" />
            <div className="text-4xl font-bold tracking-tight" data-testid="img-logo">
              <span className="text-foreground">Zend</span><span className="text-[#d5b366]">app</span>
            </div>
          </div>

          <CardDescription className="text-sm text-muted-foreground">
            Sistema de Gestión Administrativa
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recoverySentNotice && !otpState && !showRecoveryForm && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-2.5 text-green-950 dark:text-green-200 text-xs leading-relaxed">
              <AlertCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold text-green-900 dark:text-green-100">✉️ ¡Correo enviado a {recoverySentNotice}!</strong>
                Revisa tu bandeja de entrada. Te hemos enviado un correo con tu nombre de usuario y contraseña temporal. Abre el mensaje y haz clic en el botón para ingresar.
              </div>
            </div>
          )}

          {recoveredNotice && !otpState && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2.5 text-amber-950 dark:text-amber-200 text-xs leading-relaxed">
              <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold text-amber-900 dark:text-amber-100">Contraseña temporal enviada</strong>
                Hemos rellenado tu nombre de usuario. Por favor copia la contraseña temporal enviada a tu correo y pégala en el campo "Contraseña".
              </div>
            </div>
          )}

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
                            placeholder="Ingresa tu contraseña o contraseña temporal"
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
                        <FormLabel className="text-sm font-normal text-muted-foreground">Recuerda este dispositivo</FormLabel>
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
                  className="w-full font-medium"
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
                <div className="space-y-3 pt-1">
                  {!showRecoveryForm ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full p-0 text-sm text-muted-foreground hover:text-foreground"
                      onClick={() => setShowRecoveryForm(true)}
                      data-testid="toggle-recovery-form"
                    >
                      ¿Olvidaste tu usuario o contraseña?
                    </Button>
                  ) : (
                    <div className="rounded-xl border border-muted-foreground/20 bg-muted/30 p-4 space-y-3 text-left">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <HelpCircle className="h-4 w-4 text-primary" />
                        Recuperación de Cuenta
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ingresa el correo electrónico asociado a tu cuenta. Te enviaremos tu nombre de usuario y una contraseña temporal.
                      </p>
                      <Input
                        type="email"
                        value={recoveryEmail}
                        onChange={(event) => setRecoveryEmail(event.target.value)}
                        placeholder="tu-correo@ejemplo.com"
                        data-testid="input-recovery-email"
                      />
                      <div className="flex flex-col gap-2 pt-1">
                        <Button
                          type="button"
                          variant="default"
                          className="w-full font-medium"
                          onClick={onRecoverAccess}
                          disabled={isRecovering}
                          data-testid="button-recover-access"
                        >
                          {isRecovering ? "Enviando correo..." : "Enviar datos y volver al inicio"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full text-xs text-muted-foreground"
                          onClick={() => setShowRecoveryForm(false)}
                          data-testid="button-back-login"
                        >
                          ← Cancelar y volver
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!showRecoveryForm && !otpState && (
                <div className="pt-2 border-t border-muted/50 text-center">
                  {isStandalone || !canPromptInstall ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-xs font-medium gap-2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setPwaGuideTab("find");
                        setShowPwaGuide(true);
                      }}
                      data-testid="button-find-pwa"
                    >
                      <Search className="h-4 w-4 text-primary" />
                      ¿Ya la instalaste? Cómo buscarla en tu móvil
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full text-sm font-medium gap-2"
                      onClick={handleInstallClick}
                      data-testid="button-install-app"
                    >
                      <Smartphone className="h-4 w-4 text-primary" />
                      Instalar Aplicación
                    </Button>
                  )}
                </div>
              )}
            </form>
          </Form>

          <PwaInstallDialog open={showPwaGuide} onOpenChange={setShowPwaGuide} defaultTab={pwaGuideTab} />
        </CardContent>
      </Card>
    </div>
  );
}

