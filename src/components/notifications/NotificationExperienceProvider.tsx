import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import {
  NotificationExperienceContext,
  type NotificationExperienceContextValue,
} from "@/components/notifications/notification-experience-context";
import { canSeeNotificationMetrics } from "@/lib/access-control";
import { useSession } from "@/lib/auth-mock";
import {
  dedupeNotifications,
  getNotificationTypeConfig,
  groupNotifications,
  type NotificationGroup,
  type NotificationRecord,
} from "@/lib/notifications/notification-system";
import {
  installNotificationSoundUnlock,
  notificationSoundEnabled,
  playNotificationSound,
  setNotificationSoundEnabled,
} from "@/lib/notifications/notification-sound";
import {
  getMyNotificationSummary,
  getNotificationAttendanceStatuses,
  getNotificationManagementSummary,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQueryKey,
  notificationSummaryQueryKey,
  type NotificationPage,
  type NotificationSummary,
} from "@/lib/notifications/notifications.functions";
import { isPushConfigured } from "@/lib/push/firebase-config";
import { enablePush } from "@/lib/push/push-client";
import { useApp } from "@/store/app-store";


function summarizeLoadedNotifications(items: NotificationRecord[]): NotificationSummary {
  const today = new Date().toDateString();
  const unreadByCategory: NotificationSummary["unreadByCategory"] = {};
  let unreadTotal = 0;
  let todayTotal = 0;

  for (const item of items) {
    if (new Date(item.createdAt).toDateString() === today) todayTotal += 1;
    if (item.read) continue;
    unreadTotal += 1;
    unreadByCategory[item.category] = (unreadByCategory[item.category] ?? 0) + 1;
  }

  return { unreadTotal, todayTotal, unreadByCategory };
}

const DISMISSED_SESSION_KEY = "gc.notifications.transient-dismissed.v2";

function readDismissedIds(userId: string | null): Set<string> {
  if (typeof window === "undefined" || !userId) return new Set();
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(`${DISMISSED_SESSION_KEY}:${userId}`) ?? "[]",
    );
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function persistDismissedIds(ids: Set<string>, userId: string | null) {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.sessionStorage.setItem(
      `${DISMISSED_SESSION_KEY}:${userId}`,
      JSON.stringify([...ids].slice(-100)),
    );
  } catch {
    // A blocked storage area must never block notification operations.
  }
}

function localDayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function markCachedNotificationRead(
  data: InfiniteData<NotificationPage> | undefined,
  id?: string,
): InfiniteData<NotificationPage> | undefined {
  if (!data) return data;
  const readAt = new Date().toISOString();
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        (!id || item.id === id) && !item.read ? { ...item, read: true, readAt } : item,
      ),
    })),
  };
}

