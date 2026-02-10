import { formatDistanceToNow, formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import type { Notification } from "@shared/schema";

export const EVENT_NOTIFICATION_TYPES = [
  "upcoming_interview",
  "assignment_created",
  "upcoming_meeting",
  "reminder",
];

export const formatNotificationTime = (notification: Notification) => {
  if (EVENT_NOTIFICATION_TYPES.includes(notification.type) && notification.eventDate) {
    return formatDistanceToNowStrict(new Date(notification.eventDate), {
      addSuffix: true,
      locale: es,
    });
  }

  return formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
    locale: es,
  });
};

export const getNotificationDestination = (notification: Notification) => {
  switch (notification.type) {
    case "upcoming_interview":
      return notification.relatedId
        ? `/interviews?highlight=${encodeURIComponent(notification.relatedId)}`
        : "/interviews";
    case "assignment_created":
      return "/assignments";
    case "budget_approved":
    case "budget_rejected":
      return "/budget";
    case "birthday_today":
      return "/birthdays";
    case "upcoming_meeting":
      return "/calendar";
    case "reminder": {
      const title = notification.title.toLowerCase();
      if (title.includes("actividad")) {
        return "/activities";
      }
      if (title.includes("meta")) {
        return "/goals";
      }
      if (title.includes("presupuesto") || title.includes("comprobantes")) {
        return "/budget";
      }
      return "/dashboard";
    }
    default:
      return "/dashboard";
  }
};
