import { CheckCircle2, CircleDot, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { InventoryAsset } from "../types";

export function AuditScreen({
  locationName,
  assets,
  foundIds,
  onScan,
  onFinish,
}: {
  locationName: string;
  assets: InventoryAsset[];
  foundIds: string[];
  onScan: () => void;
  onFinish: () => void;
}) {
  const found = assets.filter((asset) => foundIds.includes(asset.id)).length;
  const missing = assets.length - found;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-4xl font-semibold">Auditoría <span className="text-slate-300 text-2xl">{locationName}</span></h1>
      </header>
      <Card className="rounded-3xl border-white/10 bg-white/5">
        <CardContent className="space-y-3 p-4">
          <p className="text-2xl">{assets.length} activos esperados</p>
          <div className="flex items-center justify-between text-xl"><span className="text-emerald-300">✓ Encontrados</span><span>{found}</span></div>
          <div className="flex items-center justify-between text-xl"><span className="text-amber-300">⚠ Faltantes</span><span>{missing}</span></div>
        </CardContent>
      </Card>
      <Card className="rounded-3xl border-white/10 bg-white/5">
        <CardContent className="space-y-2 p-4">
          {assets.map((asset) => {
            const isFound = foundIds.includes(asset.id);
            return (
              <div key={asset.id} className="flex items-center justify-between rounded-xl border border-white/10 p-2">
                <div>
                  <p className="text-lg">{asset.name}</p>
                  <p className="text-slate-400">{asset.category}</p>
                </div>
                {isFound ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <TriangleAlert className="h-5 w-5 text-amber-300" />}
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Button className="h-12 w-full rounded-2xl bg-blue-500 hover:bg-blue-400" onClick={onScan}>
        <CircleDot className="mr-2 h-4 w-4" />Escanear activo
      </Button>
      <Button variant="secondary" className="h-12 w-full rounded-2xl border border-white/15 bg-white/5 text-white" onClick={onFinish}>
        Finalizar auditoría
      </Button>
    </div>
  );
}
