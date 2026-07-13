import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CorretorProfile = {
  id: string;
  nome: string;
  email: string;
  iniciais: string;
  cargo: string | null;
  role: "corretor" | "admin";
};

export const listCorretores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CorretorProfile[]> => {
    const { data, error } = await context.supabase.rpc("list_corretores");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      nome: (row.nome as string) ?? "",
      email: (row.email as string) ?? "",
      iniciais: (row.iniciais as string) ?? "",
      cargo: (row.cargo as string | null) ?? null,
      role: (row.role as "corretor" | "admin") ?? "corretor",
    }));
  });
