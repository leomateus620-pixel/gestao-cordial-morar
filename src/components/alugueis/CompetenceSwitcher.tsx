import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COMPETENCE_PATTERN,
  formatCompetenceLong,
  shiftCompetence,
} from "@/lib/rentals/competence-nav";
import { currentRentalCompetence } from "@/lib/rentals/receipt-model";
import { cn } from "@/lib/utils";

export function CompetenceSwitcher({
  value,
  onChange,
  compact = false,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
  className?: string;
}) {
  const current = currentRentalCompetence();
  return (
    <div
      role="group"
      aria-label="Competência"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-input bg-emission-surface px-2 py-1.5",
        className,
      )}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onChange(shiftCompetence(value, -1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onChange(shiftCompetence(value, 1));
        }
      }}
    >
      {!compact && (
        <span className="px-1 text-xs font-semibold text-muted-foreground">Competência</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftCompetence(value, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span
        aria-live="polite"
        className="min-w-[9.5rem] text-center text-sm font-semibold text-foreground"
      >
        {formatCompetenceLong(value)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label="Próximo mês"
        onClick={() => onChange(shiftCompetence(value, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
      <input
        type="month"
        aria-label="Escolher mês e ano"
        value={value}
        onChange={(e) => {
          if (COMPETENCE_PATTERN.test(e.target.value)) onChange(e.target.value);
        }}
        className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
      />
      {value !== current && (
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => onChange(current)}>
          Mês atual
        </Button>
      )}
    </div>
  );
}
