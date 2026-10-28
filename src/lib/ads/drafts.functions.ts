import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMarketingAction, type AdsContext } from "./authorization.server";
import {
  metaAdDraftInputSchema,
  metaAdDraftPayloadSchema,
  type MetaAdCommand,
  type MetaAdDraft,
  type MetaAdStep,
} from "./drafts.model";
import { AdProviderError } from "./types";
export type {
  MetaAdDraft,
  MetaAdCommand,
  MetaAdDraftInput,
  MetaAdDraftPayload,
} from "./drafts.model";
const scopeSchema = z.object({ connectionId: z.uuid(), imobiliaria: z.enum(["cordial", "morar"]) });
const idSchema = z.object({ id: z.uuid() });
const draftColumns =
  "id,connection_id,imobiliaria,account_id,page_id,revision,status,payload,created_by,created_at,updated_at";
async function dbAdmin() {
  return (await import("@/integrations/supabase/client.server"))
    .supabaseAdmin as unknown as SupabaseClient;
}
async function draftForActor(
  ctx: AdsContext,
  id: string,
  action: "create_draft" | "send_paused" | "set_delivery" | "change_budget" = "create_draft",
) {
  await requireMarketingAction(ctx, "read_ad_budget");
  await requireMarketingAction(ctx, action);
  const db = await dbAdmin();
  const { data, error } = await db
    .from("meta_ad_drafts")
    .select(draftColumns)
    .eq("id", id)
    .single();
  if (error || !data) throw new AdProviderError("no_permission", "Rascunho indisponível.");
  const draft = data as MetaAdDraft;
  await requireMarketingAction(ctx, action, draft.imobiliaria);
  await requireMarketingAction(ctx, "read_ad_budget", draft.imobiliaria);
  return { db, draft };
}
export const listMetaAdDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { imobiliaria?: "cordial" | "morar" }) =>
    z.object({ imobiliaria: z.enum(["cordial", "morar"]).optional() }).parse(value),
  )
  .handler(async ({ data, context }): Promise<MetaAdDraft[]> => {
    await requireMarketingAction(
      context,
      "read_ad_budget",
      "imobiliaria" in data && typeof data.imobiliaria === "string" ? data.imobiliaria : undefined,
    );
    await requireMarketingAction(context, "create_draft", data.imobiliaria);
    let query = (await dbAdmin())
      .from("meta_ad_drafts")
      .select(draftColumns)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (data.imobiliaria) query = query.eq("imobiliaria", data.imobiliaria);
    else {
      const permitted: string[] = [];
      for (const agency of ["cordial", "morar"]) {
        const { data: allowed, error } = await context.supabase.rpc("marketing_can_act", {
          p_action: "read_ad_budget",
          p_agency: agency,
        });
        if (error) throw new AdProviderError("no_permission", "Não foi possível validar o escopo.");
        if (allowed === true) permitted.push(agency);
      }
      if (!permitted.length) return [];
      query = query.in("imobiliaria", permitted);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error("Não foi possível carregar os rascunhos.");
    return rows as MetaAdDraft[];
  });
export const saveMetaAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (value: {
      id?: string;
      expectedRevision?: number;
      connectionId: string;
      imobiliaria: "cordial" | "morar";
      payload: z.input<typeof metaAdDraftInputSchema>;
    }) =>
      scopeSchema
        .extend({
          id: z.uuid().optional(),
          expectedRevision: z.number().int().positive().optional(),
          payload: metaAdDraftInputSchema,
        })
        .parse(value),
  )
  .handler(async ({ data, context }): Promise<MetaAdDraft> => {
    await requireMarketingAction(
      context,
      "read_ad_budget",
      "imobiliaria" in data && typeof data.imobiliaria === "string" ? data.imobiliaria : undefined,
    );
    await requireMarketingAction(context, "create_draft", data.imobiliaria);
    const db = await dbAdmin();
    const { data: connection, error } = await db
      .from("ad_platform_connections")
      .select("id,page_id,external_account_id")
      .eq("id", data.connectionId)
      .eq("platform", "meta")
      .eq("imobiliaria", data.imobiliaria)
      .single();
    if (error || !connection?.page_id || !connection.external_account_id)
      throw new AdProviderError(
        "not_connected",
        "Selecione uma conexão com conta e Página configuradas.",
      );
    if (data.payload.pageId && data.payload.pageId !== connection.page_id)
      throw new AdProviderError("no_permission", "Página incompatível.");
    const { commandRpc } = await import("./commands.server");
    return commandRpc(db, "meta_ad_draft_save", {
      p_id: data.id ?? null,
      p_revision: data.expectedRevision ?? null,
      p_connection: data.connectionId,
      p_agency: data.imobiliaria,
      p_payload: { ...data.payload, pageId: connection.page_id },
      p_actor: context.userId,
    });
  });
