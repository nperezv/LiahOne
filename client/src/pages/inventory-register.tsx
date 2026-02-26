import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderTree, Plus, ScanLine, QrCode } from "lucide-react";

export default function InventoryRegisterHubPage() {
  return (
    <div className="space-y-4 p-4 md:p-8">
      <Card className="rounded-3xl border border-border/60 bg-gradient-to-b from-[#030a1a] to-[#040813]">
        <CardHeader>
          <CardTitle>Registro</CardTitle>
          <p className="text-sm text-muted-foreground">Elige qué deseas registrar. Por defecto recomendamos flujo NFC inverso; si falla, usa QR para imprimir etiqueta.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Link href="/inventory?panel=register&kind=assets">
            <Button className="h-16 w-full justify-start rounded-2xl" variant="secondary">
              <Plus className="mr-2 h-5 w-5" />
              <span className="text-left"><b>Registrar activo</b><br /><span className="text-xs text-muted-foreground">NFC inverso o QR</span></span>
            </Button>
          </Link>
          <Link href="/inventory?panel=register&kind=locations">
            <Button className="h-16 w-full justify-start rounded-2xl" variant="secondary">
              <FolderTree className="mr-2 h-5 w-5" />
              <span className="text-left"><b>Registrar armario</b><br /><span className="text-xs text-muted-foreground">NFC inverso o QR</span></span>
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader><CardTitle>Guía rápida</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><ScanLine className="mr-1 inline h-4 w-4" />NFC inverso: escanea UID primero, valida si existe y luego registra.</p>
          <p><QrCode className="mr-1 inline h-4 w-4" />Fallback QR: crea el registro y genera etiqueta para imprimir.</p>
        </CardContent>
      </Card>
    </div>
  );
}
