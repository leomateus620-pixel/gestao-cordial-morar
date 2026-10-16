import type { AgentContext } from "./security";
import { effectiveRole } from "./security";
import { assistantReadiness } from "./readiness.server";
import { assistantScopeKey } from "./scope";
export function assertRoutineTemplate(template: string, ctx: AgentContext) {
  const role = effectiveRole(ctx);
  if (
    !["admin", "secretaria", "corretor"].includes(role ?? "") ||
    (["broker_ranking", "market_digest"].includes(template) && role !== "admin") ||
    (template === "rentals_overdue" && !["admin", "secretaria"].includes(role ?? ""))
  )
    throw new Error("Seu perfil não pode usar esta rotina.");
}
export async function listRoutines(ctx: AgentContext, limit = 20) {
  const client = ctx.supabase as any;
  const [routines, readiness] = await Promise.all([
    client
      .from("assistant_routines")
      .select("id,name,template,hour,minute,days,day_of_week,status,next_run_at,updated_at")
      .eq("user_id", ctx.userId)
      .order("updated_at", { ascending: false })
      .limit(limit),
    assistantReadiness(ctx),
  ]);
  if (routines.error) throw new Error("Não foi possível carregar suas rotinas.");
  const ids = (routines.data ?? []).map((r: any) => r.id);
  const runs = ids.length
    ? await client
        .from("assistant_routine_runs")
        .select("id,routine_id,status,scheduled_at,finished_at,attempts")
        .eq("user_id", ctx.userId)
        .in("routine_id", ids)
        .order("scheduled_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (runs.error) throw new Error("Não foi possível carregar as execuções.");
  return {
    routines: (routines.data ?? []).map((r: any) => {
      const history = (runs.data ?? [])
        .filter((run: any) => run.routine_id === r.id)
        .slice(0, 5)
        .map((run: any) => ({
          id: run.id,
          status: run.status,
          scheduledAt: run.scheduled_at,
          finishedAt: run.finished_at,
          attempts: run.attempts,
        }));
      return {
        id: r.id,
        name: r.name,
        template: r.template,
        status: r.status,
        nextRunAt: r.next_run_at,
        hour: r.hour,
        minute: r.minute,
        timeZone: "America/Sao_Paulo" as const,
        days: r.days as "every_day" | "weekdays" | "weekly",
        dayOfWeek: r.day_of_week ?? undefined,
        needsReauthorization: readiness.delegation !== "connected",
        lastRun: history[0] ?? null,
        runs: history,
      };
    }),
    readiness,
  };
}
export async function readRoutineRun(runId: string, ctx: AgentContext) {
  const result = await (ctx.supabase as any)
    .from("assistant_routine_runs")
    .select("id,status,result_refs,scope_key,scheduled_at,finished_at")
    .eq("id", runId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (result.error || !result.data) throw new Error("Execução não encontrada no seu acesso atual.");
  const row = result.data;
  if (row.scope_key && row.scope_key !== assistantScopeKey(ctx))
    throw new Error("Esta execução pertence a um acesso anterior. Faça uma nova consulta.");
  const { executeAgentTool } = await import("./tools");
  const items: Array<{ tool: string; data: Record<string, any> }> = [];
  for (const ref of (Array.isArray(row.result_refs) ? row.result_refs : []).slice(0, 8)) {
    assertRoutineTemplate(ref.template ?? "daily_briefing", ctx);
    const out = await executeAgentTool(ref.tool, ref.params ?? {}, ctx);
    if (Array.isArray(ref.propertyIds) && Array.isArray(out.structuredContent.properties)) {
      out.structuredContent.properties = (out.structuredContent.properties as any[]).filter((p) =>
        ref.propertyIds.includes(p.id),
      );
      out.structuredContent.total = (out.structuredContent.properties as any[]).length;
    }
    items.push({ tool: ref.tool, data: out.structuredContent as Record<string, any> });
  }
  return {
    id: row.id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    finishedAt: row.finished_at,
    items,
  };
}
