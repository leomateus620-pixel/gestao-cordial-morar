import { Bell } from "lucide-react";
import { useNotificationExperience } from "@/components/notifications/notification-experience-context";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { summary, isSummaryError, bellSequence, centerOpen, setCenterOpen } =
    useNotificationExperience();
  const unread = summary.unreadTotal;

  return (
    <button
      type="button"
      className={cn(
        "notification-bell glass-panel relative grid size-11 shrink-0 place-items-center rounded-full text-primary",
        unread > 0 && "notification-bell--active",
      )}
      onClick={() => setCenterOpen(true)}
      aria-label={
        isSummaryError
          ? "Abrir central de notificações; totais temporariamente indisponíveis"
          : unread > 0
            ? `Abrir central de notificações, ${unread} ${unread === 1 ? "não lida" : "não lidas"}`
            : "Abrir central de notificações"
      }
      aria-haspopup="dialog"
      aria-expanded={centerOpen}
      aria-controls="notification-center"
    >
      <Bell
        key={bellSequence}
        className={cn(
          "notification-bell-icon size-[1.08rem] md:size-5",
          bellSequence > 0 && "notification-bell-icon--ring",
        )}
      />
      {unread > 0 ? (
        <span className="notification-bell-count" aria-hidden="true">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}
