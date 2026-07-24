import {
  ACTIVE_PIPELINE_STAGES,
  atendimentoFinalidadeLabel,
  atendimentoImobiliariaLabel,
  atendimentoOrigemLabel,
  atendimentoProximoPassoLabel,
  atendimentoStatusLabel,
  atendimentoTipoImovelLabel,
  pipelineStageLabel,
  statusToPipelineStage,
  type Atendimento,
  type AtendimentoCreateInput,
  type AtendimentoFinalidade,
  type AtendimentoStatus,
  type ContatoPreferencialAtendimento,
  type DormitoriosAtendimento,
  type ImobiliariaAtendimento,
  type OrigemLeadAtendimento,
  type PipelineStage,
  type PrioridadeAtendimento,
  type ProximoPassoAtendimento,
  type TipoImovelInteresse,
} from "@/types/atendimento";
import type { ClientCreateInput, ClientStatus, LeadOrigin } from "@/types/client";
import { mapCanonicalPropertyFields } from "@/lib/attendances/attendance-field-mapping";
import { normalizeWhatsAppNumber, whatsappHref } from "@/lib/attendances/whatsapp";

type LegacyRecord = Record<string, unknown>;

type NormalizationContext = {
  clientes?: unknown[];
  corretores?: unknown[];
  imoveis?: unknown[];
};

type RelationshipContext = {
  corretores?: unknown[];
  imoveis?: unknown[];
};

export type AtendimentoValidationResult = {
  ok: boolean;
  errors: Partial<Record<keyof AtendimentoCreateInput | "orcamento", string>>;
};

const canonicalStatuses = new Set<AtendimentoStatus>([
  "novo",
  "em_atendimento",
  "aguardando_retorno",
  "visita_agendada",
  "proposta_enviada",
  "negociacao",
  "fechado",
  "perdido",
  "sem_retorno",
  "arquivado",
]);

const canonicalPipelineStages = new Set<PipelineStage>([
  ...ACTIVE_PIPELINE_STAGES,
  "perdido",
  "arquivado",
]);

const canonicalNextActions = new Set<ProximoPassoAtendimento>([
  "ligar_cliente",
  "enviar_whatsapp",
  "enviar_opcoes",
  "agendar_visita",
  "fazer_proposta",
  "aguardar_cliente",
  "encaminhar_corretor",
  "outro",
]);

const generatedId = () => Math.random().toString(36).slice(2, 10);

export function createAtendimentoRecord(
  input: AtendimentoCreateInput,
  now = new Date(),
): Atendimento {
  const timestamp = now.toISOString();
  const createdId = generatedId();
  const initialDetails = input.historicoInicial?.trim();

  return {
    ...input,
    id: createdId,
    clienteNome: input.clienteNome.trim(),
    telefone: input.telefone.trim(),
    email: optionalText(input.email),
    corretorId: input.corretorId === "a_definir" ? undefined : input.corretorId,
    corretorNome: input.corretorId === "a_definir" ? undefined : optionalText(input.corretorNome),
    bairroInteresse: optionalText(input.bairroInteresse),
    imovelId: optionalText(input.imovelId),
    imovelCodigo: optionalText(input.imovelCodigo),
    imovelDescricao: input.imovelId ? optionalText(input.imovelDescricao) : undefined,
    interesseDescricao: optionalText(input.interesseDescricao),
    observacoes: optionalText(input.observacoes),
    historicoInicial: initialDetails,
    motivoPerda: input.status === "perdido" ? optionalText(input.motivoPerda) : undefined,
    convertidoEmCliente: Boolean(input.clienteId),
    clienteConvertidoId: input.clienteId,
    historico: [
      {
        id: `hist-${createdId}-1`,
        data: timestamp,
        descricao: "Atendimento criado pelo formulário.",
        responsavelId: input.corretorId === "a_definir" ? undefined : input.corretorId,
        tipo: "criacao",
      },
      ...(initialDetails
        ? [
            {
              id: `hist-${createdId}-2`,
              data: timestamp,
              descricao: initialDetails,
              responsavelId: input.corretorId === "a_definir" ? undefined : input.corretorId,
              tipo: "observacao" as const,
            },
          ]
        : []),
    ],
    criadoEm: timestamp,
    atualizadoEm: timestamp,
  };
}

