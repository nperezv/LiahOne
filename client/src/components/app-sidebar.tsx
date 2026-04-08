import * as React from "react";
import { Home, Calendar, Users, Euro, UserCheck, Target, Cake, FileText, ChevronDown, CalendarDays, Grid3x3, BarChart3, Settings, CheckSquare, Shield, Library, Sparkles, Folder, Heart, ClipboardList, LayoutList } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth";
import { useDashboardStats, useOrganizations } from "@/hooks/use-api";
import logoImage from "@assets/liahonapplogo2.svg";

interface MenuItem {
  title: string;
  url?: string;
  icon: any;
  subItems?: { title: string; url: string; roles?: string[] }[];
  roles?: string[]; // If undefined, visible to all. If defined, only visible to these roles.
  presidentOnly?: boolean; // If true, presidents only see their own sub-item
  organizationTypes?: string[]; // If defined, only visible to these organization types.
}

// Prefetch route chunks on hover so they're ready when the user clicks
const ROUTE_PREFETCHERS: Record<string, () => Promise<any>> = {
  "/dashboard": () => import("@/pages/dashboard"),
  "/sacramental-meeting": () => import("@/pages/sacramental-meeting"),
  "/ward-council": () => import("@/pages/ward-council"),
  "/leadership": () => import("@/pages/leadership"),
  "/directory": () => import("@/pages/directory"),
  "/mission-work": () => import("@/pages/mission-work"),
  "/inventory": () => import("@/pages/inventory"),
  "/resources-library": () => import("@/pages/resources-library"),
  "/welfare": () => import("@/pages/welfare"),
  "/budget": () => import("@/pages/budget"),
  "/interviews": () => import("@/pages/interviews"),
  "/organization-interviews": () => import("@/pages/organization-interviews"),
  "/goals": () => import("@/pages/goals"),
  "/birthdays": () => import("@/pages/birthdays"),
  "/activities": () => import("@/pages/activities"),
  "/quarterly-plans": () => import("@/pages/quarterly-plans"),
  "/calendar": () => import("@/pages/calendar"),
  "/agenda": () => import("@/pages/agenda"),
  "/reports": () => import("@/pages/reports"),
  "/secretary-dashboard": () => import("@/pages/secretary-dashboard"),
  "/assignments": () => import("@/pages/assignments"),
  "/activity-logistics": () => import("@/pages/activity-logistics"),
  "/settings": () => import("@/pages/settings"),
  "/admin/users": () => import("@/pages/admin-users"),
  "/notifications": () => import("@/pages/notifications"),
  "/profile": () => import("@/pages/profile"),
  "/presidency/hombres-jovenes": () => import("@/pages/presidency-manage-organization"),
  "/presidency/mujeres-jovenes": () => import("@/pages/presidency-manage-organization"),
  "/presidency/sociedad-socorro": () => import("@/pages/presidency-manage-organization"),
  "/presidency/primaria": () => import("@/pages/presidency-manage-organization"),
  "/presidency/escuela-dominical": () => import("@/pages/presidency-manage-organization"),
  "/presidency/jas": () => import("@/pages/presidency-manage-organization"),
  "/presidency/cuorum-elderes": () => import("@/pages/presidency-manage-organization"),
};

const ORG_ROLES = ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"];
const HIDDEN_FOR_ORG_ROLES = ["/dashboard", "/goals", "/calendar"];

