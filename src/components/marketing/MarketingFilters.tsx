import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { marketingChannelFilters, marketingStatusFilters } from "@/services/marketing";
import type { MarketingChannelFilter, MarketingStatusFilter } from "@/types/marketing";
import { cn } from "@/lib/utils";

type MarketingFiltersProps = {
  status: MarketingStatusFilter;
  channel: MarketingChannelFilter;
  search: string;
  resultCount: number;
  onStatusChange: (status: MarketingStatusFilter) => void;
  onChannelChange: (channel: MarketingChannelFilter) => void;
  onSearchChange: (search: string) => void;
  onReset: () => void;
};

export function MarketingFilters({
  status,
  channel,
  search,
  resultCount,
  onStatusChange,
  onChannelChange,
  onSearchChange,
  onReset,
}: MarketingFiltersProps) {
  const hasFilter = status !== "Todas" || channel !== "Todos" || search.trim().length > 0;

  return (
    <section className="glass-panel rounded-3xl p-3 sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar campanhas</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/42" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar campanha, canal, região ou objetivo"
            className="h-11 w-full min-w-0 rounded-2xl border border-white/65 bg-white/58 pl-9 pr-9 text-sm font-semibold text-foreground outline-none transition placeholder:text-foreground/38 focus:border-primary/35 focus:ring-2 focus:ring-primary/15"
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-foreground/42 transition hover:bg-white/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <X className="size-4" />
            </button>
          )}
        </label>

        <div className="flex items-center justify-between gap-3 xl:w-auto">
          <span className="shrink-0 rounded-full bg-white/55 px-3 py-1 text-[11px] font-bold text-foreground/58">
            {resultCount} campanha{resultCount === 1 ? "" : "s"}
          </span>
          {hasFilter && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-9 items-center justify-center rounded-full px-3 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <FilterRow label="Status">
          {marketingStatusFilters.map((item) => (
            <FilterChip
              key={item.value}
              active={status === item.value}
              label={item.label}
              onClick={() => onStatusChange(item.value)}
            />
          ))}
        </FilterRow>
        <FilterRow label="Canais">
          {marketingChannelFilters.map((item) => (
            <FilterChip
              key={item.value}
              active={channel === item.value}
              label={item.label}
              onClick={() => onChannelChange(item.value)}
            />
          ))}
        </FilterRow>
      </div>
    </section>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 md:grid-cols-[5rem_minmax(0,1fr)] md:items-center">
      <p className="px-1 text-[10px] font-bold text-foreground/42">{label}</p>
      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-9 shrink-0 rounded-full px-3 text-xs font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
        active
          ? "bg-primary text-white shadow-[0_12px_24px_-16px_rgba(30,100,125,0.95)]"
          : "bg-white/56 text-foreground/58 ring-1 ring-white/65 hover:bg-white/80 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
