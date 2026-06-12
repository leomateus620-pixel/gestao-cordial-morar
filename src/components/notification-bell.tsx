import { Bell, CheckCheck, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApp } from "@/store/app-store";
import { notificationLabels } from "@/lib/mock/notifications";
import { cn } from "@/lib/utils";

const priorityTone = {
  alta: "bg-red-500/12 text-red-700",
  media: "bg-amber-500/12 text-amber-700",
  baixa: "bg-sky-500/12 text-sky-700",
};

export function NotificationBell() {
  const notifications = useApp((s) => s.notifications);
  const markNotificationRead = useApp((s) => s.markNotificationRead);
  const markAllNotificationsRead = useApp((s) => s.markAllNotificationsRead);
  const unread = notifications.filter((n) => !n.read).length;
  const latest = [...notifications]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="glass-panel relative grid size-10 shrink-0 place-items-center rounded-full text-primary transition active:scale-95 md:size-11"
          aria-label={`Notificações mockadas${unread ? `: ${unread} não lidas` : ""}`}
        >
          <Bell className="size-4 md:size-5" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] rounded-3xl border-white/60 bg-white/90 p-0 shadow-2xl backdrop-blur-xl"
      >
        <div className="border-b border-foreground/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Central de notificações</p>
              <p className="mt-0.5 text-[11px] text-foreground/55">
                Alertas simulados para validar UX antes de Supabase/RLS.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[11px]"
              onClick={markAllNotificationsRead}
            >
              <CheckCheck className="size-3" /> Ler tudo
            </Button>
          </div>
        </div>

        <div className="max-h-[24rem] overflow-y-auto p-2">
          {latest.map((notification) => (
            <button
              key={notification.id}
              onClick={() => markNotificationRead(notification.id)}
              className={cn(
                "w-full rounded-2xl p-3 text-left transition hover:bg-primary/5",
                !notification.read && "bg-primary/5",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl",
                    priorityTone[notification.priority],
                  )}
                >
                  <CircleAlert className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[10px] font-bold uppercase tracking-wider text-primary">
                      {notificationLabels[notification.type]}
                    </span>
                    {!notification.read && (
                      <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-semibold">{notification.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-foreground/60">
                    {notification.description}
                  </p>
                  <p className="mt-1 text-[10px] text-foreground/45">
                    {new Date(notification.date).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
