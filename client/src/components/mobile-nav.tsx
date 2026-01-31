import { CalendarDays, Home, Menu, Target, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
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
  const [location] = useLocation();
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

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: Home },
    { label: "Agenda", href: "/calendar", icon: CalendarDays },
    {
      label: isObispado ? "Directorio" : "Organización",
      href: isObispado ? "/directory" : organizationHref,
      icon: Users,
    },
    { label: "Metas", href: "/goals", icon: Target },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors",
                isActive && "text-primary"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex flex-col items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors"
        >
          <Menu className="h-5 w-5" />
          <span>Más</span>
        </button>
      </div>
    </nav>
  );
}
