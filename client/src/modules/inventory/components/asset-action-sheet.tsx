import { Mic, MapPin, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { InventoryAsset, InventoryLocation } from "../types";

export function AssetActionSheet({
  asset,
  locations,
  onMove,
  onLoan,
}: {
  asset: InventoryAsset;
  locations: InventoryLocation[];
  onMove: () => void;
  onLoan: () => void;
}) {
  const locationName = locations.find((entry) => entry.id === asset.location_id)?.name ?? "Sin ubicación";

  return (
    <Card className="rounded-3xl border-white/10 bg-slate-950/90">
      <CardContent className="space-y-4 p-4">
        <h2 className="text-2xl font-semibold">Activo detectado</h2>
        <p className="text-slate-300">UID: {asset.uid_nfc ?? asset.qr_code}</p>
        <div className="flex gap-3 rounded-2xl bg-white/5 p-3">
          <Mic className="mt-1 h-8 w-8 text-slate-200" />
          <div>
            <p className="text-xl">{asset.name}</p>
            <p className="text-slate-300">{asset.category}</p>
            <p className="text-slate-400">{locationName}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button className="rounded-xl bg-blue-500/40 hover:bg-blue-500/60" onClick={onMove}>Mover</Button>
          <Button className="rounded-xl bg-amber-500/70 text-slate-950 hover:bg-amber-400" onClick={onLoan}>
            <NotebookPen className="mr-2 h-4 w-4" />Prestar
          </Button>
        </div>
        <Button variant="secondary" className="w-full rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/10">
          Ver detalles
        </Button>
        <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
          <MapPin className="mr-2 inline h-4 w-4" />Escanea ubicación destino
        </div>
      </CardContent>
    </Card>
  );
}
