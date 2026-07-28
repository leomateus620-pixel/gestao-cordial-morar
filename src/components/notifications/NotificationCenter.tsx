import { useMemo, useState } from "react";
import {
  BellOff,
  BellRing,
  CheckCheck,
  LoaderCircle,
  RefreshCcw,
  Settings2,
  Volume2,
} from "lucide-react";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import { useNotificationExperience } from "@/components/notifications/notification-experience-context";
import { NotificationManagementSummary } from "@/components/notifications/NotificationManagementSummary";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  NOTIFICATION_CATEGORIES,
  notificationCategoryLabel,
  type NotificationCategory,
  type NotificationRecord,
} from "@/lib/notifications/notification-system";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread" | NotificationCategory;

function dateBucket(item: NotificationRecord, today: Date): "unread" | "today" | "previous" {
  if (!item.read) return "unread";
  const date = new Date(item.createdAt);
  return date.toDateString() === today.toDateString() ? "today" : "previous";
}

const sectionLabels = {
  unread: "Não lidas",
  today: "Lidas hoje",
  previous: "Anteriores",
} as const;

export function NotificationCenter() {
  const {
    notifications,
    summary,
    managementSummary,
    attendanceStatuses,
    now,
    centerOpen,
    soundEnabled,
    isLoading,
    isError,
    isSummaryError,
    errorMessage,
    hasNextPage,
    isFetchingNextPage,
    setCenterOpen,
    setSoundEnabled,
    markRead,
    markAllRead,
    loadMore,
    refresh,
  } = useNotificationExperience();
  const [filter, setFilter] = useState<Filter>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const availableCategories = useMemo(
    () =>
      NOTIFICATION_CATEGORIES.filter(
        (category) =>
          notifications.some((item) => item.category === category) ||
          (summary.unreadByCategory[category] ?? 0) > 0,
      ),
    [notifications, summary.unreadByCategory],
  );

  const filtered = useMemo(
    () =>
      notifications.filter((item) => {
        if (filter === "all") return true;
        if (filter === "unread") return !item.read;
        return item.category === filter;
      }),
    [filter, notifications],
  );

  const sections = useMemo(
    () =>
      (["unread", "today", "previous"] as const)
        .map((key) => ({ key, items: filtered.filter((item) => dateBucket(item, now) === key) }))
        .filter((section) => section.items.length > 0),
    [filtered, now],
  );

  return (
    <Sheet open={centerOpen} onOpenChange={setCenterOpen}>
      <SheetContent
        id="notification-center"
        side="right"
        closeLabel="Fechar central de notificações"
        className="notification-center w-full border-white/60 bg-[#f8f5f0]/95 p-0 shadow-2xl backdrop-blur-2xl data-[state=closed]:duration-200 data-[state=open]:duration-300 sm:max-w-[31rem]"
      >
        <SheetHeader className="notification-center-header">
          <div className="notification-center-heading">
            <span className="notification-center-mark" aria-hidden="true">
              <BellRing className="size-4" />
            </span>
            <div>
              <SheetTitle className="text-[1.08rem] font-bold tracking-[-0.025em]">
                Central de notificações
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-xs">
                {isSummaryError
                  ? "Totais indisponíveis; exibindo os itens carregados"
                  : summary.unreadTotal > 0
                    ? `${summary.unreadTotal} ${summary.unreadTotal === 1 ? "item pendente" : "itens pendentes"}`
                    : "Você está em dia"}
              </SheetDescription>
            </div>
          </div>
          <div className="notification-center-toolbar">
            <button
              type="button"
              onClick={() => setSettingsOpen((value) => !value)}
              className="notification-toolbar-button"
              aria-expanded={settingsOpen}
              aria-controls="notification-settings"
            >
              <Settings2 className="size-3.5" />
              Preferências
            </button>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!isSummaryError && summary.unreadTotal === 0}
              className="notification-toolbar-button"
            >
              <CheckCheck className="size-3.5" />
              Ler tudo
            </button>
          </div>
          {settingsOpen ? (
            <div id="notification-settings" className="notification-settings">
              <div className="flex items-center gap-2">
                {soundEnabled ? <Volume2 className="size-4" /> : <BellOff className="size-4" />}
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-semibold">Sons discretos</p>
                  <p className="text-[10px] leading-relaxed text-foreground/55">
                    Ativados somente após sua primeira interação nesta sessão.
                  </p>
                </div>
                <Switch
                  checked={soundEnabled}
                  onCheckedChange={setSoundEnabled}
                  aria-label="Ativar sons de notificação"
                />
              </div>
            </div>
          ) : null}
        </SheetHeader>

        <div className="notification-filter-strip" role="group" aria-label="Filtrar notificações">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="Todas" />
          <FilterButton
            active={filter === "unread"}
            onClick={() => setFilter("unread")}
            label="Não lidas"
            count={summary.unreadTotal}
          />
          {availableCategories.map((category) => (
            <FilterButton
              key={category}
              active={filter === category}
              onClick={() => setFilter(category)}
              label={notificationCategoryLabel(category)}
              count={summary.unreadByCategory[category] ?? 0}
            />
          ))}
        </div>

        <div className="notification-center-scroll">
          {managementSummary ? <NotificationManagementSummary summary={managementSummary} /> : null}

          {isLoading ? (
            <div className="notification-loading" role="status">
              <LoaderCircle className="size-5 animate-spin" />
              Carregando notificações…
            </div>
          ) : null}

          {!isLoading && isError ? (
            <div className="notification-empty" role="alert">
              <RefreshCcw className="size-5" />
              <p className="font-semibold">
                {isSummaryError
                  ? "Alguns totais não puderam ser atualizados."
                  : "Não foi possível atualizar a central."}
              </p>
              <p className="text-xs text-foreground/55">{errorMessage ?? "Tente novamente."}</p>
              <button type="button" onClick={refresh} className="notification-primary-action">
                Tentar novamente
              </button>
            </div>
          ) : null}

          {!isLoading && !isError && sections.length === 0 ? (
            <div className="notification-empty">
              <BellRing className="size-6" />
              <p className="font-semibold">
                {filter === "all" ? "Nenhuma notificação por aqui" : "Nada neste filtro"}
              </p>
              <p className="text-xs text-foreground/55">
                Novos alertas persistidos aparecerão automaticamente.
              </p>
            </div>
          ) : null}

          {sections.map((section) => (
            <section key={section.key} className="notification-section">
              <div className="notification-section-heading">
                <h3>{sectionLabels[section.key]}</h3>
                <span>{section.items.length}</span>
              </div>
              <div className="space-y-2.5">
                {section.items.map((item) => (
                  <NotificationCard
                    key={item.id}
                    notification={item}
                    status={attendanceStatuses.get(item.id)}
                    now={now}
                    onNavigate={() => setCenterOpen(false)}
                    onMarkRead={markRead}
                  />
                ))}
              </div>
            </section>
          ))}

          {hasNextPage ? (
            <button
              type="button"
              className="notification-load-more"
              onClick={loadMore}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {isFetchingNextPage ? "Carregando…" : "Carregar notificações anteriores"}
            </button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn("notification-filter", active && "notification-filter--active")}
      onClick={onClick}
    >
      {label}
      {count && count > 0 ? <span>{count > 99 ? "99+" : count}</span> : null}
    </button>
  );
}
