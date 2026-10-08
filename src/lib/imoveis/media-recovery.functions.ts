import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isActiveRebuildCheckpoint } from "@/lib/imoveis/media-recovery-rules";

export type RecoverMediaInput = {
  propertyId: string;
  provider: "cordial" | "morar";
  /** resume = retomar envio; clean_rebuild = limpar e reenviar a galeria do site. */
  mode: "resume" | "clean_rebuild";
};

/**
 * "Reenviar fotos" — somente administrador, um imóvel + um site por vez.
 * Nunca envia nada direto: só destrava o estado e agenda o envio de fotos,
 * que segue todas as conferências anti-cópia do envio normal.
 */
export const recoverPropertyMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RecoverMediaInput) => {
    if (!input || typeof input.propertyId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.propertyId))
      throw new Error("Imóvel inválido.");
    if (input.provider !== "cordial" && input.provider !== "morar") throw new Error("Site inválido.");
    if (input.mode !== "resume" && input.mode !== "clean_rebuild") throw new Error("Ação inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin !== true) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: publication, error } = await supabaseAdmin
      .from("property_provider_publications")
      .select("id, external_property_id, enabled, media_rebuild_state")
      .eq("property_id", data.propertyId)
      .eq("provider", data.provider)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!publication?.external_property_id || publication.enabled === false)
      throw new Error("Este imóvel ainda não tem anúncio ativo neste site.");

    const { count: running, error: runningError } = await supabaseAdmin
      .from("property_sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("property_id", data.propertyId)
      .eq("provider", data.provider)
      .eq("status", "processing");
    if (runningError) throw new Error(runningError.message);
    if ((running ?? 0) > 0) throw new Error("Há um envio em andamento neste site. Tente de novo em alguns minutos.");

    if (data.mode === "clean_rebuild" && isActiveRebuildCheckpoint(publication.media_rebuild_state))
      throw new Error("Já existe uma reconstrução em andamento; ela continua sozinha.");

    const fields: Record<string, unknown> = {
      media_no_progress_runs: 0,
      media_attention_reason: null,
    };
    if (data.mode === "clean_rebuild") {
      fields["media_rebuild_state"] = {
        state: "clean_rebuild_requested",
        requested_by: context.userId,
        requested_at: new Date().toISOString(),
      };
    }
    const { error: updateError } = await supabaseAdmin
      .from("property_provider_publications")
      .update(fields as never)
      .eq("id", publication.id);
    if (updateError) throw new Error(updateError.message);

    const { queueMediaSync } = await import("@/lib/imobibrasil/media-sync.server");
    const queued = await queueMediaSync(supabaseAdmin, data.propertyId, {
      providers: [data.provider],
      requestedBy: context.userId,
    });
    // Job já na fila com espera longa (sem progresso): volta para agora.
    await supabaseAdmin
      .from("property_sync_jobs")
      .update({ next_run_at: new Date().toISOString() })
      .eq("property_id", data.propertyId)
      .eq("provider", data.provider)
      .eq("action", "media_sync")
      .in("status", ["pending", "retry"]);

    return { queued: queued.enqueued.includes(data.provider), mode: data.mode };
  });
