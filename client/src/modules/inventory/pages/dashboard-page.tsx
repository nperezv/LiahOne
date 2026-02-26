import { Link } from "wouter";
import { QrCode, ScanLine, ShieldCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { inventoryAssetsMock, categoryPalette } from "../mockData";
import { InventoryGauge } from "../components/inventory-gauge";
import { InventoryShell } from "../components/inventory-shell";

export function InventoryDashboardPage() {
  const total = inventoryAssetsMock.length;
  const present = inventoryAssetsMock.filter((asset) => asset.status === "present").length;
  const loaned = inventoryAssetsMock.filter((asset) => asset.status === "loaned").length;
  const incidents = inventoryAssetsMock.filter((asset) => asset.status === "incident").length;

  const gaugeData = categoryPalette.map((category) => ({
    name: category.key,
    value: Math.max(10, inventoryAssetsMock.filter((asset) => asset.category === category.key).length * 20),
    fill: category.color,
  }));

  return (
    <InventoryShell>
      <header className="mb-4">
        <p className="text-4xl font-semibold">Inventario</p>
        <p className="text-2xl text-slate-300">Barrio Madrid 8</p>
      </header>
      <InventoryGauge total={total} data={gaugeData} />
      <Card className="mt-4 rounded-3xl border-white/10 bg-white/5">
        <CardContent className="grid grid-cols-3 p-4 text-center">
          <div><p className="text-2xl font-semibold">{present}</p><p className="text-xs text-slate-300">presentes</p></div>
          <div><p className="text-2xl font-semibold">{loaned}</p><p className="text-xs text-slate-300">prestados</p></div>
          <div><p className="text-2xl font-semibold">{incidents}</p><p className="text-xs text-slate-300">incidencias</p></div>
        </CardContent>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/inventory/scan"><Button className="h-14 w-full rounded-2xl bg-white/10"><ScanLine className="mr-2 h-4 w-4" />Escanear NFC</Button></Link>
        <Link href="/inventory/scan"><Button className="h-14 w-full rounded-2xl bg-white/10"><QrCode className="mr-2 h-4 w-4" />Escanear QR</Button></Link>
        <Link href="/inventory/assets"><Button className="h-14 w-full rounded-2xl bg-white/10"><Plus className="mr-2 h-4 w-4" />Nuevo activo</Button></Link>
        <Link href="/inventory/audit"><Button className="h-14 w-full rounded-2xl bg-white/10"><ShieldCheck className="mr-2 h-4 w-4" />Auditoría</Button></Link>
      </div>
    </InventoryShell>
  );
}
