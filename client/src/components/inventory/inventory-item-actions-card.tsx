import { useMemo, useState } from "react";
import { ArrowRight, HandCoins, MoveRight, Undo2 } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INVENTORY_STATUS_LABELS } from "@/hooks/use-api";
import { InventoryLoanDialog } from "@/components/inventory/inventory-loan-dialog";

interface InventoryItemActionsCardProps {
  itemId: string;
  assetCode: string;
  uid?: string;
  name: string;
  category?: string;
  location?: string;
  photoUrl?: string | null;
  status?: "available" | "loaned" | "maintenance";
  defaultExpanded?: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  available: "border-emerald-300 text-emerald-700 dark:text-emerald-300",
  loaned: "border-amber-300 text-amber-700 dark:text-amber-300",
  maintenance: "border-rose-300 text-rose-700 dark:text-rose-300",
};

export function InventoryItemActionsCard({
  itemId,
  assetCode,
  uid,
  name,
  category,
  location,
  photoUrl,
  status = "available",
  defaultExpanded = false,
}: InventoryItemActionsCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isLoanOpen, setIsLoanOpen] = useState(false);

  const resolvedCategory = useMemo(() => category || "Sin categoría", [category]);
  const resolvedLocation = useMemo(() => location || "Sin armario", [location]);

  return (
    <>
      <article className={cn("rounded-2xl border border-border/70 bg-background/70 p-3", expanded && "shadow-[0_0_0_1px_rgba(139,92,246,0.35)]") }>
        {uid ? <p className="text-xs uppercase tracking-wide text-muted-foreground">UID: {uid}</p> : null}

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 flex w-full items-center gap-3 text-left"
        >
          {photoUrl ? (
            <img src={photoUrl} alt={name} className="h-14 w-14 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-xs text-muted-foreground">IMG</div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-lg font-semibold">{name}</p>
              <Badge variant="outline" className={cn("shrink-0 text-[10px]", STATUS_STYLE[status])}>{INVENTORY_STATUS_LABELS[status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{assetCode} · {resolvedCategory}</p>
            <p className="text-sm text-muted-foreground">{resolvedLocation}</p>
          </div>
        </button>

        {expanded ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {status === "loaned" ? (
              <Link href={`/inventory/${assetCode}`}>
                <Button className="h-11 w-full rounded-xl"><Undo2 className="mr-2 h-4 w-4" />Devolución</Button>
              </Link>
            ) : (
              <Button
                className="h-11 w-full rounded-xl bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50"
                onClick={() => setIsLoanOpen(true)}
                disabled={!itemId || status === "maintenance"}
              >
                <HandCoins className="mr-2 h-4 w-4" />Prestar
              </Button>
            )}
            <Link href={`/inventory/${assetCode}`}>
              <Button className="h-11 w-full rounded-xl" variant="secondary">
                <MoveRight className="mr-2 h-4 w-4" />Mover
              </Button>
            </Link>
            <Link href={`/inventory/${assetCode}`} className="col-span-2">
              <Button className="h-11 w-full rounded-xl" variant="outline">
                <ArrowRight className="mr-2 h-4 w-4" />Abrir ficha (editar, QR, etiqueta, eliminar)
              </Button>
            </Link>
          </div>
        ) : null}
      </article>

      <InventoryLoanDialog open={isLoanOpen} onOpenChange={setIsLoanOpen} itemId={itemId} assetCode={assetCode} itemName={name} />
    </>
  );
}
