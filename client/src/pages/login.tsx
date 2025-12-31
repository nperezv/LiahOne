import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { LogIn } from "lucide-react";
import logoImage from "@assets/liahonapplogo2.svg";

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center pt-6 pb-4">
          <div className="flex justify-center">
            <img src={logoImage} alt="Liahonaap Logo" className="h-64 w-64 object-contain" data-testid="img-logo" />
          </div>
          <CardDescription className="text-base">
            Sistema de Gestión Administrativa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
