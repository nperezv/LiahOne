import { useReducer, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { inventoryLocationsMock } from "../mockData";
import { createLocation, moveAsset, resolveTag } from "../inventoryClient";
import { AssetActionSheet } from "../components/asset-action-sheet";
import { InventoryShell } from "../components/inventory-shell";
import { MoveWizard } from "../components/move-wizard";
import { RegisterLocation } from "../components/register-location-sheet";
import { ScanScreen } from "../components/scan-screen";
import { reduceScanState } from "../stateMachine";

export function InventoryScanPage() {
  const [state, dispatch] = useReducer(reduceScanState, { step: "idle" });
  const [, navigate] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleScan = async (kind: "nfc" | "qr", value: string) => {
    const result = await resolveTag({ kind, value });
    dispatch({ type: "SCAN_RESULT", result });
    setSheetOpen(true);
  };

  const closeFlow = () => {
    setSheetOpen(false);
    dispatch({ type: "RESET" });
  };

  return (
    <InventoryShell>
      <ScanScreen onMockNfc={() => handleScan("nfc", "8AP24D981")} onMockQr={() => handleScan("qr", "LOC-AV-001")} />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-white/10 bg-[#090f1a] text-white">
          {state.step === "tag-detected" && (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle className="text-white">Etiqueta detectada</SheetTitle>
                <SheetDescription>UID/QR: {state.tag.value}</SheetDescription>
              </SheetHeader>
              <Button className="w-full rounded-xl" onClick={() => navigate("/inventory/assets")}>Registrar como Activo</Button>
              <Button className="w-full rounded-xl bg-white/10 text-white hover:bg-white/20" onClick={() => dispatch({ type: "REGISTER_LOCATION" })}>
                Registrar como Ubicación
              </Button>
            </div>
          )}

          {state.step === "register-location" && (
            <RegisterLocation
              uid={state.tag.value}
              locations={inventoryLocationsMock}
              onSubmit={async (payload) => {
                await createLocation({ ...payload, nfc_uid: state.tag.value });
                closeFlow();
              }}
            />
          )}

          {state.step === "asset-detected" && (
            <AssetActionSheet
              asset={state.asset}
              locations={inventoryLocationsMock}
              onMove={() => dispatch({ type: "REQUEST_MOVE" })}
              onLoan={closeFlow}
            />
          )}

          {state.step === "move-await-destination" && (
            <div className="space-y-3">
              <p className="text-xl">Escanea ubicación destino para mover {state.asset.name}</p>
              <Button className="w-full rounded-xl bg-cyan-500 text-slate-950" onClick={() => dispatch({ type: "DESTINATION_SCANNED", location: inventoryLocationsMock[1] })}>
                Simular destino: Armario AV
              </Button>
            </div>
          )}

          {state.step === "move-confirm" && (
            <MoveWizard
              asset={state.asset}
              destination={state.destination}
              onConfirm={async () => {
                await moveAsset({ assetId: state.asset.id, toLocationId: state.destination.id });
                closeFlow();
              }}
            />
          )}

          {state.step === "location-detected" && (
            <div className="space-y-2">
              <h2 className="text-2xl">Ubicación detectada</h2>
              <p>{state.location.name}</p>
              <Button className="w-full" onClick={closeFlow}>Cerrar</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </InventoryShell>
  );
}
