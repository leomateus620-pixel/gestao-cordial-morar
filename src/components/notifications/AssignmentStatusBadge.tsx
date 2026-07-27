import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, CheckCircle2 } from "lucide-react";
import {
  getAttendanceAssignmentStatus,
  type AttendanceAssignmentStatus,
} from "@/lib/attendances/assignments.functions";
import { elapsedSecondsSince, formatElapsedSeconds } from "@/lib/time/elapsed";
import { useSession } from "@/lib/auth-mock";

const MANAGEMENT_ROLES = new Set(["admin", "secretaria"]);

/** Extract `id=<uuid>` from `/atendimentos?id=<uuid>`. */
export function attendanceIdFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = link.match(/[?&]id=([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

/** Ticks once every 30s so pending timers update without a per-card interval. */
function useLiveClock(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const bump = () => mounted && setTick((n) => (n + 1) % 1_000_000);
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") bump();
    }, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mounted = false;
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active]);
}

type Props = {
  attendanceId: string;
  /** Optional pre-fetched status (avoids a re-query). */
  initial?: AttendanceAssignmentStatus | null;
};

/**
 * Renders "Aguardando abertura há X" / "Aberto por Y em Z".
 * Backend RPC returns [] for non-management users, so this component
 * safely renders nothing for brokers even if invoked.
 */
export function AssignmentStatusBadge({ attendanceId, initial }: Props) {
  const user = useSession();
  const isManagement = user ? MANAGEMENT_ROLES.has(user.perfil) : false;

  const q = useQuery({
    queryKey: ["attendance-assignment", attendanceId],
    queryFn: () => getAttendanceAssignmentStatus({ data: { attendanceId } }),
    enabled: isManagement && !initial,
    staleTime: 15_000,
  });

  const rows = initial ? [initial] : q.data ?? [];
  const active =
    rows.find((r) => r.status === "pending_open") ??
    rows.find((r) => r.status === "opened") ??
    null;

  useLiveClock(Boolean(active && active.status === "pending_open"));

  if (!isManagement || !active) return null;

  if (active.status === "pending_open") {
    const label = formatElapsedSeconds(elapsedSecondsSince(active.assigned_at));
    return (
      <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        <Clock3 className="size-3" />
        Aguardando abertura há {label}
        {active.broker_nome ? <span className="opacity-70">· {active.broker_nome}</span> : null}
      </span>
    );
  }

  if (active.status === "opened" && active.response_time_seconds != null) {
    return (
      <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <CheckCircle2 className="size-3" />
        Aberto em {formatElapsedSeconds(active.response_time_seconds)}
        {active.broker_nome ? <span className="opacity-70">· {active.broker_nome}</span> : null}
      </span>
    );
  }

  return null;
}