const ALL_MENU_ITEMS: MenuItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "Reunión Sacramental",
    url: "/sacramental-meeting",
    icon: Calendar,
    roles: ["obispo", "consejero_obispo","secretario_ejecutivo", "secretario"],
  },
  {
    title: "Consejo de Barrio",
    url: "/ward-council",
    icon: Users,
    roles: ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"],
  },
  {
    title: "Liderazgo",
    url: "/leadership",
    icon: Users,
    roles: [
      "obispo",
      "consejero_obispo",
      "secretario",
      "secretario_ejecutivo",
      "secretario_financiero",
      "presidente_organizacion",
      "consejero_organizacion",
      "secretario_organizacion",
    ],
  },
  {
    title: "Directorio",
    url: "/directory",
    icon: Users,
    roles: [
      "obispo",
      "consejero_obispo",
      "secretario",
      "secretario_ejecutivo",
      "secretario_financiero",
    ],
  },
  {
    title: "Presidencias",
    icon: FileText,
    roles: ["obispo", "consejero_obispo", "presidente_organizacion", "secretario_organizacion", "consejero_organizacion"],
    subItems: [
      { title: "Cuórum del Sacerdocio Aarónico", url: "/presidency/hombres-jovenes" },
      { title: "Mujeres Jóvenes", url: "/presidency/mujeres-jovenes" },
      { title: "Sociedad de Socorro", url: "/presidency/sociedad-socorro" },
      { title: "Primaria", url: "/presidency/primaria" },
      { title: "Escuela Dominical", url: "/presidency/escuela-dominical" },
      { title: "Liderazgo JAS", url: "/presidency/jas" },
      { title: "Cuórum de Élderes", url: "/presidency/cuorum-elderes" },
    ],
    presidentOnly: true, // Presidents only see their own presidency
  },
    {
    title: "Obra Misional",
    url: "/mission-work",
    icon: Folder,
    roles: ["obispo", "consejero_obispo", "mission_leader", "ward_missionary", "full_time_missionary"],
  },
  {
    title: "Obra Misional",
    url: "/mission-work",
    icon: Folder,
    roles: ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"],
    organizationTypes: ["cuorum_elderes", "sociedad_socorro"],
  },
  {
    title: "Inventario",
    url: "/inventory",
    icon: Sparkles,
    roles: ["obispo", "consejero_obispo", "bibliotecario", "lider_actividades"],
  },
  {
    title: "Biblioteca de recursos",
    url: "/resources-library",
    icon: Library,
    roles: [
      "obispo",
      "consejero_obispo",
      "secretario",
      "secretario_ejecutivo",
      "presidente_organizacion",
      "consejero_organizacion",
      "secretario_organizacion",
    ],
  },
  {
    title: "Bienestar",
    url: "/welfare",
    icon: Heart,
    roles: ["obispo", "presidente_organizacion"],
    organizationTypes: ["sociedad_socorro", "cuorum_elderes"],
    // obispo bypasses organizationTypes check; presidentes only if their org matches
  },
  {
    title: "Presupuestos",
    url: "/budget",
    icon: Euro,
    roles: [
      "obispo",
      "consejero_obispo",
      "secretario_ejecutivo",
      "secretario_financiero",
      "presidente_organizacion",
      "secretario_organizacion",
      "consejero_organizacion",
    ],
  },
  {
    title: "Entrevistas",
    url: "/interviews",
    icon: UserCheck,
    roles: ["obispo", "consejero_obispo", "secretario_ejecutivo"],
  },
  {
    title: "Entrevistas",
    url: "/organization-interviews",
    icon: UserCheck,
    roles: ["presidente_organizacion", "consejero_organizacion", "secretario_organizacion"],
    organizationTypes: ["cuorum_elderes", "sociedad_socorro"],
  },
  {
    title: "Metas",
    url: "/goals",
    icon: Target,
  },
  {
    title: "Cumpleaños",
    url: "/birthdays",
    icon: Cake,
  },
  {
    title: "Actividades",
    icon: CalendarDays,
    subItems: [
      { title: "Registro de actividades", url: "/activities" },
      {
        title: "Planes Trimestrales",
        url: "/quarterly-plans",
        roles: [
          "presidente_organizacion", "consejero_organizacion", "secretario_organizacion",
          "lider_actividades", "technology_specialist",
          "obispo", "consejero_obispo", "secretario", "secretario_ejecutivo",
        ],
      },
    ],
  },
  {
    title: "Agenda",
    url: "/agenda",
    icon: Grid3x3,
  },
  {
    title: "Reportes",
    url: "/reports",
    icon: BarChart3,
    roles: [
      "obispo",
      "consejero_obispo",
      "secretario",
      "secretario_ejecutivo",
      "secretario_financiero",
      "presidente_organizacion",
      "consejero_organizacion",
      "secretario_organizacion",
      "lider_actividades",
      "bibliotecario",
    ],
  },
  {
    title: "Panel Secretaría",
    url: "/secretary-dashboard",
    icon: FileText,
    roles: ["obispo", "consejero_obispo", "secretario", "secretario_ejecutivo"],
  },
  {
    title: "Asignaciones",
    url: "/assignments",
    icon: CheckSquare,
  },
  {
    title: "Logística de actividades",
    url: "/activity-logistics",
    icon: ClipboardList,
    roles: ["lider_actividades", "technology_specialist", "obispo", "consejero_obispo"],
  },
  {
    title: "Configuración",
    url: "/settings",
    icon: Settings,
    roles: ["obispo", "consejero_obispo"],
  },
  {
    title: "Administración",
    url: "/admin/users",
    icon: Shield,
    roles: ["obispo", "consejero_obispo"],
  },
];

