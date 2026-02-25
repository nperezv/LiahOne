import { useState } from "react";
import { useParams } from "wouter";
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
      <Card>
        <CardHeader><CardTitle>{data.location.name}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">Código: {data.location.code}</p>
          <p className="text-sm">Ruta: {data.path}</p>
          <a className="text-sm underline" href={`/inventory/location-label/${data.location.code}`} target="_blank">Imprimir etiqueta ubicación</a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Registrar NFC</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="UID NFC" value={uid} onChange={(event) => setUid(event.target.value)} />
          <Button onClick={() => registerNfc.mutate({ location_code: data.location.code, nfc_uid: uid })}>Registrar NFC</Button>
        </CardContent>
      </Card>
    </div>
  );
}
