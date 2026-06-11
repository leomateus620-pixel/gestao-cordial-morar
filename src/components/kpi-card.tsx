import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  delta,
  tone = "default",
  accent,
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "default" | "primary";
  accent?: "up" | "down" | "neutral";
}) {
  return (
    <div className="glass-panel rounded-3xl p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-foreground/50">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            "text-2xl font-bold leading-none",
            tone === "primary" && "text-primary",
          )}
        >
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "font-mono text-[10px] font-medium",
              accent === "up" && "text-emerald-600",
              accent === "down" && "text-destructive",
              (accent === "neutral" || !accent) && "text-foreground/40",
            )}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}