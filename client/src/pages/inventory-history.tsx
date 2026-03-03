import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useInventoryHistory } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function InventoryHistoryPage() {
  const { data: entries = [], isLoading } = useInventoryHistory();
  const [typeFilter, setTypeFilter] = useState<"all" | "movement" | "loan">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "returned" | "overdue">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

    return entries.filter((entry: any) => {
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (statusFilter !== "all" && entry.type === "loan" && entry.status !== statusFilter) return false;
      if (statusFilter !== "all" && entry.type !== "loan") return false;

      const createdAtMs = new Date(entry.createdAt).getTime();
      if (fromMs && createdAtMs < fromMs) return false;
      if (toMs && createdAtMs > toMs) return false;

      if (normalizedSearch) {
        const haystack = `${entry.assetCode || ""} ${entry.itemName || ""} ${entry.borrowerName || ""} ${entry.note || ""}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }

      return true;
    });
  }, [entries, fromDate, search, statusFilter, toDate, typeFilter]);

  const resetFilters = () => {
    setTypeFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    setSearch("");
  };

  return (
    <div className="space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historial de inventario</h1>
        <Link href="/inventory">
          <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
            <Select value={typeFilter} onValueChange={(value: any) => setTypeFilter(value)}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="movement">Movimientos</SelectItem>
                <SelectItem value="loan">Préstamos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
              <SelectTrigger><SelectValue placeholder="Estado préstamo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="returned">Devueltos</SelectItem>
                <SelectItem value="overdue">Vencidos</SelectItem>
              </SelectContent>
            </Select>

            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar activo / solicitante" />
          </div>

          <div>
            <Button variant="outline" onClick={resetFilters}><RotateCcw className="mr-2 h-4 w-4" />Limpiar filtros</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos y préstamos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Cargando historial...</p> : null}
          {!isLoading && filteredEntries.length === 0 ? <p className="text-sm text-muted-foreground">Sin registros para los filtros seleccionados.</p> : null}
          {filteredEntries.map((entry: any) => (
            <div key={`${entry.type}-${entry.id}`} className="rounded-xl border p-3 text-sm space-y-1">
              <p>
                <strong>{entry.assetCode}</strong> · {entry.itemName}
              </p>
              {entry.type === "movement" ? (
                <>
                  <p>Movimiento de ubicación registrado.</p>
                  {entry.note ? <p className="text-muted-foreground">Nota: {entry.note}</p> : null}
                </>
              ) : (
                <>
                  <p>Préstamo · Estado: <span className="uppercase">{entry.status}</span></p>
                  <p className="text-muted-foreground">Solicitante: {entry.borrowerName || "—"}</p>
                  <p className="text-muted-foreground">Fecha estimada: {entry.expectedReturnDate || "—"} · Devolución: {entry.dateReturn || "—"}</p>
                  {entry.requestPdfUrl ? <a className="underline text-primary" href={entry.requestPdfUrl} target="_blank" rel="noreferrer">Descargar PDF</a> : null}
                </>
              )}
              <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
