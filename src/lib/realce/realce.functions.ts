import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCanUse(supabase: { rpc: (n: string) => PromiseLike<{ data: unknown }> }) {
  const { data } = await supabase.rpc("realce_can_use");
  if (data !== true) throw new Error("Sem acesso ao Realce.");
}

/** Estado da configuração de IA (sem revelar valores). */
export const realceStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCanUse(context.supabase as never);
    const { activeProvider } = await import("./provider.server");
    return { aiConfigured: activeProvider.configured(), provider: activeProvider.id, model: activeProvider.model };
  });

/** Processa agora itens já enfileirados do próprio usuário (a rotina por minuto é o reforço). */
export const realceProcessNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCanUse(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runRealce } = await import("./worker.server");
    return runRealce(supabaseAdmin, { limit: 2, userId: context.userId });
  });
