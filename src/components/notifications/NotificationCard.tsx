import { Check, CheckCheck, ChevronRight, Clock3, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { NotificationIcon } from "@/components/notifications/NotificationIcon";
import type { NotificationAttendanceStatus } from "@/lib/notifications/notifications.functions";
import {
  formatNotificationTimestamp,
  getNotificationTypeConfig,
  resolveNotificationDestination,
  type NotificationGroup,
  type NotificationRecord,
} from "@/lib/notifications/notification-system";
import { elapsedSecondsSince, formatElapsedSeconds } from "@/lib/time/elapsed";
import { cn } from "@/lib/utils";

type NotificationCardProps = {
  notification: NotificationRecord;
  group?: NotificationGroup;
  status?: NotificationAttendanceStatus;
  now: Date;
  compact?: boolean;
  transient?: boolean;
  onDismiss?: () => void;
  onNavigate?: () => void;
  onMarkRead: (id: string) => void;
};

function agencyLabel(agency: NotificationRecord["agency"]): string | null {
  if (agency === "cordial") return "Cordial";
  if (agency === "morar") return "Morar";
  if (agency === "ambas") return "Cordial + Morar";
  return null;
}

function AttendanceStatus({ status, now }: { status?: NotificationAttendanceStatus; now: Date }) {
  if (!status) return null;
  if (status.status === "superseded" || status.status === "cancelled") {
    return (
      <span className="notification-status" data-state="closed">
        {status.status === "superseded" ? (
          <CheckCheck className="size-3" />
        ) : (
          <X className="size-3" />
        )}
        {status.status === "superseded" ? "Atendimento reatribuído" : "Atribuição encerrada"}
      </span>
    );
  }
  if (status.status === "pending_open") {
    const elapsed = elapsedSecondsSince(status.assignedAt, now);
    return (
      <span className="notification-status" data-state="pending">
        <Clock3 className="size-3" />
        Aguardando há {formatElapsedSeconds(elapsed)}
        {status.brokerName ? <span aria-hidden="true">·</span> : null}
        {status.brokerName ? <span className="truncate">{status.brokerName}</span> : null}
      </span>
    );
  }
  if (status.responseTimeSeconds == null) return null;
  return (
    <span className="notification-status" data-state="opened">
      <Check className="size-3" />
      Aberto em {formatElapsedSeconds(status.responseTimeSeconds)}
      {status.brokerName ? <span aria-hidden="true">·</span> : null}
      {status.brokerName ? <span className="truncate">{status.brokerName}</span> : null}
    </span>
  );
}

export function NotificationCard({
  notification,
  group,
  status,
  now,
  compact = false,
  transient = false,
  onDismiss,
  onNavigate,
  onMarkRead,
}: NotificationCardProps) {
  const navigate = useNavigate();
  const config = getNotificationTypeConfig(notification.type, notification.category);
  const groupedCount = group?.notifications.length ?? 1;
  const visibleAgency = agencyLabel(notification.agency);

  const openDestination = () => {
    const destination = resolveNotificationDestination(notification);
    if (!destination) {
      toast.error("Este destino não está mais disponível.");
      return;
    }
    onNavigate?.();
    if (!notification.read) onMarkRead(notification.id);
    if (transient && onDismiss) onDismiss();
    void navigate({ to: destination.path, search: destination.search } as never);
  };

  return (
    <article
      className={cn(
        "notification-card",
        compact && "notification-card--compact",
        transient && "notification-card--transient",
        !notification.read && "notification-card--unread",
      )}
      data-category={notification.category}
      data-motion={transient ? config.motion : undefined}
      aria-label={`${config.label}: ${notification.title}`}
    >
      <NotificationIcon icon={config.icon} category={notification.category} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="notification-eyebrow">{config.label}</span>
          {groupedCount > 1 ? (
            <span className="notification-count">+{groupedCount - 1} relacionados</span>
          ) : null}
          {visibleAgency ? <span className="notification-agency">{visibleAgency}</span> : null}
          {!notification.read ? (
            <span className="notification-unread-dot" aria-label="Não lida" />
          ) : null}
          <time className="notification-time" dateTime={notification.createdAt}>
            {formatNotificationTimestamp(notification.createdAt, now)}
          </time>
        </div>

        <h3 className="notification-title">{notification.title}</h3>
        {notification.message ? (
          <p className="notification-message">{notification.message}</p>
        ) : null}
        {!compact ? <AttendanceStatus status={status} now={now} /> : null}

        <div className="notification-actions">
          <button type="button" className="notification-primary-action" onClick={openDestination}>
            {groupedCount > 1 && config.groupable ? "Abrir mais recente" : config.ctaLabel}
            <ChevronRight className="size-3.5" />
          </button>
          {!notification.read ? (
            <button
              type="button"
              className="notification-secondary-action"
              onClick={() => onMarkRead(notification.id)}
            >
              <CheckCheck className="size-3.5" />
              Marcar como lida
            </button>
          ) : null}
        </div>
      </div>

      {onDismiss ? (
        <button
          type="button"
          className="notification-dismiss"
          onClick={onDismiss}
          aria-label="Dispensar aviso desta sessão"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </article>
  );
}
