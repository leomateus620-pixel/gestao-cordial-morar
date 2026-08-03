import {
  atendimentoDormitoriosLabel,
  atendimentoFinalidadeLabel,
  atendimentoOrigemLabel,
  atendimentoPrioridadeLabel,
  atendimentoProximoPassoLabel,
  atendimentoTipoImovelLabel,
  type Atendimento,
} from "../../types/atendimento.ts";
import { brl } from "../format.ts";

function formatPhone(value?: string | null): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  }
  return value?.trim() || null;
}

function formatDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  if (!hasTime) return day;
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day} às ${time}`;
}

function contactChannelLabel(atendimento: Atendimento): string | null {
  switch (atendimento.contatoPreferencial) {
    case "whatsapp":
      return "WhatsApp";
    case "ligacao":
      return "ligação";
    case "email":
      return "e-mail";
    default:
      return null;
  }
}

function budgetLine(atendimento: Atendimento): string | null {
  const { orcamentoMin: min, orcamentoMax: max } = atendimento;
  if (min && max) return `${brl(min)} a ${brl(max)}`;
  if (max) return `até ${brl(max)}`;
  if (min) return `a partir de ${brl(min)}`;
  return null;
}

function propertyLine(atendimento: Atendimento): string | null {
  const parts = [
    atendimento.imovelCodigo ?? atendimento.imovel?.codigo,
    atendimento.imovelDescricao ?? atendimento.imovel?.titulo ?? atendimento.interesseDescricao,
  ].filter((part): part is string => Boolean(part && part.trim()));
  if (parts.length === 0) return null;
  return parts.join(" — ");
}

function interestLine(atendimento: Atendimento): string {
  const parts = [
    atendimentoFinalidadeLabel(atendimento.finalidade),
    atendimentoTipoImovelLabel(atendimento.tipoImovel),
  ];
  if (atendimento.dormitorios && atendimento.dormitorios !== "nao_aplica") {
    parts.push(`${atendimentoDormitoriosLabel(atendimento.dormitorios)} dormitórios`);
  }
  return parts.join(" • ");
}

function nextStepLine(atendimento: Atendimento): string | null {
  const hasStep = Boolean(atendimento.proximoPasso);
  const when = formatDateTime(atendimento.proximoRetorno);
  if (!hasStep && !when) return null;
  const label = hasStep ? atendimentoProximoPassoLabel(atendimento.proximoPasso) : "Retorno";
  return when ? `${label} — ${when}` : label;
}

/**
 * Monta a mensagem pronta de repasse do atendimento para o corretor.
 * Somente campos preenchidos entram no texto — nada de "não informado".
 */
export function buildHandoffMessage(atendimento: Atendimento, autorNome?: string): string {
  const lines: string[] = [];
  lines.push(`Novo atendimento — ${atendimento.clienteNome}`);
  lines.push(`Corretor responsável: ${atendimento.corretorNome?.trim() || "a definir"}`);
  lines.push("");

  const phone = formatPhone(atendimento.telefone);
  const channel = contactChannelLabel(atendimento);
  if (phone) lines.push(`Contato: ${phone}${channel ? ` (${channel})` : ""}`);
  else if (atendimento.email) lines.push(`Contato: ${atendimento.email}`);
  if (phone && atendimento.email) lines.push(`E-mail: ${atendimento.email}`);

  lines.push(`Origem: ${atendimentoOrigemLabel(atendimento.origem)}`);
  lines.push(`Interesse: ${interestLine(atendimento)}`);

  if (atendimento.bairroInteresse?.trim()) {
    lines.push(`Bairro: ${atendimento.bairroInteresse.trim()}`);
  }

  const budget = budgetLine(atendimento);
  if (budget) lines.push(`Orçamento: ${budget}`);

  const property = propertyLine(atendimento);
  if (property) lines.push(`Imóvel: ${property}`);

  lines.push(`Prioridade: ${atendimentoPrioridadeLabel(atendimento.prioridade)}`);

  const nextStep = nextStepLine(atendimento);
  if (nextStep) lines.push(`Próximo passo: ${nextStep}`);

  const notes = atendimento.observacoes?.trim() || atendimento.historicoInicial?.trim();
  if (notes) lines.push(`Obs.: ${notes}`);

  const createdAt = new Date(atendimento.criadoEm);
  if (!Number.isNaN(createdAt.getTime())) {
    const date = createdAt.toLocaleDateString("pt-BR");
    const time = createdAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    lines.push("");
    lines.push(
      autorNome?.trim()
        ? `Cadastrado por ${autorNome.trim()} em ${date} às ${time}`
        : `Cadastrado em ${date} às ${time}`,
    );
  }

  return lines.join("\n");
}