export function normalizeAtendimento(
  rawValue: unknown,
  context: NormalizationContext = {},
): Atendimento {
  const raw = isRecord(rawValue) ? rawValue : {};
  const cliente = context.clientes?.find(
    (item): item is LegacyRecord =>
      isRecord(item) && stringValue(item.id) === stringValue(raw.clienteId),
  );
  const corretor = context.corretores?.find(
    (item): item is LegacyRecord =>
      isRecord(item) && stringValue(item.id) === stringValue(raw.corretorId),
  );
  const imovel = context.imoveis?.find(
    (item): item is LegacyRecord =>
      isRecord(item) && stringValue(item.id) === stringValue(raw.imovelId),
  );
  const id = stringValue(raw.id) || generatedId();
  const criadoEm = dateValue(raw.criadoEm ?? raw.createdAt ?? raw.data) ?? new Date().toISOString();
  const clienteNome =
    stringValue(raw.clienteNome ?? raw.nomeContato ?? raw.nome) ||
    stringValue(cliente?.fullName ?? cliente?.nome) ||
    "Contato sem nome";
  const telefone =
    stringValue(raw.telefone ?? raw.whatsapp ?? raw.phone) ||
    stringValue(cliente?.telefone ?? cliente?.phone ?? cliente?.whatsapp);
  const status = normalizeStatus(raw.status);
  const corretorId = optionalText(stringValue(raw.corretorId ?? raw.assignedBrokerId));
  const corretorNome =
    optionalText(stringValue(raw.corretorNome ?? raw.assignedBrokerName ?? raw.responsavel)) ??
    optionalText(stringValue(corretor?.nome));
  const finalidade = normalizeFinalidade(
    raw.finalidade ?? raw.interesse ?? cliente?.purpose ?? cliente?.tipo,
  );
  const tipoImovel = normalizeTipoImovel(
    raw.tipoImovel ?? raw.propertyType ?? imovel?.tipo ?? cliente?.propertyType,
  );
  const minBudget =
    numberValue(raw.orcamentoMin ?? raw.minBudget) ?? rangeValue(raw.faixaValor, "minimo");
  const maxBudget =
    numberValue(raw.orcamentoMax ?? raw.maxBudget) ?? rangeValue(raw.faixaValor, "maximo");
  const rawHistory = Array.isArray(raw.historico) ? raw.historico : [];
  const canonicalProperty = mapCanonicalPropertyFields({
    propertyId: optionalText(stringValue(raw.imovelId)),
    propertyCode: optionalText(stringValue(raw.imovelCodigo ?? imovel?.codigoInterno)),
    propertyTitle: optionalText(stringValue(imovel?.titulo ?? raw.imovelDescricao)),
    interestDescription: optionalText(
      stringValue(
        raw.interesseDescricao ?? raw.interestDescription ?? raw.propertyInterestDescription,
      ),
    ),
  });
  const imovelId = canonicalProperty.propertyId;

  const statusNorm = status;
  return {
    id,
    clienteId: optionalText(stringValue(raw.clienteId)),
    clienteNome,
    telefone,
    pipelineStage:
      (raw.pipelineStage as PipelineStage | undefined) ?? statusToPipelineStage(statusNorm),
    email: optionalText(stringValue(raw.email ?? cliente?.email)),
    contatoPreferencial: normalizeContato(
      raw.contatoPreferencial ??
        raw.contactPreference ??
        cliente?.contactPreference ??
        cliente?.preferenciaContato,
    ),
    origem: normalizeOrigem(raw.origem ?? raw.leadOrigin ?? cliente?.leadOrigin),
    imobiliaria: normalizeImobiliaria(raw.imobiliaria ?? raw.brand ?? cliente?.brand),
    corretorId,
    corretorNome,
    finalidade,
    tipoImovel,
    dormitorios: normalizeDormitorios(raw.dormitorios ?? raw.bedrooms),
    bairroInteresse: optionalText(
      stringValue(raw.bairroInteresse ?? raw.bairro ?? raw.neighborhood ?? cliente?.neighborhood),
    ),
    orcamentoMin: minBudget,
    orcamentoMax: maxBudget,
    imovelId,
    imovelCodigo: canonicalProperty.propertyCode,
    imovelDescricao: canonicalProperty.propertyTitle,
    imovel: imovelId ? linkedPropertyFromRecord(imovelId, imovel, raw) : undefined,
    interesseDescricao: canonicalProperty.interestDescription,
    prioridade: normalizePrioridade(raw.prioridade ?? raw.urgencia),
    status,
    proximoRetorno: dateValue(raw.proximoRetorno ?? raw.nextFollowUpAt),
    proximoPasso: normalizeProximoPasso(raw.proximoPasso ?? raw.nextStep, status),
    observacoes: optionalText(stringValue(raw.observacoes ?? raw.notes)),
    historicoInicial: optionalText(stringValue(raw.historicoInicial)),
    motivoPerda: optionalText(stringValue(raw.motivoPerda)),
    convertidoEmCliente: Boolean(raw.convertidoEmCliente ?? raw.clienteConvertidoId),
    clienteConvertidoId: optionalText(stringValue(raw.clienteConvertidoId)),
    historico:
      rawHistory.length > 0
        ? rawHistory.map((item, index) => normalizeHistory(item, id, index, criadoEm))
        : [
            {
              id: `hist-${id}-legacy`,
              data: criadoEm,
              descricao: "Atendimento importado do histórico local.",
              responsavelId: corretorId,
              tipo: "criacao",
            },
          ],
    criadoEm,
    atualizadoEm: dateValue(raw.atualizadoEm ?? raw.updatedAt) ?? criadoEm,
  };
}

