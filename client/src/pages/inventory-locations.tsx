import { Link } from "wouter";
import { ChevronRight, MapPin, Printer, Wifi } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      <div key={node.id} className="space-y-2" style={{ marginLeft: depth * 14 }}>
        <div className="rounded-2xl border bg-card/80 p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{node.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{node.code}</p>
            </div>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-3 grid gap-2 sm:flex">
            <Link href={`/inventory/locations/${node.code}`}>
              <Button variant="secondary" className="h-9 w-full rounded-xl sm:w-auto"><ChevronRight className="mr-1 h-4 w-4" />Abrir</Button>
            </Link>
            <a href={`/inventory/location-label/${node.code}`} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
              <Button variant="outline" className="h-9 w-full rounded-xl"><Printer className="mr-1 h-4 w-4" />Imprimir etiqueta</Button>
            </a>
            <Link href={`/inventory/locations/${node.code}`}>
              <Button variant="outline" className="h-9 w-full rounded-xl sm:w-auto"><Wifi className="mr-1 h-4 w-4" />Registrar NFC</Button>
            </Link>
          </div>
        </div>
        {renderNode(node.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Card className="border-border/70 bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <CardContent className="p-5">
          <h1 className="text-2xl font-semibold tracking-tight">Ubicaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">Estructura jerárquica: capilla, armarios y estantes.</p>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader><CardTitle>Árbol de ubicaciones</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {renderNode(null)}
        </CardContent>
      </Card>
    </div>
  );
}
