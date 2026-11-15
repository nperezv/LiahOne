import { useTransition } from "react";
import { CalendarDays, Home, Menu, Target, Users } from "lucide-react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useOrganizations } from "@/hooks/use-api";

const organizationSlugMap: Record<string, string> = {
  hombres_jovenes: "hombres-jovenes",
  mujeres_jovenes: "mujeres-jovenes",
  sociedad_socorro: "sociedad-socorro",
  primaria: "primaria",
  escuela_dominical: "escuela-dominical",
  jas: "jas",
  cuorum_elderes: "cuorum-elderes",
};

export function MobileNav() {
  const [location, setLocation] = useLocation();
  const [, startTransition] = useTransition();
  const { toggleSidebar } = useSidebar();
  const { user } = useAuth();
  const { data: organizations = [] } = useOrganizations();

  const organizationType = user?.organizationId
    ? organizations.find((org) => org.id === user.organizationId)?.type
    : undefined;

  const isObispado = [
    "obispo",
    "consejero_obispo",
    "secretario",
    "secretario_ejecutivo",
    "secretario_financiero",
  ].includes(user?.role ?? "");

  const organizationSlug = organizationType
    ? organizationSlugMap[organizationType] ?? organizationType.replace(/_/g, "-")
    : undefined;

  const organizationHref = organizationSlug ? `/presidency/${organizationSlug}` : "/leadership";

  const isBibliotecario = user?.role === "bibliotecario";

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: Home },
    { label: isBibliotecario ? "Inventario" : "Agenda", href: isBibliotecario ? "/inventory" : "/agenda", icon: isBibliotecario ? Users : CalendarDays },
    {
      label: isObispado ? "Directorio" : "Organización",
      href: isObispado ? "/directory" : organizationHref,
      icon: Users,
    },
    { label: "Metas", href: "/goals", icon: Target },
  ];

  return (
    <nav className="fixed bottom-3 inset-x-3 z-40 mx-auto max-w-md rounded-2xl border border-white/10 bg-neutral-900/90 backdrop-blur-xl shadow-2xl p-1.5 md:hidden">
      <div className="flex items-center justify-between gap-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => startTransition(() => setLocation(item.href))}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center py-1.5 text-[10px] font-semibold transition-all duration-200 active:scale-95",
                isActive ? "text-white" : "text-white/60 hover:text-white"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-nav-pill"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/30"
                  transition={{
                    type: "spring",
                    stiffness: 350,
                    damping: 30,
                  }}
                />
              )}
              <Icon className={cn("relative z-10 h-4.5 w-4.5 transition-transform duration-200", isActive ? "scale-110 text-white" : "text-white/60")} />
              <span className="relative z-10 truncate pt-0.5 tracking-tight">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={toggleSidebar}
          className="relative flex flex-1 flex-col items-center justify-center py-1.5 text-[10px] font-semibold text-white/60 hover:text-white transition-all duration-200 active:scale-95"
        >
          <Menu className="relative z-10 h-4.5 w-4.5" />
          <span className="relative z-10 truncate pt-0.5 tracking-tight">Más</span>
        </button>
      </div>
    </nav>
  );
}
