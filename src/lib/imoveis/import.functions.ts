import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IMOBI_PROVIDER_KEYS, isImobiProvider, type ImobiProvider } from "@/lib/imobibrasil/providers";

export type ImportMode = "dry_run" | "commit" | "incremental";
export type ConflictResolution = "link_only" | "update_local" | "create_separate" | "ignore";
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };


export type ImportRunView = {
  id: string;
  provider: ImobiProvider;
  mode: ImportMode;
  status: string;
  pagesDiscovered: number;
  pagesProcessed: number;
  propertiesDiscovered: number;
  propertiesCreated: number;
  propertiesLinked: number;
  propertiesAmbiguous: number;
  propertiesErrored: number;
  imagesDiscovered: number;
  imagesImported: number;
  imagesErrored: number;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  pendingJobs: number;
  failedJobs: number;
};

export type ImportOverview = {
  runs: ImportRunView[];
  linked: Array<{ provider: ImobiProvider; linked: number; published: number; outOfSync: number }>;
  conflicts: number;
};

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data: isAdmin } = await (context.supabase.rpc as (fn: string, args: unknown) => Promise<{ data: unknown }>)(
    "has_role",
    { _user_id: context.userId, _role: "admin" },
  );
  if (isAdmin !== true) throw new Error("Acesso restrito a administradores.");
}

