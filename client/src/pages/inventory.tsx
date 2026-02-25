import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InventoryScanner } from "@/components/inventory-scanner";
import { useInventoryByNfc, useInventoryItems, useMoveByScan } from "@/hooks/use-api";
import { useNfcScanner } from "@/hooks/use-nfc-scanner";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();
  const { data: items = [], isLoading } = useInventoryItems(search);
  const moveByScan = useMoveByScan();
  const [scanItemCode, setScanItemCode] = useState("");
  const [scanLocationCode, setScanLocationCode] = useState("");

  const [firstUid, setFirstUid] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<string>("");
  const { data: firstResolved } = useInventoryByNfc(firstUid || undefined);
  const nfc = useNfcScanner(async (uid) => {
    if (!selectedItem) {
      setFirstUid(uid);
      return;
    }
    const result = await fetch(`/inventory/by-nfc/${uid}`, { credentials: "include" }).then((r) => r.json()).catch(() => null);
    if (result?.type === "location") {
      moveByScan.mutate({ item_asset_code: selectedItem, location_nfc_uid: uid });
      setSelectedItem("");
      setFirstUid("");
    }
    if (result?.type === "item") {
      setFirstUid(uid);
    }
  });

  useEffect(() => {
    if (firstResolved?.type === "item") {
      setSelectedItem(firstResolved.asset_code);
    }
  }, [firstResolved]);

  const stats = useMemo(() => ({
    total: items.length,
    available: items.filter((i) => i.status === "available").length,
    loaned: items.filter((i) => i.status === "loaned").length,
  }), [items]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventario</h1>
          <p className="text-sm text-muted-foreground">Sistema de activos con QR universal, NFC UID y auditoría móvil.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/inventory/audit")}>Auditoría</Button>
          <Button variant="outline" onClick={() => navigate("/inventory/locations")}>Ubicaciones</Button>
          <Button onClick={() => navigate("/inventory/new")}>Nuevo item</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Total</CardTitle></CardHeader><CardContent>{stats.total}</CardContent></Card>
        <Card><CardHeader><CardTitle>Disponibles</CardTitle></CardHeader><CardContent>{stats.available}</CardContent></Card>
        <Card><CardHeader><CardTitle>Prestados</CardTitle></CardHeader><CardContent>{stats.loaned}</CardContent></Card>
      </div>

      <InventoryScanner onDetected={(assetCode) => navigate(`/inventory/${assetCode}`)} />

      <Card>
        <CardHeader><CardTitle>Mover por QR (fallback universal)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="asset_code del item" value={scanItemCode} onChange={(e) => setScanItemCode(e.target.value)} />
          <Input placeholder="location_code del armario/estante" value={scanLocationCode} onChange={(e) => setScanLocationCode(e.target.value)} />
          <Button className="w-full" onClick={() => moveByScan.mutate({ item_asset_code: scanItemCode, location_code: scanLocationCode })}>Mover por escaneo</Button>
        </CardContent>
      </Card>

      {nfc.isSupported && (
        <Card>
          <CardHeader><CardTitle>Mover por NFC (doble toque inteligente)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">{selectedItem ? `Paso 2: toca ubicación destino. Item: ${selectedItem}` : "Paso 1: toca el NFC del objeto"}</p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={nfc.isScanning ? nfc.stop : nfc.start}>{nfc.isScanning ? "Detener" : "Mover por NFC"}</Button>
              <Button variant="outline" onClick={() => { setSelectedItem(""); setFirstUid(""); }}>Cancelar</Button>
            </div>
            {nfc.error && <p className="text-sm text-destructive">{nfc.error}</p>}
          </CardContent>
        </Card>
      )}

      {!nfc.isSupported && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">Web NFC no disponible en este dispositivo. Usa el modo QR.</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Listado</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código o nombre" />
          {isLoading && <p>Cargando...</p>}
          {items.map((item) => (
            <Link key={item.id} href={`/inventory/${item.assetCode}`}>
              <div className="cursor-pointer rounded-xl border p-3 hover:bg-muted/60">
                <p className="font-semibold">{item.assetCode} · {item.name}</p>
                <p className="text-sm text-muted-foreground">{item.status} · {item.locationCode ?? "Sin ubicación"}</p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
