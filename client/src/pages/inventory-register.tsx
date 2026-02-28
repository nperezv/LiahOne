import { useState } from "react";
import { ArrowRight, FolderTree, Loader2, QrCode, ScanLine, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreateInventoryItem,
  useCreateInventoryLocation,
  useInventoryByNfc,
  useInventoryCategories,
  useInventoryLocations,
  useRegisterItemNfc,
  useRegisterLocationNfc,
} from "@/hooks/use-api";
import { useNfcScanner } from "@/hooks/use-nfc-scanner";
import { NfcScanRing } from "@/components/inventory/inventory-hub-widgets";
import { InventoryPageHeader } from "@/components/inventory/inventory-page-header";

export default function InventoryRegisterHubPage() {
  const { data: categories = [] } = useInventoryCategories();
  const { data: locations = [] } = useInventoryLocations();

  const createItem = useCreateInventoryItem();
  const createLocation = useCreateInventoryLocation();
  const registerItemNfc = useRegisterItemNfc();
  const registerLocationNfc = useRegisterLocationNfc();

  const [assetUid, setAssetUid] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetCategoryId, setAssetCategoryId] = useState("");
  const [assetLocationId, setAssetLocationId] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetPhotoUrl, setAssetPhotoUrl] = useState("");
  const [assetPhotoUploading, setAssetPhotoUploading] = useState(false);
  const [createdAssetCode, setCreatedAssetCode] = useState("");

  const [assetQrName, setAssetQrName] = useState("");
  const [assetQrCategoryId, setAssetQrCategoryId] = useState("");
  const [assetQrLocationId, setAssetQrLocationId] = useState("");
  const [assetQrDescription, setAssetQrDescription] = useState("");
  const [assetQrPhotoUrl, setAssetQrPhotoUrl] = useState("");
  const [assetQrPhotoUploading, setAssetQrPhotoUploading] = useState(false);
  const [createdAssetCodeByQr, setCreatedAssetCodeByQr] = useState("");

  const [locationUid, setLocationUid] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationParentId, setLocationParentId] = useState("none");
  const [createdLocationCode, setCreatedLocationCode] = useState("");

  const [locationQrName, setLocationQrName] = useState("");
  const [locationQrParentId, setLocationQrParentId] = useState("none");
  const [createdLocationCodeByQr, setCreatedLocationCodeByQr] = useState("");

  const [nfcMode, setNfcMode] = useState<"asset" | "location" | null>(null);
  const nfc = useNfcScanner((uid) => {
    if (nfcMode === "asset") setAssetUid(uid);
    if (nfcMode === "location") setLocationUid(uid);
  });

  const startNfc = (mode: "asset" | "location") => {
    setNfcMode(mode);
    nfc.start();
  };
  const stopNfc = () => {
    nfc.stop();
    setNfcMode(null);
  };

  const assetLookup = useInventoryByNfc(assetUid || undefined);
  const locationLookup = useInventoryByNfc(locationUid || undefined);
  const assetInUse = Boolean(assetUid && (assetLookup.data as any)?.type);
  const locationInUse = Boolean(locationUid && (locationLookup.data as any)?.type);

  const handleCreateAssetByNfc = async () => {
    if (!assetUid || !assetName.trim() || !assetCategoryId || assetInUse) return;
    const created = await createItem.mutateAsync({
      name: assetName.trim(),
      description: assetDescription.trim() || undefined,
      photoUrl: assetPhotoUrl.trim() || undefined,
      categoryId: assetCategoryId,
      locationId: assetLocationId || undefined,
      status: "available",
    });
    await registerItemNfc.mutateAsync({ asset_code: created.assetCode, nfc_uid: assetUid });
    setCreatedAssetCode(created.assetCode);
    setAssetUid("");
    setAssetName("");
    setAssetCategoryId("");
    setAssetLocationId("");
    setAssetDescription("");
    setAssetPhotoUrl("");
    stopNfc();
  };

  const handleCreateAssetByQr = async () => {
    if (!assetQrName.trim() || !assetQrCategoryId) return;
    const created = await createItem.mutateAsync({
      name: assetQrName.trim(),
      description: assetQrDescription.trim() || undefined,
      photoUrl: assetQrPhotoUrl.trim() || undefined,
      categoryId: assetQrCategoryId,
      locationId: assetQrLocationId || undefined,
      status: "available",
    });
    setCreatedAssetCodeByQr(created.assetCode);
    setAssetQrName("");
    setAssetQrCategoryId("");
    setAssetQrLocationId("");
    setAssetQrDescription("");
    setAssetQrPhotoUrl("");
  };

  const handleCreateLocationByNfc = async () => {
    if (!locationUid || !locationName.trim() || locationInUse) return;
    const created = await createLocation.mutateAsync({
      name: locationName.trim(),
      parentId: locationParentId === "none" ? undefined : locationParentId,
    });
    await registerLocationNfc.mutateAsync({ location_code: created.code, nfc_uid: locationUid });
    setCreatedLocationCode(created.code);
    setLocationUid("");
    setLocationName("");
    setLocationParentId("none");
    stopNfc();
  };

  const handleCreateLocationByQr = async () => {
    if (!locationQrName.trim()) return;
    const created = await createLocation.mutateAsync({
      name: locationQrName.trim(),
      parentId: locationQrParentId === "none" ? undefined : locationQrParentId,
    });
    setCreatedLocationCodeByQr(created.code);
    setLocationQrName("");
    setLocationQrParentId("none");
  };

  const uploadImageToServer = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("No se pudo subir la imagen");
    }

    const uploaded = await response.json();
    return uploaded?.url as string;
  };

  const handleAssetPhotoFile = async (file: File | null, mode: "nfc" | "qr") => {
    if (!file) return;
    try {
      if (mode === "nfc") setAssetPhotoUploading(true);
      else setAssetQrPhotoUploading(true);

      const url = await uploadImageToServer(file);
      if (mode === "nfc") setAssetPhotoUrl(url);
      else setAssetQrPhotoUrl(url);
    } catch {
      // keep silent to avoid introducing new toast dependency here
    } finally {
      if (mode === "nfc") setAssetPhotoUploading(false);
      else setAssetQrPhotoUploading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-8">
      <InventoryPageHeader subtitle="Registro de activos y armarios" />

      <Tabs defaultValue="assets" className="space-y-4">
        <TabsList className="grid h-auto grid-cols-2 rounded-2xl bg-muted/60 p-1">
          <TabsTrigger value="assets" className="rounded-xl py-2">Registrar activo</TabsTrigger>
          <TabsTrigger value="locations" className="rounded-xl py-2">Registrar armario</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-4">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle>Activos</CardTitle></CardHeader>
            <CardContent>
              <Tabs defaultValue="asset-nfc" className="space-y-4">
                <TabsList className="grid h-auto grid-cols-2 rounded-xl bg-muted/60 p-1">
                  <TabsTrigger value="asset-nfc" className="rounded-lg">NFC (inversa)</TabsTrigger>
                  <TabsTrigger value="asset-qr" className="rounded-lg">QR</TabsTrigger>
                </TabsList>

                <TabsContent value="asset-nfc" className="space-y-4">
                  <NfcScanRing active={nfc.isScanning && nfcMode === "asset"} />
                  <div className="flex gap-2">
                    <Button className="h-12 flex-1 rounded-2xl" disabled={!nfc.isSupported} onClick={nfc.isScanning && nfcMode === "asset" ? stopNfc : () => startNfc("asset")}><ScanLine className="mr-2 h-4 w-4" />{nfc.isScanning && nfcMode === "asset" ? "Detener lectura" : "Leer NFC activo"}</Button>
                    <Input className="h-12 rounded-2xl" placeholder="UID activo" value={assetUid} onChange={(e) => setAssetUid(e.target.value.toUpperCase())} />
                  </div>
                  {assetUid && <p className={`text-sm ${assetInUse ? "text-amber-600" : "text-emerald-600"}`}>{assetInUse ? "UID en uso, escanea otro." : "UID disponible."}</p>}
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select value={assetCategoryId} onValueChange={setAssetCategoryId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.prefix}</SelectItem>)}</SelectContent></Select>
                    <Select value={assetLocationId} onValueChange={setAssetLocationId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación inicial (opcional)" /></SelectTrigger><SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>)}</SelectContent></Select>
                    <Input className="h-11 rounded-xl md:col-span-2" placeholder="Nombre activo" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
                    <Input className="h-11 rounded-xl md:col-span-2" placeholder="Descripción (opcional)" value={assetDescription} onChange={(e) => setAssetDescription(e.target.value)} />
                    <Input className="h-11 rounded-xl md:col-span-2" placeholder="URL de foto (opcional)" value={assetPhotoUrl} onChange={(e) => setAssetPhotoUrl(e.target.value)} />
                    <div className="md:col-span-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                        {assetPhotoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {assetPhotoUploading ? "Subiendo foto..." : "Subir foto desde galería"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => void handleAssetPhotoFile(e.target.files?.[0] ?? null, "nfc")}
                        />
                      </label>
                    </div>
                  </div>
                  <Button className="h-12 rounded-2xl" disabled={!assetUid || assetInUse || !assetName.trim() || !assetCategoryId || createItem.isPending || registerItemNfc.isPending} onClick={handleCreateAssetByNfc}><ScanLine className="mr-2 h-4 w-4" />Crear activo + vincular NFC</Button>
                  {createdAssetCode && <p className="text-sm text-emerald-700">Activo creado: <b>{createdAssetCode}</b>.</p>}
                </TabsContent>

                <TabsContent value="asset-qr" className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select value={assetQrCategoryId} onValueChange={setAssetQrCategoryId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.prefix}</SelectItem>)}</SelectContent></Select>
                    <Select value={assetQrLocationId} onValueChange={setAssetQrLocationId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación inicial (opcional)" /></SelectTrigger><SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>)}</SelectContent></Select>
                    <Input className="h-11 rounded-xl md:col-span-2" placeholder="Nombre activo" value={assetQrName} onChange={(e) => setAssetQrName(e.target.value)} />
                    <Input className="h-11 rounded-xl md:col-span-2" placeholder="Descripción (opcional)" value={assetQrDescription} onChange={(e) => setAssetQrDescription(e.target.value)} />
                    <Input className="h-11 rounded-xl md:col-span-2" placeholder="URL de foto (opcional)" value={assetQrPhotoUrl} onChange={(e) => setAssetQrPhotoUrl(e.target.value)} />
                    <div className="md:col-span-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                        {assetQrPhotoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {assetQrPhotoUploading ? "Subiendo foto..." : "Subir foto desde galería"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => void handleAssetPhotoFile(e.target.files?.[0] ?? null, "qr")}
                        />
                      </label>
                    </div>
                  </div>
                  <Button className="h-12 rounded-2xl" disabled={!assetQrName.trim() || !assetQrCategoryId || createItem.isPending} onClick={handleCreateAssetByQr}><QrCode className="mr-2 h-4 w-4" />Crear activo (QR)</Button>
                  {createdAssetCodeByQr && <div className="space-y-2 rounded-2xl border p-3"><p className="text-sm">Activo creado: <b>{createdAssetCodeByQr}</b>.</p><div className="flex flex-wrap gap-2"><a href={`/inventory/qr/${createdAssetCodeByQr}`} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl"><QrCode className="mr-2 h-4 w-4" />Ver QR</Button></a><a href={`/inventory/label/${createdAssetCodeByQr}`} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl"><QrCode className="mr-2 h-4 w-4" />Etiqueta PDF</Button></a></div></div>}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="space-y-4">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle>Armarios</CardTitle></CardHeader>
            <CardContent>
              <Tabs defaultValue="location-nfc" className="space-y-4">
                <TabsList className="grid h-auto grid-cols-2 rounded-xl bg-muted/60 p-1">
                  <TabsTrigger value="location-nfc" className="rounded-lg">NFC (inversa)</TabsTrigger>
                  <TabsTrigger value="location-qr" className="rounded-lg">QR</TabsTrigger>
                </TabsList>

                <TabsContent value="location-nfc" className="space-y-4">
                  <NfcScanRing active={nfc.isScanning && nfcMode === "location"} />
                  <div className="flex gap-2">
                    <Button className="h-11 flex-1 rounded-xl" variant="outline" disabled={!nfc.isSupported} onClick={nfc.isScanning && nfcMode === "location" ? stopNfc : () => startNfc("location")}><ScanLine className="mr-2 h-4 w-4" />{nfc.isScanning && nfcMode === "location" ? "Detener lectura" : "Leer NFC armario"}</Button>
                    <Input className="h-11 rounded-xl" placeholder="UID ubicación" value={locationUid} onChange={(e) => setLocationUid(e.target.value.toUpperCase())} />
                  </div>
                  {locationUid && <p className={`text-sm ${locationInUse ? "text-amber-600" : "text-emerald-600"}`}>{locationInUse ? "UID en uso, escanea otro." : "UID disponible."}</p>}
                  <Input className="h-11 rounded-xl" placeholder="Nombre ubicación" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
                  <Select value={locationParentId} onValueChange={setLocationParentId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación padre (opcional)" /></SelectTrigger><SelectContent><SelectItem value="none">Sin padre (raíz)</SelectItem>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>)}</SelectContent></Select>
                  <Button className="h-11 rounded-xl" disabled={!locationUid || locationInUse || !locationName.trim() || createLocation.isPending || registerLocationNfc.isPending} onClick={handleCreateLocationByNfc}><FolderTree className="mr-2 h-4 w-4" />Crear ubicación + vincular NFC</Button>
                  {createdLocationCode && <p className="text-sm text-emerald-700">Ubicación creada: <b>{createdLocationCode}</b>.</p>}
                </TabsContent>

                <TabsContent value="location-qr" className="space-y-4">
                  <Input className="h-11 rounded-xl" placeholder="Nombre armario/ubicación" value={locationQrName} onChange={(e) => setLocationQrName(e.target.value)} />
                  <Select value={locationQrParentId} onValueChange={setLocationQrParentId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación padre (opcional)" /></SelectTrigger><SelectContent><SelectItem value="none">Sin padre (raíz)</SelectItem>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>)}</SelectContent></Select>
                  <Button className="h-11 rounded-xl" disabled={!locationQrName.trim() || createLocation.isPending} onClick={handleCreateLocationByQr}><QrCode className="mr-2 h-4 w-4" />Crear ubicación (QR)</Button>
                  {createdLocationCodeByQr && <div className="space-y-2 rounded-2xl border p-3"><p className="text-sm">Ubicación creada: <b>{createdLocationCodeByQr}</b>.</p><div className="flex flex-wrap gap-2"><a href={`/loc/${createdLocationCodeByQr}`} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl"><ArrowRight className="mr-2 h-4 w-4" />Ver ubicación</Button></a><a href={`/inventory/location-label/${createdLocationCodeByQr}`} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl"><QrCode className="mr-2 h-4 w-4" />Etiqueta QR ubicación</Button></a></div></div>}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
