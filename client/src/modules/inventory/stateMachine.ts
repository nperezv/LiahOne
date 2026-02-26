import type { InventoryAsset, InventoryLocation, ResolveTagInput, ResolveTagResult } from "./types";

export type ScanFlowState =
  | { step: "idle" }
  | { step: "tag-detected"; tag: ResolveTagInput }
  | { step: "register-location"; tag: ResolveTagInput }
  | { step: "asset-detected"; asset: InventoryAsset }
  | { step: "move-await-destination"; asset: InventoryAsset }
  | { step: "move-confirm"; asset: InventoryAsset; destination: InventoryLocation }
  | { step: "location-detected"; location: InventoryLocation };

export type ScanFlowEvent =
  | { type: "SCAN_RESULT"; result: ResolveTagResult }
  | { type: "REGISTER_LOCATION" }
  | { type: "REQUEST_MOVE" }
  | { type: "DESTINATION_SCANNED"; location: InventoryLocation }
  | { type: "RESET" };

export function reduceScanState(state: ScanFlowState, event: ScanFlowEvent): ScanFlowState {
  switch (event.type) {
    case "SCAN_RESULT": {
      if (event.result.type === "asset") return { step: "asset-detected", asset: event.result.asset };
      if (event.result.type === "location") return { step: "location-detected", location: event.result.location };
      return { step: "tag-detected", tag: event.result.raw };
    }
    case "REGISTER_LOCATION":
      if (state.step !== "tag-detected") return state;
      return { step: "register-location", tag: state.tag };
    case "REQUEST_MOVE":
      if (state.step !== "asset-detected") return state;
      return { step: "move-await-destination", asset: state.asset };
    case "DESTINATION_SCANNED":
      if (state.step !== "move-await-destination") return state;
      return { step: "move-confirm", asset: state.asset, destination: event.location };
    case "RESET":
      return { step: "idle" };
    default:
      return state;
  }
}

export interface AuditScanState {
  foundAssetIds: string[];
}

export function reduceAuditScan(state: AuditScanState, scannedAssetId: string): AuditScanState {
  if (state.foundAssetIds.includes(scannedAssetId)) return state;
  return { ...state, foundAssetIds: [...state.foundAssetIds, scannedAssetId] };
}
