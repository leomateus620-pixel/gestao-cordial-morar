import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  readOnly?: boolean;
  className?: string;
};

export function StarRating({ value, onChange, size = 28, readOnly, className }: Props) {
  return (
    <div className={cn("flex items-center gap-1", className)} role="radiogroup" aria-label="Nota">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        const interactive = !readOnly && !!onChange;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            disabled={!interactive}
            onClick={() => interactive && onChange!(n)}
            className={cn(
              "grid place-items-center rounded-full transition",
              interactive && "hover:scale-110 active:scale-95 cursor-pointer",
              !interactive && "cursor-default",
            )}
            style={{ width: Math.max(size + 12, 44), height: Math.max(size + 12, 44) }}
          >
            <Star
              className={cn(
                "transition-colors",
                active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
              )}
              style={{ width: size, height: size }}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
    </div>
  );
}
