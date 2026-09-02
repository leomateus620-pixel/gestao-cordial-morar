export const NOTIFICATION_CATEGORIES = ["attendance", "agenda", "financial", "system"] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationMotion = "from-right" | "from-bottom" | "scale" | "from-top" | "fade";
export type NotificationSound = "soft" | "important" | "warning" | "none";
export type NotificationIconKey = "attendance" | "calendar" | "sale" | "calendar-sync" | "system";

export type NotificationTypeConfig = {
  category: NotificationCategory;
  label: string;
  icon: NotificationIconKey;
  motion: NotificationMotion;
  sound: NotificationSound;
  ctaLabel: string;
  priority: number;
  durationMs: number;
  groupable: boolean;
};

export type NotificationRecord = {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  agency: "cordial" | "morar" | "ambas" | null;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
};

export type NotificationGroup = {
  id: string;
  type: string;
  config: NotificationTypeConfig;
  notifications: NotificationRecord[];
  latest: NotificationRecord;
};

export type NotificationDestination = {
  path:
    | "/atendimentos"
    | "/agenda"
    | "/agenda/fotos"
    | "/vendas"
    | "/agenciamentos"
    | "/alugueis"
    | "/documentos"
    | "/configuracoes";
  search: Record<string, string>;
};

const FALLBACK_CONFIG: NotificationTypeConfig = {
  category: "system",
  label: "Atualização do sistema",
  icon: "system",
  motion: "fade",
  sound: "soft",
  ctaLabel: "Ver detalhes",
  priority: 1,
  durationMs: 6_000,
  groupable: false,
};

export const notificationTypeConfig: Readonly<Record<string, NotificationTypeConfig>> = {
  atendimento_atribuido: {
    category: "attendance",
    label: "Atendimento atribuído",
    icon: "attendance",
    motion: "from-right",
    sound: "important",
    ctaLabel: "Abrir atendimento",
    priority: 4,
    durationMs: 9_000,
    groupable: true,
  },
  atendimento_iniciado: {
    category: "attendance",
    label: "Atendimento iniciado",
    icon: "attendance",
    motion: "fade",
    sound: "soft",
    ctaLabel: "Abrir atendimento",
    priority: 3,
    durationMs: 8_000,
    groupable: true,
  },
  agenda_lembrete: {
    category: "agenda",
    label: "Compromisso próximo",
    icon: "calendar",
    motion: "from-bottom",
    sound: "important",
    ctaLabel: "Ver compromisso",
    priority: 3,
    durationMs: 8_000,
    groupable: true,
  },
  venda_vencimento: {
    category: "financial",
    label: "Prazo financeiro",
    icon: "sale",
    motion: "from-top",
    sound: "warning",
    ctaLabel: "Ver venda",
    priority: 5,
    durationMs: 10_000,
    groupable: false,
  },
  agenda_fotos: {
    category: "agenda",
    label: "Produção de material",
    icon: "calendar",
    motion: "from-bottom",
    sound: "important",
    ctaLabel: "Ver agenda de fotos",
    priority: 4,
    durationMs: 8_000,
    groupable: true,
  },
  google_calendar: {
    category: "system",
    label: "Google Agenda",
    icon: "calendar-sync",
    motion: "scale",
    sound: "soft",
    ctaLabel: "Abrir configurações",
    priority: 2,
    durationMs: 7_000,
    groupable: false,
  },
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  attendance: "Atendimentos",
  agenda: "Agenda",
  financial: "Financeiro",
  system: "Sistema",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUP_WINDOW_MS = 5 * 60_000;

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return NOTIFICATION_CATEGORIES.includes(value as NotificationCategory);
}

export function getNotificationTypeConfig(
  type: string,
  category?: string | null,
): NotificationTypeConfig {
  const exact = notificationTypeConfig[type];
  if (exact) return exact;
  if (isNotificationCategory(category)) return { ...FALLBACK_CONFIG, category };
  return FALLBACK_CONFIG;
}

