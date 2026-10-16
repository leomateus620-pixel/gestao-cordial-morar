import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** Identidade do assistente: arquitetura Cordial e Morar em uma marca própria. */
export const AssistantMark = forwardRef<SVGSVGElement, LucideProps>(function AssistantMark(
  { size = 24, className, absoluteStrokeWidth: _absoluteStrokeWidth, ...props },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...props}
    >
      <image href="/assistant/assistant-mark.webp" width="1024" height="1024" />
    </svg>
  );
});
