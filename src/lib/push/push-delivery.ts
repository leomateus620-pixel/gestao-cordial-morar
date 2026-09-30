/**
 * Regras puras de entrega de push (sem I/O), usadas pelo worker e pelos testes.
 */

export const PUSH_TIME_ZONE = "America/Sao_Paulo";
export const PUSH_MAX_ATTEMPTS = 5;
const AGENDA_TYPES = new Set(["agenda_lembrete", "agenda_fotos"]);
const RETRY_MINUTES = [1, 2, 4, 8];

/** Janela de validade: 30 min para avisos de agenda, 10 min para o resto. */
export function pushMaxAgeMinutes(tipo: string | null | undefined): number {
  return tipo && AGENDA_TYPES.has(tipo) ? 30 : 10;
}

/** Evento velho demais para virar push individual (vai para o resumo). */
export function isPushExpired(
  tipo: string | null | undefined,
  eventAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!eventAt) return false;
  const at = new Date(eventAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at > pushMaxAgeMinutes(tipo) * 60_000;
}

/** Próximo passo após uma falha: nova tentativa em 1/2/4/8 min ou falha final. */
export function pushRetryPlan(
  attemptsAfterThisOne: number,
  now: Date = new Date(),
): { status: "failed" | "failed_final"; nextAttemptAt: string | null } {
  if (attemptsAfterThisOne >= PUSH_MAX_ATTEMPTS) return { status: "failed_final", nextAttemptAt: null };
  const index = Math.max(0, Math.min(attemptsAfterThisOne - 1, RETRY_MINUTES.length - 1));
  return {
    status: "failed",
    nextAttemptAt: new Date(now.getTime() + RETRY_MINUTES[index] * 60_000).toISOString(),
  };
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PUSH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "às 15:02" (hoje) ou "em 28/09 às 15:02", no fuso de São Paulo. */
export function formatPushEventTime(
  eventAt: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!eventAt) return null;
  const date = new Date(eventAt);
  if (!Number.isFinite(date.getTime())) return null;
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: PUSH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  if (dayKey(date) === dayKey(now)) return `às ${time}`;
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: PUSH_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  return `em ${day} às ${time}`;
}

const SUMMARY_LABELS: Record<string, [string, string]> = {
  atendimento_iniciado: ["atendimento iniciado", "atendimentos iniciados"],
  atendimento_atribuido: ["atendimento atribuído", "atendimentos atribuídos"],
  agenda_lembrete: ["lembrete de agenda", "lembretes de agenda"],
  agenda_fotos: ["aviso de fotos", "avisos de fotos"],
  agenciamento_bonificacao: ["aviso de bonificação", "avisos de bonificação"],
  venda_realizada: ["venda realizada", "vendas realizadas"],
  venda_vencimento: ["prazo financeiro", "prazos financeiros"],
};

/** Texto do push único de resumo por usuário. */
export function buildPushSummary(tipos: Record<string, number>): { title: string; body: string } {
  const entries = Object.entries(tipos).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const parts = entries.map(([tipo, n]) => {
    const labels = SUMMARY_LABELS[tipo] ?? ["aviso", "avisos"];
    return `${n} ${n === 1 ? labels[0] : labels[1]}`;
  });
  const list =
    parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return {
    title: `🔔 ${total} ${total === 1 ? "aviso" : "avisos"} enquanto você estava sem conexão`,
    body: `${list}. Veja todos na central de notificações.`,
  };
}
