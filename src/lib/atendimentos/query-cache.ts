import type { Atendimento } from "../../types/atendimento";

export const ATTENDANCES_QUERY_KEY = ["attendances"] as const;
export const ATTENDANCE_BROKERS_QUERY_KEY = ["attendance-brokers"] as const;
export const attendanceListQueryKey = (userId: string | null | undefined) =>
  [...ATTENDANCES_QUERY_KEY, userId] as const;
export const attendanceBrokersQueryKey = (userId: string | null | undefined) =>
  [...ATTENDANCE_BROKERS_QUERY_KEY, userId] as const;
export const attendanceHistoryQueryKey = (id: string | null | undefined) =>
  ["attendance-history", id] as const;

/** Undo only the fields this transition changed, retaining other contacts and edits. */
export function rollbackAttendanceTransition(
  current: Atendimento[] | undefined,
  previous: Atendimento | undefined,
) {
  if (!previous) return current;
  return current?.map((item) =>
    item.id === previous.id
      ? { ...item, pipelineStage: previous.pipelineStage, atualizadoEm: previous.atualizadoEm }
      : item,
  );
}
