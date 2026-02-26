import { useMemo, useState } from "react";
import { Link } from "wouter";
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
  useInventoryCategories,
  useInventoryItems,
  useInventoryLocations,
  useRegisterItemNfc,
  useRegisterLocationNfc,
} from "@/hooks/use-api";
import { useNfcScanner } from "@/hooks/use-nfc-scanner";
import { InventoryScanner } from "@/components/inventory-scanner";
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
  const [actionPanel, setActionPanel] = useState<"scan" | "asset" | "cabinet" | "audit" | null>(null);
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
      <Card className="overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-primary via-primary/80 to-primary/60 text-primary-foreground shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_auto] lg:items-center">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
                  <p className="mt-1 text-sm text-primary-foreground/85">Dashboard principal con filtros y registro rápido.</p>
                </div>
                <p className="text-xs text-primary-foreground/80">Centro operativo de inventario: escaneo, alta y auditoría desde una sola pantalla.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="rounded-2xl border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm text-primary-foreground/75">Presentes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.available}</CardContent></Card>
                <Card className="rounded-2xl border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm text-primary-foreground/75">Prestados</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.loaned}</CardContent></Card>
                <Card className="rounded-2xl border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground shadow-none"><CardHeader className="pb-2"><CardTitle className="text-sm text-primary-foreground/75">Incidencias</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.incidents}</CardContent></Card>
              </div>
            </div>

            <div className="mx-auto w-full max-w-xs rounded-3xl border border-primary-foreground/20 bg-background/15 p-4 backdrop-blur-sm">
              <InventoryGauge total={stats.total} segments={gaugeSegments.length ? gaugeSegments : [{ label: "Sin datos", value: 1, color: "hsl(var(--primary))" }]} />
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {gaugeSegments.length > 0 ? gaugeSegments.map((segment) => (
                  <Badge key={segment.label} variant="secondary" className="rounded-full border-0 bg-background/35 text-primary-foreground">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
                    {segment.label}
                  </Badge>
                )) : <p className="text-xs text-primary-foreground/80">Sin categorías todavía.</p>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader><CardTitle className="text-base">Acciones rápidas</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button className="h-14 rounded-2xl" variant="secondary" onClick={() => setActionPanel("scan")}><ScanLine className="mr-2 h-4 w-4" />Escanear</Button>
          <Button className="h-14 rounded-2xl" variant="secondary" onClick={() => setActionPanel("asset")}><Plus className="mr-2 h-4 w-4" />Nuevo activo</Button>
          <Button className="h-14 rounded-2xl" variant="secondary" onClick={() => setActionPanel("cabinet")}><FolderTree className="mr-2 h-4 w-4" />Nuevo armario</Button>
          <Button className="h-14 rounded-2xl" variant="secondary" onClick={() => setActionPanel("audit")}><ShieldCheck className="mr-2 h-4 w-4" />Auditoría</Button>
        </CardContent>
      </Card>

      {actionPanel && (
        <Card className="rounded-3xl border-dashed">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{actionPanel === "scan" ? "Escaneo" : actionPanel === "asset" ? "Nuevo activo" : actionPanel === "cabinet" ? "Nuevo armario" : "Auditoría"}</CardTitle>
            <Button variant="ghost" onClick={() => setActionPanel(null)}>Cerrar</Button>
          </CardHeader>
          <CardContent>
            {actionPanel === "scan" && (
              <div className="space-y-4">
                <NfcScanRing active={nfc.isScanning} />
                <div className="grid gap-3 md:grid-cols-2">
                  <Button className="h-11 rounded-xl" onClick={nfc.isScanning ? stopNfc : () => startNfc("asset")} disabled={!nfc.isSupported}><ScanLine className="mr-2 h-4 w-4" />{nfc.isScanning ? "Detener NFC" : "Escanear NFC"}</Button>
                  <InventoryScanner onDetected={(code) => setSearch(code)} />
                </div>
                <p className="text-xs text-muted-foreground">Estados: escaneando, activo detectado, ubicación detectada o etiqueta desconocida.</p>
              </div>
            )}
            {actionPanel === "asset" && <p className="text-sm text-muted-foreground">Usa la sección Registro → Alta de activos para crear activos por NFC o QR sin salir de este módulo.</p>}
            {actionPanel === "cabinet" && <p className="text-sm text-muted-foreground">Usa la sección Registro → Alta de armarios para crear ubicaciones por NFC o QR.</p>}
            {actionPanel === "audit" && <p className="text-sm text-muted-foreground">Usa la sección Auditoría dentro de Registro para iniciar y seguir auditorías desde este hub.</p>}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="inventory" className="space-y-4">
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
                <Button className="rounded-lg" variant={inventoryViewMode === "assets" ? "default" : "ghost"} onClick={() => setInventoryViewMode("assets")}>Activos</Button>
                <Button className="rounded-lg" variant={inventoryViewMode === "locations" ? "default" : "ghost"} onClick={() => setInventoryViewMode("locations")}>Ubicaciones</Button>
              </div>

              {isLoading && <p>Cargando...</p>}

              {inventoryViewMode === "assets" ? (
                <div className="space-y-2">
                  {filteredItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{item.name}</p>
                        <Badge variant="secondary" className="rounded-full">{item.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.assetCode} · {(item as any).categoryName ?? "Sin categoría"} · {(item as any).locationCode ?? "Sin ubicación"}</p>
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
          <Tabs defaultValue="assets" className="space-y-4">
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
                      <Button className="h-12 rounded-2xl" disabled={!assetUid || !assetName.trim() || !assetCategoryId || createItem.isPending || registerItemNfc.isPending} onClick={handleCreateAssetByNfc}><Wifi className="mr-2 h-4 w-4" />Crear activo + vincular NFC</Button>
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
                      <Input className="h-11 rounded-xl" placeholder="Nombre ubicación (ej: Armario multimedia)" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
                      <Select value={locationParentId} onValueChange={setLocationParentId}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Ubicación padre (opcional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin padre (raíz)</SelectItem>
                          {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name} · {location.code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button className="h-11 rounded-xl" disabled={!locationUid || !locationName.trim() || createLocation.isPending || registerLocationNfc.isPending} onClick={handleCreateLocationByNfc}><FolderTree className="mr-2 h-4 w-4" />Crear ubicación + vincular NFC</Button>
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
