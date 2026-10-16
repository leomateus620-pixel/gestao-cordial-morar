import { z } from "zod";
import type { AuthContext } from "@lovable.dev/mcp-js";
import type { AgentContext } from "./security";
import { assertAgentRole, operationalRoles } from "./security";
import { actionBots, actionSchemas, actionIsExpired, type ActionType } from "./actions";
import {
  actionSelect,
  buildAssistantAction,
  toActionProposal,
  type ActionRow,
} from "./actions.server";
import { assistantScopeKey } from "./scope";

/** Only these existing registry tools may create external proposals. Never execute. */
export const externalActionTypes = Object.freeze({
  prepare_agenda_event: "agenda_event",
  prepare_attendance_note: "attendance_note",
  prepare_attendance_stage_change: "attendance_stage_change",
  prepare_shared_selection: "shared_selection",
  prepare_message_draft: "message_draft",
} satisfies Record<string, ActionType>);
export type ExternalPrepareTool = keyof typeof externalActionTypes;
export type ExternalIdentity = { userId: string; clientId: string };
export type ExternalPermission = ExternalIdentity & { revision: number };
const requestId = z.string().uuid();
const actionId = z.string().uuid();

/** SDK claims have already passed issuer/signature/audience checks. Never use ctx.client. */
export function externalIdentity(
  auth: Pick<AuthContext, "isAuthenticated" | "getUserId" | "getClientId" | "getClaims">,
): ExternalIdentity {
  const claims = auth.getClaims();
  const clientId = claims?.client_id;
  const userId = auth.getUserId();
  if (
    !auth.isAuthenticated() ||
    !userId ||
    typeof clientId !== "string" ||
    !clientId.trim() ||
    clientId !== clientId.trim() ||
    clientId !== auth.getClientId() ||
    (claims?.azp !== undefined &&
      claims.azp !== null &&
      claims.azp !== "" &&
      claims.azp !== clientId)
  )
    throw new Error("A preparação externa exige um cliente OAuth válido do Gestão.");
  return { userId, clientId };
}
export async function externalPermission(
  ctx: AgentContext,
  identity: ExternalIdentity,
): Promise<ExternalPermission> {
  assertAgentRole(ctx, operationalRoles);
  if (ctx.userId !== identity.userId) throw new Error("Sessão inválida.");
  const { data, error } = await ctx.supabase.rpc("assistant_mcp_client_permission");
  ctx.signal?.throwIfAborted();
  const row = Array.isArray(data) ? data[0] : data;
  if (
    error ||
    !row ||
    row.client_id !== identity.clientId ||
    row.approved !== true ||
    !Number.isInteger(row.revision) ||
    row.revision < 1
  )
    throw new Error(
      "Este aplicativo não está autorizado a preparar propostas. Peça aprovação ao administrador.",
    );
  return { ...identity, revision: row.revision };
}
function stable(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => stable(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v, k)]),
    );
  if (typeof value === "string") {
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) return value.toLowerCase();
    if (key === "start" || key === "end") return new Date(value).toISOString();
  }
  return value;
}
/** Hash parsed raw arguments BEFORE masking or business-record enrichment. No raw text is stored here. */
export async function externalRequestHash(
  tool: ExternalPrepareTool,
  input: unknown,
): Promise<string> {
  const normalized = actionSchemas[externalActionTypes[tool]].parse(input);
  if ("propertyIds" in normalized)
    normalized.propertyIds = [...new Set(normalized.propertyIds.map((id) => id.toLowerCase()))];
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(stable({ version: 1, tool, input: normalized }))),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function externalConfirmationUrl(
  id: string,
  origin = process.env.ASSISTANT_PUBLIC_ORIGIN,
): string {
  actionId.parse(id);
  let base: URL;
  try {
    base = new URL(origin ?? "");
  } catch {
    throw new Error("O endereço público do Gestão ainda não foi configurado.");
  }
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error("O endereço público do Gestão ainda não foi configurado.");
  return `${base.origin}/assistente?action=${id}`;
}
function envelope(row: ActionRow, origin?: string) {
  const action = toActionProposal(row);
  return {
    action,
    confirmationUrl: externalConfirmationUrl(action.id, origin),
    confirmationRequired: action.status === "pending" && !actionIsExpired(action),
    expired: actionIsExpired(action),
  };
}
async function findPrevious(ctx: AgentContext, permission: ExternalPermission, id: string) {
  const { data, error } = await ctx.supabase
    .from("assistant_actions")
    .select(`${actionSelect},origin_client_id,origin_client_revision,external_request_hash`)
    .eq("user_id", ctx.userId)
    .eq("scope_key", assistantScopeKey(ctx))
    .eq("origin_client_id", permission.clientId)
    .eq("external_request_id", id)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar a proposta externa.");
  return data as
    | (ActionRow & { origin_client_revision: number; external_request_hash: string })
    | null;
}
async function readExternalRow(ctx: AgentContext, permission: ExternalPermission, id: string) {
  const { data, error } = await ctx.supabase
    .from("assistant_actions")
    .select(actionSelect)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("scope_key", assistantScopeKey(ctx))
    .eq("origin_client_id", permission.clientId)
    .eq("origin_client_revision", permission.revision)
    .maybeSingle();
  if (error || !data)
    throw new Error("Não encontrei esta proposta deste aplicativo no seu acesso atual.");
  return data as ActionRow;
}
async function persistExternalAction(
  permission: ExternalPermission,
  id: string,
  hash: string,
  row: ActionRow,
): Promise<string> {
  // Administrative access is restricted to atomic assistant bookkeeping. Business validation used the caller JWT.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .rpc("assistant_external_action_prepare", {
      _user_id: permission.userId,
      _client_id: permission.clientId,
      _client_revision: permission.revision,
      _request_id: id,
      _request_hash: hash,
      _action: row,
    })
    .abortSignal(AbortSignal.timeout(8000));
  if (error || typeof data !== "string") {
    if (error?.message === "external_request_conflict")
      throw new Error("Esta solicitação já foi usada com outros dados. Prepare uma nova proposta.");
    throw new Error(
      "Não foi possível preparar a proposta externa. Consulte o estado antes de tentar novamente.",
    );
  }
  return data;
}
export type ExternalActionDependencies = {
  persist?: typeof persistExternalAction;
  origin?: string;
};
export async function prepareExternalAction(
  ctx: AgentContext,
  identity: ExternalIdentity,
  name: ExternalPrepareTool,
  input: unknown,
  deps: ExternalActionDependencies = {},
) {
  if (!Object.hasOwn(externalActionTypes, name))
    throw new Error("Esta ação externa não está disponível.");
  const tool = externalActionTypes[name];
  const source = z.object({ requestId, payload: z.unknown() }).strict().parse(input);
  // Validate URL before persisting a proposal that the user could not open.
  externalConfirmationUrl(source.requestId, deps.origin);
  const permission = await externalPermission(ctx, identity);
  const available = await ctx.supabase.rpc("assistant_bot_available", {
    _bot_id: actionBots[tool][0],
  });
  if (available.error || available.data !== true)
    throw new Error("Este agente não está disponível agora.");
  const hash = await externalRequestHash(name, source.payload);
  const previous = await findPrevious(ctx, permission, source.requestId);
  if (previous) {
    if (previous.origin_client_revision !== permission.revision)
      throw new Error(
        "Esta proposta pertence a uma autorização anterior. Prepare uma nova proposta.",
      );
    if (previous.external_request_hash !== hash)
      throw new Error("Esta solicitação já foi usada com outros dados. Prepare uma nova proposta.");
    const storedId = await (deps.persist ?? persistExternalAction)(
      permission,
      source.requestId,
      hash,
      previous,
    );
    return envelope(await readExternalRow(ctx, permission, storedId), deps.origin);
  }
  const row = await buildAssistantAction(
    { ...ctx, agentBotId: actionBots[tool][0], agentConversationId: undefined },
    tool,
    source.payload,
  );
  ctx.signal?.throwIfAborted();
  const storedId = await (deps.persist ?? persistExternalAction)(
    permission,
    source.requestId,
    hash,
    row,
  );
  // Concurrent callers can receive an existing ID. Read it again with current caller RLS and source generation.
  return envelope(await readExternalRow(ctx, permission, storedId), deps.origin);
}
export async function getExternalActionStatus(
  ctx: AgentContext,
  identity: ExternalIdentity,
  id: string,
  origin?: string,
) {
  actionId.parse(id);
  const permission = await externalPermission(ctx, identity);
  return envelope(await readExternalRow(ctx, permission, id), origin);
}
