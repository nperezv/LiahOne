import { useMemo } from "react";
import { Link } from "wouter";
import { Boxes, History, QrCode, ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GaugeSegment, InventoryGauge } from "@/components/inventory/inventory-hub-widgets";
import { useInventoryCategories, useInventoryItems } from "@/hooks/use-api";

const CHART_PALETTE = ["#30d5ff", "#52e66d", "#f3d63b", "#ff8a3d", "#cc5de8", "#6d5efc"];

function buildGaugeSegments(
  categories: Array<{ id: string; name: string }>,
  items: Array<{ categoryId?: string | null }>,
): GaugeSegment[] {
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
}

export default function InventoryPage() {
  const { data: items = [] } = useInventoryItems();
  const { data: categories = [] } = useInventoryCategories();

  const segmentsForGauge = useMemo(() => buildGaugeSegments(categories, items), [categories, items]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Inventario del barrio</h1>
        <p className="text-sm text-muted-foreground">Total de activos y bienes de la unidad</p>
        <Link href="/inventory/history">
          <Button
            variant="outline"
            className="mt-3 h-9 rounded-full border-border/70 bg-background/60 px-4 text-xs font-medium"
          >
            <History className="mr-2 h-4 w-4" />Historial
          </Button>
        </Link>
      </header>

      <div className="pt-7 pb-6 md:pt-10 md:pb-7">
        <InventoryGauge total={items.length} segments={segmentsForGauge} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/inventory/list"><Button variant="outline" className="h-12 w-full rounded-2xl border-border/70 bg-background/50"><Boxes className="mr-2 h-4 w-4" />Inventario</Button></Link>
        <Link href="/inventory/scan"><Button className="h-12 w-full rounded-2xl shadow-[0_8px_24px_rgba(37,99,235,0.25)]"><ScanLine className="mr-2 h-4 w-4" />Escanear</Button></Link>
        <Link href="/inventory/register"><Button variant="outline" className="h-12 w-full rounded-2xl border-border/70 bg-background/50"><QrCode className="mr-2 h-4 w-4" />Registro</Button></Link>
        <Link href="/inventory/audit"><Button variant="outline" className="h-12 w-full rounded-2xl border-border/70 bg-background/50"><ShieldCheck className="mr-2 h-4 w-4" />Auditoría</Button></Link>
      </div>
    </div>
  );
}
