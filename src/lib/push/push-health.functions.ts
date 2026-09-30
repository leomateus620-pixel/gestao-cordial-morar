import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PushDeliveryHealth = {
  pending: number;
  stuck: number;
  oldest_pending_at: string | null;
  sent_24h: number;
  avg_delay_s: number | null;
  p95_delay_s: number | null;
  failed_final_24h: number;
  summarized_24h: number;
  recent_errors: Array<{ tipo: string | null; status: string; attempts: number; last_error: string | null; last_error_at: string | null }>;
};

/** Saúde da entrega de push (a função do banco só responde para admin). */
export const getPushDeliveryHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PushDeliveryHealth> => {
    const { data, error } = await context.supabase.rpc("get_push_delivery_health" as never);
    if (error) throw new Error(error.message);
    return data as unknown as PushDeliveryHealth;
  });