export function validateAtendimentoInput(
  input: AtendimentoCreateInput,
): AtendimentoValidationResult {
  const errors: AtendimentoValidationResult["errors"] = {};

  if (!input.clienteNome.trim()) errors.clienteNome = "Informe o nome do contato.";
  if (!input.telefone.trim()) {
    errors.telefone = "Informe o telefone.";
  } else if (input.telefone.replace(/\D/g, "").length < 10) {
    errors.telefone = "Informe um telefone brasileiro válido.";
  }
  if (!input.origem) errors.origem = "Selecione a origem.";
  if (!input.imobiliaria) errors.imobiliaria = "Selecione a imobiliária.";
  if (!input.finalidade) errors.finalidade = "Selecione a finalidade.";
  if (!input.tipoImovel) errors.tipoImovel = "Selecione o tipo de imóvel.";
  if (!input.status) errors.status = "Selecione o status.";
  if (!input.prioridade) errors.prioridade = "Selecione a prioridade.";

  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    errors.email = "Informe um e-mail válido.";
  }

  if (
    typeof input.orcamentoMin === "number" &&
    typeof input.orcamentoMax === "number" &&
    input.orcamentoMin > input.orcamentoMax
  ) {
    errors.orcamento = "O orçamento mínimo não pode ser maior que o máximo.";
  }

  if (input.status === "perdido" && !input.motivoPerda?.trim()) {
    errors.motivoPerda = "Informe o motivo da perda.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function atendimentoMatchesSearch(atendimento: Atendimento, query: string) {
  const q = normalizeText(query);
  if (!q) return true;

  const haystack = [
    atendimento.clienteNome,
    atendimento.telefone,
    atendimento.email,
    atendimentoOrigemLabel(atendimento.origem),
    atendimento.bairroInteresse,
    atendimentoTipoImovelLabel(atendimento.tipoImovel),
    atendimento.corretorNome,
    atendimentoStatusLabel(atendimento.status),
    atendimento.observacoes,
    atendimento.interesseDescricao,
    atendimento.imovelDescricao,
    atendimento.imovelCodigo,
    atendimento.imovel?.endereco,
  ]
    .filter(Boolean)
    .join(" ");

  return normalizeText(haystack).includes(q);
}

