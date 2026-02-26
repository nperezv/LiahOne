import { ScanLine } from "lucide-react";

export type GaugeSegment = {
  label: string;
  value: number;
  color: string;
};

interface InventoryGaugeProps {
  total: number;
  segments: GaugeSegment[];
  available: number;
  incidents: number;
  loaned: number;
}

export function InventoryGauge({ total, segments, available, incidents, loaned }: InventoryGaugeProps) {
  const chartData = segments.length ? segments : [{ label: "Sin datos", value: 1, color: "hsl(var(--primary))" }];
  const totalValue = chartData.reduce((acc, segment) => acc + segment.value, 0) || 1;

  const gradient = chartData
    .reduce<{ stops: string[]; acc: number }>((state, segment) => {
      const percent = (segment.value / totalValue) * 100;
      const start = state.acc;
      const end = Math.min(state.acc + percent, 100);
      state.stops.push(`${segment.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
      state.acc = end;
      return state;
    }, { stops: [], acc: 0 }).stops
    .join(", ");

  return (
    <div className="space-y-3">
      <div className="relative mx-auto h-64 w-64">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(${gradient})`,
            boxShadow: "0 0 20px rgba(56,189,248,0.2)",
          }}
        />
        <div className="absolute inset-[16px] rounded-full bg-background/95" />
        <div className="absolute inset-[24px] rounded-full border border-primary/20 bg-background/90" />

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-5xl font-semibold leading-none">{total}</p>
          <p className="mt-1 text-sm text-muted-foreground">activos</p>
          <div className="mt-4 grid grid-cols-3 gap-4 text-[11px] text-muted-foreground">
            <div><p className="text-base font-semibold text-foreground">{available}</p><p>presentes</p></div>
            <div><p className="text-base font-semibold text-foreground">{incidents}</p><p>incidencias</p></div>
            <div><p className="text-base font-semibold text-foreground">{loaned}</p><p>prestados</p></div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {segments.length > 0 ? chartData.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
            {segment.label}
          </span>
        )) : <p className="text-xs text-muted-foreground">Sin categorías todavía.</p>}
      </div>
    </div>
  );
}

export function NfcScanRing({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex h-44 w-44 items-center justify-center">
      <div className="absolute inset-0 rounded-full border border-cyan-400/30 shadow-[0_0_40px_rgba(34,211,238,0.2)]" />
      <div className={`absolute inset-3 rounded-full border border-cyan-300/40 ${active ? "animate-pulse" : ""}`} />
      <div className={`absolute inset-6 rounded-full border-2 border-cyan-200/70 shadow-[0_0_28px_rgba(56,189,248,0.45)] ${active ? "animate-ping" : ""}`} />
      <div className="relative z-10 rounded-full border border-cyan-300/40 bg-background/80 p-6">
        <ScanLine className="h-10 w-10 text-cyan-300" />
      </div>
    </div>
  );
}
