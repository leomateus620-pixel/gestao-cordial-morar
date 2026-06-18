export type AgendaTipo =
  | "visita"
  | "fotos"
  | "video"
  | "assinatura"
  | "reuniao"
  | "retorno"
  | "vistoria"
  | "captacao"
  | "interno"
  | "outro";

export type AgendaStatus =
  | "agendado"
  | "confirmado"
  | "em_andamento"
  | "concluido"
  | "cancelado"
  | "reagendado";

export type AgendaPrioridade = "baixa" | "media" | "alta" | "urgente";
export type AgendaImobiliaria = "cordial" | "morar" | "ambas";
export type AgendaRecorrencia = "nao" | "semanal" | "mensal" | "personalizado";
export type GoogleCalendarSyncStatus = "nao_sincronizado" | "preparado" | "sincronizado";

export interface AgendaParticipant {
  userId: string;
  nome: string;
  papel?: "responsavel" | "participante" | "acompanhante";
}

export interface AgendaChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface AgendaReminder {
  id: string;
  tipo: "interno" | "email" | "whatsapp";
  antecedenciaMin: number;
  ativo: boolean;
  canalFuturo?: boolean;
}

export interface AgendaEvent {
  id: string;
  titulo: string;
  descricao?: string;
  tipo: AgendaTipo;
  status: AgendaStatus;
  prioridade: AgendaPrioridade;
  inicio: string;
  fim?: string;
  duracaoMin?: number;
  diaInteiro?: boolean;
  repeticao?: AgendaRecorrencia;
  imobiliaria: AgendaImobiliaria;
  clienteId?: string;
  clienteNome?: string;
  atendimentoId?: string;
  imovelId?: string;
  imovelDescricao?: string;
  local?: string;
  videoCallUrl?: string;
  responsavelPrincipalId?: string;
  responsavelPrincipalNome?: string;
  participantes: AgendaParticipant[];
  lembretes: AgendaReminder[];
  checklist: AgendaChecklistItem[];
  observacoes?: string;
  criadoPorId?: string;
  criadoPorNome?: string;
  atualizadoPorId?: string;
  criadoEm: string;
  atualizadoEm: string;
  googleCalendarSyncStatus: GoogleCalendarSyncStatus;
}

export type AgendaEventInput = Omit<
  AgendaEvent,
  "id" | "criadoEm" | "atualizadoEm" | "criadoPorId" | "criadoPorNome" | "atualizadoPorId"
>;

export const agendaTipoOptions = [
  { value: "visita", label: "Visita" },
  { value: "fotos", label: "Fotos do imóvel" },
  { value: "video", label: "Vídeo do imóvel" },
  { value: "assinatura", label: "Assinatura de contrato" },
  { value: "reuniao", label: "Reunião" },
  { value: "retorno", label: "Retorno para cliente" },
  { value: "vistoria", label: "Vistoria" },
  { value: "captacao", label: "Captação/Agenciamento" },
  { value: "interno", label: "Compromisso interno" },
  { value: "outro", label: "Outro" },
] as const;

export const agendaStatusOptions = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
  { value: "reagendado", label: "Reagendado" },
] as const;

export const agendaPrioridadeOptions = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
] as const;

export const agendaImobiliariaOptions = [
  { value: "cordial", label: "Cordial" },
  { value: "morar", label: "Morar" },
  { value: "ambas", label: "Ambas" },
] as const;

export const agendaRecorrenciaOptions = [
  { value: "nao", label: "Não repetir" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "personalizado", label: "Personalizado (futuro)" },
] as const;

export const agendaReminderOptions = [
  { value: 10, label: "10 min antes" },
  { value: 30, label: "30 min antes" },
  { value: 60, label: "1 hora antes" },
  { value: 1440, label: "1 dia antes" },
  { value: -1, label: "Personalizado" },
] as const;

export const agendaTipoLabel = Object.fromEntries(
  agendaTipoOptions.map((option) => [option.value, option.label]),
) as Record<AgendaTipo, string>;

export const agendaStatusLabel = Object.fromEntries(
  agendaStatusOptions.map((option) => [option.value, option.label]),
) as Record<AgendaStatus, string>;

export const agendaPrioridadeLabel = Object.fromEntries(
  agendaPrioridadeOptions.map((option) => [option.value, option.label]),
) as Record<AgendaPrioridade, string>;

export const agendaImobiliariaLabel = Object.fromEntries(
  agendaImobiliariaOptions.map((option) => [option.value, option.label]),
) as Record<AgendaImobiliaria, string>;
