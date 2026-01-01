import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  const statusQuery = useQuery<{ configured: boolean; subscribed: boolean }>({
    queryKey: ["/api/push/status"],
    enabled: isSupported,
  });

  const vapidKeyQuery = useQuery<{ publicKey: string }>({
    queryKey: ["/api/push/vapid-public-key"],
    enabled: isSupported,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (subscription: PushSubscription) => {
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Invalid subscription keys");
      }
      const res = await apiRequest("POST", "/api/push/subscribe", {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/status"] });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (endpoint: string) => {
      const res = await apiRequest("POST", "/api/push/unsubscribe", { endpoint });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/status"] });
    },
  });

  const requestPermissionAndSubscribe = useCallback(async () => {
    if (!isSupported) {
      throw new Error("Push notifications not supported");
    }

    const currentPermission = await Notification.requestPermission();
    setPermission(currentPermission);

    if (currentPermission !== "granted") {
      throw new Error("Notification permission denied");
    }

    const publicKey = vapidKeyQuery.data?.publicKey;
    if (!publicKey) {
      throw new Error("VAPID public key not available");
    }

    const registration = await navigator.serviceWorker.ready;
    
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await subscribeMutation.mutateAsync(subscription);
    return subscription;
  }, [isSupported, vapidKeyQuery.data?.publicKey, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      await unsubscribeMutation.mutateAsync(subscription.endpoint);
    }
  }, [unsubscribeMutation]);

  return {
    isSupported,
    permission,
    isConfigured: statusQuery.data?.configured ?? false,
    isSubscribed: statusQuery.data?.subscribed ?? false,
    isLoading: statusQuery.isLoading || vapidKeyQuery.isLoading,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
    subscribe: requestPermissionAndSubscribe,
    unsubscribe,
    error: subscribeMutation.error || unsubscribeMutation.error,
  };
}
