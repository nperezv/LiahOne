import { useMemo, useState } from "react";
import { ArrowRight, HandCoins, MoveRight, ScanLine } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InventoryItemActionsCardProps {
  assetCode: string;
  uid?: string;
  name: string;
  category?: string;
  location?: string;
  photoUrl?: string | null;
  defaultExpanded?: boolean;
}

export function InventoryItemActionsCard({
  assetCode,
  uid,
  name,
  category,
  location,
  photoUrl,
  defaultExpanded = false,
}: InventoryItemActionsCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const resolvedCategory = useMemo(() => category || "Sin categoría", [category]);
  const resolvedLocation = useMemo(() => location || "Sin armario", [location]);

  return (
    <article className={cn("rounded-2xl border border-border/70 bg-background/70 p-3", expanded && "shadow-[0_0_0_1px_rgba(59,130,246,0.25)]") }>
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
          <p className="truncate text-lg font-semibold">{name}</p>
          <p className="text-sm text-muted-foreground">{resolvedCategory}</p>
          <p className="text-sm text-muted-foreground">{resolvedLocation}</p>
        </div>
      </button>

      {expanded ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/inventory/${assetCode}`}>
              <Button className="h-11 w-full rounded-xl" variant="secondary">
                <MoveRight className="mr-2 h-4 w-4" />Mover
              </Button>
            </Link>
            <Link href={`/inventory/${assetCode}`}>
              <Button className="h-11 w-full rounded-xl bg-amber-600 text-white hover:bg-amber-500">
                <HandCoins className="mr-2 h-4 w-4" />Prestar
              </Button>
            </Link>
          </div>

          <Link href={`/inventory/${assetCode}`}>
            <Button className="h-11 w-full rounded-xl" variant="outline">
              <ArrowRight className="mr-2 h-4 w-4" />Ver detalles
            </Button>
          </Link>

          <Link href="/inventory/scan">
            <Button className="h-11 w-full rounded-xl" variant="ghost">
              <ScanLine className="mr-2 h-4 w-4" />Escanear ubicación destino
            </Button>
          </Link>
        </div>
      ) : null}
    </article>
  );
}
