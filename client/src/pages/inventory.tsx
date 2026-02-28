import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Filter, QrCode, ScanLine, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GaugeSegment, InventoryGauge } from "@/components/inventory/inventory-hub-widgets";
import { useInventoryCategories, useInventoryItems, useInventoryLocations } from "@/hooks/use-api";
import { apiRequest } from "@/lib/queryClient";

const CHART_PALETTE = ["#30d5ff", "#52e66d", "#f3d63b", "#ff8a3d", "#cc5de8", "#6d5efc"];

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");

  const { data: items = [], isLoading } = useInventoryItems(search);
  const { data: categories = [] } = useInventoryCategories();
  const { data: locations = [] } = useInventoryLocations();

  const { data: template } = useQuery({
    queryKey: ["/api/pdf-template"],
    queryFn: () => apiRequest("GET", "/api/pdf-template"),
  });

  const [cachedWardName, setCachedWardName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("ward_name_cache") || "";
  });

  useEffect(() => {
    const incoming = template?.wardName?.trim();
    if (!incoming) return;
    setCachedWardName(incoming);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ward_name_cache", incoming);
    }
  }, [template?.wardName]);

  const wardName = template?.wardName?.trim() || cachedWardName || "Barrio";

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const categoryOk = selectedCategoryId === "all" || item.categoryId === selectedCategoryId;
      const locationOk = selectedLocationId === "all" || item.locationId === selectedLocationId;
      return categoryOk && locationOk;
    });
  }, [items, selectedCategoryId, selectedLocationId]);

  const gaugeSegments: GaugeSegment[] = useMemo(() => {
    const categoryPool = categories.length
      ? categories.slice(0, 6).map((category) => ({ id: category.id, label: category.name }))
      : [{ id: "uncategorized", label: "Sin categoría" }];

    const totalItems = items.length;

    return categoryPool.map((category, index) => {
      const count = items.filter((item) => {
        if (category.id === "uncategorized") return !item.categoryId;
        return item.categoryId === category.id;
      }).length;

      const percent = totalItems > 0 ? (count / totalItems) * 100 : 0;

      return {
        label: category.label,
        count,
        value: percent,
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      };
    });
  }, [categories, items]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
        <p className="text-sm text-muted-foreground">{wardName}</p>
      </header>

      <InventoryGauge total={items.length} segments={gaugeSegments} />

      <div className="grid gap-2 sm:grid-cols-3">
        <Link href="/inventory/scan"><Button className="w-full rounded-xl"><ScanLine className="mr-2 h-4 w-4" />Escanear</Button></Link>
        <Link href="/inventory/register"><Button variant="outline" className="w-full rounded-xl"><QrCode className="mr-2 h-4 w-4" />Registro</Button></Link>
        <Link href="/inventory/audit"><Button variant="outline" className="w-full rounded-xl"><ShieldCheck className="mr-2 h-4 w-4" />Auditoría</Button></Link>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filtros
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
            <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Todos los armarios" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los armarios</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>{location.name} · {location.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Input
          className="h-11 rounded-xl"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre o código"
        />
      </section>

      <section className="space-y-2">
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando activos...</p> : null}

        {filteredItems.map((item) => (
          <Link key={item.id} href={`/inventory/${item.assetCode}`}>
            <article className="rounded-xl border border-border/70 p-3 transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{item.name}</p>
                <Badge variant="secondary" className="rounded-full">{item.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.assetCode} · {(item as any).categoryName ?? "Sin categoría"} · {(item as any).locationCode ?? "Sin armario"}
              </p>
            </article>
          </Link>
        ))}

        {!isLoading && filteredItems.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            No hay activos para estos filtros.
          </p>
        ) : null}
      </section>
    </div>
  );
}
