import { createContext, useContext } from "react";

/** True when the signed-in profile may only consult attendances (no writes). */
export const AttendanceReadOnlyContext = createContext(false);

export function useAttendanceReadOnly() {
  return useContext(AttendanceReadOnlyContext);
}
