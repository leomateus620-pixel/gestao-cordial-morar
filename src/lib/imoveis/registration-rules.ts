/**
 * Regras puras da conclusão de cadastro e do agenciamento automático.
 * Sem dependências de servidor: testáveis com TZ=America/Sao_Paulo.
 */
import { dateOnlyKey } from "@/lib/dates";

export type AgencyRole = "admin" | "secretaria" | "corretor" | "financeiro" | string;

/**
 * Corretor do agenciamento automático: corretor do imóvel; senão quem criou
 * (se for corretor); senão quem publicou (se for corretor). Admin/secretária
 * que clicam em publicar nunca viram responsáveis. Sem candidato → null.
 */
export function resolveAutoAgencyBroker(input: {
  propertyCorretorId: string | null | undefined;
  createdBy: string | null | undefined;
  publisherId: string;
  rolesOf: (userId: string) => AgencyRole[];
}): string | null {
  if (input.propertyCorretorId) return input.propertyCorretorId;
  // Quem cadastrou (qualquer perfil, inclusive admin/secretária) é o responsável.
  if (input.createdBy) return input.createdBy;
  const roles = input.rolesOf(input.publisherId);
  if (roles.includes("corretor") && !roles.includes("admin") && !roles.includes("secretaria")) return input.publisherId;
  return null;
}

const isManager = (roles: AgencyRole[]) => roles.includes("admin") || roles.includes("secretaria");

/**
 * Corretor do agenciamento na conclusão do cadastro. Corretor concluindo: ele
 * mesmo. Admin/secretária: escolha explícita; senão corretor do imóvel; senão
 * quem cadastrou (qualquer perfil). Quem só clicou em rascunho alheio nunca
 * vira responsável. Sem candidato → null.
 */
export function resolveFinalizeAgencyBroker(input: {
  actorId: string;
  explicitCorretorId?: string | null;
  propertyCorretorId: string | null | undefined;
  createdBy: string | null | undefined;
  rolesOf: (userId: string) => AgencyRole[];
}): string | null {
  if (!isManager(input.rolesOf(input.actorId))) return input.actorId;
  if (input.explicitCorretorId) return input.explicitCorretorId;
  if (input.propertyCorretorId) return input.propertyCorretorId;
  if (input.createdBy) return input.createdBy;
  return null;
}

/** Salvamento final: corretor vazio no formulário não apaga o do rascunho. */
export function keepDraftBroker<T extends { corretorId?: string | null; corretorNome?: string | null }>(
  values: T,
): T {
  if (values.corretorId) return values;
  const { corretorId: _i, corretorNome: _n, ...rest } = values;
  return rest as T;
}

/** Mesmo critério do servidor para "cadastro concluído". */
export function isFinalizeCompleted(
  steps: { publish: string; agency: string },
  agencyPending = false,
): boolean {
  return steps.publish !== "error" && steps.agency !== "error" && !agencyPending;
}

/** Venda/Aluguel do agenciamento a partir da operação/finalidade do imóvel. */
export function agencyFinalidadeFromProperty(
  finalidade: string | null | undefined,
  operacao: string | null | undefined,
): "venda" | "aluguel" {
  if (finalidade === "locacao" || finalidade === "temporada") return "aluguel";
  if (finalidade === "venda") return "venda";
  return operacao === "aluguel" ? "aluguel" : "venda";
}

/** Dia (São Paulo) em que o imóvel foi criado: vira a data do agenciamento. */
export function agencyDateFromCreatedAt(createdAt: string): string {
  return dateOnlyKey(createdAt);
}

export type RegistrationState = {
  source: string | null;
  isDraft: boolean;
  archived: boolean;
  registrationCompletedAt: string | null;
  hasPublication: boolean;
  hasAgenciamento: boolean;
  createdAt: string;
};

/** Mesmo critério do banco (list_incomplete_registrations). */
export function isRegistrationIncomplete(s: RegistrationState): boolean {
  if (s.source !== "gestao_cordial" || s.archived) return false;
  if (s.isDraft || !s.hasAgenciamento) return true;
  return !s.registrationCompletedAt && !s.hasPublication;
}

/** Alerta: só depois de 30 min e só para imóveis criados após o corte. */
export function shouldAlertIncomplete(
  s: RegistrationState,
  now: Date,
  cutoffIso = "2026-10-02T15:30:00Z",
): boolean {
  const created = new Date(s.createdAt).getTime();
  if (created <= new Date(cutoffIso).getTime()) return false;
  if (now.getTime() - created < 30 * 60_000) return false;
  return isRegistrationIncomplete(s);
}
