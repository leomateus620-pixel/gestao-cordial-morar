import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type FactRow = {
  id: string;
  tipo: string;
  ref_id: string | null;
  texto: string;
  expires_at: string | null;
  created_at: string;
};

export const listFacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = (await (context.supabase as any)
      .from("assistant_facts")
      .select("id,tipo,ref_id,texto,expires_at,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })) as { data: FactRow[] | null; error: unknown };
    if (result.error) throw new Error("Não foi possível carregar os fatos guardados.");
    return {
      facts: (result.data ?? []).map((row) => ({
        id: row.id,
        tipo: row.tipo,
        refId: row.ref_id,
        texto: row.texto,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      })),
    };
  });

export const deleteFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ context, data }) => {
    const result = await (context.supabase as any)
      .from("assistant_facts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (result.error) throw new Error("Não foi possível apagar o fato.");
    return { id: data.id };
  });
