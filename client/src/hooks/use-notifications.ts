import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

export function useNotifications() {
  const notificationsQuery = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 20000,
  });

  const unreadCountQuery = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/count"],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 20000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/notifications/${id}/read`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications"] });
      await queryClient.cancelQueries({ queryKey: ["/api/notifications/count"] });

      const previousNotifications = queryClient.getQueryData<Notification[]>(["/api/notifications"]);
      const previousCount = queryClient.getQueryData<{ count: number }>(["/api/notifications/count"]);

      const targetNotification = previousNotifications?.find((n) => n.id === id);
      const wasUnread = targetNotification && !targetNotification.isRead;

      queryClient.setQueryData<Notification[]>(["/api/notifications"], (old) =>
        old?.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );

      if (wasUnread && previousCount) {
        queryClient.setQueryData<{ count: number }>(["/api/notifications/count"], {
          count: Math.max(0, previousCount.count - 1),
        });
      }

      return { previousNotifications, previousCount };
    },
    onError: (_err, _id, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(["/api/notifications"], context.previousNotifications);
      }
      if (context?.previousCount) {
        queryClient.setQueryData(["/api/notifications/count"], context.previousCount);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", "/api/notifications/mark-all-read"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications"] });
      await queryClient.cancelQueries({ queryKey: ["/api/notifications/count"] });

      const previousNotifications = queryClient.getQueryData<Notification[]>(["/api/notifications"]);
      const previousCount = queryClient.getQueryData<{ count: number }>(["/api/notifications/count"]);

      queryClient.setQueryData<Notification[]>(["/api/notifications"], (old) =>
        old?.map((n) => ({ ...n, isRead: true }))
      );
      queryClient.setQueryData<{ count: number }>(["/api/notifications/count"], { count: 0 });

      return { previousNotifications, previousCount };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(["/api/notifications"], context.previousNotifications);
      }
      if (context?.previousCount) {
        queryClient.setQueryData(["/api/notifications/count"], context.previousCount);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/notifications/${id}`);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications"] });
      await queryClient.cancelQueries({ queryKey: ["/api/notifications/count"] });

      const previousNotifications = queryClient.getQueryData<Notification[]>(["/api/notifications"]);
      const previousCount = queryClient.getQueryData<{ count: number }>(["/api/notifications/count"]);

      const deletedNotification = previousNotifications?.find((n) => n.id === id);
      const wasUnread = deletedNotification && !deletedNotification.isRead;

      queryClient.setQueryData<Notification[]>(["/api/notifications"], (old) =>
        old?.filter((n) => n.id !== id)
      );

      if (wasUnread && previousCount) {
        queryClient.setQueryData<{ count: number }>(["/api/notifications/count"], {
          count: Math.max(0, previousCount.count - 1),
        });
      }

      return { previousNotifications, previousCount };
    },
    onError: (_err, _id, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(["/api/notifications"], context.previousNotifications);
      }
      if (context?.previousCount) {
        queryClient.setQueryData(["/api/notifications/count"], context.previousCount);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  return {
    notifications: notificationsQuery.data || [],
    unreadCount: notificationsQuery.data
      ? notificationsQuery.data.filter((n) => !n.isRead).length
      : (unreadCountQuery.data?.count ?? 0),
    isLoading: notificationsQuery.isLoading || unreadCountQuery.isLoading,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    deleteNotification: deleteNotificationMutation.mutate,
    isMarkingAsRead: markAsReadMutation.isPending,
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
    refetch: () => {
      notificationsQuery.refetch();
      unreadCountQuery.refetch();
    },
  };
}
