import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isNotificationCategory,
  type NotificationCategory,
  type NotificationRecord,
} from "@/lib/notifications/notification-system";

export const notificationsQueryKey = (userId: string) => ["notifications", "mine", userId] as const;
export const notificationSummaryQueryKey = (userId: string) =>
  ["notifications", "summary", userId] as const;

export type NotificationCursor = {
  createdAt: string;
  id: string;
};

export type NotificationPage = {
  items: NotificationRecord[];
  nextCursor: NotificationCursor | null;
};

export type NotificationSummary = {
  unreadTotal: number;
  todayTotal: number;
  unreadByCategory: Partial<Record<NotificationCategory, number>>;
};

export type NotificationManagementSummary = {
  assignedCount: number;
  pendingOpenCount: number;
  openedCount: number;
  averageFirstOpenSeconds: number | null;
  medianFirstOpenSeconds: number | null;
};

export type NotificationAttendanceStatus = {
  notificationId: string;
  brokerName: string | null;
  assignedAt: string;
  firstOpenedAt: string | null;
  responseTimeSeconds: number | null;
  status: "pending_open" | "opened" | "superseded" | "cancelled";
};

type RpcError = { message: string } | null;
type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError }>;
};

type NotificationRpcRow = {
  id: string;
  tipo: string;
  category: string | null;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lida: boolean;
  read_at: string | null;
  created_at: string;
  imobiliaria: "cordial" | "morar" | "ambas" | null;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
};

const listInput = z.object({
  limit: z.number().int().min(1).max(40).default(24),
  beforeCreatedAt: z.string().datetime().nullable().optional(),
  beforeId: z.string().uuid().nullable().optional(),
  category: z.enum(["attendance", "agenda", "financial", "system"]).nullable().optional(),
});

const uuidInput = z.object({ id: z.string().uuid() });
const statusInput = z.object({ notificationIds: z.array(z.string().uuid()).max(50) });
const managementInput = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  agency: z.enum(["cordial", "morar"]).nullable().optional(),
});

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapNotification(row: NotificationRpcRow): NotificationRecord {
  const category = isNotificationCategory(row.category) ? row.category : "system";
  return {
    id: row.id,
    type: row.tipo,
    category,
    title: row.titulo,
    message: row.mensagem,
    link: row.link,
    read: row.lida,
    readAt: row.read_at,
    createdAt: row.created_at,
    agency: row.imobiliaria,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorId: row.actor_id,
  };
}

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => listInput.parse(value))
  .handler(async ({ data, context }): Promise<NotificationPage> => {
    const requestedLimit = data.limit;
    const { data: rows, error } = await (context.supabase as unknown as RpcClient).rpc(
      "list_my_notifications",
      {
        _limit: requestedLimit + 1,
        _before_created_at: data.beforeCreatedAt ?? null,
        _before_id: data.beforeId ?? null,
        _category: data.category ?? null,
      },
    );
    if (error) throw new Error(error.message);
    const mapped = ((rows ?? []) as NotificationRpcRow[]).map(mapNotification);
    const hasMore = mapped.length > requestedLimit;
    const items = mapped.slice(0, requestedLimit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  });

export const getMyNotificationSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationSummary> => {
    const { data, error } = await (context.supabase as unknown as RpcClient).rpc(
      "get_my_notification_summary",
    );
    if (error) throw new Error(error.message);
    const raw = (data ?? {}) as {
      unread_total?: unknown;
      today_total?: unknown;
      by_category?: Array<{ category?: unknown; unread?: unknown }>;
    };
    const unreadByCategory: Partial<Record<NotificationCategory, number>> = {};
    for (const item of raw.by_category ?? []) {
      if (isNotificationCategory(item.category)) {
        unreadByCategory[item.category] = numberValue(item.unread);
      }
    }
    return {
      unreadTotal: numberValue(raw.unread_total),
      todayTotal: numberValue(raw.today_total),
      unreadByCategory,
    };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => uuidInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as unknown as RpcClient).rpc(
      "mark_notification_read",
      { _id: data.id },
    );
    if (error) throw new Error(error.message);
    return result as { id: string; lida: boolean; read_at: string } | null;
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as unknown as RpcClient).rpc(
      "mark_all_notifications_read",
    );
    if (error) throw new Error(error.message);
    return { updated: numberValue(data) };
  });

export const getNotificationAttendanceStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => statusInput.parse(value))
  .handler(async ({ data, context }): Promise<NotificationAttendanceStatus[]> => {
    if (data.notificationIds.length === 0) return [];
    const { data: rows, error } = await (context.supabase as unknown as RpcClient).rpc(
      "get_notification_attendance_statuses",
      { _notification_ids: data.notificationIds },
    );
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      notificationId: String(row.notification_id),
      brokerName: typeof row.broker_nome === "string" ? row.broker_nome : null,
      assignedAt: String(row.assigned_at),
      firstOpenedAt: typeof row.first_opened_at === "string" ? row.first_opened_at : null,
      responseTimeSeconds: nullableNumber(row.response_time_seconds),
      status:
        row.status === "opened" || row.status === "superseded" || row.status === "cancelled"
          ? row.status
          : "pending_open",
    }));
  });

export const getNotificationManagementSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => managementInput.parse(value))
  .handler(async ({ data, context }): Promise<NotificationManagementSummary> => {
    const { data: rows, error } = await (context.supabase as unknown as RpcClient).rpc(
      "get_notification_management_summary",
      {
        _start: data.start,
        _end: data.end,
        _imobiliaria: data.agency ?? null,
      },
    );
    if (error) throw new Error(error.message);
    const row = ((rows ?? []) as Array<Record<string, unknown>>)[0] ?? {};
    return {
      assignedCount: numberValue(row.assigned_count),
      pendingOpenCount: numberValue(row.pending_open_count),
      openedCount: numberValue(row.opened_count),
      averageFirstOpenSeconds: nullableNumber(row.avg_first_open_seconds),
      medianFirstOpenSeconds: nullableNumber(row.median_first_open_seconds),
    };
  });
