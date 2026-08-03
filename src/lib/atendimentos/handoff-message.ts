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

function budgetPhrase(atendimento: Atendimento): string | null {
  const { orcamentoMin: min, orcamentoMax: max } = atendimento;
  if (min && max) return `com orçamento entre ${brl(min)} e ${brl(max)}`;
  if (max) return `com orçamento de até ${brl(max)}`;
  if (min) return `com orçamento a partir de ${brl(min)}`;
  return null;
}

function propertyLabel(atendimento: Atendimento): string | null {
  const parts = [
    atendimento.imovelCodigo ?? atendimento.imovel?.codigo,
    atendimento.imovelDescricao ?? atendimento.imovel?.titulo ?? atendimento.interesseDescricao,
  ].filter((part): part is string => Boolean(part && part.trim()));
  if (parts.length === 0) return null;
  return parts.join(" — ");
}

function firstName(value?: string | null): string | null {
  const name = value?.trim();
  if (!name) return null;
  return name.split(/\s+/)[0] ?? null;
}

function lower(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function interestPhrase(atendimento: Atendimento): string {
  const tipo = lower(atendimentoTipoImovelLabel(atendimento.tipoImovel));
  const finalidade = lower(atendimentoFinalidadeLabel(atendimento.finalidade));
  const dorms =
    atendimento.dormitorios && atendimento.dormitorios !== "nao_aplica"
      ? ` de ${atendimentoDormitoriosLabel(atendimento.dormitorios)} dormitórios`
      : "";
  return `procura ${tipo === "apartamento" ? "um" : "uma"} ${tipo}${dorms} para ${finalidade}`;
}

/**
 * Monta a mensagem pronta de repasse do atendimento para o corretor,
 * em linguagem natural. Somente informações preenchidas entram no texto.
 */
export function buildHandoffMessage(atendimento: Atendimento, autorNome?: string): string {
  const paragraphs: string[] = [];

  const corretor = firstName(atendimento.corretorNome);
  paragraphs.push(
    corretor
      ? `Oi, ${corretor}! Tem um novo atendimento vinculado a você.`
      : "Oi! Tem um novo atendimento vinculado a você (corretor a definir).",
  );

  // Resumo do interesse
  const autor = firstName(autorNome);
  const cliente = atendimento.clienteNome.trim();
  const origem = atendimentoOrigemLabel(atendimento.origem);

  const resumo: string[] = [];
  resumo.push(
    autor
      ? `${autor} acabou de falar com ${cliente}`
      : `Acabamos de registrar o atendimento de ${cliente}`,
  );

  const detalhes: string[] = [];
  if (origem) detalhes.push(`chegou pelo ${origem}`);
  detalhes.push(interestPhrase(atendimento));
  if (atendimento.bairroInteresse?.trim()) {
    detalhes.push(`no bairro ${atendimento.bairroInteresse.trim()}`);
  }
  const budget = budgetPhrase(atendimento);
  if (budget) detalhes.push(budget);
  paragraphs.push(`${resumo[0]}, que ${detalhes.join(", ")}.`);

  // Imóvel, contato, prioridade e próximo passo
  const bloco: string[] = [];
  const property = propertyLabel(atendimento);
  if (property) bloco.push(`O imóvel de referência é o ${property}.`);

  const phone = formatPhone(atendimento.telefone);
  const channel = contactChannelLabel(atendimento);
  if (phone) {
    bloco.push(
      channel && channel !== "e-mail"
        ? `O contato preferido é por ${channel}: ${phone}.`
        : `O telefone de contato é ${phone}.`,
    );
  }

  bloco.push(`A prioridade desse atendimento é ${lower(atendimentoPrioridadeLabel(atendimento.prioridade))}.`);

  const when = formatDateTime(atendimento.proximoRetorno);
  if (atendimento.proximoPasso) {
    const passo = lower(atendimentoProximoPassoLabel(atendimento.proximoPasso));
    bloco.push(when ? `O próximo passo é ${passo}, em ${when}.` : `O próximo passo é ${passo}.`);
  } else if (when) {
    bloco.push(`O retorno está previsto para ${when}.`);
  }
  paragraphs.push(bloco.join(" "));

  const notes = atendimento.observacoes?.trim() || atendimento.historicoInicial?.trim();
  if (notes) paragraphs.push(`Observação: ${notes}`);

  paragraphs.push("Qualquer dúvida é só chamar. Bom atendimento!");

  return paragraphs.join("\n\n");
}
