import { useMemo, useReducer } from "react";
import { useRoute } from "wouter";
import { completeAudit } from "../inventoryClient";
import { inventoryAssetsMock, inventoryLocationsMock } from "../mockData";
import { AuditScreen } from "../components/audit-screen";
import { InventoryShell } from "../components/inventory-shell";
import { reduceAuditScan } from "../stateMachine";

export function InventoryAuditPage() {
  const [match, params] = useRoute("/inventory/audit/:locationId");
  const locationId = match ? params.locationId : "cab-av";

  const location = inventoryLocationsMock.find((entry) => entry.id === locationId) ?? inventoryLocationsMock[1];
  const expectedAssets = useMemo(() => inventoryAssetsMock.filter((asset) => asset.location_id === location.id), [location.id]);
  const [auditState, markFound] = useReducer(reduceAuditScan, { foundAssetIds: [] });

  return (
    <InventoryShell>
      <AuditScreen
        locationName={location.name}
        assets={expectedAssets}
        foundIds={auditState.foundAssetIds}
        onScan={() => markFound(expectedAssets[0]?.id ?? "")}
        onFinish={() => completeAudit({ locationId: location.id, foundAssetIds: auditState.foundAssetIds })}
      />
    </InventoryShell>
  );
}
