export type LocationType = "room" | "cabinet" | "shelf";

export interface InventoryAsset {
  id: string;
  name: string;
  category: string;
  uid_nfc?: string;
  qr_code?: string;
  status: "present" | "loaned" | "incident";
  location_id?: string;
}

export interface InventoryLocation {
  id: string;
  name: string;
  type: LocationType;
  parent_id?: string;
  nfc_uid?: string;
  qr_code?: string;
}

export interface InventoryMovement {
  id: string;
  asset_id: string;
  from_location_id?: string;
  to_location_id?: string;
  type: string;
  created_at: string;
  created_by: string;
}

export type ResolveTagInput =
  | { kind: "nfc"; value: string }
  | { kind: "qr"; value: string };

export type ResolveTagResult =
  | { type: "asset"; asset: InventoryAsset }
  | { type: "location"; location: InventoryLocation }
  | { type: "unknown"; raw: ResolveTagInput };
