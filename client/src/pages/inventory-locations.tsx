import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useInventoryLocations } from "@/hooks/use-api";

export default function InventoryLocationsPage() {
  const { data: locations = [] } = useInventoryLocations();

  const byParent = new Map<string, any[]>();
  locations.forEach((loc) => {
    const key = loc.parentId ?? "root";
    byParent.set(key, [...(byParent.get(key) ?? []), loc]);
  });

  const renderNode = (parentId: string | null, depth = 0) => {
    const nodes = byParent.get(parentId ?? "root") ?? [];
    return nodes.map((node) => (
      <div key={node.id} className="space-y-2" style={{ marginLeft: depth * 16 }}>
        <div className="rounded-xl border p-3">
          <p className="font-semibold">{node.name}</p>
          <p className="text-xs text-muted-foreground">{node.code}</p>
          <div className="mt-2 flex gap-2 text-sm">
            <Link href={`/inventory/locations/${node.code}`}>Abrir</Link>
            <a href={`/inventory/location-label/${node.code}`} target="_blank">Imprimir etiqueta ubicación</a>
          </div>
        </div>
        {renderNode(node.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold">Ubicaciones</h1>
      <Card>
        <CardHeader><CardTitle>Árbol capilla / armarios / estantes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {renderNode(null)}
        </CardContent>
      </Card>
    </div>
  );
}