export function NotificationExperienceProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const agency = useApp((state) => state.agency);
  const queryClient = useQueryClient();
  const userId = session?.id ?? "signed-out";
  const notificationsKey = useMemo(() => notificationsQueryKey(userId), [userId]);
  const summaryKey = useMemo(() => notificationSummaryQueryKey(userId), [userId]);
  const [centerOpen, setCenterOpen] = useState(false);
  const [bellSequence, setBellSequence] = useState(0);
  const [transientQueue, setTransientQueue] = useState<NotificationRecord[]>([]);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const initialQueueHydrated = useRef(false);
  const dismissedIds = useRef<Set<string>>(new Set());
  const transientQueueRef = useRef<NotificationRecord[]>([]);
  const previousSessionId = useRef<string | null>(null);
  const activeUserId = useRef(userId);
  const pendingRealtimeIds = useRef(new Set<string>());
  const realtimeFlushTimer = useRef<number | null>(null);
  transientQueueRef.current = transientQueue;
  activeUserId.current = userId;

  useEffect(() => {
    setSoundEnabledState(notificationSoundEnabled());
    return installNotificationSoundUnlock();
  }, []);

  useEffect(() => {
    initialQueueHydrated.current = false;
    dismissedIds.current = readDismissedIds(session?.id ?? null);
    setTransientQueue([]);
    pendingRealtimeIds.current.clear();
    if (realtimeFlushTimer.current !== null) {
      window.clearTimeout(realtimeFlushTimer.current);
      realtimeFlushTimer.current = null;
    }
  }, [session?.id]);

  useEffect(() => {
    const previousId = previousSessionId.current;
    const nextId = session?.id ?? null;
    if (previousId && previousId !== nextId) {
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === "notifications" && query.queryKey.includes(previousId),
      });
    }
    previousSessionId.current = nextId;
  }, [queryClient, session?.id]);

  // Push: renova silenciosamente o token FCM do dispositivo após o login,
  // apenas quando a permissão já foi concedida (nunca pede permissão sozinho).
  useEffect(() => {
    if (!session?.id) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted" || !isPushConfigured()) return;
    void enablePush();
  }, [session?.id]);


  useEffect(() => {
    const onPreference = (event: Event) => {
      const customEvent = event as CustomEvent<{ enabled?: boolean }>;
      setSoundEnabledState(customEvent.detail?.enabled ?? notificationSoundEnabled());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key) setSoundEnabledState(notificationSoundEnabled());
    };
    window.addEventListener("gc:notification-sound", onPreference);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("gc:notification-sound", onPreference);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const notificationsQuery = useInfiniteQuery({
    queryKey: notificationsKey,
    enabled: Boolean(session),
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) =>
      listMyNotifications({
        data: {
          limit: 24,
          beforeCreatedAt: pageParam?.createdAt ?? null,
          beforeId: pageParam?.id ?? null,
          category: null,
        },
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: summaryKey,
    queryFn: () => getMyNotificationSummary(),
    enabled: Boolean(session),
    staleTime: 20_000,
  });

  const notifications = useMemo(() => {
    const items = dedupeNotifications(
      notificationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    );
    return items.sort((a, b) => {
      const time = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return time !== 0 ? time : b.id.localeCompare(a.id);
    });
  }, [notificationsQuery.data]);

  const [dayBounds, setDayBounds] = useState(localDayBounds);
  useEffect(() => {
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 1, 0);
    const timeout = window.setTimeout(
      () => {
        setNow(new Date());
        setDayBounds(localDayBounds());
      },
      Math.max(1_000, nextMidnight.getTime() - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [dayBounds.start]);

  const canViewManagement = canSeeNotificationMetrics(session);
  const managementQueryKey = useMemo(
    () => [
      "notifications",
      "management-summary",
      userId,
      session?.perfil ?? "signed-out",
      agency,
      dayBounds.start,
    ],
    [agency, dayBounds.start, session?.perfil, userId],
  );
  const managementQuery = useQuery({
    queryKey: managementQueryKey,
    queryFn: () =>
      getNotificationManagementSummary({
        data: {
          start: dayBounds.start,
          end: dayBounds.end,
          agency: agency === "todas" ? null : agency,
        },
      }),
    enabled: Boolean(session) && canViewManagement,
    staleTime: 30_000,
  });

  const attendanceNotificationIds = useMemo(
    () =>
      notifications
        .filter((item) => item.category === "attendance")
        .slice(0, 50)
        .map((item) => item.id),
    [notifications],
  );
  const statusesQuery = useQuery({
    queryKey: [
      "notifications",
      "attendance-statuses",
      userId,
      session?.perfil ?? "signed-out",
      attendanceNotificationIds,
    ],
    queryFn: () =>
      getNotificationAttendanceStatuses({
        data: { notificationIds: attendanceNotificationIds },
      }),
    enabled: canViewManagement && attendanceNotificationIds.length > 0,
    staleTime: 20_000,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((status) => status.status === "pending_open") ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const attendanceStatuses = useMemo(
    () =>
      canViewManagement
        ? new Map(
            (statusesQuery.data ?? []).map((status) => [status.notificationId, status] as const),
          )
        : new Map(),
    [canViewManagement, statusesQuery.data],
  );

  const hasPendingTimer =
    canViewManagement &&
    (statusesQuery.data ?? []).some((status) => status.status === "pending_open");
  useEffect(() => {
    if (!hasPendingTimer) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") setNow(new Date());
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasPendingTimer]);

  useEffect(() => {
    if (
      initialQueueHydrated.current ||
      notificationsQuery.isLoading ||
      notifications.length === 0
    ) {
      return;
    }
    initialQueueHydrated.current = true;
    const recentThreshold = Date.now() - 5 * 60_000;
    const pending = notifications
      .filter(
        (item) =>
          !item.read &&
          new Date(item.createdAt).getTime() >= recentThreshold &&
          !dismissedIds.current.has(item.id) &&
          getNotificationTypeConfig(item.type, item.category).priority >= 4,
      )
      .slice(0, 3);
    if (pending.length > 0) setTransientQueue(pending);
  }, [notifications, notificationsQuery.isLoading]);

  const applyRealtimeNotifications = useCallback(
    (incoming: NotificationRecord[]) => {
      if (!session || activeUserId.current !== session.id || incoming.length === 0) return;
      queryClient.setQueryData<InfiniteData<NotificationPage>>(notificationsKey, (current) => {
        if (!current) {
          return {
            pages: [{ items: incoming, nextCursor: null }],
            pageParams: [null],
          };
        }
        const firstPage = current.pages[0];
        if (!firstPage) return current;
        return {
          ...current,
          pages: [
            {
              ...firstPage,
              items: dedupeNotifications([...incoming, ...firstPage.items]),
            },
            ...current.pages.slice(1),
          ],
        };
      });
      setBellSequence((value) => value + incoming.length);
      const visibleIncoming = incoming.filter((item) => !dismissedIds.current.has(item.id));
      if (visibleIncoming.length > 0) {
        setTransientQueue((current) =>
          dedupeNotifications([...current, ...visibleIncoming]).slice(-20),
        );
      }

      const audible = [...incoming].sort((a, b) => {
        const priority =
          getNotificationTypeConfig(b.type, b.category).priority -
          getNotificationTypeConfig(a.type, a.category).priority;
        return priority || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })[0];
      const config = getNotificationTypeConfig(audible.type, audible.category);
      void playNotificationSound({
        id: audible.id,
        policy: config.sound,
        actorId: audible.actorId,
        currentUserId: session.id,
      });
    },
    [notificationsKey, queryClient, session],
  );

  const invalidateNotificationQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: notificationsKey });
    void queryClient.invalidateQueries({ queryKey: summaryKey });
    if (canViewManagement) {
      void queryClient.invalidateQueries({
        queryKey: ["notifications", "attendance-statuses", userId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["notifications", "management-summary", userId],
      });
    }
  }, [canViewManagement, notificationsKey, queryClient, summaryKey, userId]);

  const flushRealtimeNotifications = useCallback(async () => {
    realtimeFlushTimer.current = null;
    const ids = new Set(pendingRealtimeIds.current);
    pendingRealtimeIds.current.clear();
    if (ids.size === 0 || !session) return;

    try {
      const latestPage = await listMyNotifications({
        data: {
          limit: 24,
          beforeCreatedAt: null,
          beforeId: null,
          category: null,
        },
      });
      applyRealtimeNotifications(latestPage.items.filter((item) => ids.has(item.id)));
    } catch {
      // The authoritative queries below surface persistent failures in the center.
    } finally {
      invalidateNotificationQueries();
    }
  }, [applyRealtimeNotifications, invalidateNotificationQueries, session]);

  const onRealtimeNotification = useCallback(
    (notificationId: string) => {
      pendingRealtimeIds.current.add(notificationId);
      if (realtimeFlushTimer.current !== null) return;
      realtimeFlushTimer.current = window.setTimeout(() => {
        void flushRealtimeNotifications();
      }, 120);
    },
    [flushRealtimeNotifications],
  );

  const onRealtimeUnavailable = useCallback(() => {
    if (realtimeFlushTimer.current !== null) {
      window.clearTimeout(realtimeFlushTimer.current);
      realtimeFlushTimer.current = null;
    }
    pendingRealtimeIds.current.clear();
    invalidateNotificationQueries();
  }, [invalidateNotificationQueries]);

  useEffect(
    () => () => {
      if (realtimeFlushTimer.current !== null) {
        window.clearTimeout(realtimeFlushTimer.current);
      }
      pendingRealtimeIds.current.clear();
    },
    [],
  );

  useRealtimeNotifications(onRealtimeNotification, onRealtimeUnavailable);

  const markOneMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationsKey });
      await queryClient.cancelQueries({ queryKey: summaryKey });
      const previous = queryClient.getQueryData<InfiniteData<NotificationPage>>(notificationsKey);
      const previousSummary = queryClient.getQueryData<NotificationSummary>(summaryKey);
      const previousTransient = transientQueueRef.current;
      const target = previous?.pages.flatMap((page) => page.items).find((item) => item.id === id);
      queryClient.setQueryData<InfiniteData<NotificationPage>>(notificationsKey, (current) =>
        markCachedNotificationRead(current, id),
      );
      const readAt = new Date().toISOString();
      setTransientQueue((current) =>
        current.map((item) => (item.id === id ? { ...item, read: true, readAt } : item)),
      );
      if (target && !target.read) {
        queryClient.setQueryData<NotificationSummary>(summaryKey, (current) =>
          current
            ? {
                ...current,
                unreadTotal: Math.max(0, current.unreadTotal - 1),
                unreadByCategory: {
                  ...current.unreadByCategory,
                  [target.category]: Math.max(
                    0,
                    (current.unreadByCategory[target.category] ?? 0) - 1,
                  ),
                },
              }
            : current,
        );
      }
      return { previous, previousSummary, previousTransient };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(notificationsKey, context?.previous);
      queryClient.setQueryData(summaryKey, context?.previousSummary);
      if (context?.previousTransient) setTransientQueue(context.previousTransient);
      toast.error("Não foi possível marcar a notificação como lida.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
      void queryClient.invalidateQueries({ queryKey: summaryKey });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationsKey });
      await queryClient.cancelQueries({ queryKey: summaryKey });
      const previous = queryClient.getQueryData<InfiniteData<NotificationPage>>(notificationsKey);
      const previousSummary = queryClient.getQueryData<NotificationSummary>(summaryKey);
      const previousTransient = transientQueueRef.current;
      queryClient.setQueryData<InfiniteData<NotificationPage>>(notificationsKey, (current) =>
        markCachedNotificationRead(current),
      );
      const readAt = new Date().toISOString();
      setTransientQueue((current) =>
        current.map((item) => (item.read ? item : { ...item, read: true, readAt })),
      );
      queryClient.setQueryData<NotificationSummary>(summaryKey, (current) =>
        current ? { ...current, unreadTotal: 0, unreadByCategory: {} } : current,
      );
      return { previous, previousSummary, previousTransient };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(notificationsKey, context?.previous);
      queryClient.setQueryData(summaryKey, context?.previousSummary);
      if (context?.previousTransient) setTransientQueue(context.previousTransient);
      toast.error("Não foi possível marcar todas as notificações como lidas.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
      void queryClient.invalidateQueries({ queryKey: summaryKey });
    },
  });

  const dismissTransientGroup = useCallback(
    (group: NotificationGroup) => {
      for (const item of group.notifications) dismissedIds.current.add(item.id);
      persistDismissedIds(dismissedIds.current, session?.id ?? null);
      const ids = new Set(group.notifications.map((item) => item.id));
      setTransientQueue((current) => current.filter((item) => !ids.has(item.id)));
    },
    [session?.id],
  );

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setNotificationSoundEnabled(enabled);
    setSoundEnabledState(enabled);
  }, []);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: notificationsKey });
    void queryClient.invalidateQueries({ queryKey: summaryKey });
    if (canViewManagement) {
      void queryClient.invalidateQueries({
        queryKey: ["notifications", "management-summary", userId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["notifications", "attendance-statuses", userId],
      });
    }
  }, [canViewManagement, notificationsKey, queryClient, summaryKey, userId]);

  const visibleManagementSummary =
    canViewManagement && (managementQuery.data?.assignedCount ?? 0) > 0
      ? (managementQuery.data ?? null)
      : null;
  const effectiveSummary = useMemo(
    () => summaryQuery.data ?? summarizeLoadedNotifications(notifications),
    [notifications, summaryQuery.data],
  );
  const hasExperienceError = Boolean(notificationsQuery.error ?? summaryQuery.error);

  const value = useMemo<NotificationExperienceContextValue>(
    () => ({
      notifications,
      summary: effectiveSummary,
      managementSummary: visibleManagementSummary,
      attendanceStatuses,
      transientGroups: groupNotifications(transientQueue).slice(0, 2),
      now,
      bellSequence,
      centerOpen,
      soundEnabled,
      isLoading: notificationsQuery.isLoading,
      isError: notificationsQuery.isError || summaryQuery.isError,
      isSummaryError: summaryQuery.isError,
      errorMessage: hasExperienceError ? "Verifique sua conexão e tente novamente." : null,
      hasNextPage: Boolean(notificationsQuery.hasNextPage),
      isFetchingNextPage: notificationsQuery.isFetchingNextPage,
      setCenterOpen,
      setSoundEnabled,
      dismissTransientGroup,
      markRead: (id) => markOneMutation.mutate(id),
      markAllRead: () => markAllMutation.mutate(),
      loadMore: () => {
        void notificationsQuery.fetchNextPage();
      },
      refresh,
    }),
    [
      attendanceStatuses,
      bellSequence,
      centerOpen,
      dismissTransientGroup,
      effectiveSummary,
      hasExperienceError,
      markAllMutation,
      markOneMutation,
      notifications,
      notificationsQuery,
      now,
      refresh,
      setSoundEnabled,
      soundEnabled,
      summaryQuery.isError,
      transientQueue,
      visibleManagementSummary,
    ],
  );

  return (
    <NotificationExperienceContext.Provider value={value}>
      {children}
    </NotificationExperienceContext.Provider>
  );
}
