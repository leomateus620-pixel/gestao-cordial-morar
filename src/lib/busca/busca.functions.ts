import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  BuscaCategoria,
  BuscaCategoriaFiltro,
  BuscaResultado,
  BuscaTimeline,
} from "@/types/busca";

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { query: string; categoria?: BuscaCategoriaFiltro }) => data)
  .handler(async ({ data, context }): Promise<BuscaResultado[]> => {
    const { assertAdminAccess, runGlobalSearch } = await import("./busca.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    await assertAdminAccess(supabase, context.userId);
    return runGlobalSearch(supabase, data.query ?? "", data.categoria ?? "todos");
  });

export const getRecordTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { categoria: BuscaCategoria; id: string }) => data)
  .handler(async ({ data, context }): Promise<BuscaTimeline> => {
    const { assertAdminAccess, buildRecordTimeline } = await import("./busca.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    await assertAdminAccess(supabase, context.userId);
    return buildRecordTimeline(supabase, data.categoria, data.id);
  });
