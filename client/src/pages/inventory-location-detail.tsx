import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Circle,
  MapPin,
  Package,
  Plus,
  Printer,
  ScanLine,
  Tags,
  Wifi,
  XCircle,
} from "lucide-react";
import { InventoryPageHeader } from "@/components/inventory/inventory-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useNfcScanner } from "@/hooks/use-nfc-scanner";
import { apiRequest } from "@/lib/queryClient";
import { formatShortDate, locationItemsLabelsPdf, locationLabelPdf } from "@/lib/inventory-files";
import {
  INVENTORY_STATUS_LABELS,
  useCheckInventoryLocation,
  useInventoryLocationDetail,
  useMoveByScan,
  useRegisterLocationNfc,
} from "@/hooks/use-api";

type CheckResult = { found: number; expected: number; missing: Array<{ id: string; assetCode: string; name: string }> };

export default function InventoryLocationDetailPage() {
  const { toast } = useToast();
  const { locationCode = "" } = useParams<{ locationCode: string }>();
  const { data, isLoading } = useInventoryLocationDetail(locationCode);
  const registerNfc = useRegisterLocationNfc();
  const checkLocation = useCheckInventoryLocation(locationCode);
  const moveByScan = useMoveByScan();

  const [checking, setChecking] = useState(() => new URLSearchParams(window.location.search).get("check") === "1");
  const [found, setFound] = useState<Set<string>>(new Set());
  const [strangers, setStrangers] = useState<Array<{ uid: string; assetCode: string; name: string; from?: string | null }>>([]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [linkingNfc, setLinkingNfc] = useState(false);
  const [manualUid, setManualUid] = useState("");

  const items: any[] = useMemo(() => (data?.items ?? []).filter((i: any) => i.status !== "retired"), [data]);

  // El lector NFC llama siempre a la versión más reciente de este manejador.
  const handlerRef = useRef<(uid: string) => void>(() => undefined);
  const nfc = useNfcScanner((uid) => handlerRef.current(uid));

  handlerRef.current = async (uid: string) => {
    if (linkingNfc) {
      registerNfc.mutate(
        { location_code: locationCode, nfc_uid: uid },
        { onSuccess: () => { setLinkingNfc(false); nfc.stop(); } },
      );
      return;
    }
    if (!checking) return;
    try {
      const info = await apiRequest("GET", `/api/inventory/by-nfc/${encodeURIComponent(uid)}`);
      if (info?.type !== "item" || !info.item_id) {
        toast({ title: "Esa etiqueta no es de un activo", description: info?.type === "location" ? `Es el armario ${info.location_name}.` : "No está registrada." });
        return;
      }
      if (items.some((i) => i.id === info.item_id)) {
        setFound((prev) => new Set(prev).add(info.item_id));
        if ("vibrate" in navigator) navigator.vibrate?.(60);
      } else {
        setStrangers((prev) => prev.some((s) => s.uid === uid) ? prev : [...prev, { uid, assetCode: info.asset_code, name: info.name, from: info.locationName }]);
      }
    } catch {
      toast({ title: "No se pudo leer el activo", variant: "destructive" });
    }
  };

  useEffect(() => () => nfc.stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;
  if (!data?.location) {
    return (
      <div className="space-y-3 p-6">
        <p>Armario no encontrado.</p>
        <Link href="/inventory/map"><Button variant="outline">Ver armarios</Button></Link>
      </div>
    );
  }

  const loc = data.location;
  const toggle = (id: string) => setFound((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const startCheck = () => {
    setFound(new Set());
    setStrangers([]);
    setResult(null);
    setChecking(true);
    if (nfc.isSupported) nfc.start();
  };

  const finishCheck = async () => {
    try {
      const r = await checkLocation.mutateAsync(Array.from(found));
      setResult(r);
      setChecking(false);
      nfc.stop();
    } catch {
      // aviso del hook
    }
  };

  const moveStrangerHere = (s: { uid: string; assetCode: string; name: string }) =>
    moveByScan.mutate(
      { item_asset_code: s.assetCode, location_code: loc.code, note: "Encontrado al revisar el armario" },
      {
        onSuccess: () => {
          toast({ title: "Movido a este armario", description: s.name });
          setStrangers((prev) => prev.filter((x) => x.uid !== s.uid));
        },
        onError: () => toast({ title: "No se pudo mover", variant: "destructive" }),
      },
    );

  const pdf = (fn: () => Promise<void>) => fn().catch((e) => toast({ title: "No se pudo generar la etiqueta", description: e.message, variant: "destructive" }));

  return (
    <div className="space-y-5 p-4 md:p-8">
      <InventoryPageHeader subtitle="Armario" backHref="/inventory/map" />

      <Card className="rounded-3xl">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10"><MapPin className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold">{loc.name}</h1>
              <p className="text-sm text-muted-foreground">{loc.code} · {data.path}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {items.length} activo(s){loc.lastCheckedAt ? ` · revisado el ${formatShortDate(loc.lastCheckedAt)}` : " · nunca revisado"}
              </p>
            </div>
          </div>

          {!checking ? (
            <div className="grid grid-cols-2 gap-2">
              <Button className="col-span-2 h-12 rounded-2xl" onClick={startCheck} disabled={!items.length}>
                <ClipboardCheck className="mr-2 h-4 w-4" />Revisar este armario
              </Button>
              <Link href={`/inventory/register?location=${loc.id}`}>
                <Button variant="secondary" className="h-11 w-full rounded-xl"><Plus className="mr-2 h-4 w-4" />Añadir activo</Button>
              </Link>
              <Button variant="secondary" className="h-11 rounded-xl" onClick={() => pdf(() => locationLabelPdf(loc.code))}>
                <Printer className="mr-2 h-4 w-4" />Etiqueta armario
              </Button>
              <Button variant="outline" className="h-11 rounded-xl" disabled={!items.length} onClick={() => pdf(() => locationItemsLabelsPdf(loc.code))}>
                <Tags className="mr-2 h-4 w-4" />Etiquetas de todo
              </Button>
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setLinkingNfc((v) => !v)}>
                <Wifi className="mr-2 h-4 w-4" />{loc.hasNfc ? "Cambiar NFC" : "Vincular NFC"}
              </Button>
            </div>
          ) : null}

          {linkingNfc && !checking ? (
            <div className="space-y-2 rounded-2xl bg-muted/40 p-3 text-sm">
              <p>Acerca la etiqueta NFC del armario al móvil, o escribe su código.</p>
              {nfc.isSupported ? (
                <Button className="w-full rounded-xl" onClick={() => (nfc.isScanning ? nfc.stop() : nfc.start())}>
                  <ScanLine className="mr-2 h-4 w-4" />{nfc.isScanning ? "Esperando etiqueta... (tocar para parar)" : "Leer etiqueta"}
                </Button>
              ) : null}
              <div className="flex gap-2">
                <Input placeholder="Código NFC" value={manualUid} onChange={(e) => setManualUid(e.target.value)} />
                <Button
                  disabled={manualUid.trim().length < 4 || registerNfc.isPending}
                  onClick={() => registerNfc.mutate({ location_code: loc.code, nfc_uid: manualUid.trim().toUpperCase() }, { onSuccess: () => { setManualUid(""); setLinkingNfc(false); } })}
                >
                  Guardar
                </Button>
              </div>
              {nfc.error ? <p className="text-xs text-amber-600">{nfc.error}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Revisión en curso */}
      {checking ? (
        <Card className="rounded-3xl border-primary/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Revisando · {found.size} de {items.length}
              <Badge variant="secondary">{items.length - found.size} por encontrar</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {nfc.isSupported
                ? nfc.isScanning ? "Acerca el móvil a la etiqueta de cada cosa que veas. También puedes tocarlas en la lista." : "Toca en la lista lo que vayas encontrando."
                : "Este móvil no lee NFC: toca en la lista lo que vayas encontrando."}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${items.length ? (found.size / items.length) * 100 : 0}%` }} />
            </div>
            <div className="space-y-2">
              {items.map((item) => {
                const ok = found.has(item.id);
                const lent = item.status === "loaned";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left text-sm transition-colors ${ok ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : ""}`}
                  >
                    {ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.name}{Number(item.quantity ?? 1) > 1 ? ` · ${item.quantity} uds.` : ""}</span>
                      <span className="block text-xs text-muted-foreground">{item.assetCode}{lent ? " · prestado (no tiene por qué estar)" : ""}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {strangers.length ? (
              <div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50/70 p-3 text-sm dark:bg-amber-950/20">
                <p className="font-semibold">Encontrado aquí pero es de otro sitio</p>
                {strangers.map((s) => (
                  <div key={s.uid} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{s.name} <span className="text-xs text-muted-foreground">({s.from ?? "sin armario"})</span></span>
                    <Button size="sm" variant="outline" onClick={() => moveStrangerHere(s)}>Mover aquí</Button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button className="h-12 flex-1 rounded-2xl" disabled={checkLocation.isPending} onClick={() => void finishCheck()}>
                <ClipboardCheck className="mr-2 h-4 w-4" />{checkLocation.isPending ? "Guardando..." : "Terminar revisión"}
              </Button>
              <Button variant="ghost" className="h-12 rounded-2xl" onClick={() => { setChecking(false); nfc.stop(); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Resultado */}
      {result ? (
        <div className={`space-y-2 rounded-2xl border p-4 text-sm ${result.missing.length ? "border-rose-300 bg-rose-50/70 dark:bg-rose-950/20" : "border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/20"}`}>
          {result.missing.length ? (
            <>
              <p className="flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4 text-rose-600" />Faltan {result.missing.length} de {result.expected}</p>
              {result.missing.map((m) => (
                <Link key={m.id} href={`/inventory/${m.assetCode}`}>
                  <p className="cursor-pointer underline">{m.name} · {m.assetCode}</p>
                </Link>
              ))}
              <p className="text-xs text-muted-foreground">Ábrelos para moverlos, darlos de baja o comprobar si alguien los tiene.</p>
            </>
          ) : (
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Todo en su sitio ({result.found} de {result.expected})</p>
          )}
        </div>
      ) : null}

      {/* Contenido */}
      {!checking ? (
        <Card className="rounded-3xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Contenido</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {items.length ? items.map((item) => (
              <Link key={item.id} href={`/inventory/${item.assetCode}`}>
                <div className="flex cursor-pointer items-center gap-3 rounded-xl border p-2 text-sm transition-colors hover:bg-muted/60">
                  {item.photoUrl ? <img src={item.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}{Number(item.quantity ?? 1) > 1 ? ` · ${item.quantity} uds.` : ""}</p>
                    <p className="text-xs text-muted-foreground">{item.assetCode} · {INVENTORY_STATUS_LABELS[item.status as keyof typeof INVENTORY_STATUS_LABELS] ?? item.status}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            )) : <p className="text-sm text-muted-foreground">Este armario está vacío.</p>}

            {data.children?.length ? (
              <div className="space-y-2 pt-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Estantes / sub-ubicaciones</p>
                {data.children.map((child: any) => (
                  <Link key={child.id} href={`/inventory/locations/${child.code}`}>
                    <div className="flex cursor-pointer items-center justify-between rounded-xl border p-2 text-sm hover:bg-muted/60">
                      <span><span className="font-medium">{child.name}</span> <span className="text-xs text-muted-foreground">{child.code}</span></span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
