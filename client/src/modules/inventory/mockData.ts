import type { InventoryAsset, InventoryLocation } from "./types";

export const inventoryLocationsMock: InventoryLocation[] = [
  { id: "room-capilla", name: "Capilla", type: "room", nfc_uid: "LOC-CAP-001", qr_code: "LOC-CAP-001" },
  { id: "cab-av", name: "Armario AV", type: "cabinet", parent_id: "room-capilla", nfc_uid: "LOC-AV-001", qr_code: "LOC-AV-001" },
  { id: "shelf-a", name: "Estante A", type: "shelf", parent_id: "cab-av", nfc_uid: "LOC-SHELF-A", qr_code: "LOC-SHELF-A" },
];

export const inventoryAssetsMock: InventoryAsset[] = [
  { id: "asset-1", name: "Micrófono Shure SM58", category: "Audio", uid_nfc: "8AP24D981", qr_code: "ASSET-001", status: "present", location_id: "cab-av" },
  { id: "asset-2", name: "Micrófono inalámbrico Shure", category: "Audio", uid_nfc: "8AP24D982", qr_code: "ASSET-002", status: "present", location_id: "cab-av" },
  { id: "asset-3", name: "Proyector Epson", category: "Video", uid_nfc: "8AP24D983", qr_code: "ASSET-003", status: "present", location_id: "cab-av" },
  { id: "asset-4", name: "Portátil Lenovo", category: "IT", uid_nfc: "8AP24D984", qr_code: "ASSET-004", status: "incident", location_id: "cab-av" },
  { id: "asset-5", name: "Cable XLR 10m", category: "Cables", uid_nfc: "8AP24D985", qr_code: "ASSET-005", status: "loaned", location_id: "shelf-a" },
];

export const categoryPalette = [
  { key: "Audio", color: "#4f7dff" },
  { key: "IT", color: "#31d8ff" },
  { key: "Limpieza", color: "#7ddf60" },
  { key: "Micro", color: "#f3d330" },
  { key: "Video", color: "#f59e0b" },
  { key: "Utilidad", color: "#f97316" },
  { key: "AV", color: "#b066ff" },
  { key: "Cables", color: "#5f6bff" },
];
