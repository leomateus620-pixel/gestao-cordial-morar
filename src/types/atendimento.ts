export type AtendimentoStatus =
  | "novo"
  | "em_atendimento"
  | "aguardando_retorno"
  | "visita_agendada"
  | "proposta_enviada"
  | "negociacao"
  | "fechado"
  | "perdido"
  | "sem_retorno"
  | "arquivado";

export type PipelineStage =
  | "primeiro_contato"
  | "apresentando_solucao"
  | "visita"
  | "proposta"
  | "fechamento"
  | "perdido"
  | "arquivado";

export const ACTIVE_PIPELINE_STAGES: PipelineStage[] = [
  "primeiro_contato",
  "apresentando_solucao",
  "visita",
  "proposta",
  "fechamento",
];

export const pipelineStageOptions = [
  { value: "primeiro_contato", label: "Primeiro contato", short: "1º contato" },
  { value: "apresentando_solucao", label: "Apresentando solução", short: "Solução" },
  { value: "visita", label: "Visita", short: "Visita" },
  { value: "proposta", label: "Proposta", short: "Proposta" },
  { value: "fechamento", label: "Fechamento", short: "Fechamento" },
  { value: "perdido", label: "Perdido", short: "Perdido" },
  { value: "arquivado", label: "Arquivado", short: "Arquivado" },
] as const;

export function pipelineStageLabel(value: PipelineStage): string {
  return pipelineStageOptions.find((o) => o.value === value)?.label ?? value;
}

export function statusToPipelineStage(status: AtendimentoStatus): PipelineStage {
  switch (status) {
    case "novo":
    case "aguardando_retorno":
    case "sem_retorno":
      return "primeiro_contato";
    case "em_atendimento":
      return "apresentando_solucao";
    case "visita_agendada":
      return "visita";
    case "proposta_enviada":
    case "negociacao":
      return "proposta";
    case "fechado":
      return "fechamento";
    case "perdido":
      return "perdido";
    case "arquivado":
      return "arquivado";
    default:
      return "primeiro_contato";
  }
}

export type AtendimentoFinalidade = "compra" | "aluguel" | "ambos";

export type TipoImovelInteresse =
  | "casa"
  | "apartamento"
  | "terreno"
  | "sala_comercial"
  | "area_rural"
  | "outro";

export type OrigemLeadAtendimento =
  | "whatsapp"
  | "instagram"
  | "indicacao"
  | "site"
  | "portal"
  | "presencial"
  | "porta_fria"
  | "outro";

export type PrioridadeAtendimento = "baixa" | "media" | "alta" | "urgente";

export type ImobiliariaAtendimento = "cordial" | "morar" | "ambas";

export type ProximoPassoAtendimento =
  | "ligar_cliente"
  | "enviar_whatsapp"
  | "enviar_opcoes"
  | "agendar_visita"
  | "fazer_proposta"
  | "aguardar_cliente"
  | "encaminhar_corretor"
  | "outro";

export type ContatoPreferencialAtendimento = "whatsapp" | "ligacao" | "email";
export type DormitoriosAtendimento = "1" | "2" | "3" | "4+" | "nao_aplica";

export type AtendimentoHistorico = {
  id: string;
  data: string;
  descricao: string;
  responsavelId?: string;
  tipo?: "criacao" | "retorno" | "visita" | "proposta" | "status" | "observacao";
};

export type AtendimentoLinkedProperty = {
  id: string;
  titulo: string;
  codigo?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  tipo?: string;
  valor?: number;
};

export type AtendimentoStageTransition = {
  from: PipelineStage | null;
  to: PipelineStage;
  at: string;
  actorId?: string;
  actorName?: string;
  source: string;
};

export interface Atendimento {
  id: string;
  clienteId?: string;
  clienteNome: string;
  telefone: string;
  email?: string;
  contatoPreferencial: ContatoPreferencialAtendimento;
  origem: OrigemLeadAtendimento;
  imobiliaria: ImobiliariaAtendimento;
  corretorId?: string;
  corretorNome?: string;
  finalidade: AtendimentoFinalidade;
  tipoImovel: TipoImovelInteresse;
  dormitorios?: DormitoriosAtendimento;
  bairroInteresse?: string;
  orcamentoMin?: number;
  orcamentoMax?: number;
  imovelId?: string;
  imovelCodigo?: string;
  imovelDescricao?: string;
  imovel?: AtendimentoLinkedProperty;
  interesseDescricao?: string;
  prioridade: PrioridadeAtendimento;
  status: AtendimentoStatus;
  pipelineStage: PipelineStage;
  lastStageTransition?: AtendimentoStageTransition;
  proximoRetorno?: string;
  proximoPasso?: ProximoPassoAtendimento;
  observacoes?: string;
  historicoInicial?: string;
  motivoPerda?: string;
  convertidoEmCliente?: boolean;
  clienteConvertidoId?: string;
  openedAt?: string | null;
  historico: AtendimentoHistorico[];
  criadoEm: string;
  atualizadoEm: string;
}

export type AtendimentoCreateInput = Omit<
  Atendimento,
  | "id"
  | "historico"
  | "criadoEm"
  | "atualizadoEm"
  | "convertidoEmCliente"
  | "clienteConvertidoId"
  | "lastStageTransition"