export const getMetaAdDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string }) => idSchema.parse(value))
  .handler(async ({ data, context }) => {
    const { db, draft } = await draftForActor(context, data.id);
    const { data: commands, error } = await db
      .from("meta_ad_commands")
      .select(
        "id,draft_id,draft_revision,kind,state,steps,payload,last_error,created_at,updated_at",
      )
      .eq("draft_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Não foi possível carregar os comandos.");
    const ids = [
      ...new Set(
        (commands ?? []).flatMap((c) =>
          Object.values(c.steps as Record<string, { id?: string }>).flatMap((s) =>
            s.id ? [s.id] : [],
          ),
        ),
      ),
    ];
    const hierarchy = ids.length
      ? await db
          .from("meta_ad_hierarchy")
          .select(
            "level,external_id,name,configured_status,effective_status,revision_hash,read_at,snapshot",
          )
          .eq("connection_id", draft.connection_id)
          .eq("account_id", draft.account_id)
          .in("external_id", ids)
      : { data: [], error: null };
    if (hierarchy.error) throw new Error("Não foi possível carregar a hierarquia.");
    return { ...draft, commands: commands as MetaAdCommand[], hierarchy: hierarchy.data ?? [] };
  });
export const submitMetaAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (value: { id: string; expectedRevision: number; confirmation: "CREATE_PAUSED" }) =>
      idSchema
        .extend({
          expectedRevision: z.number().int().positive(),
          confirmation: z.literal("CREATE_PAUSED"),
        })
        .parse(value),
  )
  .handler(async ({ data, context }): Promise<MetaAdCommand> => {
    const { db, draft } = await draftForActor(context, data.id, "send_paused");
    metaAdDraftPayloadSchema.parse(draft.payload);
    const { commandRpc, executeMetaAdCommand } = await import("./commands.server");
    const command = await commandRpc<MetaAdCommand>(db, "meta_ad_command_begin", {
      p_draft: draft.id,
      p_revision: data.expectedRevision,
      p_kind: "create_paused",
      p_payload: {},
      p_intent: `create:${draft.id}:${data.expectedRevision}`,
      p_actor: context.userId,
    });
    return executeMetaAdCommand(db, draft, command, context.userId);
  });
export const reconcileMetaAdCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string }) => idSchema.parse(value))
  .handler(async ({ data, context }): Promise<MetaAdCommand> => {
    await requireMarketingAction(
      context,
      "read_ad_budget",
      "imobiliaria" in data && typeof data.imobiliaria === "string" ? data.imobiliaria : undefined,
    );
    const { fetchCommand, reconcileMetaCommand } = await import("./commands.server");
    const db = await dbAdmin();
    const command = await fetchCommand(db, data.id);
    const action =
      command.kind === "set_delivery"
        ? "set_delivery"
        : command.kind === "change_budget"
          ? "change_budget"
          : "send_paused";
    const { draft } = await draftForActor(context, command.draft_id, action);
    return reconcileMetaCommand(db, draft, command, context.userId);
  });
const managementSchema = z.object({
  draftId: z.uuid(),
  expectedRevision: z.number().int().positive(),
  intentId: z.uuid(),
  expectedRevisions: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
});
export const changeMetaAdDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      value: z.input<typeof managementSchema> & {
        targetStatus: "PAUSED" | "ACTIVE";
        confirmation: "CONFIRM_DELIVERY";
      },
    ) =>
      managementSchema
        .extend({
          targetStatus: z.enum(["PAUSED", "ACTIVE"]),
          confirmation: z.literal("CONFIRM_DELIVERY"),
        })
        .parse(value),
  )
  .handler(async ({ data, context }) => {
    const { db, draft } = await draftForActor(context, data.draftId, "set_delivery");
    const { commandRpc, executeMetaAdCommand } = await import("./commands.server");
    const command = await commandRpc<MetaAdCommand>(db, "meta_ad_command_begin", {
      p_draft: draft.id,
      p_revision: data.expectedRevision,
      p_kind: "set_delivery",
      p_payload: {
        status: data.targetStatus,
        expectedRevisions: data.expectedRevisions,
        previous_status: draft.status,
      },
      p_intent: `delivery:${draft.id}:${data.intentId}`,
      p_actor: context.userId,
    });
    return executeMetaAdCommand(db, draft, command, context.userId);
  });
