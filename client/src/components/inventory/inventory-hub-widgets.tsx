import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Wifi } from "lucide-react";

export type GaugeSegment = {
  label: string;
  value: number;
  color: string;
};

export function InventoryGauge({ total, segments }: { total: number; segments: GaugeSegment[] }) {
  const chartData = segments.length ? segments : [{ label: "Sin datos", value: 1, color: "hsl(var(--primary))" }];

  return (
    <div className="relative h-64 w-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={70} outerRadius={100} stroke="none" paddingAngle={2}>
            {chartData.map((entry) => <Cell key={entry.label} fill={entry.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-5xl font-semibold leading-none">{total}</p>
        <p className="text-sm text-muted-foreground">activos</p>
      </div>
    </div>
  );
}

export function NfcScanRing({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex h-44 w-44 items-center justify-center">
      <div className="absolute inset-0 rounded-full border border-primary/30" />
      <div className={`absolute inset-3 rounded-full border border-primary/40 ${active ? "animate-pulse" : ""}`} />
      <div className={`absolute inset-6 rounded-full border-2 border-primary/60 shadow-[0_0_24px_hsl(var(--primary)/0.45)] ${active ? "animate-ping" : ""}`} />
      <div className="relative z-10 rounded-full border border-primary/40 bg-background/80 p-6">
        <Wifi className="h-10 w-10 text-primary" />
      </div>
    </div>
  );
}
