import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, CalendarClock, FileText, MessageCircle, Package, Phone, Undo2 } from "lucide-react";
import { InventoryPageHeader } from "@/components/inventory/inventory-page-header";
import { InventoryReturnDialog } from "@/components/inventory/inventory-loan-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type InventoryLoanRow, useInventoryLoans } from "@/hooks/use-api";
import { formatShortDate, loanReminderText, whatsappLink } from "@/lib/inventory-files";

type Tab = "active" | "overdue" | "all";

function daysLate(expected?: string | null) {
  if (!expected) return 0;
  const diff = Date.now() - new Date(`${expected}T12:00:00`).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function LoanCard({ loan, onReturn }: { loan: InventoryLoanRow; onReturn: (loan: InventoryLoanRow) => void }) {
  const wa = loan.isOpen ? whatsappLink(loan.borrowerPhone, loanReminderText(loan.borrowerName, loan.itemName, loan.expectedReturnDate)) : null;
  const late = loan.isOverdue ? daysLate(loan.expectedReturnDate) : 0;

  return (
    <div className={`space-y-3 rounded-2xl border p-3 ${loan.isOverdue ? "border-rose-400/70 bg-rose-50/60 dark:bg-rose-950/20" : "bg-card/80"}`}>
      <Link href={`/inventory/${loan.assetCode}`}>
        <div className="flex cursor-pointer items-center gap-3">
          {loan.photoUrl ? (
            <img src={loan.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted"><Package className="h-5 w-5 text-muted-foreground" /></div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{loan.itemName}{loan.quantity > 1 ? ` · ${loan.quantity} uds.` : ""}</p>
            <p className="truncate text-sm">{loan.borrowerName}</p>
            <p className="text-xs text-muted-foreground">
              Desde {formatShortDate(loan.dateOut)} · {loan.isOpen ? `devolver el ${formatShortDate(loan.expectedReturnDate)}` : `devuelto el ${formatShortDate(loan.dateReturn)}`}
            </p>
          </div>
          {loan.isOverdue ? (
            <Badge variant="destructive" className="shrink-0">{late === 1 ? "1 día tarde" : `${late} días tarde`}</Badge>
          ) : !loan.isOpen ? (
            <Badge variant="secondary" className="shrink-0">Devuelto</Badge>
          ) : null}
        </div>
      </Link>

      {loan.returnHasIncident ? <p className="text-xs text-amber-700">Incidencia: {loan.returnIncidentNotes || "sin notas"}</p> : null}

      {loan.isOpen ? (
        <div className="grid grid-cols-3 gap-2">
          <Button className="col-span-3 h-11 rounded-xl sm:col-span-1" onClick={() => onReturn(loan)}>
            <Undo2 className="mr-2 h-4 w-4" />Devuelto
          </Button>
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="col-span-3 sm:col-span-1">
              <Button variant="outline" className="h-11 w-full rounded-xl"><MessageCircle className="mr-2 h-4 w-4" />Recordar</Button>
            </a>
          ) : null}
          {loan.borrowerPhone ? (
            <a href={`tel:${loan.borrowerPhone}`} className="col-span-3 sm:col-span-1">
              <Button variant="outline" className="h-11 w-full rounded-xl"><Phone className="mr-2 h-4 w-4" />Llamar</Button>
            </a>
          ) : null}
        </div>
      ) : loan.requestPdfUrl ? (
        <a className="inline-flex items-center gap-1 text-xs text-primary underline" href={loan.requestPdfUrl} target="_blank" rel="noreferrer">
          <FileText className="h-3.5 w-3.5" />Hoja de préstamo firmada
        </a>
      ) : null}
    </div>
  );
}

export default function InventoryLoansPage() {
  const initialTab = (new URLSearchParams(window.location.search).get("tab") as Tab) || "active";
  const [tab, setTab] = useState<Tab>(["active", "overdue", "all"].includes(initialTab) ? initialTab : "active");
  const [search, setSearch] = useState("");
  const [returning, setReturning] = useState<InventoryLoanRow | null>(null);

  const { data: open = [], isLoading: loadingOpen } = useInventoryLoans("active");
  const { data: all = [], isLoading: loadingAll } = useInventoryLoans("all");

  const overdue = useMemo(() => open.filter((l) => l.isOverdue), [open]);
  const source = tab === "all" ? all : tab === "overdue" ? overdue : open;
  const term = search.trim().toLowerCase();
  const rows = term
    ? source.filter((l) => `${l.itemName} ${l.assetCode} ${l.borrowerName}`.toLowerCase().includes(term))
    : source;
  const loading = tab === "all" ? loadingAll : loadingOpen;

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "active", label: "En curso", count: open.length },
    { key: "overdue", label: "Vencidos", count: overdue.length },
    { key: "all", label: "Historial" },
  ];

  return (
    <div className="space-y-4 p-4 md:p-8">
      <InventoryPageHeader subtitle="Préstamos" />

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium ${tab === t.key ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            {t.key === "overdue" && (t.count ?? 0) > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> : null}
            {t.label}
            {t.count !== undefined ? <span className="text-xs opacity-70">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <Input className="h-11 rounded-xl" placeholder="Buscar por activo o persona" value={search} onChange={(e) => setSearch(e.target.value)} />

      {loading ? <p className="text-sm text-muted-foreground">Cargando préstamos...</p> : null}

      {!loading && rows.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <CalendarClock className="mx-auto h-8 w-8" />
          <p>{tab === "overdue" ? "No hay préstamos vencidos. ¡Todo en orden!" : tab === "active" ? "No hay nada prestado ahora mismo." : "Todavía no hay préstamos."}</p>
          <Link href="/inventory?lend=1"><Button variant="outline" className="rounded-xl">Prestar un activo</Button></Link>
        </div>
      ) : null}

      <div className="space-y-3">
        {rows.map((loan) => <LoanCard key={loan.id} loan={loan} onReturn={setReturning} />)}
      </div>

      {returning ? (
        <InventoryReturnDialog
          open={Boolean(returning)}
          onOpenChange={(o) => { if (!o) setReturning(null); }}
          loanId={returning.id}
          borrowerName={returning.borrowerName}
        />
      ) : null}
    </div>
  );
}
