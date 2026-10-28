import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { externalId, metaGraph, metaPages, normalizeAccountId } from "./meta.graph.server";
import { AdProviderError } from "./types";
import type { MetaAdDraft, MetaAdStep, MetaJson } from "./drafts.model";
export const hierarchyFields: Record<MetaAdStep, string> = {
  campaign:
    "id,account_id,name,status,effective_status,objective,special_ad_categories,updated_time",
  adset:
    "id,account_id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,updated_time",
  ad: "id,account_id,name,campaign_id,adset_id,status,effective_status,creative{id},updated_time",
  creative: "id,account_id,name,object_story_spec",
};
export const hierarchyEdges: Record<MetaAdStep, string> = {
  campaign: "campaigns",
  adset: "adsets",
  creative: "adcreatives",
  ad: "ads",
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function hierarchyRevision(snapshot: Record<string, unknown>): string {
  // Delivery/effective status can change due to review, without an operator edit.
  const { effective_status: _, ...configuration } = snapshot;
  return createHash("sha256")
    .update(JSON.stringify(canonical(configuration)))
    .digest("hex");
}
export function assertHierarchyScope(
  row: Record<string, unknown>,
  draft: Pick<MetaAdDraft, "account_id" | "page_id">,
  step: MetaAdStep,
  ids: Partial<Record<MetaAdStep, string>>,
) {
  if (normalizeAccountId(String(row.account_id ?? "")) !== draft.account_id)
    throw new AdProviderError("no_permission", "Objeto não pertence à conta selecionada.");
  if (
    (step === "adset" && row.campaign_id !== ids.campaign) ||
    (step === "ad" && (row.adset_id !== ids.adset || row.campaign_id !== ids.campaign))
  )
    throw new AdProviderError("no_permission", "Hierarquia externa incompatível.");
  if (
    step === "creative" &&
    (row.object_story_spec as { page_id?: string } | undefined)?.page_id !== draft.page_id
  )
    throw new AdProviderError("no_permission", "Identidade do criativo incompatível.");
  if (step === "ad" && (row.creative as { id?: string } | undefined)?.id !== ids.creative)
    throw new AdProviderError("no_permission", "Criativo externo incompatível.");
}
export async function readHierarchyObject(
  token: string,
  draft: MetaAdDraft,
  step: MetaAdStep,
  id: string,
  ids: Partial<Record<MetaAdStep, string>>,
) {
  const row = await metaGraph<Record<string, MetaJson>>(`/${externalId(id)}`, token, {
    fields: hierarchyFields[step],
  });
  assertHierarchyScope(row, draft, step, ids);
  return row;
}
export async function saveHierarchyObject(
  db: SupabaseClient,
  draft: MetaAdDraft,
  step: MetaAdStep,
  row: Record<string, unknown>,
) {
  const { error } = await db.from("meta_ad_hierarchy").upsert(
    {
      connection_id: draft.connection_id,
      imobiliaria: draft.imobiliaria,
      account_id: draft.account_id,
      external_id: String(row.id),
      level: step,
      parent_external_id:
        step === "ad" ? String(row.adset_id) : step === "adset" ? String(row.campaign_id) : null,
      name: String(row.name ?? ""),
      configured_status: typeof row.status === "string" ? row.status : null,
      effective_status: typeof row.effective_status === "string" ? row.effective_status : null,
      snapshot: row,
      revision_hash: hierarchyRevision(row),
      read_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,account_id,level,external_id" },
  );
  if (error) throw new Error("Falha ao preservar leitura da hierarquia.");
}
/** Paginated read-only discovery, scoped to a verified connection account. Existing snapshots survive a failed collection. */
export async function discoverMetaHierarchy(
  db: SupabaseClient,
  draftScope: Pick<MetaAdDraft, "connection_id" | "imobiliaria" | "account_id">,
  token: string,
) {
  const rows = [];
  for (const level of ["campaign", "adset", "ad", "creative"] as MetaAdStep[]) {
    const objects = await metaPages<Record<string, unknown>>(
      `/act_${externalId(draftScope.account_id)}/${hierarchyEdges[level]}`,
      token,
      { fields: hierarchyFields[level] },
    );
    for (const row of objects) {
      if (normalizeAccountId(String(row.account_id ?? "")) !== draftScope.account_id)
        throw new AdProviderError("no_permission", "Conta externa incompatível.");
      rows.push({
        connection_id: draftScope.connection_id,
        imobiliaria: draftScope.imobiliaria,
        account_id: draftScope.account_id,
        external_id: externalId(String(row.id)),
        level,
        parent_external_id:
          level === "ad"
            ? String(row.adset_id)
            : level === "adset"
              ? String(row.campaign_id)
              : null,
        name: String(row.name ?? ""),
        configured_status: row.status ?? null,
        effective_status: row.effective_status ?? null,
        snapshot: row,
        revision_hash: hierarchyRevision(row),
        read_at: new Date().toISOString(),
      });
    }
  }
  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await db.from("meta_ad_hierarchy").upsert(rows.slice(index, index + 100), {
      onConflict: "connection_id,account_id,level,external_id",
    });
    if (error) throw new Error("Não foi possível persistir a hierarquia.");
  }
  return { collected: rows.length, checkedAt: new Date().toISOString() };
}
