import {
  Bell,
  LogOut,
  User,
  Settings,
  Calendar,
  Gift,
  DollarSign,
  Euro,
  UserPlus,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNotifications } from "@/hooks/use-notifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest } from "@/lib/queryClient";
import {
  formatNotificationTime,
  getNotificationDestination,
} from "@/lib/notifications";
const LOGO_SRC = "/favicon.svg";
import type { Notification } from "@shared/schema";

interface AppHeaderProps {
  user?: {
    name: string;
    role: string;
    avatarUrl?: string | null;
  };
  onLogout?: () => void;
}

/* =========================
   Configuración
========================= */

const notificationTypeIcons: Record<string, typeof Bell> = {
  upcoming_interview: Calendar,
  birthday_today: Gift,
  budget_approved: Euro,
  budget_rejected: DollarSign,
  assignment_created: UserPlus,
  upcoming_meeting: Calendar,
  reminder: Clock,
};

/* =========================
   Componente
========================= */

export function AppHeader({ user, onLogout }: AppHeaderProps) {
  const [location, setLocation] = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const isMobile = useIsMobile();

  const { data: template } = useQuery({
    queryKey: ["/api/pdf-template"],
    queryFn: () => apiRequest("GET", "/api/pdf-template"),
  });

  const {
    notifications,
    unreadCount,
    markAsRead,
    isLoading,
  } = useNotifications();

  const unreadNotifications = notifications.filter(
    (notification) => !notification.isRead
  );

  const roleLabels: Record<string, string> = {
    obispo: "Obispo",
    consejero_obispo: "Consejero del Obispo",
    secretario: "Secretario",
    secretario_financiero: "Secretario Financiero",
    secretario_ejecutivo: "Secretario Ejecutivo",
    presidente_organizacion: "Presidente de Organización",
    secretario_organizacion: "Secretario de Organización",
    consejero_organizacion: "Consejero de Organización",
  };

  const isAdmin =
    user?.role === "obispo" ||
    user?.role === "consejero_obispo" ||
    user?.role === "secretario_ejecutivo";

  const wardName = template?.wardName?.trim() || "Liahonapp";

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    setNotificationsOpen(false);
    setLocation(getNotificationDestination(notification));
  };

  return (
    <header className="flex items-center justify-between gap-4 border-b bg-background px-4 py-3 md:px-6">
      {/* IZQUIERDA */}
      <div className="flex items-center gap-4">
        {!isMobile && <SidebarTrigger />}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60">
            <img src={LOGO_SRC} alt="LiahonApp" className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold">{wardName}</h1>
        </div>
      </div>

      {/* DERECHA */}
      <div className="flex items-center gap-3">
        {notificationsOpen && (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px]"
            onClick={() => setNotificationsOpen(false)}
          />
        )}

        {/* 🔔 NOTIFICACIONES */}
        <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="center"
            sideOffset={8}
            collisionPadding={16}
            className="w-[calc(100vw-2rem)] max-w-sm sm:w-80"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2">
              <DropdownMenuLabel className="p-0 text-base">
                Notificaciones
              </DropdownMenuLabel>

              <DropdownMenuItem
                onClick={() => {
                  setNotificationsOpen(false);
                  setLocation("/notifications");
                }}
                className="text-xs font-medium"
              >
                Ver todas
              </DropdownMenuItem>
            </div>

            <DropdownMenuSeparator />

            {/* Contenido */}
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Cargando...
              </div>
            ) : unreadNotifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No tienes notificaciones
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                {unreadNotifications.slice(0, 10).map((notification) => {
                  const Icon =
                    notificationTypeIcons[notification.type] || Bell;

                  return (
                    <DropdownMenuItem
                      key={notification.id}
                      className="flex gap-3 items-start px-3 py-3 cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <Icon className="h-5 w-5 text-muted-foreground mt-1" />

                      <div className="flex-1">
                        <p className="text-sm font-semibold">
                          {notification.title}
                        </p>

                        {notification.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.description}
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground mt-1">
                          {formatNotificationTime(notification)}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 👤 USUARIO */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex gap-2">
              <Avatar className="h-8 w-8">
                {user?.avatarUrl && (
                  <AvatarImage src={user.avatarUrl} alt={user.name} />
                )}
                <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{user?.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {roleLabels[user?.role ?? ""] ?? user?.role}
                </Badge>
              </div>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => setLocation("/profile")}>
              <User className="mr-2 h-4 w-4" />
              Mi Perfil
            </DropdownMenuItem>

            {isAdmin && (
              <DropdownMenuItem onClick={() => setLocation("/admin/users")}>
                <Settings className="mr-2 h-4 w-4" />
                Gestionar Usuarios
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={onLogout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
