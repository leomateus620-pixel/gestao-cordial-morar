import type { AgencyId } from "@/lib/mock/data";

export type NotificationType =
  | "retorno_cliente"
  | "visita_agendada"
  | "visita_sem_feedback"
  | "contrato_vencendo"
  | "aluguel_atraso"
  | "comissao_pagar"
  | "cobranca_vencida"
  | "reajuste_proximo"
  | "cliente_parado_funil"
  | "proposta_sem_retorno"
  | "documento_pendente";

export type NotificationPriority = "baixa" | "media" | "alta";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  date: string;
  read: boolean;
  priority: NotificationPriority;
  imobiliaria: AgencyId;
  module: "clientes" | "agenda" | "contratos" | "financeiro" | "atendimentos";
};

export const notificationLabels: Record<NotificationType, string> = {
  retorno_cliente: "Retorno de cliente",
  visita_agendada: "Visita agendada",
  visita_sem_feedback: "Visita sem feedback",
  contrato_vencendo: "Contrato vencendo",
  aluguel_atraso: "Aluguel em atraso",
  comissao_pagar: "Comissão a pagar",
  cobranca_vencida: "Cobrança vencida",
  reajuste_proximo: "Reajuste próximo",
  cliente_parado_funil: "Cliente parado no funil",
  proposta_sem_retorno: "Proposta sem retorno",
  documento_pendente: "Documento pendente",
};

export const notificationsSeed: AppNotification[] = [
  {
    id: "n1",
    type: "retorno_cliente",
    title: "Retornar Ana Beatriz",
    description: "Cliente pediu atualização sobre proposta do Edifício Harmonia.",
    date: "2026-06-12T08:10:00",
    read: false,
    priority: "alta",
    imobiliaria: "cordial",
    module: "clientes",
  },
  {
    id: "n2",
    type: "visita_agendada",
    title: "Visita amanhã às 10h",
    description: "Edifício Harmonia com Marcos Lima e Ana Beatriz.",
    date: "2026-06-12T09:00:00",
    read: false,
    priority: "media",
    imobiliaria: "cordial",
    module: "agenda",
  },
  {
    id: "n3",
    type: "visita_sem_feedback",
    title: "Feedback pendente",
    description: "Visita da Casa Bragança ainda não recebeu retorno do corretor.",
    date: "2026-06-11T18:40:00",
    read: false,
    priority: "media",
    imobiliaria: "morar",
    module: "atendimentos",
  },
  {
    id: "n4",
    type: "contrato_vencendo",
    title: "Contrato MOR-2026-014 vence em 15 dias",
    description: "Preparar renovação e conferência documental.",
    date: "2026-06-12T10:20:00",
    read: false,
    priority: "alta",
    imobiliaria: "morar",
    module: "contratos",
  },
  {
    id: "n5",
    type: "aluguel_atraso",
    title: "Aluguel em atraso",
    description: "Sala Comercial Faria Lima está com cobrança de maio pendente.",
    date: "2026-06-10T12:00:00",
    read: false,
    priority: "alta",
    imobiliaria: "morar",
    module: "financeiro",
  },
  {
    id: "n6",
    type: "comissao_pagar",
    title: "Comissão a pagar",
    description: "Separar repasse de comissão do aluguel Casa Vila Nova.",
    date: "2026-06-12T11:15:00",
    read: true,
    priority: "media",
    imobiliaria: "morar",
    module: "financeiro",
  },
  {
    id: "n7",
    type: "cobranca_vencida",
    title: "Cobrança vencida",
    description: "Boleto do Apto Pinheiros venceu sem baixa manual.",
    date: "2026-06-10T16:30:00",
    read: false,
    priority: "alta",
    imobiliaria: "cordial",
    module: "financeiro",
  },
  {
    id: "n8",
    type: "reajuste_proximo",
    title: "Reajuste próximo",
    description: "Loft Vila Madalena entra em janela de reajuste em julho.",
    date: "2026-06-12T07:30:00",
    read: true,
    priority: "baixa",
    imobiliaria: "cordial",
    module: "contratos",
  },
  {
    id: "n9",
    type: "cliente_parado_funil",
    title: "Cliente parado no funil",
    description: "Henrique Borges está sem movimentação há 7 dias.",
    date: "2026-06-09T15:45:00",
    read: false,
    priority: "media",
    imobiliaria: "morar",
    module: "atendimentos",
  },
  {
    id: "n10",
    type: "proposta_sem_retorno",
    title: "Proposta sem retorno",
    description: "João Pedro aguarda resposta da contraproposta do Loft Vila Madalena.",
    date: "2026-06-11T13:05:00",
    read: false,
    priority: "media",
    imobiliaria: "cordial",
    module: "atendimentos",
  },
  {
    id: "n11",
    type: "documento_pendente",
    title: "Documento pendente",
    description: "RG do proprietário da Cobertura Itaim precisa ser anexado.",
    date: "2026-06-12T12:05:00",
    read: false,
    priority: "media",
    imobiliaria: "morar",
    module: "contratos",
  },
];
