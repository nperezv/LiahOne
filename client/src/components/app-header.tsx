import {
  Bell,
  LogOut,
  User,
  Settings,
  Check,
  CheckCheck,
  Trash2,
  Calendar,
  Gift,
  DollarSign,
  UserPlus,
  Clock,
} from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNotifications } from "@/hooks/use-notifications";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/liahonapplogo2.svg";
import {
  formatDistanceToNow,
  formatDistanceToNowStrict,
} from "date-fns";
import { es } from "date-fns/locale";

interface AppHeaderProps {
  user?: {
    name: string;
    role: string;
  };
  onLogout?: () => void;
}

/* =========================
   Configuración
========================= */

const notificationTypeIcons: Record<string, typeof Bell> = {
  upcoming_interview: Calendar,
  birthday_today: Gift,
  budget_approved: DollarSign,
  budget_rejected: DollarSign,
  assignment_created: UserPlus,
  upcoming_meeting: Calendar,
  reminder: Clock,
};

/**
 * Tipos de notificación que representan
 * un EVENTO con fecha futura
 */
const EVENT_NOTIFICATION_TYPES = [
  "upcoming_interview",
  "assignment_created",
  "upcoming_meeting",
  "reminder",
];

/* =========================
   Componente
========================= */

export function AppHeader({ user, onLogout }: AppHeaderProps) {
  const [, setLocation] = useLocation();
  const { data: template } = useQuery({
    queryKey: ["/api/pdf-template"],
    queryFn: () => apiRequest("GET", "/api/pdf-template"),
  });
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    isLoading,
  } = useNotifications();

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
    user?.role === "obispo" || user?.role === "consejero_obispo" || user?.role === "secretario_ejecutivo";

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

  /**
   * 🕒 Lógica CORRECTA del tiempo mostrado
   */
  const renderNotificationTime = (notification: any) => {
    // Evento futuro → usar eventDate (estricto, sin “alrededor de”)
    if (
      EVENT_NOTIFICATION_TYPES.includes(notification.type) &&
      notification.eventDate
    ) {
      return formatDistanceToNowStrict(
        new Date(notification.eventDate),
        {
          addSuffix: true,
          locale: es,
        }
      );
    }

    // Notificación informativa → usar createdAt
    return formatDistanceToNow(
      new Date(notification.createdAt),
      {
        addSuffix: true,
        locale: es,
      }
    );
  };

  return (
    <header className="flex items-center justify-between gap-4 border-b bg-background px-6 py-3">
      {/* IZQUIERDA */}
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        <div className="flex items-center gap-2">
          <img
            src={logoImage}
            alt="Liahonapp"
            className="h-[2.375rem] w-[2.375rem] animate-logo-float"
          />
          <h1 className="text-lg font-semibold">{wardName}</h1>
        </div>
      </div>

      {/* DERECHA */}
      <div className="flex items-center gap-3">
        {/* 🔔 NOTIFICACIONES */}
        <DropdownMenu>
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

          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-3 py-2">
              <DropdownMenuLabel className="p-0 text-base">
                Notificaciones
              </DropdownMenuLabel>

              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-xs"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    markAllAsRead();
                  }}
                >
                  <CheckCheck className="mr-1 h-3 w-3" />
                  Marcar todo leído
                </Button>
              )}
            </div>

            <DropdownMenuSeparator />

            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Cargando...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No tienes notificaciones
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                {notifications.slice(0, 10).map((notification) => {
                  const Icon =
                    notificationTypeIcons[notification.type] || Bell;

                  return (
                    <div
                      key={notification.id}
                      className={`flex gap-3 px-3 py-3 border-b last:border-b-0 ${
                        !notification.isRead ? "bg-muted/50" : ""
                      }`}
                    >
                      <Icon className="h-5 w-5 text-muted-foreground mt-1" />

                      <div className="flex-1">
                        <p
                          className={`text-sm ${
                            !notification.isRead
                              ? "font-semibold"
                              : ""
                          }`}
                        >
                          {notification.title}
                        </p>

                        {notification.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.description}
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground mt-1">
                          {renderNotificationTime(notification)}
                        </p>
                      </div>

                      <div className="flex gap-1">
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              markAsRead(notification.id)
                            }
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() =>
                            deleteNotification(notification.id)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </ScrollArea>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 👤 USUARIO */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">
                  {user?.name}
                </span>
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
              <DropdownMenuItem
                onClick={() => setLocation("/admin/users")}
              >
                <Settings className="mr-2 h-4 w-4" />
                Gestionar Usuarios
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              className="text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
