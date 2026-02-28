import { useMemo, useState } from "react";
import { Link } from "wouter";
import { QrCode, ScanLine, FolderTree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InventoryScanner } from "@/components/inventory-scanner";
import { useInventoryByNfc } from "@/hooks/use-api";
import { useNfcScanner } from "@/hooks/use-nfc-scanner";
import { NfcScanRing } from "@/components/inventory/inventory-hub-widgets";
import { InventoryPageHeader } from "@/components/inventory/inventory-page-header";
import { InventoryItemActionsCard } from "@/components/inventory/inventory-item-actions-card";

export default function InventoryScanPage() {
  const [mode, setMode] = useState<"nfc" | "qr">("nfc");
  const [uid, setUid] = useState("");
  const [code, setCode] = useState("");

  const nfc = useNfcScanner((value) => setUid(value));
  const lookup = useInventoryByNfc(uid || undefined);
  const resolved = lookup.data as any;

  const detected = useMemo(() => {
    if (mode === "qr" && code) return { type: "item", asset_code: code } as any;
    return resolved;
  }, [mode, code, resolved]);

  return (
    <div className="space-y-4 p-4 md:p-8">
      <InventoryPageHeader subtitle="Escaneo NFC y QR" />

      <Card className="rounded-3xl border border-border/60 bg-gradient-to-b from-[#030a1a] to-[#040813]">
        <CardHeader><CardTitle className="text-center tracking-wide">ESCANEAR</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1">
            <Button variant={mode === "nfc" ? "default" : "ghost"} className="rounded-lg" onClick={() => setMode("nfc")}><ScanLine className="mr-2 h-4 w-4" />NFC</Button>
            <Button variant={mode === "qr" ? "default" : "ghost"} className="rounded-lg" onClick={() => setMode("qr")}><QrCode className="mr-2 h-4 w-4" />QR</Button>
          </div>

          {mode === "nfc" ? (
            <>
              <NfcScanRing active={nfc.isScanning} />
              <p className="text-center text-sm text-muted-foreground">Acerca una etiqueta NFC con ID NDEF grabado para identificar activo o ubicación.</p>
              <div className="flex gap-2">
                <Button className="h-11 flex-1 rounded-xl" onClick={nfc.isScanning ? nfc.stop : nfc.start} disabled={!nfc.isSupported}><ScanLine className="mr-2 h-4 w-4" />{nfc.isScanning ? "Detener" : "Leer NFC"}</Button>
                <Input className="h-11 rounded-xl" value={uid} onChange={(e) => setUid(e.target.value.toUpperCase())} placeholder="ID NFC (NDEF)" />
              </div>
              {nfc.error && <p className="text-xs text-amber-600">{nfc.error}</p>}
            </>
          ) : (
            <div className="space-y-3">
              <InventoryScanner onDetected={(assetCode) => setCode(assetCode)} />
              <Input className="h-11 rounded-xl" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de activo" />
            </div>
          )}
        </CardContent>
      </Card>

      {detected && (
        <Card className="rounded-3xl">
          <CardHeader><CardTitle>{detected.type === "location" ? "Ubicación detectada" : "Activo detectado"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {detected.type === "location" ? (
              <>
                <p className="text-sm text-muted-foreground">{detected.location_code || "Ubicación"}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Link href={`/inventory/locations/${detected.location_code || ""}`}><Button className="w-full rounded-xl" variant="outline"><FolderTree className="mr-2 h-4 w-4" />Ver contenido</Button></Link>
                  <Link href="/inventory/audit"><Button className="w-full rounded-xl">Iniciar auditoría</Button></Link>
                </div>
              </>
            ) : (
              <>
                <InventoryItemActionsCard
                  assetCode={detected.asset_code || code}
                  uid={uid || undefined}
                  name={detected.name || `Activo ${detected.asset_code || code || ""}`.trim()}
                  category={detected.categoryName || detected.category_name}
                  location={detected.locationName || detected.location_name || detected.location_code}
                  photoUrl={detected.photoUrl || detected.photo_url}
                  defaultExpanded
                />
                <Link href={`/inventory/list?asset=${detected.asset_code || code}`}>
                  <Button className="w-full rounded-xl" variant="outline">Abrir en Inventario</Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