export const changeMetaAdBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      value: z.input<typeof managementSchema> & {
        amountMinor: string;
        confirmation: "CONFIRM_BUDGET";
      },
    ) =>
      managementSchema
        .extend({
          amountMinor: z.string().regex(/^[1-9]\d{0,8}$/),
          confirmation: z.literal("CONFIRM_BUDGET"),
        })
        .parse(value),
  )
  .handler(async ({ data, context }) => {
    const { db, draft } = await draftForActor(context, data.draftId, "change_budget");
    const payload = metaAdDraftPayloadSchema.parse(draft.payload);
    const { commandRpc, executeMetaAdCommand } = await import("./commands.server");
    const command = await commandRpc<MetaAdCommand>(db, "meta_ad_command_begin", {
      p_draft: draft.id,
      p_revision: data.expectedRevision,
      p_kind: "change_budget",
      p_payload: {
        budgetField: payload.budget.kind === "daily" ? "daily_budget" : "lifetime_budget",
        amountMinor: data.amountMinor,
        expectedRevisions: data.expectedRevisions,
        previous_status: draft.status,
      },
      p_intent: `budget:${draft.id}:${data.intentId}`,
      p_actor: context.userId,
    });
    return executeMetaAdCommand(db, draft, command, context.userId);
  });
export const refreshMetaAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string }) => idSchema.parse(value))
  .handler(async ({ data, context }) => {
    const { db, draft } = await draftForActor(context, data.id);
    const { resolveConnectionCredential } = await import("./credentials.server");
    const { readHierarchyObject, saveHierarchyObject } = await import("./hierarchy.server");
    const { confirmedIds, META_AD_STEPS } = await import("./drafts.model");
    const { token } = await resolveConnectionCredential(draft.connection_id, {
      platform: "meta",
      imobiliaria: draft.imobiliaria,
      accountId: draft.account_id,
    });
    const { data: creation, error } = await db
      .from("meta_ad_commands")
      .select("steps")
      .eq("draft_id", draft.id)
      .eq("kind", "create_paused")
      .single();
    if (error) throw new AdProviderError("conflict", "Criação ainda não iniciada.");
    const ids = confirmedIds(creation.steps);
    for (const step of META_AD_STEPS)
      if (ids[step])
        await saveHierarchyObject(
          db,
          draft,
          step,
          await readHierarchyObject(token, draft, step, ids[step]!, ids),
        );
    return { ok: true as const, checkedAt: new Date().toISOString() };
  });
