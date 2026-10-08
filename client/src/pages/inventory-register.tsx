import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eraser, FolderTree, Loader2, QrCode, ScanLine, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import {
  inventoryErrorMessage,
  useCreateInventoryItem,
  useCreateInventoryItemWithNfc,
  useCreateInventoryLocation,
  useCreateInventoryLocationWithNfc,
  useInventoryByNfc,
  useInventoryCategories,
  useInventoryLocations,
} from "@/hooks/use-api";
import { useNfcScanner } from "@/hooks/use-nfc-scanner";
import { itemLabelPdf, locationLabelPdf, uploadInventoryPhoto } from "@/lib/inventory-files";
import { NfcScanRing } from "@/components/inventory/inventory-hub-widgets";
import { InventoryPageHeader } from "@/components/inventory/inventory-page-header";

export default function InventoryRegisterHubPage() {
  const { data: categories = [] } = useInventoryCategories();
  const { data: locations = [] } = useInventoryLocations();

  const createItem = useCreateInventoryItem();
  const createItemWithNfc = useCreateInventoryItemWithNfc();
  const createLocation = useCreateInventoryLocation();
  const createLocationWithNfc = useCreateInventoryLocationWithNfc();
  // Último error visible en pantalla (además del aviso emergente), para que se pueda leer con calma.
  const [formError, setFormError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
  const [assetUidLocked, setAssetUidLocked] = useState(false);
  const [locationUidLocked, setLocationUidLocked] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationParentId, setLocationParentId] = useState("none");
  const [createdLocationCode, setCreatedLocationCode] = useState("");

  const [locationQrName, setLocationQrName] = useState("");
  const [locationQrParentId, setLocationQrParentId] = useState("none");
  const [createdLocationCodeByQr, setCreatedLocationCodeByQr] = useState("");

  const [nfcMode, setNfcMode] = useState<"asset" | "location" | null>(null);
  const nfcModeRef = useRef<"asset" | "location" | null>(null);
  const nfc = useNfcScanner((uid) => {
    if (nfcModeRef.current === "asset") {
      setAssetUid(uid);
      setAssetUidLocked(true);
    }
    if (nfcModeRef.current === "location") {
      setLocationUid(uid);
      setLocationUidLocked(true);
    }
  });

  const startNfc = (mode: "asset" | "location") => {
    nfcModeRef.current = mode;
    setNfcMode(mode);
    nfc.start();
  };
  const stopNfc = () => {
    nfcModeRef.current = null;
    nfc.stop();
    setNfcMode(null);
  };

  useEffect(() => {
    if (!nfc.isScanning) return;
    if (nfcMode === "asset" && assetUid) stopNfc();
    if (nfcMode === "location" && locationUid) stopNfc();
  }, [nfc.isScanning, nfcMode, assetUid, locationUid]);

  const clearAssetNfcForm = () => {
    setAssetUid("");
    setAssetUidLocked(false);
    setAssetName("");
    setAssetCategoryId("");
    setAssetLocationId("");
    setAssetDescription("");
    setAssetPhotoUrl("");
    setCreatedAssetCode("");
  };

  const clearLocationNfcForm = () => {
    setLocationUid("");
    setLocationUidLocked(false);
    setLocationName("");
    setLocationParentId("none");
    setCreatedLocationCode("");
  };

  const assetLookup = useInventoryByNfc(assetUid || undefined);
  const locationLookup = useInventoryByNfc(locationUid || undefined);
  const assetInUse = Boolean(assetUid && (assetLookup.data as any)?.type);
  const locationInUse = Boolean(locationUid && (locationLookup.data as any)?.type);
  const showAssetNfcDetails = Boolean(assetUid && !assetInUse);
  const showLocationNfcDetails = Boolean(locationUid && !locationInUse);

  const handleCreateAssetByNfc = async () => {
    if (!assetUid || !assetName.trim() || !assetCategoryId || assetInUse) return;
    setFormError(null);
    let created: any;
    try {
      created = await createItemWithNfc.mutateAsync({
        name: assetName.trim(),
        description: assetDescription.trim() || undefined,
        photoUrl: assetPhotoUrl.trim() || undefined,
        categoryId: assetCategoryId,
        locationId: assetLocationId || undefined,
        status: "available",
        nfc_uid: assetUid,
      });
    } catch (error) {
      setFormError(inventoryErrorMessage(error));
      return;
    }
    setCreatedAssetCode(created.assetCode);
    setAssetUid("");
    setAssetUidLocked(false);
    setAssetName("");
    setAssetCategoryId("");
    setAssetLocationId("");
    setAssetDescription("");
    setAssetPhotoUrl("");
    stopNfc();
  };

  const handleCreateAssetByQr = async () => {
    if (!assetQrName.trim() || !assetQrCategoryId) return;
    setFormError(null);
    let created: any;
    try {
      created = await createItem.mutateAsync({
        name: assetQrName.trim(),
        description: assetQrDescription.trim() || undefined,
        photoUrl: assetQrPhotoUrl.trim() || undefined,
        categoryId: assetQrCategoryId,
        locationId: assetQrLocationId || undefined,
        status: "available",
      });
    } catch (error) {
      setFormError(inventoryErrorMessage(error));
      return;
    }
    setCreatedAssetCodeByQr(created.assetCode);
    setAssetQrName("");
    setAssetQrCategoryId("");
    setAssetQrLocationId("");
    setAssetQrDescription("");
    setAssetQrPhotoUrl("");
  };

  const handleCreateLocationByNfc = async () => {
    if (!locationUid || !locationName.trim() || locationInUse) return;
    setFormError(null);
    let created: any;
    try {
      created = await createLocationWithNfc.mutateAsync({
        name: locationName.trim(),
        parentId: locationParentId === "none" ? undefined : locationParentId,
        nfc_uid: locationUid,
      });
    } catch (error) {
      setFormError(inventoryErrorMessage(error));
      return;
    }
    setCreatedLocationCode(created.code);
    setLocationUid("");
    setLocationUidLocked(false);
    setLocationName("");
    setLocationParentId("none");
    stopNfc();
  };

  const handleCreateLocationByQr = async () => {
    if (!locationQrName.trim()) return;
    setFormError(null);
    let created: any;
    try {
      created = await createLocation.mutateAsync({
        name: locationQrName.trim(),
        parentId: locationQrParentId === "none" ? undefined : locationQrParentId,
      });
    } catch (error) {
      setFormError(inventoryErrorMessage(error));
      return;
    }
    setCreatedLocationCodeByQr(created.code);
    setLocationQrName("");
    setLocationQrParentId("none");
  };

  const uploadImageToServer = (file: File) => uploadInventoryPhoto(file);

  const handleAssetPhotoFile = async (file: File | null, mode: "nfc" | "qr") => {
    if (!file) return;
    setPhotoError(null);
    try {
      if (mode === "nfc") setAssetPhotoUploading(true);
      else setAssetQrPhotoUploading(true);

      const url = await uploadImageToServer(file);
      if (mode === "nfc") setAssetPhotoUrl(url);
      else setAssetQrPhotoUrl(url);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "No se pudo subir la foto.");
    } finally {
      if (mode === "nfc") setAssetPhotoUploading(false);
      else setAssetQrPhotoUploading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-8">
      <InventoryPageHeader subtitle="Registro de activos y armarios" />

      {formError || photoError ? (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <div>
            <p className="font-semibold">No se pudo guardar</p>
            <p className="mt-0.5">{formError ?? photoError}</p>
          </div>
          <button type="button" className="text-xs underline" onClick={() => { setFormError(null); setPhotoError(null); }}>Cerrar</button>
        </div>
      ) : null}

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
                    <Input className="h-12 rounded-2xl" placeholder="UID NFC" value={assetUid} onChange={(e) => { setAssetUid(e.target.value.toUpperCase()); setAssetUidLocked(false); }} disabled={assetUidLocked} />
                  </div>
                  {assetUid && <p className={`text-sm ${assetInUse ? "text-amber-600" : "text-emerald-600"}`}>{assetInUse ? "UID NFC en uso, escanea otro." : "UID disponible para registro de activos."}</p>}
                  {nfc.error && nfcMode === "asset" && <p className="text-xs text-amber-600">{nfc.error}</p>}
                  {showAssetNfcDetails ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Select value={assetCategoryId} onValueChange={setAssetCategoryId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.prefix}</SelectItem>)}</SelectContent></Select>
                        <Select value={assetLocationId} onValueChange={setAssetLocationId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación inicial (opcional)" /></SelectTrigger><SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>)}</SelectContent></Select>
                        <Input className="h-11 rounded-xl md:col-span-2" placeholder="Nombre activo" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
                        <Input className="h-11 rounded-xl md:col-span-2" placeholder="Descripción (opcional)" value={assetDescription} onChange={(e) => setAssetDescription(e.target.value)} />
                        <div className="md:col-span-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                            {assetPhotoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {assetPhotoUploading ? "Subiendo foto..." : assetPhotoUrl ? "Foto añadida ✓ (cambiar)" : "Hacer o subir foto"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => void handleAssetPhotoFile(e.target.files?.[0] ?? null, "nfc")}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button className="h-12 flex-1 rounded-2xl" disabled={!assetUid || assetInUse || !assetName.trim() || !assetCategoryId || createItemWithNfc.isPending || assetPhotoUploading} onClick={handleCreateAssetByNfc}>{createItemWithNfc.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}{createItemWithNfc.isPending ? "Guardando..." : "Crear activo"}</Button>
                        <Button className="h-12 rounded-2xl" variant="outline" disabled={!assetUid} onClick={clearAssetNfcForm}><Eraser className="mr-2 h-4 w-4" />Reset</Button>
                      </div>
                    </>
                  ) : null}
                  {createdAssetCode && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">Activo creado: <b>{createdAssetCode}</b>. <Link href={`/inventory/${createdAssetCode}`} className="underline">Ver ficha</Link></div>}
                </TabsContent>

                <TabsContent value="asset-qr" className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select value={assetQrCategoryId} onValueChange={setAssetQrCategoryId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.prefix}</SelectItem>)}</SelectContent></Select>
                    <Select value={assetQrLocationId} onValueChange={setAssetQrLocationId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación inicial (opcional)" /></SelectTrigger><SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>)}</SelectContent></Select>
                    <Input className="h-11 rounded-xl md:col-span-2" placeholder="Nombre activo" value={assetQrName} onChange={(e) => setAssetQrName(e.target.value)} />
                    <Input className="h-11 rounded-xl md:col-span-2" placeholder="Descripción (opcional)" value={assetQrDescription} onChange={(e) => setAssetQrDescription(e.target.value)} />
                    <div className="md:col-span-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm">
                        {assetQrPhotoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {assetQrPhotoUploading ? "Subiendo foto..." : assetQrPhotoUrl ? "Foto añadida ✓ (cambiar)" : "Hacer o subir foto"}
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
                  {createdAssetCodeByQr && <div className="space-y-2 rounded-2xl border p-3"><p className="text-sm">Activo creado: <b>{createdAssetCodeByQr}</b>.</p><div className="flex flex-wrap gap-2"><Link href={`/inventory/${createdAssetCodeByQr}`}><Button variant="outline" className="rounded-xl"><QrCode className="mr-2 h-4 w-4" />Ver ficha y QR</Button></Link><Button variant="outline" className="rounded-xl" onClick={() => itemLabelPdf(createdAssetCodeByQr).catch((e) => setFormError(e.message))}><QrCode className="mr-2 h-4 w-4" />Etiqueta PDF</Button></div></div>}
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
                    <Input className="h-11 rounded-xl" placeholder="UID NFC" value={locationUid} onChange={(e) => { setLocationUid(e.target.value.toUpperCase()); setLocationUidLocked(false); }} disabled={locationUidLocked} />
                  </div>
                  {locationUid && <p className={`text-sm ${locationInUse ? "text-amber-600" : "text-emerald-600"}`}>{locationInUse ? "UID NFC en uso, escanea otro." : "UID disponible para alta de armario."}</p>}
                  {nfc.error && nfcMode === "location" && <p className="text-xs text-amber-600">{nfc.error}</p>}
                  {showLocationNfcDetails ? (
                    <>
                      <Input className="h-11 rounded-xl" placeholder="Nombre ubicación" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
                      <Select value={locationParentId} onValueChange={setLocationParentId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación padre (opcional)" /></SelectTrigger><SelectContent><SelectItem value="none">Sin padre (raíz)</SelectItem>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>)}</SelectContent></Select>
                      <div className="flex gap-2">
                        <Button className="h-11 flex-1 rounded-xl" disabled={!locationUid || locationInUse || !locationName.trim() || createLocationWithNfc.isPending} onClick={handleCreateLocationByNfc}><FolderTree className="mr-2 h-4 w-4" />Alta armario</Button>
                        <Button className="h-11 rounded-xl" variant="outline" disabled={!locationUid} onClick={clearLocationNfcForm}><Eraser className="mr-2 h-4 w-4" />Reset</Button>
                      </div>
                    </>
                  ) : null}
                  {createdLocationCode && <p className="text-sm text-emerald-700">Ubicación creada: <b>{createdLocationCode}</b>.</p>}
                </TabsContent>

                <TabsContent value="location-qr" className="space-y-4">
                  <Input className="h-11 rounded-xl" placeholder="Nombre armario/ubicación" value={locationQrName} onChange={(e) => setLocationQrName(e.target.value)} />
                  <Select value={locationQrParentId} onValueChange={setLocationQrParentId}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación padre (opcional)" /></SelectTrigger><SelectContent><SelectItem value="none">Sin padre (raíz)</SelectItem>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.code}</SelectItem>)}</SelectContent></Select>
                  <Button className="h-11 rounded-xl" disabled={!locationQrName.trim() || createLocation.isPending} onClick={handleCreateLocationByQr}><QrCode className="mr-2 h-4 w-4" />Crear ubicación (QR)</Button>
                  {createdLocationCodeByQr && <div className="space-y-2 rounded-2xl border p-3"><p className="text-sm">Ubicación creada: <b>{createdLocationCodeByQr}</b>.</p><div className="flex flex-wrap gap-2"><Link href={`/inventory/locations/${createdLocationCodeByQr}`}><Button variant="outline" className="rounded-xl"><ArrowRight className="mr-2 h-4 w-4" />Ver ubicación</Button></Link><Button variant="outline" className="rounded-xl" onClick={() => locationLabelPdf(createdLocationCodeByQr).catch((e) => setFormError(e.message))}><QrCode className="mr-2 h-4 w-4" />Etiqueta QR ubicación</Button></div></div>}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
