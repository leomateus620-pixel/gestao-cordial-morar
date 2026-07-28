import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NotificationCard } from "@/components/notifications/NotificationCard";
import { useNotificationExperience } from "@/components/notifications/notification-experience-context";
import type { NotificationGroup } from "@/lib/notifications/notification-system";

function TransientNotification({ group, index }: { group: NotificationGroup; index: number }) {
  const { attendanceStatuses, dismissTransientGroup, markRead, now } = useNotificationExperience();
  const [paused, setPaused] = useState(false);
  const [exiting, setExiting] = useState(false);
  const remaining = useRef(group.config.durationMs);
  const startedAt = useRef(Date.now());
  const groupRef = useRef(group);
  const exitingRef = useRef(false);
  const exitTimer = useRef<number | null>(null);
  groupRef.current = group;

  const requestDismiss = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    exitTimer.current = window.setTimeout(
      () => dismissTransientGroup(groupRef.current),
      reduceMotion ? 0 : 180,
    );
  }, [dismissTransientGroup]);

  useEffect(() => {
    remaining.current = group.config.durationMs;
    startedAt.current = Date.now();
    return () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, [group.config.durationMs, group.id]);

  useEffect(() => {
    if (exitingRef.current) return;
    if (paused) {
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
      return;
    }
    startedAt.current = Date.now();
    const timeout = window.setTimeout(requestDismiss, remaining.current);
    return () => window.clearTimeout(timeout);
  }, [group.id, paused, requestDismiss]);

  return (
    <div
      data-exiting={exiting || undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <NotificationCard
        notification={group.latest}
        group={group}
        status={attendanceStatuses.get(group.latest.id)}
        now={now}
        compact={index > 0}
        transient
        onDismiss={requestDismiss}
        onMarkRead={markRead}
      />
    </div>
  );
}

export function NotificationTransientRegion() {
  const { transientGroups } = useNotificationExperience();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || transientGroups.length === 0) return null;

  return createPortal(
    <section
      className="notification-transient-region"
      aria-label="Novas notificações"
      aria-live="polite"
      aria-relevant="additions"
    >
      {transientGroups.map((group, index) => (
        <TransientNotification key={group.id} group={group} index={index} />
      ))}
    </section>,
    document.body,
  );
}
