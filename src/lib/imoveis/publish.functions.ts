import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  IMOBI_PROVIDER_KEYS,
  isImobiProvider,
  type ImobiProvider,
} from "@/lib/imobibrasil/providers";
import { workerCallerSecret } from "@/lib/workers/hook-auth";

export type SyncAction =
  | "publish"
  | "update"
  | "unpublish"
  | "delete"
  | "reconcile"
  /** Somente fotos: caminho independente da trava de alteração cadastral. */
  | "media_sync";

export type PublicationStatusView = {
  provider: ImobiProvider;
  enabled: boolean;
  status: string;
  externalPropertyId: string | null;
  externalReference: string;
  externalPublicUrl: string | null;
  lastSyncedAt: string | null;
  lastVerifiedAt: string | null;
  lastErrorMessage: string | null;
  activeJob: {
    id: string;
    action: string;
    status: string;
    attempts: number;
    errorCategory: string | null;
    nextRunAt: string | null;
  } | null;
  /** Categoria do último erro (config = bloqueado por pausa/credencial). */
  lastErrorCategory: string | null;
  /** Estado só das fotos, independente do cadastro. */
  media: {
    status: string | null;
    desiredRevision: number | null;
    confirmedRevision: number | null;
    orderGuarantee: string | null;
    expectedCount: number | null;
    syncedCount: number | null;
    failedCount: number | null;
    remoteCount: number | null;
    lastSyncedAt: string | null;
    lastVerifiedAt: string | null;
  };
  /** Cadastro por destino: revisão salva aqui x confirmada no site. */
  cadastro: {
    localRevision: number | null;
    savedAt: string | null;
    confirmedRevision: number | null;
    divergent: string[];
    unverifiable: string[];
    conflictCount: number;
  };
  /** Características por destino, separadas do cadastro. */
  characteristics: { syncedAt: string | null; incomplete: boolean; count: number };
  /** Conferência da referência no site: quantos anúncios respondem por ela. */
  remote: {
    createState: string | null;
    matchCount: number | null;
    matchIds: string[];
    checkedAt: string | null;
  };
};

function sanitizeProviders(input: unknown): ImobiProvider[] {
  const list = Array.isArray(input) ? input : [];
  const filtered = list.filter(isImobiProvider);
  return Array.from(new Set(filtered));
}

/** Escopo do usuário: admin publica em ambos; demais apenas nas carteiras vinculadas. */
async function assertProviderScope(
  supabase: {
    rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }>;
    from: (t: "user_agencies") => {
      select: (c: string) => {
        eq: (c: string, v: string) => Promise<{ data: Array<{ agency: string }> | null }>;
      };
    };
  },
  userId: string,
  providers: ImobiProvider[],
): Promise<{ isAdmin: boolean }> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin === true) return { isAdmin: true };
  const { data: agencies } = await supabase
    .from("user_agencies")
    .select("agency")
    .eq("user_id", userId);
  const allowed = new Set((agencies ?? []).map((row) => row.agency));
  const denied = providers.filter((provider) => !allowed.has(provider) && !allowed.has("ambas"));
  if (denied.length) {
    throw new Error(`Sem permissão para publicar em: ${denied.join(", ")}.`);
  }
  return { isAdmin: false };
}

async function kickWorker() {
  try {
    const secret =
      workerCallerSecret();
    if (!secret) return;
    const request = getRequest();
    const origin = request?.url ? new URL(request.url).origin : null;
    if (!origin) return;
    // Lote maior + drenagem: o worker repete o ciclo enquanto sobrar job
    // pendente, para a fila não ficar parada esperando o pg_cron.
    // Cadastro e fotos têm workers separados: mídia é lenta e não pode
    // derrubar o request que está publicando o cadastro.
    await fetch(`${origin}/api/public/hooks/property-sync-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: secret },
      body: JSON.stringify({ limit: 10, drain: true }),
    });
    try {
      await fetch(`${origin}/api/public/hooks/property-media-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: secret },
        body: JSON.stringify({ passes: 2 }),
        signal: AbortSignal.timeout(1500),
      });
    } catch {
      // o cron da fila de fotos processa no próximo ciclo
    }

  } catch {
    // A fila persistente é a garantia; o pg_cron reprocessa no próximo ciclo.
  }
}

