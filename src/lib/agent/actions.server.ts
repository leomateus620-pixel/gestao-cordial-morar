import type { AgentContext } from "./security";
import { assertAgentRole, operationalRoles, scopeAgency } from "./security";
import { attendanceQuery, clientQuery, rows } from "./tools/common";
import {
  actionBots,
  actionTitles,
  parseActionPayload,
  assertActionMutable,
  type ActionPayload,
  type ActionProposal,
  type ActionType,
} from "./actions";
import { assistantScopeKey } from "./scope";
import { maskAgentOutput } from "./masking";
import { persistAssistantAudit } from "./persistence.server";

export type ActionRow = {
  id: string;
  type: ActionType;
  bot_id: string;
  conversation_id?: string | null;
  user_id: string;
  scope_key: string;
  payload: ActionPayload;
  expected_state: Record<string, any>;
  revision: number;
  status: ActionProposal["status"];
  expires_at: string;
  result?: ActionProposal["result"];
  error_code?: string;
};
export const actionSelect =
  "id,type,bot_id,conversation_id,user_id,scope_key,payload,expected_state,revision,status,expires_at,result,error_code";
const friendlyErrors: Record<string, string> = {
  action_unavailable: "Não encontrei esta proposta no seu acesso atual.",
  stale_revision: "A proposta foi editada. Revise a versão atual.",
  action_not_pending: "Esta proposta não está mais pendente.",
  action_expired: "A proposta expirou. Peça uma nova proposta.",
  interactive_confirmation_required:
    "Confirme a proposta dentro do Gestão, com sua sessão pessoal.",
  record_unavailable: "O registro não está disponível no seu acesso atual.",
};
function fail(error: { message: string } | null) {
  if (error)
    throw new Error(
      friendlyErrors[error.message] ??
        "Não foi possível atualizar a proposta. Consulte o resultado antes de tentar novamente.",
    );
}
export function toActionProposal(row: ActionRow): ActionProposal {
  const p = row.payload as any;
  const diff: ActionProposal["diff"] =
    row.type === "agenda_event"
      ? [
          { label: "Título", after: p.title },
          { label: "Início", after: p.start },
          { label: "Fim", after: p.end },
          ...(p.attendanceId && p.kind === "visita"
            ? [
                {
                  label: "Atendimento vinculado",
                  before: row.expected_state.pipelineStage,
                  after: "Visita agendada, etapa Visita e próximo retorno atualizados",
                },
              ]
            : []),
        ]
      : row.type === "attendance_stage_change"
        ? [
            { label: "Etapa", before: row.expected_state.pipelineStage, after: p.to },
            ...(p.reason ? [{ label: "Motivo", after: p.reason }] : []),
          ]
        : row.type === "shared_selection"
          ? [
              { label: "Título", after: p.title },
              { label: "Imóveis", after: String(p.propertyIds.length) },
              { label: "Validade", after: `${p.expiresDays} dias` },
            ]
          : [{ label: row.type === "message_draft" ? "Rascunho" : "Anotação", after: p.text }];
  return maskAgentOutput({
    id: row.id,
    type: row.type,
    botId: row.bot_id,
    conversationId: row.conversation_id ?? undefined,
    revision: row.revision,
    status: row.status,
    expiresAt: row.expires_at,
    title: actionTitles[row.type],
    summary:
      row.status === "executed"
        ? (row.result?.text ?? "Ação concluída.")
        : row.status === "cancelled"
          ? "Proposta cancelada."
          : row.status === "failed"
            ? "Não foi possível executar. Peça uma nova proposta com os dados atuais."
            : row.type === "message_draft"
              ? "Rascunho copiável. Nenhuma mensagem será enviada."
              : "Revise os dados. O sistema só será alterado depois da sua confirmação.",
    diff,
    payload: row.payload,
    result: row.result ?? undefined,
    errorCode: row.error_code ?? undefined,
  });
}
export async function validateActionReferences(
  ctx: AgentContext,
  type: ActionType,
  payload: ActionPayload,
) {
  assertAgentRole(ctx, operationalRoles);
  const p = payload as any;
  const expected: Record<string, any> = {};
  if (p.attendanceId) {
    const records = await rows(
      attendanceQuery(
        ctx,
        "id,cliente_id,cliente_convertido_id,cliente_nome,imovel_id,imovel_ref,status,pipeline_stage,imobiliaria,corretor_id,updated_at",
      )
        .eq("id", p.attendanceId)
        .limit(1),
      ctx,
    );
    if (!records[0]) throw new Error("Não encontrei o atendimento no seu acesso atual.");
    expected.attendanceUpdatedAt = records[0].updated_at;
    expected.pipelineStage = records[0].pipeline_stage;
    if (p.agency && p.agency !== records[0].imobiliaria)
      throw new Error("O compromisso deve usar a imobiliária do atendimento.");
    if (type === "agenda_event") {
      const clientId = records[0].cliente_convertido_id ?? records[0].cliente_id;
      const propertyId = records[0].imovel_id;
      if (p.clientId && clientId && p.clientId !== clientId)
        throw new Error("O cliente deve corresponder ao atendimento vinculado.");
      if (p.propertyId && propertyId && p.propertyId !== propertyId)
        throw new Error("O imóvel deve corresponder ao atendimento vinculado.");
      if (clientId && !p.clientId) p.clientId = clientId;
      if (propertyId && !p.propertyId) p.propertyId = propertyId;
    }
  }
  if (p.clientId && !(await rows(clientQuery(ctx).eq("id", p.clientId).limit(1), ctx))[0])
    throw new Error("Não encontrei o cliente no seu acesso atual.");
  if (p.agency) {
    const { data, error } = await ctx.supabase.rpc("current_user_has_notification_agency_access", {
      _agency: p.agency,
    });
    if (error || data !== true)
      throw new Error("Esta imobiliária não está disponível para seu perfil.");
  }
  const ids: string[] = p.propertyIds ?? (p.propertyId ? [p.propertyId] : []);
  if (ids.length) {
    const records = await rows(
      ctx.supabase.from("properties").select("id").in("id", ids).is("archived_at", null),
      ctx,
    );
    if (new Set(records.map((r) => r.id)).size !== new Set(ids).size)
      throw new Error("Um imóvel não está mais disponível para esta proposta.");
  }
  if (type === "shared_selection") {
    const { data, error } = await ctx.supabase.rpc("shared_selection_check", { p_ids: ids });
    if (error || !data || data.some((r: any) => !r.eligible))
      throw new Error("Há imóveis que não podem entrar nesta seleção.");
    if (
      p.brokerId &&
      p.brokerId !== ctx.userId &&
      !ctx.roles.some((r) => r === "admin" || r === "secretaria")
    )
      throw new Error("Seu perfil não pode escolher outro responsável.");
  }
  return expected;
}
async function readRow(ctx: AgentContext, id: string): Promise<ActionRow> {
  assertAgentRole(ctx, operationalRoles);
  const { data, error } = await ctx.supabase
    .from("assistant_actions")
    .select(actionSelect)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("scope_key", assistantScopeKey(ctx))
    .maybeSingle();
  if (error || !data) throw new Error("Não encontrei esta proposta no seu acesso atual.");
  return data as ActionRow;
}
export async function readAssistantAction(ctx: AgentContext, id: string): Promise<ActionProposal> {
  return toActionProposal(await readRow(ctx, id));
}
export async function listActions(
  ctx: AgentContext,
  conversationId?: string,
): Promise<ActionProposal[]> {
  assertAgentRole(ctx, operationalRoles);
  let q = ctx.supabase
    .from("assistant_actions")
    .select(actionSelect)
    .eq("user_id", ctx.userId)
    .eq("scope_key", assistantScopeKey(ctx))
    .order("created_at", { ascending: false })
    .limit(50);
  if (conversationId) q = q.eq("conversation_id", conversationId);
  const { data, error } = await q;
  fail(error);
  return (data ?? []).map((r: any) => toActionProposal(r));
}
export async function buildAssistantAction(
  ctx: AgentContext,
  type: ActionType,
  input: unknown,
): Promise<ActionRow> {
  assertAgentRole(ctx, operationalRoles);
  if (!ctx.agentBotId || !actionBots[type].includes(ctx.agentBotId))
    throw new Error("Este agente não prepara essa ação.");
  const available = await ctx.supabase.rpc("assistant_bot_available", { _bot_id: ctx.agentBotId });
  if (available.error || available.data !== true)
    throw new Error("Este agente não está disponível agora.");
  const payload = parseActionPayload(type, input);
  const expected = await validateActionReferences(ctx, type, payload);
  if (ctx.agentConversationId) {
    const { data, error } = await ctx.supabase
      .from("assistant_conversations")
      .select("id")
      .eq("id", ctx.agentConversationId)
      .eq("user_id", ctx.userId)
      .eq("bot_id", ctx.agentBotId)
      .eq("scope_key", assistantScopeKey(ctx))
      .maybeSingle();
    if (error || !data) throw new Error("Conversa não encontrada.");
  }
  const row = {
    id: crypto.randomUUID(),
    type,
    bot_id: ctx.agentBotId,
    conversation_id: ctx.agentConversationId ?? null,
    user_id: ctx.userId,
    scope_key: assistantScopeKey(ctx),
    payload,
    expected_state: expected,
    revision: 1,
    status: "pending" as const,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  return row;
}
export async function prepareAssistantAction(
  ctx: AgentContext,
  type: ActionType,
  input: unknown,
): Promise<ActionProposal> {
  const row = await buildAssistantAction(ctx, type, input);
  // Only assistant metadata is written through this isolated administrative client.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any)
    .from("assistant_actions")
    .insert(row)
    .abortSignal(ctx.signal ?? AbortSignal.timeout(8000));
  fail(error);
  await persistAssistantAudit(
    ctx.userId,
    row.bot_id,
    row.conversation_id ?? null,
    `prepare_${type}`,
    { id: row.id },
    { status: "pending" },
    0,
    ctx.signal,
    assistantScopeKey(ctx),
  );
  return toActionProposal(row as ActionRow);
}
/** Proof never leaves the server: browsers cannot SELECT its column, mint it,
 * or invoke privileged bookkeeping helpers without this single-operation key. */
async function authorizeInteractiveOperation(
  ctx: AgentContext,
  id: string,
  revision: number,
): Promise<string> {
  const proof = crypto.randomUUID();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("assistant_action_authorize", {
    _id: id,
    _user_id: ctx.userId,
    _scope_key: assistantScopeKey(ctx),
    _revision: revision,
    _nonce: proof,
  });
  fail(error);
  if (!data)
    throw new Error("A proposta foi alterada. Consulte o estado atual antes de continuar.");
  return String(data);
}
export async function confirmAction(
  ctx: AgentContext,
  id: string,
  revision: number,
): Promise<ActionProposal> {
  const row = await readRow(ctx, id);
  if (row.status !== "executed") assertActionMutable(toActionProposal(row), revision);
  else {
    if (row.revision !== revision)
      throw new Error("A proposta foi editada. Revise a versão atual.");
    return toActionProposal(row);
  }
  const proof = await authorizeInteractiveOperation(ctx, id, revision);
  // The transaction independently rechecks all access and expected versions.
  const { data, error } = await ctx.supabase
    .rpc("assistant_action_execute", { _id: id, _revision: revision, _proof: proof })
    .abortSignal(ctx.signal ?? AbortSignal.timeout(20_000));
  fail(error);
  const action = toActionProposal(data as ActionRow);
  if (
    action.status === "executed" &&
    action.type === "agenda_event" &&
    (data as any)?.result?.recordId
  ) {
    try {
      const { scheduleGoogleSync } = await import("@/lib/google-calendar/google.server");
      await scheduleGoogleSync((data as any).result.recordId);
    } catch {
      /* Existing queue can reconcile; never repeat the business command. */
    }
  }
  return action;
}
export async function editAction(
  ctx: AgentContext,
  id: string,
  revision: number,
  input: unknown,
): Promise<ActionProposal> {
  const row = await readRow(ctx, id);
  assertActionMutable(toActionProposal(row), revision);
  const payload = parseActionPayload(row.type, input);
  const expected = await validateActionReferences(ctx, row.type, payload);
  const proof = await authorizeInteractiveOperation(ctx, id, revision);
  const { data, error } = await ctx.supabase.rpc("assistant_action_mutate", {
    _id: id,
    _revision: revision,
    _operation: "edit",
    _payload: payload,
    _expected_state: expected,
    _proof: proof,
  });
  fail(error);
  return toActionProposal(data as ActionRow);
}
export async function cancelAction(
  ctx: AgentContext,
  id: string,
  revision: number,
): Promise<ActionProposal> {
  const row = await readRow(ctx, id);
  if (row.status === "cancelled" && row.revision === revision) return toActionProposal(row);
  const proof = await authorizeInteractiveOperation(ctx, id, revision);
  const { data, error } = await ctx.supabase.rpc("assistant_action_mutate", {
    _id: id,
    _revision: revision,
    _operation: "cancel",
    _payload: null,
    _expected_state: null,
    _proof: proof,
  });
  fail(error);
  return toActionProposal(data as ActionRow);
}
