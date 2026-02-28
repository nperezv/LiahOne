import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { InventoryPageHeader } from "@/components/inventory/inventory-page-header";
import { InventoryItemActionsCard } from "@/components/inventory/inventory-item-actions-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryCategories, useInventoryItems, useInventoryLocations } from "@/hooks/use-api";

export default function InventoryListPage() {
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: items = [], isLoading } = useInventoryItems(search);
  const { data: categories = [] } = useInventoryCategories();
  const { data: locations = [] } = useInventoryLocations();

  const selectedAssetCode = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("asset") ?? "";
  }, []);

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const locationNameById = useMemo(
    () => new Map(locations.map((location) => [location.id, `${location.name} ${location.code ? `· ${location.code}` : ""}`.trim()])),
    [locations],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const categoryOk = selectedCategoryId === "all" || item.categoryId === selectedCategoryId;
      const locationOk = selectedLocationId === "all" || item.locationId === selectedLocationId;
      return categoryOk && locationOk;
    });
  }, [items, selectedCategoryId, selectedLocationId]);

  return (
    <div className="space-y-5 p-4 md:p-8">
      <InventoryPageHeader subtitle="Listado de activos" />

      <section className="space-y-3">
        <Button
          variant="outline"
          className="h-11 rounded-xl"
          onClick={() => setShowFilters((prev) => !prev)}
        >
          <Filter className="mr-2 h-4 w-4" />
          Filtros
        </Button>

        {showFilters ? (
          <div className="space-y-2 rounded-2xl border border-border/60 p-3">
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
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando activos...</p> : null}

        {filteredItems.map((item) => (
          <InventoryItemActionsCard
            key={item.id}
            assetCode={item.assetCode}
            name={item.name}
            category={categoryNameById.get(item.categoryId)}
            location={item.locationId ? locationNameById.get(item.locationId) : undefined}
            photoUrl={item.photoUrl}
            defaultExpanded={selectedAssetCode === item.assetCode}
          />
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
