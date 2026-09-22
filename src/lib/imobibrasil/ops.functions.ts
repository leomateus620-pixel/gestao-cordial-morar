/**
 * Painel operacional INTERNO por imobiliária (Cordial / Morar).
 *
 * Só aparece em Integrações, para administradores — nunca no site público.
 * Distingue sempre dois estados diferentes: "registrado na API" (o site
 * confirmou os campos por leitura) e "exibido publicamente" (o anúncio tem link
 * público e está marcado para exibir).
 *
 * Nada aqui exclui anúncio, foto ou imóvel: as duplicidades são apenas
 * classificadas e devolvidas para decisão do usuário, caso a caso.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IMOBI_PROVIDER_KEYS, type ImobiProvider } from "./providers";

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const supabase = context.supabase as {
    rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }>;
  };
  const { data } = await supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (data !== true) throw new Error("Apenas administradores podem abrir o painel de integração.");
}

export type ProviderOpsSummary = {
  provider: ImobiProvider;
  /** Saúde da conexão: credencial presente e sem bloqueio recente. */
  conexao: "ok" | "sem_credencial" | "pausado" | "com_erros";
  /** Cadastro confirmado na API (campos conferidos por leitura). */
  cadastroConfirmado: number;
  /** Registrado na API mas sem exibição pública comprovada. */
  semExibicaoPublica: number;
  midiaPendente: number;
  bloqueios: number;
  conflitos: number;
  tentativasAbertas: number;
  ultimaConfirmacao: string | null;
  idadeFilaMinutos: number | null;
  leasesVencidos: number;
  resultadosAmbiguos: number;
  midiaAtrasada: number;
  circuitoAte: string | null;
};

export type ProviderOpsItem = {
  publicationId: string;
  propertyId: string;
  provider: ImobiProvider;
  titulo: string | null;
  codigo: string | null;
  externalPropertyId: string | null;
  externalReference: string | null;
  publicUrl: string | null;
  status: string;
  registradoNaApi: boolean;
  exibidoPublicamente: boolean;
  midia: string | null;
  conflitos: number;
  tentativas: number;
  motivo: string | null;
  ultimaConfirmacao: string | null;
};

type PublicationRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Resumo + lista por imobiliária. Somente leitura. */
export const getProviderOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // As colunas novas entram pela migração; os tipos Supabase versionados são
    // anteriores a ela e serão regenerados somente após aplicação no projeto.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: publications, error } = await (supabaseAdmin.from("property_provider_publications") as any)
      .select(
        "id, property_id, provider, enabled, desired_availability, status, confirmed_revision, external_property_id, external_reference, external_public_url, media_status, media_expected_count, media_synced_count, media_failed_count, conflict_count, last_error_category, last_error_message, last_verified_at, last_synced_at, last_field_verification, properties(titulo, codigo, exibir_imovel, revision)",
      )
      .order("last_verified_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .eq("key", "imobi_update_sync_paused")
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);
    const pauseUnknown = !settings || typeof (settings.value as { paused?: unknown } | null)?.paused !== "boolean";
    const pausado = Boolean((settings?.value as { paused?: boolean } | null)?.paused);

    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from("property_sync_jobs")
      .select("provider, status")
      .in("status", ["pending", "processing", "retry"]);
    if (jobsError) throw new Error(jobsError.message);
    const { data: healthRows, error: healthError } = await supabaseAdmin
      .from("property_integration_health" as never).select("*");
    if (healthError) throw new Error(healthError.message);
    const healthByProvider = new Map(
      ((healthRows ?? []) as PublicationRow[]).map((row) => [String(row["provider"]), row]),
    );
    const { data: dispatch, error: dispatchError } = await supabaseAdmin
      .from("property_worker_dispatch_health" as never)
      .select("hook, last_dispatched_at, last_response_at, last_http_status, last_transport_error, last_config_error");
    if (dispatchError) throw new Error(dispatchError.message);

    const items: ProviderOpsItem[] = (publications ?? []).map((row: PublicationRow) => {
      const property = (row["properties"] ?? {}) as Record<string, unknown>;
      const verification = (row["last_field_verification"] ?? null) as
        | { divergent?: string[]; unverifiable?: string[] }
        | null;
      const registradoNaApi =
        row["status"] === "published" && row["enabled"] === true &&
        row["desired_availability"] === "visible" &&
        Number(row["confirmed_revision"] ?? 0) >= Number(property["revision"] ?? 1) &&
        (verification?.divergent?.length ?? 0) === 0 &&
        (verification?.unverifiable?.length ?? 0) === 0;
      const publicUrl = text(row["external_public_url"]);
      return {
        publicationId: String(row["id"]),
        propertyId: String(row["property_id"]),
        provider: row["provider"] as ImobiProvider,
        titulo: text(property["titulo"]),
        codigo: text(property["codigo"]),
        externalPropertyId: text(row["external_property_id"]),
        externalReference: text(row["external_reference"]),
        publicUrl,
        status: String(row["status"] ?? "draft"),
        registradoNaApi,
        // Exibição pública é outra coisa: precisa de link e do imóvel marcado para exibir.
        exibidoPublicamente: registradoNaApi && Boolean(publicUrl) && property["exibir_imovel"] !== false,
        midia: text(row["media_status"]),
        conflitos: Number(row["conflict_count"] ?? 0),
        tentativas: 0,
        motivo: text(row["last_error_message"]),
        ultimaConfirmacao: text(row["last_verified_at"]),
      };
    });

    const summaries: ProviderOpsSummary[] = IMOBI_PROVIDER_KEYS.map((provider) => {
      const rows = items.filter((item) => item.provider === provider);
      const health = healthByProvider.get(provider) ?? {};
      const comErros = rows.filter((item) => item.motivo).length;
      const bloqueios = (publications ?? []).filter(
        (row: PublicationRow) =>
          row["provider"] === provider &&
          (row["last_error_category"] === "config" || row["enabled"] === false),
      ).length;
      const tentativas = (jobs ?? []).filter((job) => job.provider === provider).length;
      return {
        provider,
        conexao: pauseUnknown
          ? "com_erros"
          : pausado
          ? "pausado"
          : bloqueios
            ? "sem_credencial"
            : comErros
              ? "com_erros"
              : "ok",
        cadastroConfirmado: rows.filter((item) => item.registradoNaApi).length,
        semExibicaoPublica: rows.filter((item) => item.registradoNaApi && !item.exibidoPublicamente)
          .length,
        midiaPendente: rows.filter((item) => item.midia && item.midia !== "synced").length,
        bloqueios,
        conflitos: rows.reduce((total, item) => total + item.conflitos, 0),
        tentativasAbertas: tentativas,
        ultimaConfirmacao: rows.find((item) => item.ultimaConfirmacao)?.ultimaConfirmacao ?? null,
        idadeFilaMinutos: health["oldest_open_minutes"] == null ? null : Number(health["oldest_open_minutes"]),
        leasesVencidos: Number(health["expired_leases"] ?? 0),
        resultadosAmbiguos: Number(health["ambiguous_jobs"] ?? 0),
        midiaAtrasada: Number(health["media_behind"] ?? 0),
        circuitoAte: text(health["blocked_until"]),
      };
    });

    return { summaries, items, pausado, pauseUnknown, dispatch: dispatch ?? [] };
  });

