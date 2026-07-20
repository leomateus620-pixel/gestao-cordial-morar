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
  prioridade: PrioridadeAtendimento;
  status: AtendimentoStatus;
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
  "id" | "historico" | "criadoEm" | "atualizadoEm" | "convertidoEmCliente" | "clienteConvertidoId"
>;

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
