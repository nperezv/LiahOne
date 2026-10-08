import { type ReactNode, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Boxes,
  ChevronRight,
  ClipboardCheck,
  HandCoins,
  History,
  MapPin,
  Package,
  Plus,
  ScanLine,
  Search,
  ShieldCheck,
  Undo2,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InventoryLoanDialog } from "@/components/inventory/inventory-loan-dialog";
import {
  INVENTORY_STATUS_LABELS,
  type InventoryItem,
  useInventoryHistory,
  useInventoryItems,
  useInventoryLoans,
  useInventoryLocations,
} from "@/hooks/use-api";
import { formatShortDate } from "@/lib/inventory-files";

function availableUnits(item: InventoryItem) {
  return Math.max(0, (item.quantity ?? 1) - (item.loanedQuantity ?? 0));
}

function ItemPickRow({ item, onPick, hint }: { item: InventoryItem; onPick: () => void; hint?: string }) {
  return (
    <button type="button" onClick={onPick} className="flex w-full items-center gap-3 rounded-xl border p-2 text-left text-sm transition-colors hover:bg-muted/60">
      {item.photoUrl ? (
        <img src={item.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Package className="h-4 w-4 text-muted-foreground" /></div>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{item.assetCode}{item.locationName ? ` · ${item.locationName}` : ""}</span>
      </span>
      {hint ? <span className="shrink-0 text-xs text-muted-foreground">{hint}</span> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

function Tile({ href, onClick, icon, label, sub, tone = "default" }: {
  href?: string;
  onClick?: () => void;
  icon: ReactNode;
  label: string;
  sub?: string;
  tone?: "default" | "amber" | "primary";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-400/50 bg-amber-500/10"
      : tone === "primary"
        ? "border-primary/40 bg-primary/10"
        : "border-border/70 bg-card/70";
  const content = (
    <div className={`flex h-full min-h-[92px] cursor-pointer flex-col justify-between rounded-2xl border p-3 transition-colors hover:bg-muted/60 ${toneClass}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/70">{icon}</div>
      <div>
        <p className="text-sm font-semibold leading-tight">{label}</p>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
  if (href) return <Link href={href} className="block h-full">{content}</Link>;
  return <button type="button" className="h-full text-left" onClick={onClick}>{content}</button>;
}

export default function InventoryPage() {
  const [, navigate] = useLocation();
  const { data: items = [] } = useInventoryItems();
  const { data: locations = [] } = useInventoryLocations();
  const { data: openLoans = [] } = useInventoryLoans("active");
  const { data: history = [] } = useInventoryHistory();

  const [search, setSearch] = useState("");
  const [lendPickerOpen, setLendPickerOpen] = useState(() => new URLSearchParams(window.location.search).get("lend") === "1");
  const [lendSearch, setLendSearch] = useState("");
  const [lendItem, setLendItem] = useState<InventoryItem | null>(null);
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);

  const overdue = openLoans.filter((l) => l.isOverdue);
  const stats = useMemo(() => ({
    total: items.length,
    lent: items.filter((i) => (i.loanedQuantity ?? 0) > 0).length,
    maintenance: items.filter((i) => i.status === "maintenance").length,
    noLocation: items.filter((i) => !i.locationId).length,
    noNfc: items.filter((i) => !i.hasNfc).length,
  }), [items]);

  const term = search.trim().toLowerCase();
  const searchResults = term.length >= 2
    ? items.filter((i) => `${i.name} ${i.assetCode} ${i.categoryName ?? ""} ${i.locationName ?? ""}`.toLowerCase().includes(term)).slice(0, 8)
    : [];
  const locationResults = term.length >= 2
    ? locations.filter((l) => `${l.name} ${l.code}`.toLowerCase().includes(term)).slice(0, 4)
    : [];

  const lendable = items.filter((i) => i.status !== "maintenance" && availableUnits(i) > 0);
  const lendTerm = lendSearch.trim().toLowerCase();
  const lendResults = (lendTerm ? lendable.filter((i) => `${i.name} ${i.assetCode} ${i.locationName ?? ""}`.toLowerCase().includes(lendTerm)) : lendable).slice(0, 30);

  const recent = history.slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Inventario del barrio</h1>
        <p className="text-sm text-muted-foreground">
          {stats.total} {stats.total === 1 ? "activo" : "activos"} · {locations.length} {locations.length === 1 ? "armario" : "armarios"}{openLoans.length ? ` · ${openLoans.length} préstamo(s) en curso` : ""}
        </p>
      </header>

      {/* Buscador directo */}
      <div className="relative pb-1">
        <Search className="pointer-events-none absolute left-3 top-[calc(50%-2px)] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-12 rounded-2xl pl-9" placeholder="Buscar un activo o armario..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {term.length >= 2 ? (
        <div className="space-y-2">
          {locationResults.map((l) => (
            <Link key={l.id} href={`/inventory/locations/${l.code}`} className="block">
              <div className="flex cursor-pointer items-center gap-3 rounded-xl border p-2 text-sm hover:bg-muted/60">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Box className="h-4 w-4 text-primary" /></div>
                <span className="flex-1"><span className="block font-medium">{l.name}</span><span className="text-xs text-muted-foreground">Armario · {l.code}</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
          {searchResults.map((i) => (
            <ItemPickRow key={i.id} item={i} onPick={() => navigate(`/inventory/${i.assetCode}`)} hint={INVENTORY_STATUS_LABELS[i.status]} />
          ))}
          {!searchResults.length && !locationResults.length ? <p className="text-sm text-muted-foreground">No hay coincidencias.</p> : null}
        </div>
      ) : (
        <>
          {/* Acción principal */}
          <Link href="/inventory/scan" className="block">
            <div className="flex cursor-pointer items-center gap-4 rounded-3xl bg-primary p-4 text-primary-foreground shadow-[0_8px_24px_rgba(124,58,237,0.35)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><ScanLine className="h-6 w-6" /></div>
              <div className="flex-1">
                <p className="text-lg font-semibold">Escanear etiqueta</p>
                <p className="text-sm opacity-85">Toca un activo o armario con el móvil (NFC o QR)</p>
              </div>
              <ArrowRight className="h-5 w-5" />
            </div>
          </Link>

          {/* Avisos */}
          {overdue.length || stats.noLocation || stats.noNfc ? (
            <div className="space-y-2">
              {overdue.length ? (
                <Link href="/inventory/loans?tab=overdue" className="block">
                  <div className="flex cursor-pointer items-center gap-3 rounded-2xl border border-rose-400/70 bg-rose-500/10 p-3 text-sm">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
                    <span className="flex-1"><b>{overdue.length} préstamo(s) vencido(s).</b> Toca para recordarles por WhatsApp.</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </Link>
              ) : null}
              <div className="flex gap-2 overflow-x-auto">
                {stats.noLocation ? (
                  <Link href="/inventory/map?filter=no-location">
                    <Badge variant="outline" className="cursor-pointer whitespace-nowrap rounded-full border-amber-400 px-3 py-1.5 text-xs"><MapPin className="mr-1 h-3 w-3" />{stats.noLocation} sin armario</Badge>
                  </Link>
                ) : null}
                {stats.noNfc ? (
                  <Link href="/inventory/map?filter=no-nfc">
                    <Badge variant="outline" className="cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-xs"><Wifi className="mr-1 h-3 w-3" />{stats.noNfc} sin etiqueta NFC</Badge>
                  </Link>
                ) : null}
                {stats.maintenance ? (
                  <Link href="/inventory/map?filter=maintenance">
                    <Badge variant="outline" className="cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-xs">{stats.maintenance} en mantenimiento</Badge>
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Todas las funciones a un toque */}
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile onClick={() => setLendPickerOpen(true)} tone="amber" icon={<HandCoins className="h-5 w-5 text-amber-600" />} label="Prestar" sub={`${lendable.length} disponibles`} />
            <Tile href="/inventory/loans" icon={<Undo2 className="h-5 w-5" />} label="Devoluciones" sub={openLoans.length ? `${openLoans.length} en curso` : "Nada prestado"} />
            <Tile href="/inventory/register" tone="primary" icon={<Plus className="h-5 w-5 text-primary" />} label="Registrar" sub="Activo o armario" />
            <Tile href="/inventory/map" icon={<Box className="h-5 w-5" />} label="Armarios" sub="Qué hay en cada uno" />
            <Tile onClick={() => setCheckPickerOpen(true)} icon={<ClipboardCheck className="h-5 w-5" />} label="Revisar armario" sub="Comprobar que está todo" />
            <Tile href="/inventory/list" icon={<Boxes className="h-5 w-5" />} label="Todos los activos" sub={`${stats.total} en total`} />
            <Tile href="/inventory/history" icon={<History className="h-5 w-5" />} label="Historial" sub="Movimientos y préstamos" />
            <Tile href="/inventory/audit" icon={<ShieldCheck className="h-5 w-5" />} label="Auditoría" sub="Recuento general" />
          </section>

          {/* Actividad reciente */}
          {recent.length ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Últimos movimientos</p>
                <Link href="/inventory/history" className="text-xs text-primary underline">Ver todo</Link>
              </div>
              {recent.map((e: any) => (
                <Link key={`${e.type}-${e.id}`} href={`/inventory/${e.assetCode}`} className="block">
                  <div className="flex cursor-pointer items-center gap-3 rounded-xl border p-2 text-sm hover:bg-muted/60">
                    {e.type === "loan" ? <HandCoins className="h-4 w-4 shrink-0 text-amber-600" /> : <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {e.type === "loan"
                          ? `${e.status === "returned" ? "Devuelto" : "Prestado"}: ${e.itemName} · ${e.borrowerName ?? ""}`
                          : `${e.note?.startsWith("Dado de baja") ? "Baja" : "Movido"}: ${e.itemName}`}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatShortDate(e.createdAt)}</span>
                    </span>
                  </div>
                </Link>
              ))}
            </section>
          ) : null}
        </>
      )}

      {/* Prestar: elegir activo */}
      <Dialog open={lendPickerOpen} onOpenChange={setLendPickerOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>¿Qué vas a prestar?</DialogTitle>
            <DialogDescription>Busca el activo o escanea su etiqueta.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input autoFocus placeholder="Buscar por nombre o código" value={lendSearch} onChange={(e) => setLendSearch(e.target.value)} />
            <Link href="/inventory/scan"><Button variant="outline" size="icon" aria-label="Escanear"><ScanLine className="h-4 w-4" /></Button></Link>
          </div>
          <div className="space-y-2">
            {lendResults.map((i) => (
              <ItemPickRow
                key={i.id}
                item={i}
                hint={(i.quantity ?? 1) > 1 ? `${availableUnits(i)} uds.` : undefined}
                onPick={() => { setLendItem(i); setLendPickerOpen(false); }}
              />
            ))}
            {!lendResults.length ? <p className="text-sm text-muted-foreground">No hay activos disponibles con ese nombre.</p> : null}
          </div>
        </DialogContent>
      </Dialog>

      {lendItem ? (
        <InventoryLoanDialog
          open={Boolean(lendItem)}
          onOpenChange={(o) => { if (!o) setLendItem(null); }}
          itemId={lendItem.id}
          assetCode={lendItem.assetCode}
          itemName={lendItem.name}
          availableQuantity={availableUnits(lendItem)}
        />
      ) : null}

      {/* Revisar armario: elegir cuál */}
      <Dialog open={checkPickerOpen} onOpenChange={setCheckPickerOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>¿Qué armario vas a revisar?</DialogTitle>
            <DialogDescription>También puedes escanear la etiqueta del armario.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {locations.map((l) => {
              const count = items.filter((i) => i.locationId === l.id).length;
              return (
                <Link key={l.id} href={`/inventory/locations/${l.code}?check=1`} className="block">
                  <div className="flex cursor-pointer items-center gap-3 rounded-xl border p-2 text-sm hover:bg-muted/60">
                    <Box className="h-4 w-4 text-primary" />
                    <span className="flex-1">
                      <span className="block font-medium">{l.name}</span>
                      <span className="text-xs text-muted-foreground">{count} activo(s){l.lastCheckedAt ? ` · revisado el ${formatShortDate(l.lastCheckedAt)}` : " · nunca revisado"}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
            {!locations.length ? <p className="text-sm text-muted-foreground">Aún no hay armarios registrados.</p> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
