import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

interface GaugeSlice {
  name: string;
  value: number;
  fill: string;
}

export function InventoryGauge({ total, data }: { total: number; data: GaugeSlice[] }) {
  return (
    <div className="relative h-72 w-full rounded-3xl border border-white/10 bg-white/5 p-3 shadow-[0_10px_30px_rgba(0,0,0,.35)]">
      <ResponsiveContainer>
        <RadialBarChart data={data} innerRadius="55%" outerRadius="95%" startAngle={210} endAngle={-30}>
          <PolarGrid radialLines={false} stroke="rgba(148,163,184,0.2)" />
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <PolarRadiusAxis tick={false} axisLine={false} />
          <RadialBar background dataKey="value" cornerRadius={12} clockWise />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-5xl font-semibold leading-none">{total}</p>
        <p className="text-2xl text-slate-300">activos</p>
      </div>
      <div className="-mt-2 grid grid-cols-4 gap-2 text-center text-[10px] text-slate-300">
        {data.slice(0, 8).map((slice) => (
          <div key={slice.name} className="truncate" style={{ color: slice.fill }}>
            {slice.name}
          </div>
        ))}
      </div>
    </div>
  );
}
