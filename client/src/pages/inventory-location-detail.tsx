import { useState } from "react";
import { useParams } from "wouter";
import { Link } from "wouter";
import { ChevronRight, Printer, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useInventoryLocationDetail, useRegisterLocationNfc } from "@/hooks/use-api";

export default function InventoryLocationDetailPage() {
  const { locationCode } = useParams<{ locationCode: string }>();
  const { data } = useInventoryLocationDetail(locationCode);
  const registerNfc = useRegisterLocationNfc();
  const [uid, setUid] = useState("");

  if (!data?.location) return <div className="p-6">Ubicación no encontrada</div>;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Card className="rounded-3xl">
        <CardHeader><CardTitle>{data.location.name}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Código: {data.location.code}</p>
          <p className="text-sm">Ruta: {data.path}</p>
          <div className="grid gap-2 sm:flex">
            <a className="w-full sm:w-auto" href={`/inventory/location-label/${data.location.code}`} target="_blank" rel="noreferrer">
              <Button variant="outline" className="h-10 w-full rounded-xl"><Printer className="mr-2 h-4 w-4" />Imprimir etiqueta</Button>
            </a>
            <Link href="/inventory">
              <Button variant="secondary" className="h-10 w-full rounded-xl sm:w-auto"><ChevronRight className="mr-2 h-4 w-4" />Usar como destino</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader><CardTitle>Registrar NFC</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl bg-muted/40 p-3 text-sm text-muted-foreground">
            Asocia una etiqueta NFC a esta ubicación para movimientos por doble toque.
          </div>
          <Input className="h-12 rounded-2xl" placeholder="UID NFC" value={uid} onChange={(event) => setUid(event.target.value)} />
          <Button className="h-12 w-full rounded-2xl" onClick={() => registerNfc.mutate({ location_code: data.location.code, nfc_uid: uid })}><Wifi className="mr-2 h-4 w-4" />Registrar NFC</Button>
        </CardContent>
      </Card>
    </div>
  );
}