export function atendimentoMatchesAgency(
  atendimento: Atendimento,
  agency: "todas" | "cordial" | "morar",
) {
  return (
    agency === "todas" || atendimento.imobiliaria === agency || atendimento.imobiliaria === "ambas"
  );
}

export function formatAtendimentoBudget(atendimento: Atendimento) {
  const min = atendimento.orcamentoMin;
  const max = atendimento.orcamentoMax;
  if (min !== undefined && max !== undefined && min !== max)
    return `${formatCompactCurrency(min)} a ${formatCompactCurrency(max)}`;
  const value = max ?? min;
  return value !== undefined ? formatCompactCurrency(value) : "A combinar";
}

export function atendimentoInterestLine(atendimento: Atendimento) {
  const bedrooms =
    atendimento.dormitorios && atendimento.dormitorios !== "nao_aplica"
      ? ` · ${atendimento.dormitorios} dormitório${atendimento.dormitorios === "1" ? "" : "s"}`
      : "";
  const region = atendimento.bairroInteresse ? ` · ${atendimento.bairroInteresse}` : "";
  return `${atendimentoFinalidadeLabel(atendimento.finalidade)} · ${atendimentoTipoImovelLabel(atendimento.tipoImovel)}${bedrooms}${region}`;
}

export function atendimentoToClientInput(atendimento: Atendimento): ClientCreateInput {
  return {
    fullName: atendimento.clienteNome,
    phone: atendimento.telefone,
    email: atendimento.email,
    clientType: atendimento.finalidade === "aluguel" ? "locatario" : "comprador",
    contactPreference: atendimento.contatoPreferencial,
    leadOrigin: mapOriginToClient(atendimento.origem),
    brand: atendimento.imobiliaria,
    assignedBrokerId: atendimento.corretorId,
    assignedBrokerName: atendimento.corretorNome,
    purpose: atendimento.finalidade,
    propertyType: atendimento.tipoImovel,
    bedrooms: atendimento.dormitorios,
    neighborhood: atendimento.bairroInteresse,
    minBudget: atendimento.orcamentoMin,
    maxBudget: atendimento.orcamentoMax,
    notes:
      [atendimento.interesseDescricao, atendimento.observacoes].filter(Boolean).join(" · ") ||
      undefined,
    nextStep: atendimentoProximoPassoLabel(atendimento.proximoPasso),
    nextFollowUpAt: atendimento.proximoRetorno,
    status: mapStatusToClient(atendimento.status),
  };
}

export function formatCompactCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  });
}

export function formatDateTime(value?: string) {
  if (!value) return "A definir";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "A definir";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value?: string) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatExactDateTime(value?: string) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function hydrateAtendimentoRelationships(
  atendimento: Atendimento,
  context: RelationshipContext,
): Atendimento {
  const corretor = context.corretores?.find(
    (item) => isRecord(item) && stringValue(item.id) === atendimento.corretorId,
  );
  const imovel = atendimento.imovelId
    ? context.imoveis?.find(
        (item) => isRecord(item) && stringValue(item.id) === atendimento.imovelId,
      )
    : undefined;
  const interesseDescricao =
    atendimento.interesseDescricao ??
    (!atendimento.imovelId ? optionalText(atendimento.imovelDescricao) : undefined);

  return {
    ...atendimento,
    corretorNome:
      (isRecord(corretor) ? optionalText(stringValue(corretor.nome)) : undefined) ??
      atendimento.corretorNome,
    interesseDescricao,
    imovelDescricao: atendimento.imovelId
      ? ((isRecord(imovel) ? optionalText(stringValue(imovel.titulo)) : undefined) ??
        atendimento.imovelDescricao)
      : undefined,
    imovelCodigo: atendimento.imovelId
      ? ((isRecord(imovel) ? optionalText(stringValue(imovel.codigoInterno)) : undefined) ??
        atendimento.imovelCodigo)
      : undefined,
    imovel: atendimento.imovelId
      ? linkedPropertyFromRecord(
          atendimento.imovelId,
          imovel,
          atendimento as unknown as LegacyRecord,
        )
      : undefined,
  };
}