function getVisibleMenuItems(userRole: string | undefined, organizationType?: string): MenuItem[] {
  if (!userRole) return [];
  
  return ALL_MENU_ITEMS.filter(item => {
    if (ORG_ROLES.includes(userRole) && item.url && HIDDEN_FOR_ORG_ROLES.includes(item.url)) {
      return false;
    }

    // If no roles specified, visible to everyone
    if (!item.roles) return true;
    // Otherwise, only visible if user's role is in the list
    if (!item.roles.includes(userRole)) return false;
    if (!item.organizationTypes) return true;
    if (userRole === "obispo") return true;
    if (!organizationType) return false;
    return item.organizationTypes.includes(organizationType);
  }).map(item => {
    // For presidents/counselors/secretaries of organizations, filter sub-items to only show their organization
    if (item.presidentOnly && ORG_ROLES.includes(userRole || "") && item.subItems && organizationType) {
      const organizationMap: Record<string, string> = {
        "hombres_jovenes": "hombres-jovenes",
        "mujeres_jovenes": "mujeres-jovenes",
        "sociedad_socorro": "sociedad-socorro",
        "primaria": "primaria",
        "escuela_dominical": "escuela-dominical",
        "jas": "jas",
        "cuorum_elderes": "cuorum-elderes",
      };
      
      const presidentUrl = organizationMap[organizationType];
      return {
        ...item,
        subItems: item.subItems.filter(sub => sub.url === `/presidency/${presidentUrl}`),
      };
    }
    return item;
  });
}

function getPinnedUrls(userRole?: string) {
  if (ORG_ROLES.includes(userRole ?? "")) {
    return ["/assignments", "/budget", "/resources-library"];
  }

  return ["/dashboard", "/calendar", "/assignments", "/directory", "/goals", "/budget"];
}

function getRenamedTitle(item: MenuItem, userRole?: string) {
  if (item.title === "Presidencias") {
    return ORG_ROLES.includes(userRole ?? "") ? "Mi organización" : "Organizaciones";
  }

  if (item.url === "/organization-interviews") {
    return "Entrevistas de organización";
  }

  return item.title;
}

