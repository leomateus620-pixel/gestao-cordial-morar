/**
 * Controle de acompanhamento da limpeza de "pontos fortes".
 *
 * Só leitura da API (GET). Nenhuma função aqui envia dados aos sites.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isImobiProvider, type ImobiProvider } from "@/lib/imobibrasil/providers";

export type HotspotCleanupRow = {
  id: string;
  propertyId: string;
  provider: ImobiProvider;
  codigo: string | null;
  externalId: string;
  publicUrl: string | null;
  publicationStatus: string | null;
  remotePontosFortes: string | null;
  localPontosFortes: string | null;
  localInternalText: string | null;
  expectedFinal: string;
  classification: string;
  state: string;
  priority: number;
  lastCheckedAt: string | null;
  checkResult: Record<string, unknown> | null;
};

export type HotspotCleanupSummary = {
  total: number;
  byProvider: Record<string, number>;
  byState: Record<string, number>;
  byPublicationStatus: Record<string, number>;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Acesso restrito à administração.");
}

function toRow(record: Record<string, any>): HotspotCleanupRow {
  return {
    id: record["id"],
    propertyId: record["property_id"],
    provider: record["provider"],
    codigo: record["codigo"] ?? null,
    externalId: record["external_id"],
    publicUrl: record["public_url"] ?? null,
    publicationStatus: record["publication_status"] ?? null,
    remotePontosFortes: record["remote_pontos_fortes"] ?? null,
    localPontosFortes: record["local_pontos_fortes"] ?? null,
    localInternalText: record["local_internal_text"] ?? null,
    expectedFinal: record["expected_final"] ?? "",
    classification: record["classification"],
    state: record["state"],
    priority: record["priority"] ?? 0,
    lastCheckedAt: record["last_checked_at"] ?? null,
    checkResult: record["check_result"] ?? null,
  };
}

export type ListHotspotCleanupInput = {
  provider?: string | null;
  state?: string | null;
  publicationStatus?: string | null;
  search?: string | null;
  limit?: number;
};

export const listHotspotCleanup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ListHotspotCleanupInput | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = (context as never as { supabase: any }).supabase;

    let query = supabase
      .from("property_hotspot_cleanup")
      .select("*")
      .order("priority", { ascending: false })
      .order("provider", { ascending: true })
      .order("codigo", { ascending: true })
      .limit(Math.min(Math.max(data.limit ?? 500, 1), 1000));

    if (data.provider && isImobiProvider(data.provider)) query = query.eq("provider", data.provider);
    if (data.state) query = query.eq("state", data.state);
    if (data.publicationStatus) query = query.eq("publication_status", data.publicationStatus);
    if (data.search?.trim()) {
      const term = data.search.trim();
      query = query.or(`codigo.ilike.%${term}%,external_id.ilike.%${term}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { data: all, error: allError } = await supabase
      .from("property_hotspot_cleanup")
      .select("provider, state, publication_status");
    if (allError) throw new Error(allError.message);

    const summary: HotspotCleanupSummary = {
      total: all?.length ?? 0,
      byProvider: {},
      byState: {},
      byPublicationStatus: {},
    };
    for (const item of all ?? []) {
      summary.byProvider[item.provider] = (summary.byProvider[item.provider] ?? 0) + 1;
      summary.byState[item.state] = (summary.byState[item.state] ?? 0) + 1;
      const status = item.publication_status ?? "desconhecido";
      summary.byPublicationStatus[status] = (summary.byPublicationStatus[status] ?? 0) + 1;
    }

    return { rows: (rows ?? []).map(toRow), summary };
  });

/** Marca como "limpo manualmente" (ou volta para pendente). Nenhum envio ao site. */
export const setHotspotCleanupState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; state: "pendente" | "limpo_manual" }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = (context as never as { supabase: any; userId: string }).supabase;
    const userId = (context as never as { userId: string }).userId;
    const { error } = await supabase
      .from("property_hotspot_cleanup")
      .update({
        state: data.state,
        marked_cleaned_at: data.state === "limpo_manual" ? new Date().toISOString() : null,
        marked_cleaned_by: data.state === "limpo_manual" ? userId : null,
        check_result: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { state: data.state };
  });

/**
 * Reconferência por GET: confirma que o texto interno saiu, que o conteúdo
 * público legítimo continua lá e que nenhum outro campo do anúncio mudou.
 */
export const recheckHotspotCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const ids = data.ids.slice(0, 20);
    if (!ids.length) return { checked: [] as Array<{ id: string; state: string; ok: boolean; reasons: string[] }> };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recheckRemote } = await import("./hotspot-cleanup.server");

    const { data: rows, error } = await supabaseAdmin
      .from("property_hotspot_cleanup")
      .select("*")
      .in("id", ids);
    if (error) throw new Error(error.message);

    const checked: Array<{ id: string; state: string; ok: boolean; reasons: string[] }> = [];
    for (const row of (rows ?? []) as Array<Record<string, any>>) {
      try {
        const { result, record } = await recheckRemote({
          provider: row["provider"],
          externalId: row["external_id"],
          expectedFinal: row["expected_final"] ?? "",
          snapshot: (row["remote_snapshot"] ?? null) as Record<string, unknown> | null,
        });
        const state = result.ok ? "reconferido" : "pendente";
        await supabaseAdmin
          .from("property_hotspot_cleanup")
          .update({
            state,
            last_checked_at: result.checkedAt,
            check_result: result as never,
            remote_pontos_fortes: result.remotePontosFortes,
            // O retrato só é atualizado quando a conferência passou: assim a
            // próxima comparação continua valendo contra o estado aprovado.
            ...(result.ok ? { remote_snapshot: record as never } : {}),
          })
          .eq("id", row["id"]);
        const reasons: string[] = [];
        if (!result.internalGone) reasons.push("texto interno ainda aparece no site");
        if (!result.legitPreserved) reasons.push("conteúdo público legítimo não confere");
        if (result.changedFields.length)
          reasons.push(`outros campos mudaram: ${result.changedFields.join(", ")}`);
        checked.push({ id: row["id"], state, ok: result.ok, reasons });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "falha na consulta";
        await supabaseAdmin
          .from("property_hotspot_cleanup")
          .update({
            last_checked_at: new Date().toISOString(),
            check_result: { ok: false, error: message },
          })
          .eq("id", row["id"]);
        checked.push({ id: row["id"], state: row["state"], ok: false, reasons: [message] });
      }
    }
    return { checked };
  });

/** Auditoria em dry-run do `/imovel/alterar`. Nunca envia nada. */
export const dryRunHotspotAlterarAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildDryRunReport } = await import("./hotspot-cleanup.server");

    const { data: row, error } = await supabaseAdmin
      .from("property_hotspot_cleanup")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Registro não encontrado.");

    return buildDryRunReport(
      supabaseAdmin as never,
      (row as Record<string, any>)["property_id"],
      (row as Record<string, any>)["provider"],
      (row as Record<string, any>)["external_id"],
    );
  });
