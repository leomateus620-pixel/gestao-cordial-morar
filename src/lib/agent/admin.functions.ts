import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { maskAgentOutput } from "./masking";

export const getAssistantAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        days: z.number().int().min(1).max(90).default(7),
        userId: z.string().uuid().optional(),
        botId: z.string().max(24).optional(),
        status: z.enum(["pending", "confirmed", "executed", "failed", "cancelled"]).optional(),
      })
      .strict()
      .parse(value ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadAgentContext, effectiveRole } = await import("./security");
    const ctx = await loadAgentContext(context.supabase, context.userId);
    if (effectiveRole(ctx) !== "admin") throw new Error("Acesso exclusivo do administrador.");
    const from = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const filter = (q: any) => {
      q = q.gte("created_at", from).order("created_at", { ascending: false });
      if (data.userId) q = q.eq("user_id", data.userId);
      if (data.botId) q = q.eq("bot_id", data.botId);
      return q;
    };
    let actionsQuery = filter(
      ctx.supabase.from("assistant_actions").select("id,user_id,bot_id,type,status,created_at"),
    );
    if (data.status) actionsQuery = actionsQuery.eq("status", data.status);
    const [usage, actions, audit] = await Promise.all([
      filter(
        ctx.supabase
          .from("assistant_usage")
          .select(
            "id,user_id,bot_id,model,prompt_tokens,completion_tokens,duration_ms,estimated_cost_usd,rate_version,created_at",
          ),
      ).limit(501),
      actionsQuery.limit(201),
      filter(
        ctx.supabase
          .from("assistant_audit")
          .select("id,user_id,bot_id,tool,result_summary,duration_ms,created_at"),
      ).limit(201),
    ]);
    if (usage.error || actions.error || audit.error)
      throw new Error(
        "Não foi possível consultar a auditoria. Confira as migrations do assistente.",
      );
    const samples = (usage.data ?? []).slice(0, 500) as any[];
    const known = samples.filter((r) => r.estimated_cost_usd !== null);
    return maskAgentOutput({
      usage: samples,
      actions: (actions.data ?? []).slice(0, 200),
      audit: (audit.data ?? []).slice(0, 200),
      limited:
        (usage.data?.length ?? 0) > 500 ||
        (actions.data?.length ?? 0) > 200 ||
        (audit.data?.length ?? 0) > 200,
      summary: {
        gatewayCalls: samples.length,
        tokens: samples.reduce(
          (n, r) => n + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0),
          0,
        ),
        costUsd: known.length ? known.reduce((n, r) => n + Number(r.estimated_cost_usd), 0) : null,
        unknownCosts: samples.length - known.length,
        executed: (actions.data ?? []).slice(0, 200).filter((r: any) => r.status === "executed")
          .length,
      },
    });
  });
