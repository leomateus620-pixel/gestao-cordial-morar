import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveConnectionCredential, resolvePageCredential } from "./credentials.server";
import { externalId, metaGraph, metaGraphCommand, metaPages } from "./meta.graph.server";
import { AdProviderError } from "./types";
import {
  confirmedIds,
  externalObjectName,
  metaAdDraftPayloadSchema,
  META_AD_STEPS,
  type MetaAdCommand,
  type MetaAdDraft,
  type MetaAdStep,
  type MetaCommandStep,
} from "./drafts.model";
import { runPausedCreation } from "./commands.engine";
import {
  hierarchyEdges,
  hierarchyFields,
  hierarchyRevision,
  readHierarchyObject,
  saveHierarchyObject,
} from "./hierarchy.server";
export async function commandRpc<T>(
  db: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error)
    throw new AdProviderError(
      "conflict",
      "A operação mudou ou não pôde ser preservada. Atualize e confira o comando.",
    );
  return data as T;
}
export async function fetchCommand(db: SupabaseClient, id: string): Promise<MetaAdCommand> {
  const { data, error } = await db
    .from("meta_ad_commands")
    .select("id,draft_id,draft_revision,kind,state,steps,payload,last_error,created_at,updated_at")
    .eq("id", id)
    .single();
  if (error || !data) throw new AdProviderError("conflict", "Comando indisponível.");
  return data as MetaAdCommand;
}
export async function validateDraftAssets(db: SupabaseClient, draft: MetaAdDraft, token: string) {
  const payload = metaAdDraftPayloadSchema.parse(draft.payload);
  const account = await metaGraph<{
    id: string;
    currency: string;
    timezone_name?: string;
    account_status?: number;
  }>(`/act_${externalId(draft.account_id)}`, token, {
    fields: "id,currency,timezone_name,account_status",
  });
  if (account.currency !== "BRL")
    throw new AdProviderError(
      "not_configured",
      "O assistente suporta orçamento em BRL; use o Ads Manager para esta moeda.",
    );
  if (account.account_status !== 1)
    throw new AdProviderError("no_permission", "A conta não está ativa para operações.");
  if (payload.pageId !== draft.page_id)
    throw new AdProviderError("no_permission", "Página incompatível.");
  const pages = await metaPages<{ id: string }>(
    `/act_${externalId(draft.account_id)}/promote_pages`,
    token,
    { fields: "id" },
  );
  if (!pages.some((page) => page.id === draft.page_id))
    throw new AdProviderError(
      "no_permission",
      "A Página não está autorizada para anúncios nesta conta.",
    );
  const images = await metaPages<{ hash: string }>(
    `/act_${externalId(draft.account_id)}/adimages`,
    token,
    { fields: "hash", hashes: JSON.stringify([payload.creative.imageHash]) },
  );
  if (!images.some((image) => image.hash === payload.creative.imageHash))
    throw new AdProviderError("no_permission", "Imagem não pertence à conta selecionada.");
  if (payload.destination === "lead_form") {
    const { data: mapping, error } = await db
      .from("meta_lead_form_mappings")
      .select("id")
      .eq("connection_id", draft.connection_id)
      .eq("imobiliaria", draft.imobiliaria)
      .eq("page_id", draft.page_id)
      .eq("form_id", payload.formId)
      .eq("enabled", true)
      .maybeSingle();
    if (error || !mapping)
      throw new AdProviderError(
        "no_permission",
        "Mapeie o formulário desta Página antes do anúncio.",
      );
    const { token: pageToken } = await resolvePageCredential(draft.connection_id);
    const forms = await metaPages<{ id: string; status?: string }>(
      `/${externalId(draft.page_id)}/leadgen_forms`,
      pageToken,
      { fields: "id,status" },
    );
    if (!forms.some((form) => form.id === payload.formId && form.status === "ACTIVE"))
      throw new AdProviderError("no_permission", "Formulário ativo não confirmado na Página.");
  }
  return payload;
}
export async function executeMetaAdCommand(
  db: SupabaseClient,
  draft: MetaAdDraft,
  inputCommand: MetaAdCommand,
  actorId: string,
) {
  const workerId = randomUUID();
  const claimed = await commandRpc<Array<MetaAdCommand & { fence: number }>>(
    db,
    "meta_ad_command_claim",
    { p_id: inputCommand.id, p_worker: workerId, p_actor: actorId },
  );
  const command = claimed[0];
  if (!command) return fetchCommand(db, inputCommand.id);
  const record = (step: MetaAdStep, result: MetaCommandStep) =>
    commandRpc(db, "meta_ad_command_step", {
      p_id: command.id,
      p_worker: workerId,
      p_fence: command.fence,
      p_step: step,
      p_result: result,
      p_actor: actorId,
    }).then(() => undefined);
  const finish = (state: string, code: string | null) =>
    commandRpc(db, "meta_ad_command_finish", {
      p_id: command.id,
      p_worker: workerId,
      p_fence: command.fence,
      p_state: state,
      p_error: code,
      p_actor: actorId,
    }).then(() => undefined);
  let token: string;
  try {
    const resolved = await resolveConnectionCredential(draft.connection_id, {
      platform: "meta",
      imobiliaria: draft.imobiliaria,
      accountId: draft.account_id,
    });
    if (resolved.connection.page_id !== draft.page_id)
      throw new AdProviderError(
        "no_permission",
        "A Página da conexão foi alterada. Revise o rascunho.",
      );
    token = resolved.token;
  } catch (error) {
    await finish("failed", error instanceof AdProviderError ? error.code : "not_configured");
    return fetchCommand(db, command.id);
  }
  if (command.kind === "create_paused") {
    let payload;
    try {
      payload = await validateDraftAssets(db, draft, token);
    } catch (error) {
      await finish(
        Object.keys(confirmedIds(command.steps)).length ? "partial" : "failed",
        error instanceof AdProviderError ? error.code : "invalid_parameter",
      );
      return fetchCommand(db, command.id);
    }
    await runPausedCreation(command, payload, {
      record,
      finish,
      create: (step, fields) =>
        metaGraphCommand<{ id: string }>(
          `/act_${externalId(draft.account_id)}/${hierarchyEdges[step]}`,
          token,
          fields,
        ),
      verify: async (step, id, ids) => {
        const row = await readHierarchyObject(token, draft, step, id, ids);
        if (step !== "creative" && row.status !== "PAUSED")
          throw new AdProviderError("conflict", "Status pausado não confirmado.");
        await saveHierarchyObject(db, draft, step, row);
        return row;
      },
    });
  } else {
    await executeManagement(db, draft, command, token, record, finish);
  }
  return fetchCommand(db, command.id);
}
async function creationIds(db: SupabaseClient, draftId: string) {
  const { data, error } = await db
    .from("meta_ad_commands")
    .select("steps")
    .eq("draft_id", draftId)
    .eq("kind", "create_paused")
    .eq("state", "done")
    .single();
  if (error || !data) throw new AdProviderError("conflict", "Criação ainda não confirmada.");
  return confirmedIds(data.steps);
}
async function executeManagement(
  db: SupabaseClient,
  draft: MetaAdDraft,
  command: MetaAdCommand,
  token: string,
  record: (step: MetaAdStep, result: MetaCommandStep) => Promise<void>,
  finish: (state: string, error: string | null) => Promise<void>,
) {
  const ids = await creationIds(db, draft.id);
  // Activate campaign last. Pause campaign first. No optimistic success or hidden creation.
  const steps: MetaAdStep[] =
    command.kind === "change_budget"
      ? ["adset"]
      : command.payload.status === "ACTIVE"
        ? ["ad", "adset", "campaign"]
        : ["campaign", "adset", "ad"];
  // Preflight every target before the first write. Previously completed steps are never replayed.
  try {
    for (const step of steps) {
      if (command.steps[step]?.state === "done") continue;
      const row = await readHierarchyObject(token, draft, step, ids[step]!, ids);
      const { data, error } = await db
        .from("meta_ad_hierarchy")
        .select("revision_hash")
        .eq("connection_id", draft.connection_id)
        .eq("account_id", draft.account_id)
        .eq("level", step)
        .eq("external_id", ids[step])
        .single();
      const expected = (command.payload.expectedRevisions as Record<string, string> | undefined)?.[
        step
      ];
      if (
        error ||
        !data ||
        data.revision_hash !== hierarchyRevision(row) ||
        expected !== data.revision_hash
      )
        throw new AdProviderError(
          "conflict",
          "O Ads Manager alterou o objeto. Atualize os detalhes e confirme novamente.",
        );
    }
  } catch (error) {
    await finish(
      Object.values(command.steps).some((s) => s?.state === "done") ? "partial" : "failed",
      error instanceof AdProviderError ? error.code : "provider_error",
    );
    return;
  }
  for (const step of steps) {
    if (command.steps[step]?.state === "done") continue;
    await record(step, { state: "sending", id: ids[step] });
    let accepted = false;
    try {
      const fields =
        command.kind === "change_budget"
          ? { [String(command.payload.budgetField)]: String(command.payload.amountMinor) }
          : { status: String(command.payload.status) };
      const response = await metaGraphCommand<{ success: boolean }>(
        `/${externalId(ids[step]!)}`,
        token,
        fields,
      );
      if (response.success !== true)
        throw new AdProviderError("outcome_uncertain", "Resultado ainda não confirmado.");
      accepted = true;
      await record(step, { state: "uncertain", id: ids[step], error: "verification_pending" });
      const row = await readHierarchyObject(token, draft, step, ids[step]!, ids);
      for (const [key, value] of Object.entries(fields))
        if (String(row[key]) !== value)
          throw new AdProviderError("conflict", "Alteração externa ainda não confirmada.");
      await saveHierarchyObject(db, draft, step, row);
      await record(step, { state: "done", id: ids[step], snapshot: row });
    } catch (error) {
      const uncertain =
        accepted || !(error instanceof AdProviderError) || error.code === "outcome_uncertain";
      const code = uncertain ? "outcome_uncertain" : (error as AdProviderError).code;
      await record(step, { state: uncertain ? "uncertain" : "failed", id: ids[step], error: code });
      await finish(uncertain ? "uncertain" : "partial", code);
      return;
    }
  }
  await finish("done", null);
}
export async function reconcileMetaCommand(
  db: SupabaseClient,
  draft: MetaAdDraft,
  command: MetaAdCommand,
  actorId: string,
) {
  const { token, connection } = await resolveConnectionCredential(draft.connection_id, {
    platform: "meta",
    imobiliaria: draft.imobiliaria,
    accountId: draft.account_id,
  });
  if (connection.page_id !== draft.page_id)
    throw new AdProviderError("no_permission", "Página da conexão alterada.");
  const ids =
    command.kind === "create_paused"
      ? confirmedIds(command.steps)
      : await creationIds(db, draft.id);
  for (const step of META_AD_STEPS) {
    const stored = command.steps[step];
    if (!stored || !["sending", "uncertain"].includes(stored.state)) continue;
    let id = stored.id;
    if (!id && command.kind === "create_paused") {
      const candidates = await metaPages<Record<string, unknown>>(
        `/act_${externalId(draft.account_id)}/${hierarchyEdges[step]}`,
        token,
        { fields: hierarchyFields[step] },
      );
      const exact = candidates.filter(
        (row) => row.name === externalObjectName(draft.payload.name ?? "", command.id, step),
      );
      // Zero results does not prove absence; multiple matches cannot be guessed.
      if (exact.length !== 1) continue;
      id = String(exact[0].id);
    }
    if (!id) continue;
    const row = await readHierarchyObject(token, draft, step, id, ids);
    if (command.kind === "create_paused" && step !== "creative" && row.status !== "PAUSED")
      continue;
    if (command.kind === "set_delivery" && row.status !== command.payload.status) continue;
    if (
      command.kind === "change_budget" &&
      String(row[String(command.payload.budgetField)]) !== command.payload.amountMinor
    )
      continue;
    await saveHierarchyObject(db, draft, step, row);
    await commandRpc(db, "meta_ad_command_reconcile", {
      p_id: command.id,
      p_step: step,
      p_result: { state: "done", id, snapshot: row },
      p_actor: actorId,
    });
    ids[step] = id;
  }
  return fetchCommand(db, command.id);
}
