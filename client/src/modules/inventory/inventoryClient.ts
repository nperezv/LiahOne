import { apiRequest } from "@/lib/queryClient";
import { inventoryAssetsMock, inventoryLocationsMock } from "./mockData";
import type { InventoryAsset, InventoryLocation, ResolveTagInput, ResolveTagResult } from "./types";

export async function resolveTag(input: ResolveTagInput): Promise<ResolveTagResult> {
  const asset = inventoryAssetsMock.find((entry) => entry.uid_nfc === input.value || entry.qr_code === input.value);
  if (asset) return { type: "asset", asset };

  const location = inventoryLocationsMock.find((entry) => entry.nfc_uid === input.value || entry.qr_code === input.value);
  if (location) return { type: "location", location };

  // TODO: wire to canonical resolve endpoint once backend contract is finalized.
  return { type: "unknown", raw: input };
}

export async function createAsset(payload: Partial<InventoryAsset>) {
  return apiRequest("POST", "/api/inventory", payload);
}

export async function createLocation(payload: Partial<InventoryLocation>) {
  return apiRequest("POST", "/api/inventory/locations", {
    name: payload.name,
    parentId: payload.parent_id,
    // TODO: add `type` when backend supports location hierarchy types.
  });
}

export async function moveAsset(payload: { assetId: string; toLocationId: string; note?: string }) {
  return apiRequest("POST", `/api/inventory/${payload.assetId}/move`, {
    toLocation: payload.toLocationId,
    note: payload.note,
  });
}

export async function loanAsset(payload: { assetId: string; borrower?: string; dueDate?: string }) {
  return apiRequest("POST", "/api/inventory/loan", payload);
}

export async function returnAsset(payload: { loanId: string }) {
  return apiRequest("POST", "/api/inventory/return", payload);
}

export async function listAssetsByLocation(locationId: string): Promise<InventoryAsset[]> {
  // TODO: replace with API query once endpoint accepts location filters.
  return inventoryAssetsMock.filter((asset) => asset.location_id === locationId);
}

export async function listLocations(): Promise<InventoryLocation[]> {
  const response = await apiRequest("GET", "/api/inventory/locations");
  if (!Array.isArray(response)) return inventoryLocationsMock;

  return response.map((location: any) => ({
    id: location.id,
    name: location.name,
    type: "cabinet",
    parent_id: location.parentId ?? undefined,
    nfc_uid: location.nfc_uid,
    qr_code: location.code,
  }));
}

export async function listAssets(): Promise<InventoryAsset[]> {
  const response = await apiRequest("GET", "/api/inventory");
  if (!Array.isArray(response)) return inventoryAssetsMock;

  return response.map((asset: any) => ({
    id: asset.assetCode ?? asset.id,
    name: asset.name,
    category: asset.categoryName ?? "General",
    uid_nfc: asset.nfc_uid,
    qr_code: asset.assetCode,
    status: asset.status === "loaned" ? "loaned" : asset.status === "maintenance" ? "incident" : "present",
    location_id: asset.locationId,
  }));
}

export async function completeAudit(payload: { locationId: string; foundAssetIds: string[] }) {
  // TODO: connect to final audit completion endpoint when available.
  return Promise.resolve(payload);
}