export function isAtendimentoOverdue(atendimento: Atendimento, now = new Date()) {
  if (
    !atendimento.proximoRetorno ||
    atendimento.pipelineStage === "fechamento" ||
    atendimento.pipelineStage === "perdido" ||
    atendimento.pipelineStage === "arquivado"
  ) {
    return false;
  }
  const returnAt = new Date(atendimento.proximoRetorno);
  return !Number.isNaN(returnAt.getTime()) && returnAt.getTime() < now.getTime();
}

export function getPipelineContext(atendimento: Atendimento) {
  const current = atendimento.pipelineStage;
  const currentIndex = ACTIVE_PIPELINE_STAGES.indexOf(current);
  const logicalPrevious = currentIndex > 0 ? ACTIVE_PIPELINE_STAGES[currentIndex - 1] : null;
  const logicalNext =
    currentIndex >= 0 && currentIndex < ACTIVE_PIPELINE_STAGES.length - 1
      ? ACTIVE_PIPELINE_STAGES[currentIndex + 1]
      : null;
  return {
    previous: atendimento.lastStageTransition?.from ?? logicalPrevious,
    current,
    next: logicalNext,
    transitionAt: atendimento.lastStageTransition?.at,
    transitionActor: atendimento.lastStageTransition?.actorName,
    transitionSource: atendimento.lastStageTransition?.source,
  };
}

type HistoryEventLike = {
  eventType: string;
  description?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
};

export function describeAttendanceHistoryEvent(event: HistoryEventLike): string {
  const previous = isRecord(event.previousValue) ? event.previousValue : {};
  const next = isRecord(event.newValue) ? event.newValue : {};

  if (event.eventType === "stage_change") {
    const from = pipelineStageValue(previous.pipeline_stage);
    const to = pipelineStageValue(next.pipeline_stage);
    if (from && to)
      return `Etapa alterada de ${pipelineStageLabel(from)} para ${pipelineStageLabel(to)}.`;
  }
  if (event.eventType === "status_change") {
    const from = statusValue(previous.status);
    const to = statusValue(next.status);
    if (from && to)
      return `Status alterado de ${atendimentoStatusLabel(from)} para ${atendimentoStatusLabel(to)}.`;
  }
  if (event.eventType === "broker_change") {
    const from = optionalText(stringValue(previous.corretor_nome)) ?? "A definir";
    const to = optionalText(stringValue(next.corretor_nome)) ?? "A definir";
    return `Corretor responsável alterado de ${from} para ${to}.`;
  }
  if (event.eventType === "property_link") {
    const from =
      optionalText(stringValue(previous.imovel_descricao ?? previous.imovel_codigo)) ??
      "nenhum imóvel";
    const to =
      optionalText(stringValue(next.imovel_descricao ?? next.imovel_codigo)) ?? "nenhum imóvel";
    return `Imóvel vinculado alterado de ${from} para ${to}.`;
  }
  if (event.eventType === "next_return") {
    const nextReturn = optionalText(stringValue(next.proximo_retorno));
    return nextReturn
      ? `Próximo retorno agendado para ${formatExactDateTime(nextReturn)}.`
      : "Próximo retorno removido.";
  }
  if (event.eventType === "next_action") {
    const action = proximoPassoValue(next.proximo_passo);
    return action
      ? `Próxima ação definida como ${atendimentoProximoPassoLabel(action)}.`
      : "Próxima ação removida.";
  }
  return optionalText(event.description ?? undefined) ?? "Atualização registrada.";
}