async function kickImportWorker() {
  try {
    const secret = process.env["PROPERTY_SYNC_WORKER_SECRET"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!secret) return;
    const request = getRequest();
    const origin = request?.url ? new URL(request.url).origin : null;
    if (!origin) return;
    await fetch(`${origin}/api/public/hooks/property-import-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: secret },
      body: JSON.stringify({ limit: 4, chain: true }),
    });
  } catch {
    // A fila é persistente: o próximo ciclo do worker retoma do checkpoint.
  }
}

export const startPropertyImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { providers: string[]; mode: ImportMode }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const providers = (data.providers ?? []).filter(isImobiProvider);
    if (!providers.length) throw new Error("Selecione ao menos um site.");
    const mode: ImportMode = data.mode === "commit" || data.mode === "incremental" ? data.mode : "dry_run";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startImportRun } = await import("@/lib/imobibrasil/import.server");

    const started: Array<{ provider: ImobiProvider; runId: string }> = [];
    const failed: Array<{ provider: ImobiProvider; error: string }> = [];
    for (const provider of providers) {
      try {
        const run = await startImportRun(supabaseAdmin, {
          provider,
          mode,
          requestedBy: context.userId,
        });
        started.push({ provider, runId: run.id as string });
      } catch (error) {
        // Falha em um site nunca bloqueia o outro.
        failed.push({ provider, error: (error as Error).message });
      }
    }
    if (started.length) await kickImportWorker();
    return { started, failed };
  });

export const getImportOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportOverview> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const runs: ImportRunView[] = [];
    for (const provider of IMOBI_PROVIDER_KEYS) {
      const { data: run } = await supabaseAdmin
        .from("property_import_runs")
        .select("*")
        .eq("provider", provider)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!run) continue;
      const [{ count: pending }, { count: failedJobs }] = await Promise.all([
        supabaseAdmin
          .from("property_import_jobs")
          .select("id", { count: "exact", head: true })
          .eq("run_id", run.id)
          .in("status", ["pending", "processing", "retry"]),
        supabaseAdmin
          .from("property_import_jobs")
          .select("id", { count: "exact", head: true })
          .eq("run_id", run.id)
          .eq("status", "failed"),
      ]);
      runs.push({
        id: run.id,
        provider,
        mode: run.mode as ImportMode,
        status: run.status,
        pagesDiscovered: run.pages_discovered,
        pagesProcessed: run.pages_processed,
        propertiesDiscovered: run.properties_discovered,
        propertiesCreated: run.properties_created,
        propertiesLinked: run.properties_linked,
        propertiesAmbiguous: run.properties_ambiguous,
        propertiesErrored: run.properties_errored,
        imagesDiscovered: run.images_discovered,
        imagesImported: run.images_imported,
        imagesErrored: run.images_errored,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        updatedAt: run.updated_at,
        pendingJobs: pending ?? 0,
        failedJobs: failedJobs ?? 0,
      });
    }

    const linked = await Promise.all(
      IMOBI_PROVIDER_KEYS.map(async (provider) => {
        const [{ count: total }, { count: published }, { count: outOfSync }] = await Promise.all([
          supabaseAdmin
            .from("property_provider_publications")
            .select("id", { count: "exact", head: true })
            .eq("provider", provider),
          supabaseAdmin
            .from("property_provider_publications")
            .select("id", { count: "exact", head: true })
            .eq("provider", provider)
            .eq("status", "published"),
          supabaseAdmin
            .from("property_provider_publications")
            .select("id", { count: "exact", head: true })
            .eq("provider", provider)
            .eq("status", "out_of_sync"),
        ]);
        return {
          provider,
          linked: total ?? 0,
          published: published ?? 0,
          outOfSync: outOfSync ?? 0,
        };
      }),
    );

    const { count: conflicts } = await supabaseAdmin
      .from("property_import_candidates")
      .select("id", { count: "exact", head: true })
      .in("status", ["ambiguous", "probable_match", "external_discovered"]);

    return { runs, linked, conflicts: conflicts ?? 0 };
  });

export const controlPropertyImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string; action: "pause" | "resume" | "cancel" | "retry_errors" }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "retry_errors") {
      await supabaseAdmin
        .from("property_import_jobs")
        .update({ status: "retry", attempts: 0, next_run_at: new Date().toISOString() })
        .eq("run_id", data.runId)
        .eq("status", "failed");
      await supabaseAdmin.from("property_import_runs").update({ status: "running" }).eq("id", data.runId);
      await kickImportWorker();
      return { ok: true };
    }

    const status = data.action === "pause" ? "paused" : data.action === "resume" ? "running" : "cancelled";
    await supabaseAdmin
      .from("property_import_runs")
      .update({
        status,
        ...(status === "cancelled" ? { finished_at: new Date().toISOString() } : {}),
      })
      .eq("id", data.runId);
    if (status === "running") await kickImportWorker();
    return { ok: true };
  });

export type ImportConflictView = {
  id: string;
  provider: ImobiProvider;
  externalPropertyId: string;
  externalReference: string | null;
  status: string;
  matchReason: string | null;
  matchConfidence: number | null;
  remote: Record<string, JsonValue>;
  local: Record<string, JsonValue> | null;

};

export const listImportConflicts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId?: string | null } | undefined) => data ?? {})
  .handler(async ({ data, context }): Promise<ImportConflictView[]> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("property_import_candidates")
      .select("*")
      .in("status", ["ambiguous", "probable_match", "external_discovered"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.runId) query = query.eq("run_id", data.runId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set((rows ?? []).map((row) => row.match_property_id).filter((id): id is string => !!id)),
    );
    const locals = new Map<string, Record<string, JsonValue>>();
    if (ids.length) {
      const { data: properties } = await supabaseAdmin.from("properties").select("*").in("id", ids);
      for (const property of properties ?? []) locals.set(property.id, property as unknown as Record<string, JsonValue>);
    }

    return (rows ?? []).map((row) => ({
      id: row.id,
      provider: row.provider as ImobiProvider,
      externalPropertyId: row.external_property_id,
      externalReference: row.external_reference,
      status: row.status,
      matchReason: row.match_reason,
      matchConfidence: row.match_confidence,
      remote: (row.normalized ?? {}) as unknown as Record<string, JsonValue>,
      local: row.match_property_id ? (locals.get(row.match_property_id) ?? null) : null,
    }));
  });

export const resolveImportConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { candidateId: string; resolution: ConflictResolution }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { commitCandidate } = await import("@/lib/imobibrasil/import.server");
    const result = await commitCandidate(supabaseAdmin, data.candidateId, data.resolution, context.userId);
    await kickImportWorker();
    return result;
  });

/**
 * Retirada administrativa: remove do(s) site(s) e arquiva localmente.
 * Nunca faz hard delete — o registro fica recuperável com trilha de auditoria.
 */
export const removeProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; providers: string[]; reason?: string | null }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const providers = (data.providers ?? []).filter(isImobiProvider);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("id, revision")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!property) throw new Error("Imóvel não encontrado.");

    for (const provider of providers) {
      await supabaseAdmin.from("property_sync_jobs").upsert(
        {
          property_id: data.propertyId,
          provider,
          action: "delete",
          requested_revision: property.revision ?? 1,
          requested_by: context.userId,
          status: "pending",
          next_run_at: new Date().toISOString(),
        },
        { onConflict: "property_id,provider,action,requested_revision" },
      );
    }

    await supabaseAdmin
      .from("properties")
      .update({
        removal_state: providers.length ? "pending_removal" : "removed",
        archived_at: providers.length ? null : new Date().toISOString(),
        archive_reason: data.reason ?? null,
      })
      .eq("id", data.propertyId);

    // Dispara o worker de saída já existente (publicação/remoção).
    try {
      const secret = process.env["PROPERTY_SYNC_WORKER_SECRET"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
      const request = getRequest();
      const origin = request?.url ? new URL(request.url).origin : null;
      if (secret && origin) {
        await fetch(`${origin}/api/public/hooks/property-sync-worker`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: secret },
          body: JSON.stringify({ limit: 3 }),
        });
      }
    } catch {
      // Fila persistente garante o reprocessamento.
    }

    return { ok: true, providers };
  });
