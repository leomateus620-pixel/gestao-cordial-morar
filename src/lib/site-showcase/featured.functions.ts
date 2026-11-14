import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { featuredAdapter, featuredPolicySchema, FEATURED_TREATMENT_VERSION } from "./featured";

const brandSchema = z.enum(["cordial", "morar"]);
async function admin(client: SupabaseClient, userId: string) {
  const roles = await Promise.all(
    ["admin", "meta_reviewer", "atendimentos_viewer"].map((role) =>
      client.rpc("has_role", { _user_id: userId, _role: role }),
    ),
  );
  if (
    roles.some((role) => role.error) ||
    roles[0].data !== true ||
    roles.slice(1).some((role) => role.data === true)
  )
    throw new Error("Acesso restrito à administração.");
  return (await import("@/integrations/supabase/client.server"))
    .supabaseAdmin as unknown as SupabaseClient;
}
export const featuredSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ brand: brandSchema }).parse(v))
  .handler(async ({ context, data }) => {
    const db = await admin(context.supabase as unknown as SupabaseClient, context.userId),
      A = featuredAdapter(data.brand);
    const [settings, weeks] = await Promise.all([
      db.from(A.settings).select("featured_policy").eq("id", true).maybeSingle(),
      db
        .from(A.weeks)
        .select("id,week_start,state,expected_items")
        .order("week_start", { ascending: false })
        .limit(4),
    ]);
    if (settings.error || weeks.error) throw new Error("Não foi possível ler os destaques.");
    const items = weeks.data.length
      ? await db
          .from(A.items)
          .select("id,week_id,slot,public_id")
          .in(
            "week_id",
            weeks.data.map((w) => w.id),
          )
          .order("slot")
      : { data: [], error: null };
    if (items.error) throw new Error("Não foi possível ler os imóveis.");
    const photos = items.data.length
      ? await db
          .from(A.photos)
          .select("id,item_id,ordinal,state,error,parameters")
          .in(
            "item_id",
            items.data.map((i) => i.id),
          )
          .order("ordinal")
      : { data: [], error: null };
    if (photos.error) throw new Error("Não foi possível ler as fotos.");
    return {
      enabled: settings.data?.featured_policy?.enabled === true,
      weeks: weeks.data.map((w) => ({
        ...w,
        photos: photos.data
          .filter((p) => items.data.some((i) => i.week_id === w.id && i.id === p.item_id))
          .map((p) => ({
            id: p.id,
            ordinal: p.ordinal,
            state: p.state as string,
            error: p.error as string | null,
            canRetry: p.state === "failed" && Boolean(p.parameters),
          })),
      })),
    };
  });

export const featuredAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .discriminatedUnion("action", [
        z.object({ brand: brandSchema, action: z.literal("enabled"), enabled: z.boolean() }),
        z.object({ brand: brandSchema, action: z.literal("run") }),
        z.object({ brand: brandSchema, action: z.literal("retry"), id: z.string().uuid() }),
      ])
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    const db = await admin(context.supabase as unknown as SupabaseClient, context.userId),
      A = featuredAdapter(data.brand);
    if (data.action === "enabled") {
      const policy = featuredPolicySchema.parse({
        enabled: data.enabled,
        authorizedAt: new Date().toISOString(),
        authorizedBy: context.userId,
        treatment: FEATURED_TREATMENT_VERSION,
        authorization:
          "Tratamento semanal das três primeiras fotos dos cinco destaques: IA orienta ajustes limitados de luz, cor e nitidez, preservando geometria, conteúdo e originais.",
      });
      const saved = await db.from(A.settings).update({ featured_policy: policy }).eq("id", true);
      if (saved.error) throw new Error("Não foi possível salvar a rotina.");
      const event = await db
        .from(A.events)
        .insert({
          kind: data.enabled ? "enabled" : "paused",
          detail: { by: context.userId, policy },
        });
      if (event.error) throw new Error("Não foi possível registrar a alteração.");
      return {
        message: data.enabled ? "Renovação semanal ativada." : "Novos tratamentos pausados.",
      };
    }
    if (data.action === "retry") {
      // A manual retry reuses the completed analysis; it never repeats an uncertain paid call.
      const retry = await db
        .from(A.photos)
        .update({ state: "queued", attempts: 0, error: null })
        .eq("id", data.id)
        .eq("state", "failed")
        .not("parameters", "is", null)
        .select("id");
      if (retry.error || !retry.data.length)
        throw new Error("Esta foto precisa de revisão da análise antes de uma nova tentativa.");
      await db
        .from(A.events)
        .insert({ photo_id: data.id, kind: "retry", detail: { by: context.userId } });
      return { message: "Nova tentativa agendada com a análise já salva." };
    }
    const { runFeatured } = await import("./featured.server");
    const result = await runFeatured(db, new Date(), data.brand);
    return {
      message:
        "skipped" in result
          ? "A rotina está pausada ou indisponível."
          : "Rotina executada. Acompanhe o estado das fotos.",
    };
  });