export type MetaAdCreationAssets = {
  accountId: string;
  accountName: string;
  currency: string;
  timezone: string;
  page: { id: string; name: string };
  images: Array<{ hash: string; name: string; url: string | null }>;
  forms: Array<{ id: string; name: string }>;
  writing: { state: "unverified"; evidence: string };
};
export const listMetaAdCreationAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.input<typeof scopeSchema>) => scopeSchema.parse(value))
  .handler(async ({ data, context }): Promise<MetaAdCreationAssets> => {
    await requireMarketingAction(
      context,
      "read_ad_budget",
      "imobiliaria" in data && typeof data.imobiliaria === "string" ? data.imobiliaria : undefined,
    );
    await requireMarketingAction(context, "create_draft", data.imobiliaria);
    const { resolveConnectionCredential, resolvePageCredential } =
      await import("./credentials.server");
    const { externalId, normalizeAccountId, metaGraph, metaPages } =
      await import("./meta.graph.server");
    const { token, connection } = await resolveConnectionCredential(data.connectionId, {
      platform: "meta",
      imobiliaria: data.imobiliaria,
    });
    if (!connection.external_account_id || !connection.page_id)
      throw new AdProviderError("not_connected", "Conta/Página não configuradas.");
    const accountId = normalizeAccountId(connection.external_account_id);
    const account = await metaGraph<{ name?: string; currency?: string; timezone_name?: string }>(
      `/act_${accountId}`,
      token,
      { fields: "id,name,currency,timezone_name" },
    );
    const pages = await metaPages<{ id: string; name?: string }>(
      `/act_${accountId}/promote_pages`,
      token,
      { fields: "id,name" },
    );
    const page = pages.find((item) => item.id === connection.page_id);
    if (!page) throw new AdProviderError("no_permission", "Página não autorizada nesta conta.");
    const images = await metaPages<{ hash: string; name?: string; url?: string }>(
      `/act_${accountId}/adimages`,
      token,
      { fields: "hash,name,url" },
    );
    const db = await dbAdmin();
    const { data: mappings, error } = await db
      .from("meta_lead_form_mappings")
      .select("form_id")
      .eq("connection_id", data.connectionId)
      .eq("imobiliaria", data.imobiliaria)
      .eq("page_id", connection.page_id)
      .eq("enabled", true);
    if (error) throw new Error("Não foi possível consultar formulários mapeados.");
    let forms: Array<{ id: string; name: string }> = [];
    if (mappings?.length) {
      const { token: pageToken } = await resolvePageCredential(data.connectionId);
      const live = await metaPages<{ id: string; name?: string; status?: string }>(
        `/${externalId(connection.page_id)}/leadgen_forms`,
        pageToken,
        { fields: "id,name,status" },
      );
      forms = live
        .filter((form) => form.status === "ACTIVE" && mappings.some((m) => m.form_id === form.id))
        .map((form) => ({ id: form.id, name: form.name ?? form.id }));
    }
    return {
      accountId,
      accountName: account.name ?? accountId,
      currency: account.currency ?? "unknown",
      timezone: account.timezone_name ?? "unknown",
      page: { id: page.id, name: page.name ?? page.id },
      images: images.map((image) => ({
        hash: image.hash,
        name: image.name ?? image.hash,
        url: safeImageUrl(image.url),
      })),
      forms,
      writing: {
        state: "unverified",
        evidence:
          "Leitura de ativos confirmada. Escrita só é comprovada pelo comando pausado retornado e conferido na Meta.",
      },
    };
  });
function safeImageUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.searchParams.has("access_token") &&
      /(^|\.)(fbcdn\.net|fbsbx\.com|facebook\.com)$/.test(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
/** Explicit read, never a render/hover side effect. Persists a complete paginated hierarchy. */
export const syncMetaAdHierarchy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.input<typeof scopeSchema>) => scopeSchema.parse(value))
  .handler(async ({ data, context }) => {
    await requireMarketingAction(
      context,
      "read_ad_budget",
      "imobiliaria" in data && typeof data.imobiliaria === "string" ? data.imobiliaria : undefined,
    );
    await requireMarketingAction(context, "read_metrics", data.imobiliaria);
    const { resolveConnectionCredential } = await import("./credentials.server");
    const { normalizeAccountId } = await import("./meta.graph.server");
    const { discoverMetaHierarchy } = await import("./hierarchy.server");
    const { token, connection } = await resolveConnectionCredential(data.connectionId, {
      platform: "meta",
      imobiliaria: data.imobiliaria,
    });
    if (!connection.external_account_id)
      throw new AdProviderError("not_connected", "Conta não configurada.");
    return discoverMetaHierarchy(
      await dbAdmin(),
      {
        connection_id: data.connectionId,
        imobiliaria: data.imobiliaria,
        account_id: normalizeAccountId(connection.external_account_id),
      },
      token,
    );
  });
