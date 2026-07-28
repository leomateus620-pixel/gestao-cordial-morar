import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-mock";

type RealtimeNotificationBroadcast = {
  payload?: {
    notification_id?: unknown;
  };
};

function notificationIdFromBroadcast(message: RealtimeNotificationBroadcast): string | null {
  const value = message.payload?.notification_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Exactly one authenticated INSERT subscription, owned by the global provider.
 * The websocket row is intentionally opaque; the provider retrieves the safe
 * display payload through the role-scoped inbox RPC.
 */
export function useRealtimeNotifications(
  onNotification: (notificationId: string) => void | Promise<void>,
  onUnavailable?: () => void,
) {
  const user = useSession();
  const callbackRef = useRef(onNotification);
  const unavailableRef = useRef(onUnavailable);
  const seenRef = useRef(new Set<string>());
  const orderRef = useRef<string[]>([]);

  useEffect(() => {
    callbackRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    unavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`notifications:${user.id}`, { config: { private: true } })
        .on("broadcast", { event: "notification.created" }, (message) => {
          const notificationId = notificationIdFromBroadcast(
            message as RealtimeNotificationBroadcast,
          );
          if (!notificationId || seenRef.current.has(notificationId)) return;
          seenRef.current.add(notificationId);
          orderRef.current.push(notificationId);
          while (orderRef.current.length > 100) {
            const expired = orderRef.current.shift();
            if (expired) seenRef.current.delete(expired);
          }
          void callbackRef.current(notificationId);
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (
            status === "SUBSCRIBED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            // SUBSCRIBED also closes the race between the initial inbox fetch and
            // socket readiness. Reconciliation only invalidates persisted queries,
            // so missed historical rows never replay sound or transient motion.
            unavailableRef.current?.();
          }
        });
    })().catch(() => unavailableRef.current?.());

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [user]);
}
