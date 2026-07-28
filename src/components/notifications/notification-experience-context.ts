import { createContext, useContext } from "react";
import type {
  NotificationAttendanceStatus,
  NotificationManagementSummary,
  NotificationSummary,
} from "@/lib/notifications/notifications.functions";
import type {
  NotificationGroup,
  NotificationRecord,
} from "@/lib/notifications/notification-system";

export type NotificationExperienceContextValue = {
  notifications: NotificationRecord[];
  summary: NotificationSummary;
  managementSummary: NotificationManagementSummary | null;
  attendanceStatuses: Map<string, NotificationAttendanceStatus>;
  transientGroups: NotificationGroup[];
  now: Date;
  bellSequence: number;
  centerOpen: boolean;
  soundEnabled: boolean;
  isLoading: boolean;
  isError: boolean;
  isSummaryError: boolean;
  errorMessage: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  setCenterOpen: (open: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  dismissTransientGroup: (group: NotificationGroup) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  loadMore: () => void;
  refresh: () => void;
};

export const NotificationExperienceContext =
  createContext<NotificationExperienceContextValue | null>(null);

export function useNotificationExperience() {
  const value = useContext(NotificationExperienceContext);
  if (!value) {
    throw new Error("useNotificationExperience must be used inside NotificationExperienceProvider");
  }
  return value;
}
