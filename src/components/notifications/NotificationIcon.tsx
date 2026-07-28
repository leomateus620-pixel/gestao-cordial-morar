import {
  BellRing,
  CalendarClock,
  CalendarSync,
  CircleAlert,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import type { NotificationIconKey } from "@/lib/notifications/notification-system";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationIconKey, LucideIcon> = {
  attendance: BellRing,
  calendar: CalendarClock,
  sale: Landmark,
  "calendar-sync": CalendarSync,
  system: CircleAlert,
};

export function NotificationIcon({
  icon,
  category,
  className,
}: {
  icon: NotificationIconKey;
  category: "attendance" | "agenda" | "financial" | "system";
  className?: string;
}) {
  const Icon = ICONS[icon];
  return (
    <span
      className={cn("notification-icon", className)}
      data-category={category}
      aria-hidden="true"
    >
      <Icon className="size-[1.05rem]" strokeWidth={2.1} />
    </span>
  );
}
