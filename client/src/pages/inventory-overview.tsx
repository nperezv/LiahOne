import { type ReactElement, type ReactNode, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronRight,
  MapPin,
  Wifi,
  Package,
  Plus,
  Printer,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { InventoryPageHeader } from "@/components/inventory/inventory-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  INVENTORY_STATUS_LABELS,
  useDeleteInventoryLocation,
  type InventoryItem,
  type InventoryLocation,
  useInventoryItems,
  useInventoryLocations,
} from "@/hooks/use-api";

type QuickFilter = "all" | "available" | "loaned" | "maintenance" | "no-location" | "no-nfc";

const STATUS_BADGE: Record<InventoryItem["status"], string> = {
  available: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  loaned: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  maintenance: "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

function matchesFilter(item: InventoryItem, filter: QuickFilter) {
  switch (filter) {
    case "available":
    case "loaned":
    case "maintenance":
      return item.status === filter;
    case "no-location":
      return !item.locationId;
    case "no-nfc":
      return !item.hasNfc;
    default:
      return true;
  }
}

function ItemRow({ item }: { item: InventoryItem }) {
  return (
    <Link href={`/inventory/${item.assetCode}`}>
      <div className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-background/70 p-2 transition-colors hover:bg-muted/60">
        {item.photoUrl ? (
          <img src={item.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {item.assetCode}
            {item.categoryName ? ` · ${item.categoryName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[item.status]}`}>
            {INVENTORY_STATUS_LABELS[item.status] ?? item.status}
          </Badge>
          {!item.hasNfc ? <span className="text-[10px] text-muted-foreground">sin NFC</span> : null}
        </div>
      </div>
    </Link>
  );
}

export default function InventoryOverviewPage() {
  const { data: items = [], isLoading: loadingItems } = useInventoryItems();
  const { data: locations = [], isLoading: loadingLocations } = useInventoryLocations();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  // Igual que en el servidor: solo obispo y consejeros pueden eliminar armarios.
  const canDelete = ["obispo", "consejero_obispo"].includes(String(user?.role ?? ""));
  const deleteLocation = useDeleteInventoryLocation();
  const [toDelete, setToDelete] = useState<InventoryLocation | null>(null);
  const [moveItemsTo, setMoveItemsTo] = useState<string>("none");

  const normalizedSearch = search.trim().toLowerCase();

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (!matchesFilter(item, filter)) return false;
        if (!normalizedSearch) return true;
        return (
          item.name.toLowerCase().includes(normalizedSearch) ||
          item.assetCode.toLowerCase().includes(normalizedSearch) ||
          (item.categoryName ?? "").toLowerCase().includes(normalizedSearch)
        );
      }),
    [items, filter, normalizedSearch],
  );

  const itemsByLocation = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    visibleItems.forEach((item) => {
      const key = item.locationId ?? "none";
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return map;
  }, [visibleItems]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, InventoryLocation[]>();
    const ids = new Set(locations.map((l) => l.id));
    locations.forEach((loc) => {
      // Si el padre ya no existe, se trata como raíz para que no desaparezca.
      const key = loc.parentId && ids.has(loc.parentId) ? loc.parentId : "root";
      map.set(key, [...(map.get(key) ?? []), loc]);
    });
    return map;
  }, [locations]);

  // Total de activos (visibles) dentro de un armario, incluidos sus estantes/sub-ubicaciones.
  const totalCount = useMemo(() => {
    const cache = new Map<string, number>();
    const count = (id: string, depth = 0): number => {
      if (cache.has(id)) return cache.get(id)!;
      if (depth > 20) return 0;
      const own = itemsByLocation.get(id)?.length ?? 0;
      const nested = (childrenByParent.get(id) ?? []).reduce((acc, child) => acc + count(child.id, depth + 1), 0);
      cache.set(id, own + nested);
      return own + nested;
    };
    return count;
  }, [itemsByLocation, childrenByParent]);

  const stats = useMemo(
    () => ({
      total: items.length,
      available: items.filter((i) => i.status === "available").length,
      loaned: items.filter((i) => i.status === "loaned").length,
      maintenance: items.filter((i) => i.status === "maintenance").length,
      noLocation: items.filter((i) => !i.locationId).length,
      noNfc: items.filter((i) => !i.hasNfc).length,
      locations: locations.length,
    }),
    [items, locations],
  );

  const filtering = filter !== "all" || Boolean(normalizedSearch);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderLocation = (loc: InventoryLocation, depth: number): ReactElement | null => {
    const total = totalCount(loc.id);
    // Al buscar o filtrar, se ocultan los armarios vacíos y se abren los que tienen resultados.
    if (filtering && total === 0) return null;
    const isOpen = filtering ? true : expanded.has(loc.id);
    const ownItems = itemsByLocation.get(loc.id) ?? [];
    const children = childrenByParent.get(loc.id) ?? [];

    return (
      <div key={loc.id} className={depth > 0 ? "border-l-2 border-primary/20 pl-3" : ""}>
        <div className="rounded-2xl border bg-card/80 shadow-sm">
          <button
            type="button"
            onClick={() => toggle(loc.id)}
            className="flex w-full items-center gap-3 p-3 text-left"
            aria-expanded={isOpen}
          >
            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              {depth === 0 ? <Box className="h-4 w-4 text-primary" /> : <MapPin className="h-4 w-4 text-primary" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{loc.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {loc.code}
                {children.length ? ` · ${children.length} sub-ubicación${children.length === 1 ? "" : "es"}` : ""}
              </p>
            </div>
            {loc.hasNfc ? (
              <Wifi className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Tiene etiqueta NFC" />
            ) : (
              <Wifi className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-label="Sin etiqueta NFC" />
            )}
            <Badge variant="secondary" className="shrink-0 rounded-full">
              {total}
            </Badge>
          </button>

          {isOpen ? (
            <div className="space-y-2 px-3 pb-3">
              {ownItems.length ? (
                ownItems.map((item) => <ItemRow key={item.id} item={item} />)
              ) : (
                <p className="text-xs text-muted-foreground">
                  {children.length ? "Los activos están en sus sub-ubicaciones." : "Este armario está vacío."}
                </p>
              )}
              {children.map((child) => renderLocation(child, depth + 1))}
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/inventory/locations/${loc.code}`}>
                  <Button size="sm" variant="outline" className="rounded-xl">Abrir armario</Button>
                </Link>
                <a href={`/inventory/location-label/${loc.code}`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost" className="rounded-xl"><Printer className="mr-1 h-3.5 w-3.5" />Etiqueta</Button>
                </a>
                {canDelete ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      setMoveItemsTo(loc.parentId ?? "none");
                      setToDelete(loc);
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />Eliminar
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const unassigned = itemsByLocation.get("none") ?? [];
  const roots = childrenByParent.get("root") ?? [];
  const isLoading = loadingItems || loadingLocations;

  const chips: Array<{ key: QuickFilter; label: string; value: number; icon?: ReactNode }> = [
    { key: "all", label: "Todos", value: stats.total },
    { key: "available", label: "Disponibles", value: stats.available },
    { key: "loaned", label: "Prestados", value: stats.loaned },
    { key: "maintenance", label: "Mantenimiento", value: stats.maintenance, icon: <Wrench className="h-3 w-3" /> },
    { key: "no-location", label: "Sin armario", value: stats.noLocation, icon: <AlertTriangle className="h-3 w-3" /> },
    { key: "no-nfc", label: "Sin NFC", value: stats.noNfc, icon: <Wifi className="h-3 w-3" /> },
  ];

  return (
    <div className="space-y-5 p-4 md:p-8">
      <InventoryPageHeader subtitle={`Vista de armarios · ${stats.locations} armarios/ubicaciones · ${stats.total} activos`} />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === chip.key ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-background/60"
            }`}
          >
            {chip.icon}
            {chip.label}
            <span className="opacity-80">{chip.value}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 rounded-xl pl-9"
          placeholder="Buscar activo por nombre, código o categoría"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando inventario...</p> : null}

      {!isLoading && roots.length === 0 && items.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay armarios ni activos registrados.</p>
          <Link href="/inventory/register">
            <Button className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Registrar el primer armario</Button>
          </Link>
        </div>
      ) : null}

      <section className="space-y-3">{roots.map((loc) => renderLocation(loc, 0))}</section>

      {unassigned.length ? (
        <section className="space-y-2 rounded-2xl border border-amber-300/70 bg-amber-50/60 p-3 dark:bg-amber-950/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="font-semibold">Sin armario asignado</p>
            <Badge variant="secondary" className="ml-auto rounded-full">{unassigned.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Abre cada activo y usa “Mover” para ponerlo en su armario.</p>
          {unassigned.map((item) => <ItemRow key={item.id} item={item} />)}
        </section>
      ) : null}

      {!isLoading && filtering && visibleItems.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No hay activos que coincidan.</p>
      ) : null}

      <Link href="/inventory/register">
        <Button variant="outline" className="h-11 w-full rounded-2xl"><Plus className="mr-2 h-4 w-4" />Registrar activo o armario</Button>
      </Link>
      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => { if (!open && !deleteLocation.isPending) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {(() => {
                  if (!toDelete) return null;
                  const directItems = items.filter((i) => i.locationId === toDelete.id).length;
                  const subLocations = childrenByParent.get(toDelete.id)?.length ?? 0;
                  return (
                    <>
                      <p>Esta acción no se puede deshacer. El historial de movimientos se conserva.</p>
                      {directItems ? <p><b>Tiene {directItems} activo(s) dentro.</b> Elige a dónde pasan:</p> : <p>El armario está vacío.</p>}
                      {subLocations ? <p>Sus {subLocations} sub-ubicación(es) pasarán a estar directamente en el nivel superior.</p> : null}
                      {toDelete.hasNfc ? <p>Su etiqueta NFC quedará libre para usarla en otro armario.</p> : null}
                    </>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {toDelete && items.some((i) => i.locationId === toDelete.id) ? (
            <Select value={moveItemsTo} onValueChange={setMoveItemsTo}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Mover activos a..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Dejarlos sin armario</SelectItem>
                {locations
                  .filter((l) => l.id !== toDelete.id && l.parentId !== toDelete.id)
                  .map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLocation.isPending}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteLocation.isPending}
              onClick={() => {
                if (!toDelete) return;
                deleteLocation.mutate(
                  { code: toDelete.code, moveItemsTo: moveItemsTo === "none" ? null : moveItemsTo },
                  { onSuccess: () => setToDelete(null) },
                );
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleteLocation.isPending ? "Eliminando..." : "Eliminar armario"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
