import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { AssistantMark } from "./AssistantMark";

export const CORDIAL_BOT_NAME = "Cordial Bot";
const wordmarkStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 600,
  letterSpacing: "-0.025em",
  lineHeight: 1.1,
  textTransform: "none",
};

/** One typographic signature for navigation, chat and account settings. */
export function CordialBotWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("whitespace-nowrap text-base text-foreground", className)}
      style={wordmarkStyle}
    >
      {CORDIAL_BOT_NAME}
    </span>
  );
}

export function CordialBotBrand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <AssistantMark size={compact ? 24 : 28} />
      <CordialBotWordmark className={compact ? "text-base" : "text-lg"} />
    </span>
  );
}