function linkedPropertyFromRecord(
  id: string,
  propertyValue: unknown,
  fallback: LegacyRecord,
): Atendimento["imovel"] {
  const property = isRecord(propertyValue) ? propertyValue : {};
  const titulo =
    optionalText(stringValue(property.titulo ?? fallback.imovelDescricao)) ??
    optionalText(stringValue(property.codigoInterno ?? fallback.imovelCodigo)) ??
    `Imóvel ${id.slice(0, 8)}`;
  const valor =
    numberValue(property.valorVenda) ??
    numberValue(property.valorAluguel) ??
    numberValue(property.valor);
  return {
    id,
    titulo,
    codigo: optionalText(stringValue(property.codigoInterno ?? fallback.imovelCodigo)),
    endereco: optionalText(stringValue(property.endereco)),
    bairro: optionalText(stringValue(property.bairro)),
    cidade: optionalText(stringValue(property.cidade)),
    tipo: optionalText(stringValue(property.tipo)),
    valor,
  };
}

function normalizeHistory(
  value: unknown,
  atendimentoId: string,
  index: number,
  fallbackDate: string,
): Atendimento["historico"][number] {
  const item = isRecord(value) ? value : {};
  return {
    id: stringValue(item.id) || `hist-${atendimentoId}-${index + 1}`,
    data: dateValue(item.data) ?? fallbackDate,
    descricao: stringValue(item.descricao) || "Registro importado.",
    responsavelId: optionalText(stringValue(item.responsavelId)),
    tipo: normalizeHistoryType(item.tipo),
  };
}

function normalizeStatus(value: unknown): AtendimentoStatus {
  if (typeof value === "string" && canonicalStatuses.has(value as AtendimentoStatus)) {
    return value as AtendimentoStatus;
  }
  const normalized = normalizeText(stringValue(value));
  if (normalized.includes("arquiv") || normalized.includes("paus")) return "arquivado";
  if (normalized.includes("sem retorno")) return "sem_retorno";
  if (normalized.includes("perdid")) return "perdido";
  if (normalized.includes("fechad")) return "fechado";
  if (normalized.includes("negoci")) return "negociacao";
  if (normalized.includes("proposta")) return "proposta_enviada";
  if (normalized.includes("visita")) return "visita_agendada";
  if (normalized.includes("aguard")) return "aguardando_retorno";
  if (normalized.includes("atendimento")) return "em_atendimento";
  return "novo";
}

function pipelineStageValue(value: unknown): PipelineStage | undefined {
  return typeof value === "string" && canonicalPipelineStages.has(value as PipelineStage)
    ? (value as PipelineStage)
    : undefined;
}

function statusValue(value: unknown): AtendimentoStatus | undefined {
  return typeof value === "string" && canonicalStatuses.has(value as AtendimentoStatus)
    ? (value as AtendimentoStatus)
    : undefined;
}

function proximoPassoValue(value: unknown): ProximoPassoAtendimento | undefined {
  return typeof value === "string" && canonicalNextActions.has(value as ProximoPassoAtendimento)
    ? (value as ProximoPassoAtendimento)
    : undefined;
}

function normalizeFinalidade(value: unknown): AtendimentoFinalidade {
  const normalized = normalizeText(stringValue(value));
  if (normalized.includes("amb")) return "ambos";
  if (normalized.includes("alug") || normalized.includes("locat")) return "aluguel";
  return "compra";
}

function normalizeTipoImovel(value: unknown): TipoImovelInteresse {
  const normalized = normalizeText(stringValue(value));
  if (normalized.includes("casa")) return "casa";
  if (normalized.includes("terreno")) return "terreno";
  if (normalized.includes("sala") || normalized.includes("comercial")) return "sala_comercial";
  if (normalized.includes("rural") || normalized.includes("area")) return "area_rural";
  if (
    normalized.includes("apart") ||
    normalized.includes("loft") ||
    normalized.includes("cobertura")
  ) {
    return "apartamento";
  }
  return "outro";
}

