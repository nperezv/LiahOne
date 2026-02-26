import { Home, Boxes, ScanLine, MapPin, Ellipsis } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/inventory/dashboard", label: "Dashboard", icon: Home },
  { href: "/inventory/assets", label: "Activos", icon: Boxes },
  { href: "/inventory/scan", label: "Escanear", icon: ScanLine, center: true },
  { href: "/inventory/locations", label: "Ubicaciones", icon: MapPin },
  { href: "/inventory/audit", label: "Más", icon: Ellipsis },
];

export function BottomTabs() {
  const [location] = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md border-t border-white/10 bg-[#0A111D]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-5 items-end gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = location.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] text-slate-400 transition",
                active && "text-cyan-300",
                tab.center && "-mt-6 bg-cyan-500/20 py-3 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.35)]"
              )}
            >
              <Icon className={cn("h-4 w-4", tab.center && "h-5 w-5")} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
