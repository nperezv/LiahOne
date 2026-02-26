import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  ArrowRight,
  Filter,
  FolderTree,
  Plus,
  QrCode,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  useCreateInventoryCategory,
  useCreateInventoryItem,
  useCreateInventoryLocation,
  useInventoryByNfc,
  useInventoryCategories,
  useInventoryItems,
  useInventoryLocations,
  useRegisterItemNfc,
  useRegisterLocationNfc,
} from "@/hooks/use-api";
import { useNfcScanner } from "@/hooks/use-nfc-scanner";
import { GaugeSegment, InventoryGauge, NfcScanRing } from "@/components/inventory/inventory-hub-widgets";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const { data: items = [], isLoading } = useInventoryItems(search);
  const { data: categories = [] } = useInventoryCategories();
  const { data: locations = [] } = useInventoryLocations();

  const createItem = useCreateInventoryItem();
  const createCategory = useCreateInventoryCategory();
  const createLocation = useCreateInventoryLocation();
  const registerItemNfc = useRegisterItemNfc();
  const registerLocationNfc = useRegisterLocationNfc();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [categoryName, setCategoryName] = useState("");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [mainTab, setMainTab] = useState<"inventory" | "register">("inventory");
  const [registerTab, setRegisterTab] = useState<"assets" | "locations">("assets");
  const [inventoryViewMode, setInventoryViewMode] = useState<"assets" | "locations">("assets");

  const [assetUid, setAssetUid] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetCategoryId, setAssetCategoryId] = useState("");
  const [assetLocationId, setAssetLocationId] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [createdAssetCode, setCreatedAssetCode] = useState("");
  const [assetQrName, setAssetQrName] = useState("");
  const [assetQrCategoryId, setAssetQrCategoryId] = useState("");
  const [assetQrLocationId, setAssetQrLocationId] = useState("");
  const [assetQrDescription, setAssetQrDescription] = useState("");
  const [createdAssetCodeByQr, setCreatedAssetCodeByQr] = useState("");

  const [locationUid, setLocationUid] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationParentId, setLocationParentId] = useState("none");
  const [createdLocationCode, setCreatedLocationCode] = useState("");
  const [locationQrName, setLocationQrName] = useState("");
  const [locationQrParentId, setLocationQrParentId] = useState("none");
  const [createdLocationCodeByQr, setCreatedLocationCodeByQr] = useState("");

  const [qrAssetCode, setQrAssetCode] = useState("");

  const [nfcMode, setNfcMode] = useState<"asset" | "location" | null>(null);
  const nfc = useNfcScanner(async (uid) => {
    if (nfcMode === "asset") setAssetUid(uid);
    if (nfcMode === "location") setLocationUid(uid);
  });

  const assetUidLookup = useInventoryByNfc(assetUid || undefined);
  const locationUidLookup = useInventoryByNfc(locationUid || undefined);


  const stopNfc = () => {
    nfc.stop();
    setNfcMode(null);
  };

  const startNfc = (mode: "asset" | "location") => {
    setNfcMode(mode);
    nfc.start();
  };

  const stats = useMemo(
    () => ({
      total: items.length,
      available: items.filter((i) => i.status === "available").length,
      loaned: items.filter((i) => i.status === "loaned").length,
      incidents: items.filter((i) => i.status === "maintenance").length,
    }),
    [items],
  );

  const gaugeSegments = useMemo(() => {
    const chartPalette = [
      "hsl(var(--chart-1))",
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
      "hsl(var(--chart-4))",
      "hsl(var(--chart-5))",
      "hsl(var(--primary))",
    ];

    const countByCategory = new Map<string, number>();
    items.forEach((item) => {
      const category = categories.find((cat) => cat.id === item.categoryId);
      const label = category?.name ?? "Sin categoría";
      countByCategory.set(label, (countByCategory.get(label) ?? 0) + 1);
    });

    return Array.from(countByCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], index) => ({
        label,
        value,
        color: chartPalette[index % chartPalette.length],
      }));
  }, [items, categories]);

  const assetUidResolved = assetUidLookup.data as any;
  const locationUidResolved = locationUidLookup.data as any;
  const assetUidInUse = Boolean(assetUid && assetUidResolved?.type);
  const locationUidInUse = Boolean(locationUid && locationUidResolved?.type);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const categoryOk = selectedCategoryId === "all" || item.categoryId === selectedCategoryId;
      const locationOk = selectedLocationId === "all" || item.locationId === selectedLocationId;
      return categoryOk && locationOk;
    });
  }, [items, selectedCategoryId, selectedLocationId]);

  const itemsByLocation = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; code: string; count: number; items: typeof items }>();

    locations.forEach((location) => {
      grouped.set(location.id, { id: location.id, name: location.name, code: location.code, count: 0, items: [] as typeof items });
    });

    filteredItems.forEach((item) => {
      if (!item.locationId) return;
      const entry = grouped.get(item.locationId);
      if (!entry) return;
      entry.count += 1;
      entry.items.push(item);
    });

    return Array.from(grouped.values())
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [filteredItems, locations, items]);

  const buildCategoryBasePrefix = (rawName: string) => {
    const tokens = rawName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/)
      .map((token) => token.replace(/[^A-Za-z0-9]/g, ""))
      .filter(Boolean);

    const fromInitials = tokens.map((token) => token[0]).join("").toUpperCase();
    const candidate = (fromInitials || "CAT").slice(0, 4);
    return candidate || "CAT";
  };

  const handleCreateCategory = async () => {
    if (!categoryName.trim()) return;

    const cleanName = categoryName.trim();
    const generatedPrefix = buildCategoryBasePrefix(cleanName);

    try {
      await createCategory.mutateAsync({
        name: cleanName,
        prefix: generatedPrefix,
      });
      setCategoryName("");
      setCategoryModalOpen(false);
    } catch {
      // handled by API/error toasts upstream; avoid uncaught promise in UI
    }
  };

  const handleCreateAssetByNfc = async () => {
    if (!assetUid || !assetName.trim() || !assetCategoryId) return;
    try {
      const created = await createItem.mutateAsync({
        name: assetName.trim(),
        description: assetDescription.trim() || undefined,
        categoryId: assetCategoryId,
        locationId: assetLocationId || undefined,
        status: "available",
      });

      await registerItemNfc.mutateAsync({
        asset_code: created.assetCode,
        nfc_uid: assetUid,
      });

      setCreatedAssetCode(created.assetCode);
      setQrAssetCode(created.assetCode);
      setAssetUid("");
      setAssetName("");
      setAssetCategoryId("");
      setAssetLocationId("");
      setAssetDescription("");
      stopNfc();
    } catch {
      // prevent unhandled promise in case of upstream 5xx
    }
  };

  const handleCreateLocationByNfc = async () => {
    if (!locationUid || !locationName.trim()) return;

    try {
      const created = await createLocation.mutateAsync({
        name: locationName.trim(),
        parentId: locationParentId === "none" ? undefined : locationParentId,
      });

      await registerLocationNfc.mutateAsync({
        location_code: created.code,
        nfc_uid: locationUid,
      });

      setCreatedLocationCode(created.code);
      setLocationUid("");
      setLocationName("");
      setLocationParentId("none");
      stopNfc();
    } catch {
      // prevent unhandled promise in case of upstream 5xx
    }
  };

  const handleCreateAssetByQr = async () => {
    if (!assetQrName.trim() || !assetQrCategoryId) return;
    try {
      const created = await createItem.mutateAsync({
        name: assetQrName.trim(),
        description: assetQrDescription.trim() || undefined,
        categoryId: assetQrCategoryId,
        locationId: assetQrLocationId || undefined,
        status: "available",
      });

      setCreatedAssetCodeByQr(created.assetCode);
      setQrAssetCode(created.assetCode);
      setAssetQrName("");
      setAssetQrCategoryId("");
      setAssetQrLocationId("");
      setAssetQrDescription("");
    } catch {
      // prevent unhandled promise in case of upstream 5xx
    }
  };

  const handleCreateLocationByQr = async () => {
    if (!locationQrName.trim()) return;
    try {
      const created = await createLocation.mutateAsync({
        name: locationQrName.trim(),
        parentId: locationQrParentId === "none" ? undefined : locationQrParentId,
      });

      setCreatedLocationCodeByQr(created.code);
      setLocationQrName("");
      setLocationQrParentId("none");
    } catch {
      // prevent unhandled promise in case of upstream 5xx
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Card className="overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-[#030a1a] to-[#040813] shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Inventario</h1>
            <p className="text-sm text-muted-foreground">Barrio Madrid 8</p>
          </div>

          <div className="mx-auto w-full max-w-xs rounded-3xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm">
            <InventoryGauge total={stats.total} segments={gaugeSegments} available={stats.available} incidents={stats.incidents} loaned={stats.loaned} />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border/60 bg-card/70 backdrop-blur">
        <CardContent className="grid gap-2 p-3 sm:grid-cols-2">
          <Button className="h-14 justify-start rounded-2xl" variant="secondary" onClick={() => { setMainTab("register"); setRegisterTab("assets"); }}><ScanLine className="mr-2 h-4 w-4" /><span className="text-left leading-tight"><b>Escanear</b><br/><span className="text-xs text-muted-foreground">NFC</span></span></Button>
          <Button className="h-14 justify-start rounded-2xl" variant="secondary" onClick={() => { setMainTab("register"); setRegisterTab("assets"); }}><QrCode className="mr-2 h-4 w-4" /><span className="text-left leading-tight"><b>Escanear</b><br/><span className="text-xs text-muted-foreground">QR</span></span></Button>
          <Button className="h-12 justify-start rounded-2xl" variant="secondary" onClick={() => { setMainTab("register"); setRegisterTab("assets"); }}><Plus className="mr-2 h-4 w-4" />Nuevo activo</Button>
          <Link href="/inventory/audit"><Button className="h-12 w-full justify-start rounded-2xl" variant="secondary"><ShieldCheck className="mr-2 h-4 w-4" />Auditoría</Button></Link>
        </CardContent>
      </Card>

      <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as "inventory" | "register")} className="space-y-4">
        <TabsList className="grid h-auto grid-cols-2 rounded-2xl bg-muted/60 p-1">
          <TabsTrigger value="inventory" className="rounded-xl py-2">Inventario</TabsTrigger>
          <TabsTrigger value="register" className="rounded-xl py-2">Registro</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="mt-0 space-y-4">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" />Filtros por categoría y armario</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.name} · {category.prefix}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Todos los armarios / ubicaciones" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los armarios / ubicaciones</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>{location.name} · {location.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {categories.map((category) => <Badge key={category.id} variant="outline" className="rounded-full">{category.name} ({category.prefix})</Badge>)}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">Vista de inventario</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input className="h-12 rounded-2xl" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código o nombre" />
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1">
                <Button className="rounded-lg" variant={inventoryViewMode === "assets" ? "default" : "ghost"} onClick={() => setInventoryViewMode("assets")}>Ver activos</Button>
                <Button className="rounded-lg" variant={inventoryViewMode === "locations" ? "default" : "ghost"} onClick={() => setInventoryViewMode("locations")}>Ver ubicaciones</Button>
              </div>

              {isLoading && <p>Cargando...</p>}

              {inventoryViewMode === "assets" ? (
                <div className="space-y-2">
                  {filteredItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border p-3">
                      <div className="flex items-start gap-3">
                        {(item.photoUrl || (item as any).photo_url)
                          ? <img src={item.photoUrl || (item as any).photo_url} alt={item.name} className="h-12 w-12 rounded-lg object-cover" />
                          : <div className="h-12 w-12 rounded-lg border bg-muted" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-semibold">{item.name}</p>
                            <Badge variant="secondary" className="rounded-full">{item.status}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{item.assetCode} · {(item as any).categoryName ?? "Sin categoría"} · {(item as any).locationCode ?? "Sin ubicación"}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={`/inventory/${item.assetCode}`}><Button size="sm" variant="outline" className="rounded-xl">Ver detalles</Button></Link>
                        <Link href={`/inventory/${item.assetCode}`}><Button size="sm" variant="outline" className="rounded-xl">Mover</Button></Link>
                        <Link href={`/inventory/${item.assetCode}`}><Button size="sm" variant="outline" className="rounded-xl">Prestar</Button></Link>
                        <Link href={`/inventory/${item.assetCode}`}><Button size="sm" variant="outline" className="rounded-xl">Historial</Button></Link>
                      </div>
                    </div>
                  ))}
                  {filteredItems.length === 0 && <p className="text-sm text-muted-foreground">No hay activos para este filtro.</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {itemsByLocation.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{entry.name} · {entry.code}</p>
                        <Badge variant="secondary" className="rounded-full">{entry.count} activo(s)</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.items.slice(0, 3).map((item) => item.assetCode).join(" · ")}
                        {entry.items.length > 3 ? ` · +${entry.items.length - 3} más` : ""}
                      </p>
                    </div>
                  ))}
                  {itemsByLocation.length === 0 && <p className="text-sm text-muted-foreground">No hay activos ubicados en armarios para el filtro actual.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="register" className="mt-0 space-y-4">
          <Tabs value={registerTab} onValueChange={(value) => setRegisterTab(value as "assets" | "locations")} className="space-y-4">
            <TabsList className="grid h-auto grid-cols-2 rounded-2xl bg-muted/60 p-1">
              <TabsTrigger value="assets" className="rounded-xl py-2">Alta de activos</TabsTrigger>
              <TabsTrigger value="locations" className="rounded-xl py-2">Alta de armarios</TabsTrigger>
            </TabsList>

            <TabsContent value="assets" className="mt-0">
              <Card className="rounded-3xl">
                <CardHeader><CardTitle className="text-base">Activos: elegir método de alta</CardTitle></CardHeader>
                <CardContent>
                  <Tabs defaultValue="asset-nfc" className="space-y-4">
                    <TabsList className="grid h-auto grid-cols-2 rounded-xl bg-muted/60 p-1">
                      <TabsTrigger value="asset-nfc" className="rounded-lg">Alta por NFC (inversa)</TabsTrigger>
                      <TabsTrigger value="asset-qr" className="rounded-lg">Alta por QR</TabsTrigger>
                    </TabsList>

                    <TabsContent value="asset-nfc" className="mt-0 space-y-4">
                      <div className="rounded-2xl bg-muted/40 p-3 text-sm">Paso 1: leer NFC activo. Paso 2: completar datos. Paso 3: crear activo + vincular UID.</div>
                      <NfcScanRing active={nfc.isScanning && nfcMode === "asset"} />
                      <p className="text-center text-sm text-muted-foreground">Acerca el móvil al sticker NFC del activo o captura el UID manualmente.</p>
                      <div className="flex gap-2">
                        <Button className="h-12 flex-1 rounded-2xl" disabled={!nfc.isSupported} onClick={nfc.isScanning && nfcMode === "asset" ? stopNfc : () => startNfc("asset")}><ScanLine className="mr-2 h-4 w-4" />{nfc.isScanning && nfcMode === "asset" ? "Detener lectura" : "Leer NFC activo"}</Button>
                        <Input className="h-12 rounded-2xl" placeholder="UID activo" value={assetUid} onChange={(e) => setAssetUid(e.target.value.toUpperCase())} />
                      </div>
                      {assetUid && (
                        <div className="rounded-2xl border bg-muted/30 p-3 text-sm">
                          <p className="font-medium">UID leído: <span className="font-mono">{assetUid}</span></p>
                          {!assetUidLookup.isFetching && !assetUidInUse && <p className="mt-1 text-emerald-600">UID disponible. Continúa con el registro del activo.</p>}
                          {assetUidInUse && (
                            <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2">
                              <p className="text-amber-700">Este UID ya está registrado como {assetUidResolved?.type === "location" ? "ubicación" : "activo"}.</p>
                              {assetUidResolved?.asset_code && <p className="text-xs">Activo: <b>{assetUidResolved.asset_code}</b></p>}
                              {assetUidResolved?.location_code && <p className="text-xs">Ubicación: <b>{assetUidResolved.location_code}</b></p>}
                              {(assetUidResolved?.photoUrl || assetUidResolved?.photo_url) && (
                                <img src={assetUidResolved?.photoUrl || assetUidResolved?.photo_url} alt="Activo detectado" className="mt-2 h-14 w-14 rounded-lg object-cover" />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="grid gap-3 md:grid-cols-2">
                        <Select value={assetCategoryId} onValueChange={setAssetCategoryId}>
                          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name} · {category.prefix}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={assetLocationId} onValueChange={setAssetLocationId}>
                          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación inicial (opcional)" /></SelectTrigger>
                          <SelectContent>
                            {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name} · {location.code}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input className="h-11 rounded-xl md:col-span-2" placeholder="Nombre activo" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
                        <Input className="h-11 rounded-xl md:col-span-2" placeholder="Descripción (opcional)" value={assetDescription} onChange={(e) => setAssetDescription(e.target.value)} />
                      </div>
                      <Button className="h-12 rounded-2xl" disabled={!assetUid || assetUidInUse || !assetName.trim() || !assetCategoryId || createItem.isPending || registerItemNfc.isPending} onClick={handleCreateAssetByNfc}><ScanLine className="mr-2 h-4 w-4" />Crear activo + vincular NFC</Button>
                      {createdAssetCode && <p className="text-sm text-emerald-700">Activo creado: <b>{createdAssetCode}</b>.</p>}
                    </TabsContent>

                    <TabsContent value="asset-qr" className="mt-0 space-y-4">
                      <div className="rounded-2xl bg-muted/40 p-3 text-sm">Paso 1: crear activo con nombre/categoría. Paso 2: generar QR. Paso 3: guardar etiqueta PDF, imprimir y pegar.</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Select value={assetQrCategoryId} onValueChange={setAssetQrCategoryId}>
                          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name} · {category.prefix}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={assetQrLocationId} onValueChange={setAssetQrLocationId}>
                          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación inicial (opcional)" /></SelectTrigger>
                          <SelectContent>
                            {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name} · {location.code}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input className="h-11 rounded-xl md:col-span-2" placeholder="Nombre activo" value={assetQrName} onChange={(e) => setAssetQrName(e.target.value)} />
                        <Input className="h-11 rounded-xl md:col-span-2" placeholder="Descripción (opcional)" value={assetQrDescription} onChange={(e) => setAssetQrDescription(e.target.value)} />
                      </div>
                      <Button className="h-12 rounded-2xl" disabled={!assetQrName.trim() || !assetQrCategoryId || createItem.isPending} onClick={handleCreateAssetByQr}><QrCode className="mr-2 h-4 w-4" />Crear activo (QR)</Button>
                      {createdAssetCodeByQr && (
                        <div className="space-y-2 rounded-2xl border p-3">
                          <p className="text-sm">Activo creado: <b>{createdAssetCodeByQr}</b>.</p>
                          <div className="flex flex-wrap gap-2">
                            <a href={`/inventory/qr/${createdAssetCodeByQr}`} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl"><QrCode className="mr-2 h-4 w-4" />Ver QR</Button></a>
                            <a href={`/inventory/label/${createdAssetCodeByQr}`} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl"><QrCode className="mr-2 h-4 w-4" />Etiqueta PDF</Button></a>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="locations" className="mt-0">
              <Card className="rounded-3xl">
                <CardHeader><CardTitle className="text-base">Armarios: elegir método de alta</CardTitle></CardHeader>
                <CardContent>
                  <Tabs defaultValue="location-nfc" className="space-y-4">
                    <TabsList className="grid h-auto grid-cols-2 rounded-xl bg-muted/60 p-1">
                      <TabsTrigger value="location-nfc" className="rounded-lg">Alta por NFC (inversa)</TabsTrigger>
                      <TabsTrigger value="location-qr" className="rounded-lg">Alta por QR</TabsTrigger>
                    </TabsList>

                    <TabsContent value="location-nfc" className="mt-0 space-y-4">
                      <p className="text-xs text-muted-foreground">Primero UID NFC del armario, luego nombre/jerarquía. Se crea ubicación y queda vinculada al UID.</p>
                      <NfcScanRing active={nfc.isScanning && nfcMode === "location"} />
                      <p className="text-center text-sm text-muted-foreground">Acerca una etiqueta NFC de ubicación o escribe el UID.</p>
                      <div className="flex gap-2">
                        <Button className="h-11 flex-1 rounded-xl" variant="outline" disabled={!nfc.isSupported} onClick={nfc.isScanning && nfcMode === "location" ? stopNfc : () => startNfc("location")}><ScanLine className="mr-2 h-4 w-4" />{nfc.isScanning && nfcMode === "location" ? "Detener lectura" : "Leer NFC armario"}</Button>
                        <Input className="h-11 rounded-xl" placeholder="UID ubicación" value={locationUid} onChange={(e) => setLocationUid(e.target.value.toUpperCase())} />
                      </div>
                      {locationUid && (
                        <div className="rounded-2xl border bg-muted/30 p-3 text-sm">
                          <p className="font-medium">UID leído: <span className="font-mono">{locationUid}</span></p>
                          {!locationUidLookup.isFetching && !locationUidInUse && <p className="mt-1 text-emerald-600">UID disponible. Continúa con el registro de ubicación.</p>}
                          {locationUidInUse && (
                            <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2">
                              <p className="text-amber-700">Este UID ya está registrado como {locationUidResolved?.type === "item" ? "activo" : "ubicación"}.</p>
                              {locationUidResolved?.asset_code && <p className="text-xs">Activo: <b>{locationUidResolved.asset_code}</b></p>}
                              {locationUidResolved?.location_code && <p className="text-xs">Ubicación: <b>{locationUidResolved.location_code}</b></p>}
                            </div>
                          )}
                        </div>
                      )}
                      <Input className="h-11 rounded-xl" placeholder="Nombre ubicación (ej: Armario multimedia)" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
                      <Select value={locationParentId} onValueChange={setLocationParentId}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación padre (opcional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin padre (raíz)</SelectItem>
                          {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name} · {location.code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button className="h-11 rounded-xl" disabled={!locationUid || locationUidInUse || !locationName.trim() || createLocation.isPending || registerLocationNfc.isPending} onClick={handleCreateLocationByNfc}><FolderTree className="mr-2 h-4 w-4" />Crear ubicación + vincular NFC</Button>
                      {createdLocationCode && <p className="text-sm text-emerald-700">Ubicación creada: <b>{createdLocationCode}</b>.</p>}
                    </TabsContent>

                    <TabsContent value="location-qr" className="mt-0 space-y-4">
                      <div className="rounded-2xl bg-muted/40 p-3 text-sm">Paso 1: crear armario/ubicación con nombre. Paso 2: abrir etiqueta con QR de ubicación. Paso 3: imprimir, guardar y pegar.</div>
                      <Input className="h-11 rounded-xl" placeholder="Nombre armario/ubicación" value={locationQrName} onChange={(e) => setLocationQrName(e.target.value)} />
                      <Select value={locationQrParentId} onValueChange={setLocationQrParentId}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación padre (opcional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin padre (raíz)</SelectItem>
                          {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name} · {location.code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button className="h-11 rounded-xl" disabled={!locationQrName.trim() || createLocation.isPending} onClick={handleCreateLocationByQr}><QrCode className="mr-2 h-4 w-4" />Crear ubicación (QR)</Button>
                      {createdLocationCodeByQr && (
                        <div className="space-y-2 rounded-2xl border p-3">
                          <p className="text-sm">Ubicación creada: <b>{createdLocationCodeByQr}</b>.</p>
                          <div className="flex flex-wrap gap-2">
                            <a href={`/loc/${createdLocationCodeByQr}`} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl"><ArrowRight className="mr-2 h-4 w-4" />Ver ubicación</Button></a>
                            <a href={`/inventory/location-label/${createdLocationCodeByQr}`} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl"><QrCode className="mr-2 h-4 w-4" />Etiqueta QR ubicación</Button></a>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <Card className="rounded-3xl border-dashed">
            <CardHeader><CardTitle className="text-base">Definir categorías</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Crea una categoría al final del flujo. El prefijo base se calcula automáticamente desde el nombre (ej: Comida → C; código final: CBM8-0001).</p>
              <Dialog open={categoryModalOpen} onOpenChange={setCategoryModalOpen}>
                <DialogTrigger asChild>
                  <Button className="h-11 rounded-xl" variant="outline"><Plus className="mr-2 h-4 w-4" />Nueva categoría</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Crear categoría</DialogTitle>
                    <DialogDescription>
                      Indica el nombre y generamos el prefijo base automáticamente según las iniciales.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input className="h-11 rounded-xl" placeholder="Nombre categoría (ej: Comida)" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Prefijo sugerido: <b>{buildCategoryBasePrefix(categoryName || "Categoria")}</b></p>
                    <Button className="h-11 w-full rounded-xl" disabled={!categoryName.trim() || createCategory.isPending} onClick={handleCreateCategory}>
                      {createCategory.isPending ? "Creando..." : "Crear categoría"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

        </TabsContent>

      </Tabs>
    </div>
  );
}
