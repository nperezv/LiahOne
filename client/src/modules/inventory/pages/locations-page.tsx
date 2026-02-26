import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InventoryShell } from "../components/inventory-shell";
import { inventoryAssetsMock, inventoryLocationsMock } from "../mockData";

export function InventoryLocationsPage() {
  return (
    <InventoryShell>
      <h1 className="mb-4 text-3xl font-semibold">Ubicaciones</h1>
      <div className="space-y-3">
        {inventoryLocationsMock.map((location) => {
          const count = inventoryAssetsMock.filter((asset) => asset.location_id === location.id).length;
          return (
            <Card key={location.id} className="rounded-2xl border-white/10 bg-white/5">
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="text-xl">{location.name}</p>
                  <p className="text-slate-300">{location.type} · {count} activos</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/inventory/audit/${location.id}`}><Button className="w-full rounded-xl bg-blue-500/30 hover:bg-blue-500/40">Iniciar auditoría</Button></Link>
                  <Link href="/inventory/assets"><Button variant="secondary" className="w-full rounded-xl border border-white/15 bg-white/5 text-white">Ver contenidos</Button></Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </InventoryShell>
  );
}
