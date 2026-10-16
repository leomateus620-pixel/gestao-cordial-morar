import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { memoryPreferences, defaultAssistantMemory } from "./memory.schemas";
export const listAssistantMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = (await context.supabase
      .from("assistant_memory" as never)
      .select("preferences,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle()) as any;
    if (result.error) throw new Error("Não foi possível carregar suas preferências.");
    return {
      preferences: result.data
        ? memoryPreferences.parse(result.data.preferences)
        : defaultAssistantMemory(),
      updatedAt: result.data?.updated_at ?? null,
    };
  });
export const saveAssistantMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ preferences: memoryPreferences, confirmed: z.literal(true) })
      .strict()
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const updatedAt = new Date().toISOString();
    const result = await (context.supabase as any)
      .from("assistant_memory")
      .upsert(
        { user_id: context.userId, preferences: data.preferences, updated_at: updatedAt },
        { onConflict: "user_id" },
      );
    if (result.error) throw new Error("Não foi possível salvar suas preferências.");
    return { preferences: data.preferences, updatedAt };
  });
export const deleteAssistantMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ confirmed: z.literal(true) })
      .strict()
      .parse(v),
  )
  .handler(async ({ context }) => {
    const result = await (context.supabase as any)
      .from("assistant_memory")
      .delete()
      .eq("user_id", context.userId);
    if (result.error) throw new Error("Não foi possível apagar suas preferências.");
    return { preferences: defaultAssistantMemory(), updatedAt: null };
  });