export type EnqueueSyncInput = {
  propertyId: string;
  providers: string[];
  action?: SyncAction;
};

export const enqueuePropertySync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: EnqueueSyncInput) => data)
  .handler(async ({ data, context }) => {
    const providers = sanitizeProviders(data.providers);
    if (!providers.length) throw new Error("Selecione ao menos um destino de publicação.");
    const action: SyncAction = data.action ?? "publish";
    await assertProviderScope(context.supabase as never, context.userId, providers);

    const { data: property, error: propertyError } = await context.supabase
      .from("properties")
      .select("id, revision, is_draft")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    if (!property) throw new Error("Imóvel não encontrado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildExternalReference } = await import("@/lib/imobibrasil/serializers");
    if (!["publish", "update", "unpublish", "delete"].includes(action)) {
      throw new Error("Ação de publicação inválida.");
    }
    // Uma única transação fixa a decisão de disponibilidade, a revisão e as
    // intenções por destino. O request HTTP abaixo só acelera o worker.
    const { data: requested, error: requestError } = await supabaseAdmin.rpc(
      "property_publication_request" as never,
      {
        _property_id: property.id,
        _providers: providers,
        _action: action,
        _requested_by: context.userId,
        _external_reference: buildExternalReference(property.id),
        _expected_revision: null,
      } as never,
    );
    if (requestError) throw new Error(requestError.message);
    if (!(requested as { ok?: boolean } | null)?.ok) {
      throw new Error("Não foi possível persistir a decisão de publicação.");
    }
    await kickWorker();
    return { enqueued: providers, durable: true };

  });

export const getPropertySyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data, context }): Promise<PublicationStatusView[]> => {
    const [publicationResult, jobResult, propertyResult] = await Promise.all([
      context.supabase
        .from("property_provider_publications")
        .select("*")
        .eq("property_id", data.propertyId),
      context.supabase
        .from("property_sync_jobs")
        .select("id, provider, action, status, attempts, last_error_category, next_run_at")
        .eq("property_id", data.propertyId)
        .in("status", ["pending", "processing", "retry"]),
      context.supabase
        .from("properties")
        .select("revision, gallery_revision, updated_at")
        .eq("id", data.propertyId)
        .maybeSingle(),
    ]);
    for (const result of [publicationResult, jobResult, propertyResult]) {
      if (result.error) throw new Error(result.error.message);
    }
    const publications = publicationResult.data;
    const jobs = jobResult.data;
    const prop = propertyResult.data;
    const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

    const jobIndex = new Map(
      (jobs ?? []).map((job) => [
        job.provider,
        {
          id: job.id,
          action: job.action,
          status: job.status,
          attempts: job.attempts,
          errorCategory: job.last_error_category ?? null,
          nextRunAt: job.next_run_at ?? null,
        },
      ]),
    );
    return (publications ?? []).map((row) => ({
      provider: row.provider as ImobiProvider,
      enabled: row.enabled,
      status: row.status,
      externalPropertyId: row.external_property_id,
      externalReference: row.external_reference,
      externalPublicUrl: row.external_public_url,
      lastSyncedAt: row.last_synced_at,
      lastVerifiedAt: row.last_verified_at,
      lastErrorMessage: row.last_error_message,
      lastErrorCategory: row.last_error_category ?? null,
      activeJob: jobIndex.get(row.provider) ?? null,
      media: {
        status: row.media_status ?? null,
        desiredRevision: (prop as { gallery_revision?: number } | null)?.gallery_revision ?? null,
        confirmedRevision: row.synced_gallery_revision ?? null,
        orderGuarantee: row.media_order_guarantee ?? null,
        expectedCount: row.media_expected_count ?? null,
        syncedCount: row.media_synced_count ?? null,
        failedCount: row.media_failed_count ?? null,
        remoteCount: row.media_remote_count ?? null,
        lastSyncedAt: row.last_media_synced_at ?? null,
        lastVerifiedAt: row.last_media_verified_at ?? null,
      },
      cadastro: {
        localRevision: (prop as { revision?: number } | null)?.revision ?? null,
        savedAt: (prop as { updated_at?: string } | null)?.updated_at ?? null,
        confirmedRevision: row.confirmed_revision ?? null,
        divergent: list((row.last_field_verification as { divergent?: unknown } | null)?.divergent),
        unverifiable: list((row.last_field_verification as { unverifiable?: unknown } | null)?.unverifiable),
        conflictCount: row.conflict_count ?? 0,
      },
      characteristics: {
        syncedAt: row.characteristic_synced_at ?? null,
        incomplete: row.characteristic_sync_incomplete === true,
        count: Array.isArray(row.characteristic_codes) ? row.characteristic_codes.length : 0,
      },
      remote: {
        createState: row.create_state ?? null,
        matchCount: row.remote_match_count ?? null,
        matchIds: Array.isArray(row.remote_match_ids)
          ? (row.remote_match_ids as string[]).map(String)
          : [],
        checkedAt: row.remote_match_checked_at ?? null,
      },
    }));
  });

