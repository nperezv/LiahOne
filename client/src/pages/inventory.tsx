import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Filter,
  FolderTree,
  Plus,
  QrCode,
  ScanLine,
  Wifi,
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

  const [assetUid, setAssetUid] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetCategoryId, setAssetCategoryId] = useState("");
  const [assetLocationId, setAssetLocationId] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [createdAssetCode, setCreatedAssetCode] = useState("");

  const [locationUid, setLocationUid] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationParentId, setLocationParentId] = useState("none");
  const [createdLocationCode, setCreatedLocationCode] = useState("");

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
    }),
    [items],
  );

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

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Card className="border-0 bg-gradient-to-br from-primary via-primary/80 to-primary/60 text-primary-foreground shadow-sm">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
              <p className="mt-1 text-sm text-primary-foreground/85">Dashboard principal con filtros y registro rápido.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-3xl"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.total}</CardContent></Card>
        <Card className="rounded-3xl"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Presentes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.available}</CardContent></Card>
        <Card className="rounded-3xl"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Prestados</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{stats.loaned}</CardContent></Card>
      </div>

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
            <CardHeader><CardTitle className="text-base">Listado de activos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input className="h-12 rounded-2xl" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código o nombre" />
              {isLoading && <p>Cargando...</p>}
              {filteredItems.map((item) => (
                <Link key={item.id} href={`/inventory/${item.assetCode}`}>
                  <div className="cursor-pointer rounded-2xl border p-3 transition-colors hover:bg-muted/60">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{item.assetCode} · {item.name}</p>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{item.status} · {(item as any).locationCode ?? "Sin ubicación"}</p>
                  </div>
                </Link>
              ))}
              {filteredItems.length === 0 && <p className="text-sm text-muted-foreground">No hay activos para este filtro.</p>}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="text-base">Visibilidad por armario / ubicación</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {itemsByLocation.map((entry) => (
                <Link key={entry.id} href={`/inventory/locations/${entry.code}`}>
                  <div className="cursor-pointer rounded-2xl border p-3 transition-colors hover:bg-muted/60">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{entry.name} · {entry.code}</p>
                      <Badge variant="secondary" className="rounded-full">{entry.count} activo(s)</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.items.slice(0, 3).map((item) => item.assetCode).join(" · ")}
                      {entry.items.length > 3 ? ` · +${entry.items.length - 3} más` : ""}
                    </p>
                  </div>
                </Link>
              ))}
              {itemsByLocation.length === 0 && <p className="text-sm text-muted-foreground">No hay activos ubicados en armarios para el filtro actual.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="register" className="mt-0 space-y-4">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="text-base">Alta de activo por NFC (inversa)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-muted/40 p-3 text-sm">Paso 1: leer NFC activo. Paso 2: completar datos. Paso 3: crear activo + vincular UID.</div>
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
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="text-base">Alta de armario/ubicación por NFC (inversa)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Primero UID NFC del armario, luego nombre/jerarquía. Se crea ubicación y queda vinculada al UID.</p>
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
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="text-base">Flujo QR por activo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input className="h-12 rounded-2xl" placeholder="Asset code (ej: ABM8-0001)" value={qrAssetCode} onChange={(e) => setQrAssetCode(e.target.value.toUpperCase())} />
              <div className="flex flex-wrap gap-2">
                <a href={qrAssetCode ? `/inventory/qr/${qrAssetCode}` : undefined} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl" disabled={!qrAssetCode}><QrCode className="mr-2 h-4 w-4" />Ver QR</Button></a>
                <a href={qrAssetCode ? `/inventory/label/${qrAssetCode}` : undefined} target="_blank" rel="noreferrer"><Button variant="outline" className="rounded-xl" disabled={!qrAssetCode}><QrCode className="mr-2 h-4 w-4" />Etiqueta PDF</Button></a>
              </div>
            </CardContent>
          </Card>
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
