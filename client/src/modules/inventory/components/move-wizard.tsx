import { Button } from "@/components/ui/button";
import type { InventoryAsset, InventoryLocation } from "../types";

export function MoveWizard({
  asset,
  destination,
  onConfirm,
}: {
  asset: InventoryAsset;
  destination: InventoryLocation;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/85 p-4">
      <h3 className="text-xl font-semibold">Confirmar movimiento</h3>
      <p className="text-slate-300">Mover {asset.name} a {destination.name}?</p>
      <Button className="w-full rounded-2xl bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={onConfirm}>
        Confirmar mover
      </Button>
    </div>
  );
}
