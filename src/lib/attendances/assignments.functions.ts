import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type CorretorResponseMetric = {
  broker_id: string;
  broker_nome: string | null;
  avg_seconds: number | null;
  median_seconds: number | null;
  fastest_seconds: number | null;
  slowest_seconds: number | null;
  completed_count: number;
  pending_count: number;
};

/** Idempotent. Only the assigned broker closes their own timer. */
export const markAttendanceFirstOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attendanceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as unknown as RpcClient).rpc(
      "mark_attendance_first_opened",
      { _attendance_id: data.attendanceId },
    );
    if (error) throw new Error(error.message);
    return result as { ok: boolean; noop: boolean } | null;
  });

/** Aggregate broker metrics. Management-only. */
export const getCorretoresResponseMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { start?: string | null; end?: string | null; imobiliaria?: string | null }) => d,
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as unknown as RpcClient).rpc(
      "get_corretores_response_metrics",
      {
        _start: data.start ?? null,
        _end: data.end ?? null,
        _imobiliaria: data.imobiliaria ?? null,
      },
    );
    if (error) throw new Error(error.message);
    return (rows as CorretorResponseMetric[] | null) ?? [];
  });
