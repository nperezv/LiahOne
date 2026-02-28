import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface InventoryPageHeaderProps {
  subtitle?: string;
  backHref?: string;
}

export function InventoryPageHeader({ subtitle, backHref = "/inventory" }: InventoryPageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario del barrio</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>

        {backHref ? (
          <Link href={backHref}>
            <Button variant="outline" className="rounded-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
