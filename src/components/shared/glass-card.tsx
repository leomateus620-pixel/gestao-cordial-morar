import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassCardVariants = cva("liquid-panel min-w-0 w-full", {
  variants: {
    variant: {
      default: "",
      strong: "premium-card",
      subtle: "bg-white/35 shadow-sm",
      interactive: "transition active:scale-[0.99] hover:bg-white/55",
    },
    padding: {
      none: "p-0",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
    },
  },
  defaultVariants: {
    variant: "default",
    padding: "md",
  },
});

export type GlassCardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof glassCardVariants> & {
    asChild?: false;
  };

export function GlassCard({ className, variant, padding, ...props }: GlassCardProps) {
  return <div className={cn(glassCardVariants({ variant, padding }), className)} {...props} />;
}
