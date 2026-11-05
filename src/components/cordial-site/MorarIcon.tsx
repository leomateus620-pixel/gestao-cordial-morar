import type { LucideIcon } from "lucide-react";

/** Lucide's 24 x 24 optical grid, rounded caps/joins, inherited color, and one outline weight. */
export function MorarIcon({ icon: Icon, size = 20 }: { icon: LucideIcon; size?: 20 | 24 }) {
  return <Icon className="ms-icon" size={size} strokeWidth={1.7} fill="none" aria-hidden="true" />;
}
