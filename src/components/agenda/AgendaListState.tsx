import { CalendarDays, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export function AgendaListSkeleton() {
  return (
    <div className="space-y-3" aria-label="Carregando compromissos" aria-busy="true">
      <div className="flex items-center gap-3 px-0.5">
        <div className="h-3 w-28 animate-pulse rounded-full bg-white/60" />
        <div className="h-px flex-1 bg-foreground/8" />
      </div>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,23rem),1fr))]">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="glass-panel rounded-[1.35rem] p-3.5 pl-4">
            <div className="flex gap-3.5">
              <div className="w-12 space-y-1.5 sm:w-14">
                <div className="h-4 w-11 animate-pulse rounded-md bg-white/70" />
                <div className="h-2 w-9 animate-pulse rounded-full bg-white/50" />
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-white/70" />
                  <div className="h-4 w-16 animate-pulse rounded-full bg-white/60" />
                </div>
                <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-white/50" />
                <div className="flex gap-4">
                  <div className="h-2.5 w-24 animate-pulse rounded-full bg-white/50" />
                  <div className="h-2.5 w-32 animate-pulse rounded-full bg-white/50" />
                </div>
                <div className="flex items-center justify-between border-t border-white/60 pt-2.5">
                  <div className="h-3 w-24 animate-pulse rounded-full bg-white/55" />
                  <div className="h-3 w-14 animate-pulse rounded-full bg-white/55" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgendaListError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="glass-panel flex flex-col gap-3 rounded-[1.35rem] border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-destructive">
            Não foi possível carregar a agenda
          </p>
          {message && <p className="mt-0.5 truncate text-[11px] text-destructive/75">{message}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground transition hover:bg-destructive/90"
      >
        <RotateCcw className="size-3.5" />
        Tentar novamente
      </button>
    </div>
  );
}

export function AgendaListEmpty({
  title,
  description,
  hasFilters,
  onClearFilters,
  canCreate,
  createLabel,
  onCreate,
}: {
  title: string;
  description: string;
  hasFilters: boolean;
  onClearFilters: () => void;
  canCreate: boolean;
  createLabel: string;
  onCreate: () => void;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      icon={<CalendarDays className="size-5" />}
      action={
        hasFilters || canCreate ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {hasFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold text-foreground/70 ring-1 ring-white/80 transition hover:bg-white hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                Limpar filtros
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={onCreate}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_24px_-12px_rgba(15,118,110,0.9)] transition hover:bg-teal-600"
              >
                <Plus className="size-3.5" />
                {createLabel}
              </button>
            )}
          </div>
        ) : undefined
      }
    />
  );
}