export function notificationCategoryLabel(category: NotificationCategory): string {
  return CATEGORY_LABELS[category];
}

function idFromLink(link: string | null): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//")) return null;
  try {
    const id = new URL(link, "https://gestao-cordial.local").searchParams.get("id");
    return id && UUID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

function safePathFromLink(link: string | null): NotificationDestination["path"] | null {
  if (!link || !link.startsWith("/") || link.startsWith("//")) return null;
  try {
    const url = new URL(link, "https://gestao-cordial.local");
    const allowed: NotificationDestination["path"][] = [
      "/atendimentos",
      "/agenda",
      "/agenda/fotos",
      "/vendas",
      "/agenciamentos",
      "/alugueis",
      "/documentos",
      "/configuracoes",
    ];
    return allowed.includes(url.pathname as NotificationDestination["path"])
      ? (url.pathname as NotificationDestination["path"])
      : null;
  } catch {
    return null;
  }
}

/**
 * Converts stored links into a small allowlisted router contract. An entity id
 * always wins over query-string text supplied by a notification producer.
 */
export function resolveNotificationDestination(
  notification: Pick<NotificationRecord, "type" | "link" | "entityId">,
): NotificationDestination | null {
  const storedPath = safePathFromLink(notification.link);
  const entityId =
    notification.entityId && UUID_RE.test(notification.entityId)
      ? notification.entityId
      : idFromLink(notification.link);

  if (notification.type.startsWith("atendimento_")) {
    return entityId ? { path: "/atendimentos", search: { id: entityId } } : null;
  }
  if (notification.type === "agenda_lembrete") {
    return entityId ? { path: "/agenda", search: { id: entityId } } : null;
  }
  if (notification.type === "agenda_fotos") {
    return { path: "/agenda/fotos", search: entityId ? { id: entityId } : {} };
  }
  if (notification.type === "venda_vencimento") {
    return entityId ? { path: "/vendas", search: { id: entityId } } : null;
  }
  if (notification.type === "google_calendar") {
    return { path: "/configuracoes", search: {} };
  }
  if (!storedPath) return null;
  return { path: storedPath, search: entityId ? { id: entityId } : {} };
}

export function dedupeNotifications(items: NotificationRecord[]): NotificationRecord[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function sortNotifications(items: NotificationRecord[]): NotificationRecord[] {
  return [...items].sort((a, b) => {
    const priorityDelta =
      getNotificationTypeConfig(b.type, b.category).priority -
      getNotificationTypeConfig(a.type, a.category).priority;
    if (priorityDelta !== 0) return priorityDelta;
    const timeDelta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return timeDelta !== 0 ? timeDelta : b.id.localeCompare(a.id);
  });
}

/** Groups only compatible, groupable events in the same tenant and 5-minute window. */
export function groupNotifications(items: NotificationRecord[]): NotificationGroup[] {
  const groups: Array<NotificationGroup & { latestTime: number }> = [];
  for (const notification of sortNotifications(dedupeNotifications(items))) {
    const config = getNotificationTypeConfig(notification.type, notification.category);
    const timestamp = new Date(notification.createdAt).getTime();
    const existing = config.groupable
      ? groups.find(
          (group) =>
            group.config.groupable &&
            group.type === notification.type &&
            group.latest.agency === notification.agency &&
            Number.isFinite(timestamp) &&
            Number.isFinite(group.latestTime) &&
            group.latestTime - timestamp <= GROUP_WINDOW_MS,
        )
      : undefined;
    if (existing) {
      existing.notifications.push(notification);
      continue;
    }
    groups.push({
      id: config.groupable
        ? `${notification.type}:${notification.agency ?? "global"}:${notification.id}`
        : notification.id,
      type: notification.type,
      config,
      notifications: [notification],
      latest: notification,
      latestTime: timestamp,
    });
  }
  return groups;
}

export function formatNotificationTimestamp(value: string, now = new Date()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Horário indisponível";
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("pt-BR", {
    ...(sameDay ? {} : { day: "2-digit", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
