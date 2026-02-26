import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InventoryShell } from "../components/inventory-shell";
import { inventoryAssetsMock, inventoryLocationsMock } from "../mockData";

export function InventoryAssetsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const categories = useMemo(() => ["all", ...Array.from(new Set(inventoryAssetsMock.map((asset) => asset.category)))], []);

  const filtered = inventoryAssetsMock.filter((asset) => {
    const matchSearch = asset.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || asset.category === category;
    return matchSearch && matchCategory;
  });

  return (
    <InventoryShell>
      <h1 className="mb-4 text-3xl font-semibold">Activos</h1>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar activo..." className="h-11 rounded-xl border-white/15 bg-white/5 pl-9" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((entry) => (
          <button key={entry} onClick={() => setCategory(entry)} className={`rounded-full border px-3 py-1 text-sm ${category === entry ? "border-cyan-400 bg-cyan-500/15 text-cyan-200" : "border-white/20 text-slate-300"}`}>
            {entry}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map((asset) => {
          const location = inventoryLocationsMock.find((entry) => entry.id === asset.location_id)?.name ?? "Sin ubicación";
          return (
            <Card key={asset.id} className="rounded-2xl border-white/10 bg-white/5">
              <CardContent className="space-y-1 p-4">
                <p className="text-lg font-medium">{asset.name}</p>
                <p className="text-slate-300">{asset.category} · {location}</p>
                <Badge className="w-fit rounded-full bg-white/15 text-slate-200">{asset.status}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </InventoryShell>
  );
}
