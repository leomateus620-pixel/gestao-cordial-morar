import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-mock";

type NotificationRow = {
  id: string;
  user_id: string;
  tipo: string | null;
  titulo: string | null;
  mensagem: string | null;
  link: string | null;
  lida: boolean;
  created_at: string;
};

const HIGH_PRIORITY = new Set([
  "atendimento_atribuido",
  "atendimento_iniciado",
]);

/**
 * Subscribes to realtime inserts on public.notifications for the signed-in user
 * and pushes visual toasts + refreshes the bell query. This complements the
 * existing NotificationBell polling.
 */
export function useRealtimeNotifications() {
  const user = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const lastShownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          if (!row?.id || lastShownRef.current.has(row.id)) return;
          lastShownRef.current.add(row.id);
          qc.invalidateQueries({ queryKey: ["notifications", "mine"] });

          const isHigh = HIGH_PRIORITY.has(row.tipo ?? "");
          const title = row.titulo ?? "Nova notificação";
          const description = row.mensagem ?? undefined;
          const action = row.link
            ? {
                label: "Abrir",
                onClick: () => {
                  void navigate({ to: row.link as string } as never);
                },
              }
            : undefined;

          if (isHigh) {
            toast.success(title, {
              description,
              duration: 8000,
              action,
            });
          } else {
            toast(title, { description, action });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc, navigate]);
}