function AppSidebarInner() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  const { data: dashboardStats } = useDashboardStats();

  const [, startTransition] = React.useTransition();

  const handleLinkClick = React.useCallback((path: string) => {
    // Close sidebar immediately (feels responsive), defer content swap
    if (isMobile) setOpenMobile(false);
    startTransition(() => {
      setLocation(path);
    });
  }, [isMobile, setLocation, setOpenMobile, startTransition]);

  const handlePrefetch = React.useCallback((url: string) => {
    const prefetcher = ROUTE_PREFETCHERS[url];
    if (prefetcher) prefetcher();
  }, []);

  // Fetch organizations to map organization ID to type
  const { data: organizations = [] } = useOrganizations();

  // Get organization type from user's organization (for presidents/counselors/secretaries)
  const organizationType = React.useMemo(() => {
    if (!user?.organizationId || organizations.length === 0) return undefined;
    return organizations.find(org => org.id === user.organizationId)?.type;
  }, [organizations, user?.organizationId]);

  const menuItems = React.useMemo(
    () => getVisibleMenuItems(user?.role, organizationType),
    [organizationType, user?.role],
  );

  const pinnedUrls = React.useMemo(() => getPinnedUrls(user?.role), [user?.role]);

  const pinnedMenuItems = React.useMemo(
    () => menuItems.filter((item) => item.url && pinnedUrls.includes(item.url)),
    [menuItems, pinnedUrls],
  );

  const secondaryMenuItems = React.useMemo(
    () => menuItems.filter((item) => (item.url ? !pinnedUrls.includes(item.url) : true)),
    [menuItems, pinnedUrls],
  );

  // Prefetch all visible route chunks when the sidebar opens (works on mobile too)
  const isOpen = isMobile ? openMobile : open;
  React.useEffect(() => {
    if (!isOpen) return;
    menuItems.forEach((item) => {
      if (item.url) handlePrefetch(item.url);
      item.subItems?.forEach((sub) => handlePrefetch(sub.url));
    });
  }, [isOpen, menuItems, handlePrefetch]);

  const pendingByUrl: Record<string, number> = React.useMemo(() => ({
    "/assignments": dashboardStats?.pendingAssignments ?? 0,
    "/interviews": dashboardStats?.upcomingInterviews ?? 0,
    "/organization-interviews": dashboardStats?.upcomingInterviews ?? 0,
    "/budget": dashboardStats?.budgetRequests?.pending ?? 0,
    "/activity-logistics": dashboardStats?.pendingServiceTasks ?? 0,
    "/mission-work": dashboardStats?.pendingBaptismDrafts ?? 0,
  }), [
    dashboardStats?.budgetRequests?.pending,
    dashboardStats?.pendingAssignments,
    dashboardStats?.upcomingInterviews,
    dashboardStats?.pendingServiceTasks,
    dashboardStats?.pendingBaptismDrafts,
  ]);
  return (
    <Sidebar>
      <SidebarContent>
        <div className="mx-2 mt-3 rounded-[22px] border border-sidebar-border/70 bg-sidebar-accent/20 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background/80">
              <img src="/icons/icon.svg" alt="LiahonApp" className="h-6 w-6 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-none">Liahonapp</p>
              <p className="truncate pt-1 text-[11px] text-sidebar-foreground/65">Panel principal</p>
            </div>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="px-4 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
            Navegación
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="mx-2 mb-3 rounded-[22px] border border-sidebar-border/70 bg-gradient-to-b from-sidebar-accent/50 via-sidebar-accent/30 to-transparent px-3 py-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
                <Sparkles className="h-3.5 w-3.5" />
                Accesos rápidos
              </div>
              <SidebarMenu>
                {pinnedMenuItems.map((item) => {
                  const title = getRenamedTitle(item, user?.role);

                  return (
                    <SidebarMenuItem key={`${title}-${item.url}`}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url}
                        className="rounded-2xl px-3 py-2.5 text-[0.92rem]"
                        data-testid={`nav-${title.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Link href={item.url!} onMouseEnter={() => handlePrefetch(item.url!)} onClick={(event) => { event.preventDefault(); handleLinkClick(item.url!); }}>
                          <item.icon className="h-5 w-5" />
                          <span>{title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.url && pendingByUrl[item.url] > 0 && (
                        <SidebarMenuBadge className="bg-red-500 text-white">
                          {pendingByUrl[item.url] > 99 ? "99+" : pendingByUrl[item.url]}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </div>

            <div className="mx-2 rounded-[22px] border border-sidebar-border/70 bg-sidebar/40 px-3 py-3">
              <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
                <Folder className="h-3.5 w-3.5" />
                Más módulos
              </div>
              <SidebarMenu>
              {secondaryMenuItems.map((item) => {
                const title = getRenamedTitle(item, user?.role);
                if (item.subItems) {
                  const visibleSubItems = item.subItems.filter(sub =>
                    !sub.roles || sub.roles.includes(user?.role ?? "")
                  );
                  if (visibleSubItems.length === 0) return null;
                  const isActive = visibleSubItems.some(sub => location === sub.url);
                  return (
                    <Collapsible key={title} defaultOpen={isActive}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            className={`rounded-2xl px-3 py-2.5 text-[0.92rem] ${isActive ? "bg-sidebar-accent" : ""}`}
                            data-testid={`nav-${title.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <item.icon className="h-5 w-5" />
                            <span>{title}</span>
                            <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {visibleSubItems.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.url}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={location === subItem.url}
                                  data-testid={`nav-${subItem.title.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  <Link href={subItem.url} onMouseEnter={() => handlePrefetch(subItem.url)} onClick={(event) => { event.preventDefault(); handleLinkClick(subItem.url); }}>
                                    <span>{subItem.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={`${title}-${item.url}`}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      className="rounded-2xl px-3 py-2.5 text-[0.92rem]"
                      data-testid={`nav-${title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={item.url!} onMouseEnter={() => handlePrefetch(item.url!)} onClick={(event) => { event.preventDefault(); handleLinkClick(item.url!); }}>
                        <item.icon className="h-5 w-5" />
                        <span>{title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.url && pendingByUrl[item.url] > 0 && (
                      <SidebarMenuBadge className="bg-red-500 text-white">
                        {pendingByUrl[item.url] > 99 ? "99+" : pendingByUrl[item.url]}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export const AppSidebar = React.memo(AppSidebarInner);
