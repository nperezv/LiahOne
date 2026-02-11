import * as React from "react";
import { Home, Calendar, Users, DollarSign, Euro, UserCheck, Target, Cake, FileText, ChevronDown, CalendarDays, Grid3x3, BarChart3, Settings, CheckSquare, Shield } from "lucide-react";
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
import { Organization, useDashboardStats, useOrganizations } from "@/hooks/use-api";

interface MenuItem {
  title: string;
  url?: string;
  icon: any;
  subItems?: { title: string; url: string }[];
  roles?: string[]; // If undefined, visible to all. If defined, only visible to these roles.
  presidentOnly?: boolean; // If true, presidents only see their own sub-item
  organizationTypes?: string[]; // If defined, only visible to these organization types.
}

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
    roles: ["obispo", "consejero_obispo", "secretario"],
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
    title: "Presupuestos",
    url: "/budget",
    icon: Euro,
    roles: ["obispo", "consejero_obispo", "secretario_financiero", "presidente_organizacion", "secretario_organizacion", "consejero_organizacion"],
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
    url: "/activities",
    icon: CalendarDays,
  },
  {
    title: "Calendario Integrado",
    url: "/calendar",
    icon: Grid3x3,
  },
  {
    title: "Reportes",
    url: "/reports",
    icon: BarChart3,
  },
  {
    title: "Panel Secretaría",
    url: "/secretary-dashboard",
    icon: FileText,
    roles: ["secretario"],
  },
  {
    title: "Asignaciones",
    url: "/assignments",
    icon: CheckSquare,
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
    // If no roles specified, visible to everyone
    if (!item.roles) return true;
    // Otherwise, only visible if user's role is in the list
    if (!item.roles.includes(userRole)) return false;
    if (!item.organizationTypes) return true;
    if (!organizationType) return false;
    return item.organizationTypes.includes(organizationType);
  }).map(item => {
    // For presidents/counselors/secretaries of organizations, filter sub-items to only show their organization
    if (item.presidentOnly && ["presidente_organizacion", "secretario_organizacion", "consejero_organizacion"].includes(userRole || "") && item.subItems && organizationType) {
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

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: dashboardStats } = useDashboardStats();

  const handleLinkClick = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  // Fetch organizations to map organization ID to type
  const { data: organizations = [] } = useOrganizations();

  // Get organization type from user's organization (for presidents/counselors/secretaries)
  const organizationType = user?.organizationId && organizations.length > 0
    ? organizations.find(org => org.id === user.organizationId)?.type
    : undefined;

  const menuItems = getVisibleMenuItems(user?.role, organizationType);

  const pendingByUrl: Record<string, number> = {
    "/assignments": dashboardStats?.pendingAssignments ?? 0,
    "/interviews": dashboardStats?.upcomingInterviews ?? 0,
    "/organization-interviews": dashboardStats?.upcomingInterviews ?? 0,
    "/budget": dashboardStats?.budgetRequests?.pending ?? 0,
  };
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-lg font-bold px-4 py-3">
            Liahonapp
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                if (item.subItems) {
                  const isActive = item.subItems.some(sub => location === sub.url);
                  return (
                    <Collapsible key={item.title} defaultOpen={isActive}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            className={isActive ? "bg-sidebar-accent" : ""}
                            data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <item.icon className="h-5 w-5" />
                            <span>{item.title}</span>
                            <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.subItems.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.url}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={location === subItem.url}
                                  data-testid={`nav-${subItem.title.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  <Link href={subItem.url} onClick={handleLinkClick}>
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
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={item.url!} onClick={handleLinkClick}>
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
