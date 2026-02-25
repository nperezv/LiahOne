import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Boxes, ClipboardCheck, MapPin, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
      <Card className="border-0 bg-gradient-to-br from-primary/15 via-primary/5 to-background shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
              <p className="mt-1 text-sm text-muted-foreground">Escaneo móvil, movimientos rápidos y control de ubicación en un solo flujo.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex">
              <Button variant="secondary" className="rounded-2xl" onClick={() => navigate("/inventory/audit")}><ClipboardCheck className="mr-2 h-4 w-4" />Auditoría</Button>
              <Button variant="secondary" className="rounded-2xl" onClick={() => navigate("/inventory/locations")}><MapPin className="mr-2 h-4 w-4" />Ubicaciones</Button>
              <Button className="col-span-2 rounded-2xl md:col-auto" onClick={() => navigate("/inventory/new")}><Boxes className="mr-2 h-4 w-4" />Nuevo item</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-3xl"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.total}</CardContent></Card>
        <Card className="rounded-3xl"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Disponibles</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.available}</CardContent></Card>
        <Card className="rounded-3xl"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Prestados</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.loaned}</CardContent></Card>
      </div>

      <InventoryScanner onDetected={(assetCode) => navigate(`/inventory/${assetCode}`)} />

      <Card className="rounded-3xl">
        <CardHeader><CardTitle className="text-base">Mover por QR (fallback universal)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input className="h-12 rounded-2xl" placeholder="asset_code del item" value={scanItemCode} onChange={(e) => setScanItemCode(e.target.value)} />
          <Input className="h-12 rounded-2xl" placeholder="location_code del armario/estante" value={scanLocationCode} onChange={(e) => setScanLocationCode(e.target.value)} />
          <Button className="h-12 w-full rounded-2xl" onClick={() => moveByScan.mutate({ item_asset_code: scanItemCode, location_code: scanLocationCode })}>Mover por escaneo</Button>
        </CardContent>
      </Card>

      {nfc.isSupported && (
        <Card className="rounded-3xl">
          <CardHeader><CardTitle className="text-base">Mover por NFC (doble toque inteligente)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl bg-muted/40 p-3 text-sm">
              {selectedItem ? (
                <span className="flex items-center gap-2"><Badge variant="secondary" className="rounded-full">Paso 2</Badge> Toca ubicación destino para <b>{selectedItem}</b>.</span>
              ) : (
                <span className="flex items-center gap-2"><Badge variant="secondary" className="rounded-full">Paso 1</Badge> Toca el NFC del objeto.</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button className="h-12 flex-1 rounded-2xl" onClick={nfc.isScanning ? nfc.stop : nfc.start}><Radio className="mr-2 h-4 w-4" />{nfc.isScanning ? "Detener" : "Mover por NFC"}</Button>
              <Button variant="outline" className="h-12 rounded-2xl" onClick={() => { setSelectedItem(""); setFirstUid(""); }}>Cancelar</Button>
            </div>
            {nfc.error && <p className="text-sm text-destructive">{nfc.error}</p>}
          </CardContent>
        </Card>
      )}

      {!nfc.isSupported && (
        <Card className="rounded-3xl">
          <CardContent className="pt-6 text-sm text-muted-foreground">Web NFC no disponible en este dispositivo. Usa el modo QR.</CardContent>
        </Card>
      )}

      <Card className="rounded-3xl">
        <CardHeader><CardTitle className="text-base">Listado</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input className="h-12 rounded-2xl" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código o nombre" />
          {isLoading && <p>Cargando...</p>}
          {items.map((item) => (
            <Link key={item.id} href={`/inventory/${item.assetCode}`}>
              <div className="cursor-pointer rounded-2xl border p-3 transition-colors hover:bg-muted/60">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{item.assetCode} · {item.name}</p>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">{item.status} · {item.locationCode ?? "Sin ubicación"}</p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
