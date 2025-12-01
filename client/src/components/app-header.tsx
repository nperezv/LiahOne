import { Bell, LogOut, User, Settings, Check, CheckCheck, Trash2, Calendar, Gift, DollarSign, UserPlus, Clock } from "lucide-react";
import { useLocation } from "wouter";
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
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface AppHeaderProps {
  user?: {
    name: string;
    role: string;
  };
  onLogout?: () => void;
}

const notificationTypeIcons: Record<string, typeof Bell> = {
  upcoming_interview: Calendar,
  birthday_today: Gift,
  budget_approved: DollarSign,
  budget_rejected: DollarSign,
  assignment_created: UserPlus,
  upcoming_meeting: Calendar,
  reminder: Clock,
};

const notificationTypeLabels: Record<string, string> = {
  upcoming_interview: "Entrevista",
  birthday_today: "Cumpleaños",
  budget_approved: "Presupuesto Aprobado",
  budget_rejected: "Presupuesto Rechazado",
  assignment_created: "Nueva Asignación",
  upcoming_meeting: "Reunión Próxima",
  reminder: "Recordatorio",
};

export function AppHeader({ user, onLogout }: AppHeaderProps) {
  const [, setLocation] = useLocation();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, isLoading } = useNotifications();

  const roleLabels: Record<string, string> = {
    obispo: "Obispo",
    consejero_obispo: "Consejero del Obispo",
    secretario: "Secretario",
    presidente_organizacion: "Presidente de Organización",
    secretario_organizacion: "Secretario de Organización",
    consejero_organizacion: "Consejero de Organización",
  };

  const isAdmin = user?.role === "obispo" || user?.role === "consejero_obispo";

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="flex items-center justify-between gap-4 border-b bg-background px-6 py-3">
      <div className="flex items-center gap-4">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">LiahOne</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              data-testid="button-notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <DropdownMenuLabel className="p-0 text-base">Notificaciones</DropdownMenuLabel>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-xs text-muted-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    markAllAsRead();
                  }}
                  data-testid="button-mark-all-read"
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
                  const Icon = notificationTypeIcons[notification.type] || Bell;
                  return (
                    <div
                      key={notification.id}
                      className={`flex items-center gap-3 px-3 py-3 border-b last:border-b-0 ${
                        !notification.isRead ? "bg-muted/50" : ""
                      }`}
                      data-testid={`notification-item-${notification.id}`}
                    >
                      <div className="flex-shrink-0 self-center">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col">
                        <p className={`text-sm leading-tight ${!notification.isRead ? "font-semibold" : ""}`}>
                          {notification.title}
                        </p>
                        {notification.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 self-center">
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            data-testid={`button-mark-read-${notification.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          data-testid={`button-delete-notification-${notification.id}`}
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 hover-elevate"
              data-testid="button-user-menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {user ? getInitials(user.name) : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{user?.name || "Usuario"}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {user ? roleLabels[user.role] || user.role : "Rol"}
                </Badge>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/profile")} data-testid="button-profile">
              <User className="mr-2 h-4 w-4" />
              Mi Perfil
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuItem onClick={() => setLocation("/admin/users")} data-testid="button-admin-users">
                  <Settings className="mr-2 h-4 w-4" />
                  Gestionar Usuarios
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              className="text-destructive"
              data-testid="button-logout"
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
