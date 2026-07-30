import type { AgendaEventInput, AgendaTipo } from "@/types/agenda";
import type { Atendimento, ProximoPassoAtendimento } from "@/types/atendimento";
import { atendimentoProximoPassoLabel } from "@/types/atendimento";

/** Mapeia o "próximo passo" do atendimento para um tipo de evento da agenda. */
function tipoFromProximoPasso(passo?: ProximoPassoAtendimento): AgendaTipo {
  switch (passo) {
    case "agendar_visita":
      return "visita";
    case "fazer_proposta":
      return "reuniao";
    default:
      return "retorno";
  }
}

function durationMin(tipo: AgendaTipo) {
  return tipo === "visita" ? 60 : 30;
}

/**
 * Constrói o evento de agenda correspondente ao "Próximo passo" preenchido na
 * criação do atendimento. Retorna `null` quando não há data de retorno.
 */
export function buildNextStepAgendaEvent(
  atendimento: Atendimento,
  fallbackResponsavel?: { id?: string; nome?: string },
): AgendaEventInput | null {
  if (!atendimento.proximoRetorno) return null;
  const start = new Date(atendimento.proximoRetorno);
  if (Number.isNaN(start.getTime())) return null;

  const tipo = tipoFromProximoPasso(atendimento.proximoPasso);
  const minutes = durationMin(tipo);
  const end = new Date(start.getTime() + minutes * 60_000);

  const acao = atendimento.proximoPasso
    ? atendimentoProximoPassoLabel(atendimento.proximoPasso)
    : "Retorno";

  const descricaoLinhas = [
    `Próximo passo do atendimento: ${acao}.`,
    atendimento.telefone ? `Contato: ${atendimento.telefone}` : null,
    atendimento.observacoes ? `Observações: ${atendimento.observacoes}` : null,
  ].filter(Boolean) as string[];

  return {
    titulo: `${acao} — ${atendimento.clienteNome}`,
    descricao: descricaoLinhas.join("\n"),
    tipo,
    status: "agendado",
    prioridade: atendimento.prioridade,
    inicio: start.toISOString(),
    fim: end.toISOString(),
    duracaoMin: minutes,
    diaInteiro: false,
    repeticao: "nao",
    imobiliaria: atendimento.imobiliaria,
    clienteId: atendimento.clienteConvertidoId ?? atendimento.clienteId,
    clienteNome: atendimento.clienteNome,
    atendimentoId: atendimento.id,
    imovelId: atendimento.imovelId,
    imovelDescricao: atendimento.imovelDescricao,
    responsavelPrincipalId: atendimento.corretorId ?? fallbackResponsavel?.id,
    responsavelPrincipalNome: atendimento.corretorNome ?? fallbackResponsavel?.nome,
    participantes: [],
    convidados: [],
    lembretes: [],
    checklist: [],
    observacoes: atendimento.observacoes || undefined,
    googleCalendarSyncStatus: "nao_sincronizado",
  };
}
