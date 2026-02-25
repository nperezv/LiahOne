import { useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInventoryItem, useInventoryLocations, useMoveInventoryItem } from "@/hooks/use-api";

export default function InventoryDetailPage() {
  const { assetCode } = useParams<{ assetCode: string }>();
  const { data, isLoading } = useInventoryItem(assetCode);
  const { data: locations = [] } = useInventoryLocations();
  const moveItem = useMoveInventoryItem(assetCode!);
  const [toLocation, setToLocation] = useState("");
  const [note, setNote] = useState("");

  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (!data?.item) return <div className="p-6">No encontrado</div>;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Card>
        <CardHeader><CardTitle>{data.item.assetCode} · {data.item.name}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p>Estado: <strong>{data.item.status}</strong></p>
          <p>Ubicación: <strong>{data.item.locationName ?? "Sin ubicación"}</strong></p>
          <a className="text-sm text-primary underline" href={data.item.qrUrl} target="_blank">Ver QR</a>
          <div className="pt-2">
            <a className="text-sm underline" href={`/inventory/label/${data.item.assetCode}`} target="_blank">Imprimir etiqueta térmica</a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mover objeto</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select onValueChange={setToLocation} value={toLocation}>
            <SelectTrigger><SelectValue placeholder="Nueva ubicación" /></SelectTrigger>
            <SelectContent>
              {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota del movimiento" />
          <Button disabled={!toLocation || moveItem.isPending} onClick={() => moveItem.mutate({ toLocation, note })}>
            Mover objeto
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial de movimientos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.movements.length === 0 && <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>}
          {data.movements.map((movement: any) => (
            <div key={movement.id} className="rounded-xl border p-3 text-sm">
              <p>{movement.fromLocation ?? "—"} → {movement.toLocation ?? "—"}</p>
              <p className="text-muted-foreground">{new Date(movement.createdAt).toLocaleString()}</p>
              {movement.note && <p>{movement.note}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