export const listMetaAdHierarchy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      value: z.input<typeof scopeSchema> & { level?: MetaAdStep; parentId?: string; page?: number },
    ) =>
      scopeSchema
        .extend({
          level: z.enum(["campaign", "adset", "ad", "creative"]).optional(),
          parentId: z
            .string()
            .regex(/^\d{1,80}$/)
            .optional(),
          page: z.number().int().min(1).max(10000).default(1),
        })
        .parse(value),
  )
  .handler(async ({ data, context }) => {
    await requireMarketingAction(
      context,
      "read_ad_budget",
      "imobiliaria" in data && typeof data.imobiliaria === "string" ? data.imobiliaria : undefined,
    );
    await requireMarketingAction(context, "read_metrics", data.imobiliaria);
    const db = await dbAdmin();
    const { data: connection } = await db
      .from("ad_platform_connections")
      .select("id,external_account_id")
      .eq("id", data.connectionId)
      .eq("imobiliaria", data.imobiliaria)
      .eq("platform", "meta")
      .single();
    if (!connection?.external_account_id)
      throw new AdProviderError("no_permission", "Conexão indisponível.");
    const { normalizeAccountId } = await import("./meta.graph.server");
    let query = db
      .from("meta_ad_hierarchy")
      .select(
        "external_id,level,parent_external_id,name,configured_status,effective_status,revision_hash,read_at",
        { count: "exact" },
      )
      .eq("connection_id", data.connectionId)
      .eq("imobiliaria", data.imobiliaria)
      .eq("account_id", normalizeAccountId(connection.external_account_id))
      .order("name")
      .order("external_id");
    if (data.level) query = query.eq("level", data.level);
    if (data.parentId) query = query.eq("parent_external_id", data.parentId);
    const {
      data: rows,
      error,
      count,
    } = await query.range((data.page - 1) * 50, data.page * 50 - 1);
    if (error) throw new Error("Não foi possível ler a hierarquia.");
    return { items: rows ?? [], total: count ?? 0 };
  });

export const uploadMetaAdImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.input<typeof scopeSchema> & { base64: string; fileName: string }) =>
    scopeSchema
      .extend({
        base64: z
          .string()
          .min(1)
          .max(7_000_000)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/),
        fileName: z
          .string()
          .max(120)
          .regex(/^[\p{L}\p{N} ._-]+\.(?:png|jpe?g)$/iu),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    await requireMarketingAction(
      context,
      "read_ad_budget",
      "imobiliaria" in data && typeof data.imobiliaria === "string" ? data.imobiliaria : undefined,
    );
    await requireMarketingAction(context, "send_paused", data.imobiliaria);
    const { Buffer } = await import("node:buffer");
    const { validateMetaImage } = await import("./drafts.media");
    const bytes = Buffer.from(data.base64, "base64");
    const dimensions = validateMetaImage(bytes);
    const { resolveConnectionCredential } = await import("./credentials.server");
    const { normalizeAccountId, metaGraphCommand } = await import("./meta.graph.server");
    const { connection, token } = await resolveConnectionCredential(data.connectionId, {
      platform: "meta",
      imobiliaria: data.imobiliaria,
    });
    if (!connection.external_account_id)
      throw new AdProviderError("not_connected", "Conta não configurada.");
    const result = await metaGraphCommand<{ images?: Record<string, { hash?: string }> }>(
      `/act_${normalizeAccountId(connection.external_account_id)}/adimages`,
      token,
      { bytes: data.base64 },
    );
    const hash = Object.values(result.images ?? {}).find((image) => image.hash)?.hash;
    if (!hash || !/^[a-zA-Z0-9_-]{8,128}$/.test(hash))
      throw new AdProviderError(
        "outcome_uncertain",
        "Imagem enviada sem confirmação. Atualize os ativos antes de repetir.",
      );
    return { hash, name: data.fileName, ...dimensions };
  });

/** Explicit user resume of the same persisted intention; no new key or payload after navigation. */
export const resumeMetaAdCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string }) => idSchema.parse(value))
  .handler(async ({ data, context }): Promise<MetaAdCommand> => {
    await requireMarketingAction(
      context,
      "read_ad_budget",
      "imobiliaria" in data && typeof data.imobiliaria === "string" ? data.imobiliaria : undefined,
    );
    const { fetchCommand, executeMetaAdCommand } = await import("./commands.server");
    const { commandMayResume } = await import("./drafts.model");
    const db = await dbAdmin();
    const command = await fetchCommand(db, data.id);
    const action =
      command.kind === "set_delivery"
        ? "set_delivery"
        : command.kind === "change_budget"
          ? "change_budget"
          : "send_paused";
    const { draft } = await draftForActor(context, command.draft_id, action);
    if (command.state === "done") return command;
    if (command.state === "uncertain" || !commandMayResume(command.steps))
      throw new AdProviderError(
        "conflict",
        "Reconcilie o resultado incerto antes de retomar. Nenhum envio foi repetido.",
      );
    if (draft.revision !== command.draft_revision)
      throw new AdProviderError(
        "conflict",
        "O rascunho mudou desde este comando. Atualize o histórico.",
      );
    return executeMetaAdCommand(db, draft, command, context.userId);
  });
