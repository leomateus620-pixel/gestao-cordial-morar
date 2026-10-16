import { adminBookkeeping, delegatedContext } from "./delegation.server";
import { assertRoutineTemplate } from "./routines.server";
import { assistantScopeKey, assistantReferenceParams } from "./scope";
import { nextRoutineRun } from "./routines.schemas";
import { executeAgentTool, getAllowedTools } from "./tools";
import { clientQuery, rows, saoPauloDay } from "./tools/common";
import type { AgentContext } from "./security";
import { botForRoutineTemplate } from "./routine-bot";
export type RoutineRef = {
  tool: string;
  params: Record<string, unknown>;
  template: string;
  propertyIds?: string[];
};
export async function executeRoutineTemplate(
  template: string,
  ctx: AgentContext,
  clientCursor?: string,
): Promise<{
  refs: RoutineRef[];
  seen: Array<{ client_id: string; property_id: string }>;
  nextCursor: string | null;
}> {
  assertRoutineTemplate(template, ctx);
  const { resolveAgentBots } = await import("./bot-config.server");
  const available = new Set(
    (await resolveAgentBots(ctx)).filter((bot) => bot.active).flatMap((bot) => bot.tools),
  );
  const allowed = new Set(
    getAllowedTools(ctx)
      .map((t) => t.name)
      .filter((name) => available.has(name)),
  );
  const refs: RoutineRef[] = [],
    seen: Array<{ client_id: string; property_id: string }> = [];
  let calls = 0;
  let nextCursor: string | null = null;
  const run = async (tool: string, params: Record<string, unknown> = {}) => {
    if (!allowed.has(tool) || calls >= 8) throw new Error("routine_scope_or_limit");
    calls++;
    if (tool === "agenda_today") params = { ...params, date: saoPauloDay() };
    const started = Date.now();
    const result = await executeAgentTool(tool, params, ctx);
    const { persistAssistantAudit } = await import("./persistence.server");
    await persistAssistantAudit(
      ctx.userId,
      "routine",
      null,
      tool,
      params,
      { status: "ok" },
      Date.now() - started,
      ctx.signal,
      assistantScopeKey(ctx),
    );
    if (result.structuredContent.status === "not_configured")
      throw new Error("research_not_configured");
    refs.push({ tool, params: assistantReferenceParams(params), template });
    return result.structuredContent;
  };
  if (template === "daily_briefing") {
    for (const tool of [
      "agenda_today",
      "stale_attendances",
      "expiring_agenciamentos",
      "rentals_overdue",
    ])
      if (allowed.has(tool)) await run(tool, tool === "agenda_today" ? {} : { limit: 5 });
  } else if (template === "market_digest")
    await run("web_research", { topic: "mercado_local", region: "santa_rosa_rs" });
  else if (template !== "new_matches")
    await run(
      template,
      template === "agenda_today" || template === "broker_ranking" ? {} : { limit: 10 },
    );
  if (
    (template === "new_matches" || template === "daily_briefing") &&
    allowed.has("match_client_properties")
  ) {
    let query = clientQuery(ctx).order("id", { ascending: true }).limit(3);
    if (clientCursor) query = query.gt("id", clientCursor);
    let clients = await rows(query, ctx);
    if (!clients.length && clientCursor)
      clients = await rows(clientQuery(ctx).order("id", { ascending: true }).limit(3), ctx);
    calls++;
    nextCursor = clients.length === 3 ? clients.at(-1).id : null;
    for (const client of clients.filter(
      (c) => !["perdido", "inativo", "convertido", "concluido", "cancelado"].includes(c.status),
    )) {
      if (calls >= 8) break;
      const result = await run("match_client_properties", { clientId: client.id, limit: 5 });
      const props = (result.properties as any[]) ?? [];
      const prior = await (ctx.supabase as any)
        .from("assistant_match_seen")
        .select("property_id")
        .eq("user_id", ctx.userId)
        .eq("client_id", client.id)
        .eq("scope_key", assistantScopeKey(ctx))
        .in(
          "property_id",
          props.map((p) => p.id),
        )
        .limit(5);
      if (prior.error) throw new Error("match_baseline_unavailable");
      const known = new Set((prior.data ?? []).map((p: any) => p.property_id));
      const fresh = props.filter((p) => !known.has(p.id));
      refs[refs.length - 1].propertyIds = fresh.map((p) => p.id);
      for (const p of fresh) seen.push({ client_id: client.id, property_id: p.id });
    }
  }
  return { refs, seen, nextCursor };
}
type RoutineWorkerDeps = {
  admin?: ReturnType<typeof adminBookkeeping>;
  contextForUser?: typeof delegatedContext;
  executeTemplate?: typeof executeRoutineTemplate;
  assertBotEnabled?: (ctx: AgentContext, botId: string) => Promise<void>;
};
export async function runAssistantRoutines(limit = 20, deps: RoutineWorkerDeps = {}) {
  if (process.env.ASSISTANT_ROUTINES_ENABLED !== "true")
    return {
      status: "not_configured",
      processed: 0,
      completed: 0,
      failed: 0,
      deferred: 0,
      needsReauthorization: 0,
    };
  const admin = deps.admin ?? adminBookkeeping();
  const claimed = await admin.rpc("assistant_routine_claim", {
    p_limit: Number.isFinite(limit) ? Math.min(20, Math.max(1, Math.trunc(limit))) : 20,
  });
  if (claimed.error) throw new Error("Não foi possível reservar as execuções.");
  const counts = {
    status: "ok",
    processed: 0,
    completed: 0,
    failed: 0,
    deferred: 0,
    needsReauthorization: 0,
  };
  const contexts = new Map<string, Promise<AgentContext>>();
  const contextForUser = (userId: string) => {
    let pending = contexts.get(userId);
    if (!pending) {
      pending = (deps.contextForUser ?? delegatedContext)(userId);
      contexts.set(userId, pending);
    }
    return pending;
  };
  await Promise.all(
    (claimed.data ?? []).map(async (run: any) => {
      counts.processed++;
      let ctx: AgentContext | undefined;
      try {
        // One rotation per user per batch. Each run keeps its own deadline.
        ctx = { ...(await contextForUser(run.user_id)), signal: AbortSignal.timeout(90000) };
        const routine = await (ctx.supabase as any)
          .from("assistant_routines")
          .select("template,status,hour,minute,days,day_of_week,client_cursor,revision")
          .eq("id", run.routine_id)
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (
          routine.error ||
          !routine.data ||
          routine.data.status !== "active" ||
          routine.data.revision !== run.routine_revision
        )
          throw new Error("routine_cancelled");
        const botId = botForRoutineTemplate(routine.data.template);
        const assertBot =
          deps.assertBotEnabled ?? (await import("./bot-config.server")).assertAssistantBotEnabled;
        try {
          await assertBot(ctx, botId);
        } catch {
          throw new Error("routine_cancelled");
        }
        const { refs, seen, nextCursor } = await (deps.executeTemplate ?? executeRoutineTemplate)(
          routine.data.template,
          ctx,
          routine.data.client_cursor ?? undefined,
        );
        ctx.signal?.throwIfAborted();
        const finished = await admin.rpc("assistant_routine_finish", {
          p_run: run.id,
          p_lease: run.lease_id,
          p_scope: assistantScopeKey(ctx),
          p_refs: refs,
          p_seen: seen,
          p_cursor: nextCursor,
          p_next: nextRoutineRun(
            routine.data.hour,
            routine.data.minute,
            new Date(),
            routine.data.days,
            routine.data.day_of_week,
          ),
        });
        if (finished.error || finished.data !== true) throw new Error("routine_cancelled");
        counts.completed++;
      } catch (error) {
        const code = error instanceof Error ? error.message : "failed";
        const deferred = code === "delegation_busy";
        const auth =
          code === "needs_reauthorization" ||
          code === "identity_mismatch" ||
          code === "not_configured";
        const status = auth
          ? "needs_reauthorization"
          : code === "routine_cancelled"
            ? "cancelled"
            : "failed";
        const nextAttempt = new Date(
          Date.now() + (run.attempts === 1 ? 60000 : 300000),
        ).toISOString();
        await admin
          .from("assistant_routine_runs")
          .update({
            status,
            next_attempt_at: nextAttempt,
            finished_at: run.attempts >= 3 || auth ? new Date().toISOString() : null,
            lease_id: null,
            lease_until: null,
            ...(deferred ? { attempts: Math.max(0, run.attempts - 1) } : {}),
          })
          .eq("id", run.id)
          .eq("lease_id", run.lease_id);
        if (auth) {
          counts.needsReauthorization++;
          await admin
            .from("assistant_routines")
            .update({ status: "needs_reauthorization" })
            .eq("id", run.routine_id)
            .eq("status", "active");
        } else if (deferred) counts.deferred++;
        else counts.failed++;
      }
    }),
  );
  return counts;
}
