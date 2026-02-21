import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";

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

function openBizumApp(phone: string, smsHref: string) {
  const nationalPhone = phone.replace("+34", "");
  const candidates = [
    `bizum://send?phone=${encodeURIComponent(nationalPhone)}`,
    `bizum://pay?phone=${encodeURIComponent(nationalPhone)}`,
  ];

  let opened = false;
  const onBlur = () => {
    opened = true;
  };

  window.addEventListener("blur", onBlur, { once: true });
  window.location.href = candidates[0];

  window.setTimeout(() => {
    if (!opened) {
      window.location.href = candidates[1];
      window.setTimeout(() => {
        if (!opened) {
          window.location.href = smsHref;
        }
      }, 500);
    }
  }, 700);
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
  const telHref = phone ? `tel:${phone}` : "";
  const smsHref = phone ? `sms:${phone}?body=${encodeURIComponent("Bizum")}` : "";
  const telQr = telHref
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(telHref)}`
    : "";

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Donaciones</h1>
          <p className="text-muted-foreground">{data?.wardName ?? "Barrio"}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Donar por Bizum
            </CardTitle>
            <CardDescription>Escanea o pulsa un botón.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!phone && <p className="text-sm text-muted-foreground">Número no disponible.</p>}

            {phone && (
              <>
                <div className="rounded-lg border p-4 w-fit mx-auto">
                  <img src={telQr} alt="QR para donar por Bizum" className="h-64 w-64" />
                </div>

                <div className="flex flex-wrap gap-3 justify-center">
                  <Button onClick={() => openBizumApp(phone, smsHref)} data-testid="button-open-bizum-app">
                    Abrir Bizum
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={telHref}>Llamar</a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={smsHref}>SMS</a>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