/** Divergências campo a campo aguardando conferência. */
export const listFieldConflicts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("property_field_conflicts")
      .select(
        "id, property_id, provider, field, confirmed_value, local_value, remote_value, applied_value, resolution, created_at, properties(titulo, codigo)",
      )
      .eq("resolution", "pending")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: PublicationRow) => {
      const property = (row["properties"] ?? {}) as Record<string, unknown>;
      return {
        id: String(row["id"]),
        propertyId: String(row["property_id"]),
        provider: row["provider"] as ImobiProvider,
        titulo: text(property["titulo"]),
        codigo: text(property["codigo"]),
        campo: String(row["field"]),
        valorGestao: row["local_value"] ?? null,
        valorSite: row["remote_value"] ?? null,
        valorAplicado: row["applied_value"] ?? null,
        detectadoEm: text(row["created_at"]),
      };
    });
  });

export type DuplicateClass =
  | "duplicacao_local"
  | "ids_diferentes_mesma_conta"
  | "repeticao_visual"
  | "publicacao_legitima_nas_duas";

/**
 * Diagnóstico classificado das duplicações. SOMENTE LEITURA: nada é excluído
 * automaticamente, e nem endereço parecido nem contagem de cards servem de prova.
 */
export const listDuplicateDiagnosis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("property_provider_publications")
      .select(
        "id, property_id, provider, external_property_id, external_reference, external_public_url, create_state, remote_match_count, remote_match_ids, media_remote_count, properties(titulo, codigo)",
      )
      .limit(1000);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const byProperty = new Map<string, PublicationRow[]>();
    for (const row of rows as PublicationRow[]) {
      const key = String(row["property_id"]);
      byProperty.set(key, [...(byProperty.get(key) ?? []), row]);
    }

    const diagnosis: Array<{
      propertyId: string;
      titulo: string | null;
      codigo: string | null;
      classificacao: DuplicateClass;
      explicacao: string;
      vinculos: Array<{
        provider: ImobiProvider;
        externalPropertyId: string | null;
        externalReference: string | null;
        publicUrl: string | null;
        fotosNoSite: number | null;
        idsRepetidos: string[];
      }>;
    }> = [];

    for (const [propertyId, list] of byProperty) {
      const property = (list[0]?.["properties"] ?? {}) as Record<string, unknown>;
      const vinculos = list.map((row) => ({
        provider: row["provider"] as ImobiProvider,
        externalPropertyId: text(row["external_property_id"]),
        externalReference: text(row["external_reference"]),
        publicUrl: text(row["external_public_url"]),
        fotosNoSite: row["media_remote_count"] === null ? null : Number(row["media_remote_count"]),
        idsRepetidos: Array.isArray(row["remote_match_ids"])
          ? (row["remote_match_ids"] as string[])
          : [],
      }));

      const sameAccountDuplicate = list.find((row) => Number(row["remote_match_count"] ?? 0) > 1);
      const providers = new Set(vinculos.map((v) => v.provider));

      let classificacao: DuplicateClass = "publicacao_legitima_nas_duas";
      let explicacao =
        "Um anúncio em cada imobiliária, com IDs próprios. É publicação legítima nas duas contas.";
      if (sameAccountDuplicate) {
        classificacao = "ids_diferentes_mesma_conta";
        explicacao =
          "A mesma referência responde por mais de um anúncio na mesma imobiliária. Precisa de conferência manual antes de qualquer remoção.";
      } else if (providers.size === 1 && list.length > 1) {
        classificacao = "duplicacao_local";
        explicacao =
          "Mais de um vínculo local para a mesma imobiliária. Revisar qual deve permanecer.";
      } else if (list.some((row) => row["create_state"] === "awaiting_create_reconcile")) {
        classificacao = "repeticao_visual";
        explicacao =
          "Criação sem resposta confirmada: pode aparecer repetido no site sem duplicar o cadastro.";
      }

      if (classificacao === "publicacao_legitima_nas_duas" && providers.size < 2) continue;

      diagnosis.push({
        propertyId,
        titulo: text(property["titulo"]),
        codigo: text(property["codigo"]),
        classificacao,
        explicacao,
        vinculos,
      });
    }

    return diagnosis.filter((row) => row.classificacao !== "publicacao_legitima_nas_duas");
  });