>;

export type AtendimentoUpdatePatch = Partial<
  Omit<
    AtendimentoCreateInput,
    | "clienteId"
    | "email"
    | "corretorId"
    | "corretorNome"
    | "dormitorios"
    | "bairroInteresse"
    | "orcamentoMin"
    | "orcamentoMax"
    | "imovelId"
    | "imovelCodigo"
    | "imovelDescricao"
    | "imovel"
    | "interesseDescricao"
    | "proximoRetorno"
    | "proximoPasso"
    | "observacoes"
    | "historicoInicial"
    | "motivoPerda"
  >
> & {
  clienteId?: string | null;
  email?: string | null;
  corretorId?: string | null;
  corretorNome?: string | null;
  dormitorios?: DormitoriosAtendimento | null;
  bairroInteresse?: string | null;
  orcamentoMin?: number | null;
  orcamentoMax?: number | null;
  imovelId?: string | null;
  imovelCodigo?: string | null;
  imovelDescricao?: string | null;
  imovel?: AtendimentoLinkedProperty | null;
  interesseDescricao?: string | null;
  proximoRetorno?: string | null;
  proximoPasso?: ProximoPassoAtendimento | null;
  observacoes?: string | null;
  historicoInicial?: string | null;
  motivoPerda?: string | null;
  convertidoEmCliente?: boolean;
  clienteConvertidoId?: string | null;
};

export const atendimentoStatusOptions = [
  { value: "novo", label: "Novo" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "aguardando_retorno", label: "Aguardando retorno" },
  { value: "visita_agendada", label: "Visita agendada" },
  { value: "proposta_enviada", label: "Proposta enviada" },
  { value: "negociacao", label: "Negociação" },
  { value: "fechado", label: "Fechado" },
  { value: "perdido", label: "Perdido" },
  { value: "sem_retorno", label: "Sem retorno" },
  { value: "arquivado", label: "Arquivado" },
] as const;

export const atendimentoFinalidadeOptions = [
  { value: "compra", label: "Compra" },
  { value: "aluguel", label: "Aluguel" },
  { value: "ambos", label: "Ambos" },
] as const;

export const atendimentoTipoImovelOptions = [
  { value: "casa", label: "Casa" },
  { value: "apartamento", label: "Apartamento" },
  { value: "terreno", label: "Terreno" },
  { value: "sala_comercial", label: "Sala comercial" },
  { value: "area_rural", label: "Área rural" },
  { value: "outro", label: "Outro" },
] as const;

export const atendimentoOrigemOptions = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "indicacao", label: "Indicação" },
  { value: "site", label: "Site" },
  { value: "portal", label: "Portal" },
  { value: "presencial", label: "Atendimento presencial" },
  { value: "porta_fria", label: "Porta fria" },
  { value: "outro", label: "Outro" },
] as const;

export const atendimentoPrioridadeOptions = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
] as const;

export const atendimentoImobiliariaOptions = [
  { value: "cordial", label: "Cordial" },
  { value: "morar", label: "Morar" },
  { value: "ambas", label: "Ambas" },
] as const;

export const atendimentoContatoOptions = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ligacao", label: "Ligação" },
  { value: "email", label: "E-mail" },
] as const;

export const atendimentoDormitoriosOptions = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4+", label: "4+" },
  { value: "nao_aplica", label: "Não se aplica" },
] as const;

export const atendimentoProximoPassoOptions = [
  { value: "ligar_cliente", label: "Ligar para cliente" },
  { value: "enviar_whatsapp", label: "Enviar WhatsApp" },
  { value: "enviar_opcoes", label: "Enviar opções de imóveis" },
  { value: "agendar_visita", label: "Agendar visita" },
  { value: "fazer_proposta", label: "Fazer proposta" },
  { value: "aguardar_cliente", label: "Aguardar cliente" },
  { value: "encaminhar_corretor", label: "Encaminhar para corretor" },
  { value: "outro", label: "Outro" },
] as const;

function optionLabel<T extends string>(options: readonly { value: T; label: string }[], value: T) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export const atendimentoStatusLabel = (value: AtendimentoStatus) =>
  optionLabel(atendimentoStatusOptions, value);
export const atendimentoFinalidadeLabel = (value: AtendimentoFinalidade) =>
  optionLabel(atendimentoFinalidadeOptions, value);
export const atendimentoTipoImovelLabel = (value: TipoImovelInteresse) =>
  optionLabel(atendimentoTipoImovelOptions, value);
export const atendimentoOrigemLabel = (value: OrigemLeadAtendimento) =>
  optionLabel(atendimentoOrigemOptions, value);
export const atendimentoPrioridadeLabel = (value: PrioridadeAtendimento) =>
  optionLabel(atendimentoPrioridadeOptions, value);
export const atendimentoImobiliariaLabel = (value: ImobiliariaAtendimento) =>
  optionLabel(atendimentoImobiliariaOptions, value);
export const atendimentoProximoPassoLabel = (value?: ProximoPassoAtendimento) =>
  value ? optionLabel(atendimentoProximoPassoOptions, value) : "A definir";
export const atendimentoDormitoriosLabel = (value?: DormitoriosAtendimento) =>
  value ? optionLabel(atendimentoDormitoriosOptions, value) : "Não informado";
