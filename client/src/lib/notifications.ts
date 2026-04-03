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
      if (
        notification.title.toLowerCase().includes("organización") ||
        notification.description?.toLowerCase().includes("organización")
      ) {
        return notification.relatedId
          ? `/organization-interviews?highlight=${encodeURIComponent(notification.relatedId)}`
          : "/organization-interviews";
      }
      return notification.relatedId
        ? `/interviews?highlight=${encodeURIComponent(notification.relatedId)}`
        : "/interviews";
    case "assignment_created": {
      const title = notification.title.toLowerCase();
      const description = (notification.description || "").toLowerCase();
      if (title.includes("comprobante") || description.includes("adjuntar comprobantes")) {
        if (description.includes("bienestar")) {
          return notification.relatedId
            ? `/welfare?highlight=${encodeURIComponent(notification.relatedId)}`
            : "/welfare";
        }
        return notification.relatedId
          ? `/budget?highlight=${encodeURIComponent(notification.relatedId)}`
          : "/budget";
      }
      return notification.relatedId
        ? `/assignments?highlight=${encodeURIComponent(notification.relatedId)}`
        : "/assignments";
    }
    case "budget_approved":
    case "budget_rejected": {
      const isWelfare = notification.title.toLowerCase().includes("bienestar");
      if (isWelfare) {
        return notification.relatedId
          ? `/welfare?highlight=${encodeURIComponent(notification.relatedId)}`
          : "/welfare";
      }
      return notification.relatedId
        ? `/budget?highlight=${encodeURIComponent(notification.relatedId)}`
        : "/budget";
    }
    case "birthday_today":
      return "/birthdays";
    case "upcoming_meeting":
      return "/calendar";
    case "reminder": {
      const title = notification.title.toLowerCase();
      const desc = (notification.description || "").toLowerCase();
      // Activity logistics / service tasks — check BEFORE baptism since titles may include both
      if (title.includes("logística") || title.includes("logistica") || title.includes("logistica")) {
        return notification.relatedId
          ? `/activity-logistics?highlight=${encodeURIComponent(notification.relatedId)}`
          : "/activity-logistics";
      }
      // Mission / baptism
      if (
        title.includes("bautism") ||
        title.includes("programa") ||
        title.includes("fecha de bautismo") ||
        title.includes("agenda") ||
        desc.includes("bautism")
      ) {
        return notification.relatedId
          ? `/mission-work?section=servicios_bautismales&highlight=${encodeURIComponent(notification.relatedId)}`
          : "/mission-work?section=servicios_bautismales";
      }
      // Assignments
      if (title.includes("asignación") || title.includes("asignacion") || title.includes("tarea")) {
        return notification.relatedId
          ? `/assignments?highlight=${encodeURIComponent(notification.relatedId)}`
          : "/assignments";
      }
      if (title.includes("actividad")) {
        return "/activities";
      }
      if (title.includes("meta")) {
        return "/goals";
      }
      if (title.includes("bienestar")) {
        return notification.relatedId
          ? `/welfare?highlight=${encodeURIComponent(notification.relatedId)}`
          : "/welfare";
      }
      if (title.includes("presupuesto") || title.includes("comprobantes")) {
        return notification.relatedId
          ? `/budget?highlight=${encodeURIComponent(notification.relatedId)}`
          : "/budget";
      }
      if (title.includes("entrevista")) {
        return notification.relatedId
          ? `/interviews?highlight=${encodeURIComponent(notification.relatedId)}`
          : "/interviews";
      }
      if (title.includes("consejo de barrio")) {
        return "/ward-council";
      }
      return "/dashboard";
    }
    default:
      return "/dashboard";
  }
};
