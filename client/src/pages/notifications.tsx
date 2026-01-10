import { Bell, Calendar, Clock, DollarSign, Gift, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/use-notifications";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const notificationTypeIcons: Record<string, typeof Bell> = {
  upcoming_interview: Calendar,
  birthday_today: Gift,
  budget_approved: DollarSign,
  budget_rejected: DollarSign,
  assignment_created: UserPlus,
  upcoming_meeting: Calendar,
  reminder: Clock,
};

export default function NotificationsPage() {
  const { notifications, isLoading, markAsRead } = useNotifications();
  const [, setLocation] = useLocation();

  const sortedNotifications = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const getNotificationRoute = (notification: any) => {
    switch (notification.type) {
      case "assignment_created":
        return "/assignments";
      case "budget_approved":
      case "budget_rejected":
        return "/budget";
      case "upcoming_interview":
        return "/interviews";
      case "upcoming_meeting":
        return "/calendar";
      case "birthday_today":
        return "/birthdays";
      case "reminder":
        return "/dashboard";
      default:
        return "/dashboard";
    }
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    setLocation(getNotificationRoute(notification));
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Notificaciones</h1>
        <p className="text-sm text-muted-foreground">
          Historial de notificaciones leídas y no leídas.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : sortedNotifications.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No tienes notificaciones.
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[70vh]">
              <div className="divide-y">
                {sortedNotifications.map((notification) => {
                  const Icon =
                    notificationTypeIcons[notification.type] || Bell;
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon className="h-5 w-5 text-muted-foreground mt-1" />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">
                            {notification.title}
                          </p>
                          <Badge variant={notification.isRead ? "secondary" : "default"}>
                            {notification.isRead ? "Leída" : "No leída"}
                          </Badge>
                        </div>
                        {notification.description && (
                          <p className="text-xs text-muted-foreground">
                            {notification.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
