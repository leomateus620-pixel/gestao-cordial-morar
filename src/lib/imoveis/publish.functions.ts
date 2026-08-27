import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IMOBI_PROVIDER_KEYS, isImobiProvider, type ImobiProvider } from "@/lib/imobibrasil/providers";

export type SyncAction = "publish" | "update" | "unpublish" | "delete" | "reconcile";

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
  activeJob: { id: string; action: string; status: string; attempts: number } | null;
};

function sanitizeProviders(input: unknown): ImobiProvider[] {
  const list = Array.isArray(input) ? input : [];
  const filtered = list.filter(isImobiProvider);
  return Array.from(new Set(filtered));
}

/** Escopo do usuário: admin publica em ambos; demais apenas nas carteiras vinculadas. */
async function assertProviderScope(
  supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }>; from: (t: "user_agencies") => { select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: Array<{ agency: string }> | null }> } } },
  userId: string,
  providers: ImobiProvider[],
): Promise<{ isAdmin: boolean }> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin === true) return { isAdmin: true };
  const { data: agencies } = await supabase.from("user_agencies").select("agency").eq("user_id", userId);
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
      process.env["PROPERTY_SYNC_WORKER_SECRET"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!secret) return;
    const request = getRequest();
    const origin = request?.url ? new URL(request.url).origin : null;
    if (!origin) return;
    await fetch(`${origin}/api/public/hooks/property-sync-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: secret },
      body: JSON.stringify({ limit: 3 }),
    });
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

    if (action === "publish" || action === "update") {
      const { data: pendingImages } = await context.supabase
        .from("property_images")
        .select("id, file_name, processing_status")
        .eq("property_id", property.id)
        .in("processing_status", ["pending", "failed"]);
      if (pendingImages?.length) {
        const names = pendingImages
          .slice(0, 3)
          .map((image: { file_name: string }) => image.file_name)
          .join(", ");
        throw new Error(
          `Aguardando a marca-d'água em ${pendingImages.length} foto(s): ${names}. Reprocesse ou remova antes de publicar.`,
        );
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildExternalReference } = await import("@/lib/imobibrasil/serializers");

    // Destinos escolhidos definem a marca aplicada nas fotos.
    const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
    if (action === "publish" || action === "update") {
      await supabaseAdmin.from("properties").update({ publish_targets: providers }).eq("id", property.id);
      await enqueueImageJobs(supabaseAdmin, property.id, { targets: providers });
    }

    for (const provider of providers) {
      await supabaseAdmin.from("property_provider_publications").upsert(
        {
          property_id: property.id,
          provider,
          enabled: action !== "unpublish" && action !== "delete",
          external_reference: buildExternalReference(property.id),
          status: action === "unpublish" ? "pending" : "pending",
        },
        { onConflict: "property_id,provider", ignoreDuplicates: true },
      );
      await supabaseAdmin.from("property_sync_jobs").upsert(
        {
          property_id: property.id,
          provider,
          action,
          requested_revision: property.revision ?? 1,
          requested_by: context.userId,
          status: "pending",
          next_run_at: new Date().toISOString(),
        },
        { onConflict: "property_id,provider,action,requested_revision", ignoreDuplicates: false },
      );
    }

    await supabaseAdmin.from("properties").update({ is_draft: false }).eq("id", property.id);
    await kickWorker();
    return { enqueued: providers };
  });

export const getPropertySyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data, context }): Promise<PublicationStatusView[]> => {
    const [{ data: publications }, { data: jobs }] = await Promise.all([
      context.supabase
        .from("property_provider_publications")
        .select("*")
        .eq("property_id", data.propertyId),
      context.supabase
        .from("property_sync_jobs")
        .select("id, provider, action, status, attempts")
        .eq("property_id", data.propertyId)
        .in("status", ["pending", "processing", "retry"]),
    ]);

    const jobIndex = new Map((jobs ?? []).map((job) => [job.provider, job]));
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
      activeJob: jobIndex.get(row.provider) ?? null,
    }));
  });

export const retryPropertySync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; provider: string }) => data)
  .handler(async ({ data, context }) => {
    const providers = sanitizeProviders([data.provider]);
    if (!providers.length) throw new Error("Destino inválido.");
    await assertProviderScope(context.supabase as never, context.userId, providers);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("property_sync_jobs")
      .update({ status: "retry", next_run_at: new Date().toISOString(), attempts: 0 })
      .eq("property_id", data.propertyId)
      .eq("provider", providers[0]!)
      .in("status", ["failed", "retry", "cancelled"]);
    await kickWorker();
    return { ok: true };
  });

export const reconcileProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; provider: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin !== true) throw new Error("Apenas administradores podem reconciliar publicações.");
    const providers = sanitizeProviders([data.provider]);
    if (!providers.length) throw new Error("Destino inválido.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("revision")
      .eq("id", data.propertyId)
      .maybeSingle();
    await supabaseAdmin.from("property_sync_jobs").upsert(
      {
        property_id: data.propertyId,
        provider: providers[0]!,
        action: "reconcile",
        requested_revision: property?.revision ?? 1,
        requested_by: context.userId,
        status: "pending",
        next_run_at: new Date().toISOString(),
      },
      { onConflict: "property_id,provider,action,requested_revision" },
    );
    await kickWorker();
    return { ok: true };
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
    const accounts = await Promise.all(IMOBI_PROVIDER_KEYS.map((provider) => fetchAccountStatus(provider)));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: pending }, { count: failed }, { data: recent }] = await Promise.all([
      supabaseAdmin
        .from("property_sync_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing", "retry"]),
      supabaseAdmin.from("property_sync_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabaseAdmin
        .from("property_sync_jobs")
        .select("id, property_id, provider, action, status, attempts, last_error_message, updated_at")
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    return {
      accounts,
      queue: { pending: pending ?? 0, failed: failed ?? 0 },
      recent: recent ?? [],
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
  .inputValidator((data: { provider: string; kind: "city" | "property_type" | "characteristic" }) => data)
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