/** Painel de saúde: `/account/status` dos provedores + fila. Somente administradores. */
export const getProvidersHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin !== true) throw new Error("Acesso restrito a administradores.");

    const { fetchAccountStatus } = await import("@/lib/imobibrasil/catalogs.server");
    const accountChecks = await Promise.allSettled(
      IMOBI_PROVIDER_KEYS.map((provider) => fetchAccountStatus(provider)),
    );
    const accounts = accountChecks.map((check, index) => check.status === "fulfilled"
      ? check.value
      : { provider: IMOBI_PROVIDER_KEYS[index], ok: false, configured: null,
          message: "Não foi possível consultar a conta neste momento." });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [pendingRows, failedRows, recentRows] = await Promise.all([
      supabaseAdmin
        .from("property_sync_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing", "retry"]),
      supabaseAdmin
        .from("property_sync_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabaseAdmin
        .from("property_sync_jobs")
        .select(
          "id, property_id, provider, action, status, attempts, last_error_message, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);
    const queueError = pendingRows.error ?? failedRows.error ?? recentRows.error;
    if (queueError) throw new Error(queueError.message);

    return {
      accounts,
      queue: { pending: pendingRows.count ?? 0, failed: failedRows.count ?? 0 },
      recent: recentRows.data ?? [],
    };
  });

/** Atualiza o cache de catálogos do provedor. Read-only na API externa. */
export const refreshProviderCatalogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin !== true) throw new Error("Acesso restrito a administradores.");
    if (!isImobiProvider(data.provider)) throw new Error("Provedor inválido.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshProviderCatalogs: refresh } = await import("@/lib/imobibrasil/catalogs.server");
    return refresh(supabaseAdmin, data.provider);
  });

/** Catálogos em cache para alimentar os selects do formulário. */
export const listProviderCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { provider: string; kind: "city" | "property_type" | "characteristic" }) => data,
  )
  .handler(async ({ data, context }) => {
    if (!isImobiProvider(data.provider)) throw new Error("Provedor inválido.");
    const { data: rows, error } = await context.supabase
      .from("provider_catalog_items")
      .select("external_code, label, group_name")
      .eq("provider", data.provider)
      .eq("kind", data.kind)
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Ferramenta administrativa SOMENTE LEITURA: lista as referências que o site
 * responde com mais de um anúncio, além das criações que ficaram sem resposta
 * confirmada. Não publica, não altera e não exclui nada — serve para decidir
 * manualmente, no painel do site, qual anúncio permanece.
 */
export const listRemoteDuplicateReferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem conferir duplicidades.");

    const { data, error } = await context.supabase
      .from("property_provider_publications")
      .select(
        "property_id, provider, external_reference, external_property_id, create_state, remote_match_count, remote_match_ids, remote_match_checked_at, properties(titulo)",
      )
      .or("remote_match_count.gt.1,create_state.not.is.null")
      .order("remote_match_checked_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      propertyId: row.property_id as string,
      titulo:
        (row as { properties?: { titulo?: string | null } | null }).properties?.titulo ?? null,
      provider: row.provider as ImobiProvider,
      reference: row.external_reference as string,
      canonicalId: row.external_property_id as string | null,
      createState: (row.create_state ?? null) as string | null,
      matchCount: (row.remote_match_count ?? null) as number | null,
      matchIds: Array.isArray(row.remote_match_ids)
        ? (row.remote_match_ids as string[]).map(String)
        : [],
      checkedAt: (row.remote_match_checked_at ?? null) as string | null,
    }));
  });
