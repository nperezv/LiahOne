import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Smartphone } from "lucide-react";

type PublicDonationSettings = {
  wardName?: string;
  bizumPhone?: string;
};

function normalizePhone(value?: string) {
  const raw = value ?? "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("34") && digits.length >= 11) return `+${digits}`;
  if (digits.length === 9) return `+34${digits}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
}

export default function DonationsPage() {
  const { data } = useQuery<PublicDonationSettings>({
    queryKey: ["/api/public/donation-settings"],
    queryFn: async () => {
      const response = await fetch("/api/public/donation-settings");
      if (!response.ok) throw new Error("No se pudo cargar la configuración");
      return response.json();
    },
  });

  const phone = useMemo(() => normalizePhone(data?.bizumPhone), [data?.bizumPhone]);
  const nationalPhone = phone.replace("+34", "");
  const telHref = phone ? `tel:${phone}` : "";
  const smsHref = phone ? `sms:${phone}?body=${encodeURIComponent("Bizum")}` : "";
  const smsToHref = phone ? `SMSTO:${nationalPhone}:Bizum` : "";
  const telQr = telHref
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(telHref)}`
    : "";

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Donaciones</h1>
          <p className="text-muted-foreground">
            {data?.wardName ? `Apoya ${data.wardName} con un envío por Bizum.` : "Apoya con un envío por Bizum."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Donar por Bizum
            </CardTitle>
            <CardDescription>
              Escanea el QR o pulsa en los botones para abrir el flujo en tu móvil.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!phone && (
              <p className="text-sm text-muted-foreground">
                Aún no hay un número configurado. Pídelo al administrador en Configuración.
              </p>
            )}

            {phone && (
              <>
                <div className="rounded-lg border p-4 w-fit mx-auto">
                  <img src={telQr} alt="QR para donar por Bizum" className="h-64 w-64" />
                </div>

                <div className="flex flex-wrap gap-3 justify-center">
                  <Button asChild>
                    <a href={telHref}>
                      <Smartphone className="h-4 w-4 mr-2" />
                      Abrir llamada (tel:)
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={smsHref}>Abrir SMS (sms:)</a>
                  </Button>
                </div>

                <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1">
                  <p>tel: <code>{telHref}</code></p>
                  <p>sms: <code>{smsHref}</code></p>
                  <p>SMSTO (alternativa): <code>{smsToHref}</code></p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