function normalizeOrigem(value: unknown): OrigemLeadAtendimento {
  const normalized = normalizeText(stringValue(value));
  if (normalized.includes("instagram")) return "instagram";
  if (normalized.includes("indic")) return "indicacao";
  if (normalized.includes("site")) return "site";
  if (normalized.includes("portal")) return "portal";
  if (normalized.includes("porta")) return "porta_fria";
  if (normalized.includes("presencial") || normalized.includes("captacao")) return "presencial";
  if (normalized.includes("whatsapp")) return "whatsapp";
  return "outro";
}

function normalizePrioridade(value: unknown): PrioridadeAtendimento {
  const normalized = normalizeText(stringValue(value));
  if (normalized.includes("imediat") || normalized.includes("urgent")) return "urgente";
  if (normalized.includes("alta")) return "alta";
  if (normalized.includes("baixa")) return "baixa";
  return "media";
}

function normalizeImobiliaria(value: unknown): ImobiliariaAtendimento {
  const normalized = normalizeText(stringValue(value));
  if (normalized.includes("amb")) return "ambas";
  if (normalized.includes("morar")) return "morar";
  return "cordial";
}

function normalizeContato(value: unknown): ContatoPreferencialAtendimento {
  const normalized = normalizeText(stringValue(value));
  if (normalized.includes("email") || normalized.includes("e-mail")) return "email";
  if (normalized.includes("lig") || normalized.includes("telefon")) return "ligacao";
  return "whatsapp";
}

function normalizeDormitorios(value: unknown): DormitoriosAtendimento | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = normalizeText(String(value));
  if (normalized.includes("nao") || normalized === "0") return "nao_aplica";
  const numeric = Number.parseInt(normalized, 10);
  if (numeric >= 4) return "4+";
  if (numeric >= 1 && numeric <= 3) return String(numeric) as DormitoriosAtendimento;
  return undefined;
}

function normalizeProximoPasso(
  value: unknown,
  status: AtendimentoStatus,
): ProximoPassoAtendimento | undefined {
  const normalized = normalizeText(stringValue(value));
  if (!normalized) return status === "visita_agendada" ? "agendar_visita" : undefined;
  if (normalized.includes("whatsapp")) return "enviar_whatsapp";
  if (normalized.includes("lig")) return "ligar_cliente";
  if (normalized.includes("op")) return "enviar_opcoes";
  if (normalized.includes("visita")) return "agendar_visita";
  if (normalized.includes("proposta")) return "fazer_proposta";
  if (normalized.includes("aguard")) return "aguardar_cliente";
  if (normalized.includes("corretor")) return "encaminhar_corretor";
  return "outro";
}

function normalizeHistoryType(value: unknown): Atendimento["historico"][number]["tipo"] {
  const normalized = normalizeText(stringValue(value));
  if (normalized.includes("retorno")) return "retorno";
  if (normalized.includes("visita")) return "visita";
  if (normalized.includes("proposta")) return "proposta";
  if (normalized.includes("status")) return "status";
  if (normalized.includes("criacao")) return "criacao";
  return "observacao";
}

function mapOriginToClient(value: OrigemLeadAtendimento): LeadOrigin {
  if (value === "porta_fria" || value === "presencial") return "presencial";
  return value;
}

function mapStatusToClient(value: AtendimentoStatus): ClientStatus {
  if (value === "negociacao") return "em_negociacao";
  if (value === "arquivado") return "sem_retorno";
  return value;
}

function rangeValue(value: unknown, key: "minimo" | "maximo") {
  return isRecord(value) ? numberValue(value[key]) : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function isRecord(value: unknown): value is LegacyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export { formatCurrencyBR, formatPhoneBR, parseCurrencyBR } from "@/services/clients";
export { normalizeWhatsAppNumber, whatsappHref };
export { atendimentoImobiliariaLabel };
