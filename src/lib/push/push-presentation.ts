import {
  getNotificationTypeConfig,
  type NotificationCategory,
} from "@/lib/notifications/notification-system";

/**
 * Apresentação do push espelhando a central de notificações.
 * Módulo puro (sem React) para poder ser usado também no worker do servidor.
 */

export type PushPresentation = {
  title: string;
  body: string;
  label: string;
  category: NotificationCategory;
  emoji: string;
  icon: string;
  badge: string;
  tag: string;
  ctaLabel: string;
  link: string;
};

const CATEGORY_EMOJI: Record<NotificationCategory, string> = {
  attendance: "🤝",
  agenda: "📅",
  financial: "💰",
  system: "🔔",
};

const TYPE_EMOJI: Record<string, string> = {
  atendimento_atribuido: "🤝",
  atendimento_iniciado: "📣",
  agenda_lembrete: "⏰",
  agenda_fotos: "📸",
  venda_vencimento: "💰",
  google_calendar: "🔄",
};

const AGENCY_LABEL: Record<string, string> = {
  cordial: "Cordial",
  morar: "Morar",
  ambas: "Cordial + Morar",
};

export function pushAgencyLabel(agency: string | null | undefined): string | null {
  if (!agency) return null;
  return AGENCY_LABEL[agency] ?? null;
}

export function buildPushPresentation(input: {
  id: string;
  type: string;
  category?: string | null;
  titulo: string;
  mensagem?: string | null;
  link?: string | null;
  agency?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}): PushPresentation {
  const config = getNotificationTypeConfig(input.type, input.category);
  const emoji = TYPE_EMOJI[input.type] ?? CATEGORY_EMOJI[config.category];
  const agency = pushAgencyLabel(input.agency);
  const title = `${emoji} ${config.label}${agency ? ` · ${agency}` : ""}`;

  const parts = [input.titulo?.trim(), input.mensagem?.trim()].filter(
    (part): part is string => Boolean(part && part.length > 0),
  );
  const body = parts.join("\n") || config.label;

  // Agrupa avisos do mesmo assunto (entidade) para não empilhar repetições no aparelho.
  const tag = input.entityId
    ? `${config.category}:${input.entityType ?? input.type}:${input.entityId}`
    : `${config.category}:${input.type}:${input.id}`;

  const link = input.link && input.link.startsWith("/") ? input.link : "/";

  return {
    title,
    body,
    label: config.label,
    category: config.category,
    emoji,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag,
    ctaLabel: config.ctaLabel,
    link,
  };
}
