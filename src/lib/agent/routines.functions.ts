import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { routineProposal, proposeRoutine, nextRoutineRun } from "./routines.schemas";
const confirmation = z.object({ id: z.string().uuid(), confirmed: z.literal(true) }).strict();
export const listAssistantRoutines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ limit: z.number().int().min(1).max(50).default(20) })
      .strict()
      .parse(v ?? {}),
  )
  .handler(async ({ context, data }) => {
    const [{ loadAgentContext }, { listRoutines }] = await Promise.all([
      import("./security"),
      import("./routines.server"),
    ]);
    return listRoutines(await loadAgentContext(context.supabase, context.userId), data.limit);
  });
export const prepareAssistantRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ message: z.string().trim().min(4).max(1000) })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const [{ loadAgentContext }, { assertRoutineTemplate }] = await Promise.all([
      import("./security"),
      import("./routines.server"),
    ]);
    const out = proposeRoutine(data.message);
    assertRoutineTemplate(
      out.proposal.template,
      await loadAgentContext(context.supabase, context.userId),
    );
    return { ...out, requestId: crypto.randomUUID() };
  });
export const saveAssistantRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        proposal: routineProposal,
        requestId: z.string().uuid().optional(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const [
      { loadAgentContext },
      { assertRoutineTemplate, listRoutines },
      { assistantReadiness },
      { maskText },
    ] = await Promise.all([
      import("./security"),
      import("./routines.server"),
      import("./readiness.server"),
      import("./masking"),
    ]);
    const ctx = await loadAgentContext(context.supabase, context.userId);
    assertRoutineTemplate(data.proposal.template, ctx);
    const readiness = await assistantReadiness(ctx);
    const row = {
      user_id: ctx.userId,
      name: maskText(data.proposal.name),
      template: data.proposal.template,
      hour: data.proposal.hour,
      minute: data.proposal.minute,
      days: data.proposal.days,
      day_of_week: data.proposal.dayOfWeek ?? null,
      next_run_at: nextRoutineRun(
        data.proposal.hour,
        data.proposal.minute,
        new Date(),
        data.proposal.days,
        data.proposal.dayOfWeek,
      ),
      status: readiness.status === "ready" ? "active" : "needs_reauthorization",
      updated_at: new Date().toISOString(),
    };
    if (!data.id && !data.requestId) throw new Error("Prepare a rotina antes de confirmar.");
    const result = await (context.supabase as any).rpc("assistant_routine_save_configured", {
      _id: data.id ?? data.requestId,
      _row: row,
      _create: !data.id,
      _confirmed: data.confirmed,
    });
    if (result.error)
      throw new Error(
        result.error.message === "bot_disabled"
          ? "Este agente está desativado. A rotina não foi salva."
          : "Não foi possível salvar esta rotina. Confira a proposta atual.",
      );
    return listRoutines(ctx);
  });
export const setAssistantRoutineState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    confirmation.extend({ status: z.enum(["active", "paused"]) }).parse(v),
  )
  .handler(async ({ context, data }) => {
    const [{ loadAgentContext }, { assertRoutineTemplate, listRoutines }, { assistantReadiness }] =
      await Promise.all([
        import("./security"),
        import("./routines.server"),
        import("./readiness.server"),
      ]);
    const ctx = await loadAgentContext(context.supabase, context.userId),
      client = context.supabase as any;
    const current = await client
      .from("assistant_routines")
      .select("template,hour,minute,days,day_of_week")
      .eq("id", data.id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (current.error || !current.data) throw new Error("Rotina não encontrada.");
    assertRoutineTemplate(current.data.template, ctx);
    if (data.status === "active" && (await assistantReadiness(ctx)).status !== "ready")
      throw new Error("Conecte a autorização de rotinas antes de retomar.");
    const result = await client.rpc("assistant_routine_state_configured", {
      _id: data.id,
      _status: data.status,
      _confirmed: data.confirmed,
      _next: nextRoutineRun(
        current.data.hour,
        current.data.minute,
        new Date(),
        current.data.days,
        current.data.day_of_week,
      ),
    });
    if (result.error) throw new Error("Não foi possível atualizar esta rotina.");
    return listRoutines(ctx);
  });
export const deleteAssistantRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => confirmation.parse(v))
  .handler(async ({ context, data }) => {
    const result = await (context.supabase as any)
      .from("assistant_routines")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (result.error) throw new Error("Não foi possível apagar esta rotina.");
    const [{ loadAgentContext }, { listRoutines }] = await Promise.all([
      import("./security"),
      import("./routines.server"),
    ]);
    return listRoutines(await loadAgentContext(context.supabase, context.userId));
  });
export const getAssistantRoutineRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ context, data }) => {
    const [{ loadAgentContext }, { readRoutineRun }] = await Promise.all([
      import("./security"),
      import("./routines.server"),
    ]);
    return readRoutineRun(data.id, await loadAgentContext(context.supabase, context.userId));
  });
