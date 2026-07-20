import { ArrowDownUp, Search, SlidersHorizontal, X } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { DEFAULT_SALES_FILTERS } from "@/types/sale";
import type {
  SalesContractFilter,
  SalesFiltersState,
  SalesPeriodFilter,
  SalesStatusFilter,
} from "@/types/sale";

const statusFilters: Array<{ id: SalesStatusFilter; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "concluidas", label: "Concluídas" },
  { id: "em_analise", label: "Em revisão" },
];

const periodFilters: Array<{ id: SalesPeriodFilter; label: string; helper: string }> = [
  { id: "todos", label: "Qualquer período", helper: "Todo o histórico disponível" },
  { id: "mes", label: "Este mês", helper: "Somente vendas do mês corrente" },
];

const contractFilters: Array<{ id: SalesContractFilter; label: string; helper: string }> = [
  { id: "todos", label: "Qualquer situação", helper: "Com ou sem contrato" },
  { id: "com_contrato", label: "Com contrato", helper: "Arquivo de contrato anexado" },
  { id: "sem_contrato", label: "Contrato pendente", helper: "Sem arquivo de contrato" },
];

export function SalesFilters({
  filters,
  onFiltersChange,
  search,
  onSearchChange,
}: {
  filters: SalesFiltersState;
  onFiltersChange: (filters: SalesFiltersState) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const activeFilterCount = [
    filters.status !== DEFAULT_SALES_FILTERS.status,
    filters.period !== DEFAULT_SALES_FILTERS.period,
    filters.contract !== DEFAULT_SALES_FILTERS.contract,
  ].filter(Boolean).length;

  const hasChanges =
    activeFilterCount > 0 || filters.sort !== DEFAULT_SALES_FILTERS.sort || Boolean(search.trim());

  function updateFilters(patch: Partial<SalesFiltersState>) {
    onFiltersChange({ ...filters, ...patch });
  }

  function resetFilters() {
    onFiltersChange(DEFAULT_SALES_FILTERS);
    onSearchChange("");
  }

  const activeChips = [
    filters.status === "concluidas"
      ? { id: "status", label: "Concluídas", onRemove: () => updateFilters({ status: "todos" }) }
      : filters.status === "em_analise"
        ? {
            id: "status",
            label: "Em revisão",
            onRemove: () => updateFilters({ status: "todos" }),
          }
        : null,
    filters.period === "mes"
      ? { id: "period", label: "Este mês", onRemove: () => updateFilters({ period: "todos" }) }
      : null,
    filters.contract === "com_contrato"
      ? {
          id: "contract",
          label: "Com contrato",
          onRemove: () => updateFilters({ contract: "todos" }),
        }
      : filters.contract === "sem_contrato"
        ? {
            id: "contract",
            label: "Contrato pendente",
            onRemove: () => updateFilters({ contract: "todos" }),
          }
        : null,
    filters.sort === "maior_valor"
      ? {
          id: "sort",
          label: "Maior valor",
          onRemove: () => updateFilters({ sort: "recentes" }),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <section
      className="rounded-[1.5rem] border border-white/70 bg-white/[0.7] p-3 shadow-[0_18px_42px_-34px_rgba(23,27,33,0.42)] backdrop-blur-xl sm:p-3.5"
      aria-label="Busca e filtros de vendas"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:grid-cols-[minmax(20rem,1fr)_auto_auto]">
        <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-foreground/42"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar comprador, imóvel, endereço, cidade, valor ou responsável"
            className="h-11 w-full rounded-2xl border border-border/65 bg-white/86 pl-10 pr-11 text-sm font-semibold text-foreground shadow-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-foreground/38 hover:bg-white focus:border-primary/55 focus:bg-white focus:ring-2 focus:ring-primary/15 motion-reduce:transition-none"
            aria-label="Buscar vendas realizadas"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-xl text-foreground/48 transition hover:bg-foreground/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none"
              aria-label="Limpar busca"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          className="no-scrollbar flex min-w-0 items-center gap-1.5 overflow-x-auto"
          aria-label="Filtros rápidos por status"
        >
          {statusFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => updateFilters({ status: item.id })}
              aria-pressed={filters.status === item.id}
              className={cn(
                "inline-flex h-10 shrink-0 items-center justify-center rounded-xl px-3.5 text-xs font-extrabold transition-[background-color,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-1 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none",
                filters.status === item.id
                  ? "bg-primary text-primary-foreground shadow-[0_8px_18px_-10px_rgba(30,100,125,0.7)]"
                  : "bg-transparent text-foreground/60 hover:bg-white hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:justify-end">
          <label className="relative min-w-0 sm:w-[10.5rem]">
            <span className="sr-only">Ordenar vendas</span>
            <ArrowDownUp
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/48"
              aria-hidden="true"
            />
            <select
              value={filters.sort}
              onChange={(event) =>
                updateFilters({ sort: event.target.value as SalesFiltersState["sort"] })
              }
              className="h-11 w-full appearance-none rounded-2xl border border-border/65 bg-white/82 pl-9 pr-8 text-xs font-extrabold text-foreground/72 outline-none transition focus:border-primary/55 focus:ring-2 focus:ring-primary/15"
            >
              <option value="recentes">Mais recentes</option>
              <option value="maior_valor">Maior valor</option>
            </select>
          </label>

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-xs font-extrabold transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 motion-reduce:transition-none",
                  activeFilterCount > 0
                    ? "border-primary/25 bg-primary/10 text-primary shadow-sm"
                    : "border-border/65 bg-white/82 text-foreground/68 hover:bg-white hover:text-foreground",
                )}
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </SheetTrigger>

            <SheetContent
              side="bottom"
              closeLabel="Fechar filtros"
              className="mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col gap-0 overflow-hidden rounded-t-[2rem] border-white/70 bg-[#f7f3ed]/98 p-0 backdrop-blur-2xl [&>button]:hidden"
            >
              <SheetHeader className="shrink-0 border-b border-white/65 px-5 pb-4 pt-5 text-left sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SheetTitle className="text-xl font-black tracking-tight">
                      Filtros de vendas
                    </SheetTitle>
                    <SheetDescription className="mt-1 font-medium text-foreground/55">
                      Combine período e situação do contrato.
                    </SheetDescription>
                  </div>
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-white/75 text-foreground/58 ring-1 ring-white/80 transition hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                      aria-label="Fechar filtros"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </SheetClose>
                </div>
              </SheetHeader>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
                <FilterGroup
                  label="Período"
                  options={periodFilters}
                  value={filters.period}
                  onChange={(value) => updateFilters({ period: value as SalesPeriodFilter })}
                />
                <FilterGroup
                  label="Contrato"
                  options={contractFilters}
                  value={filters.contract}
                  onChange={(value) => updateFilters({ contract: value as SalesContractFilter })}
                />
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/65 bg-white/55 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
                <button
                  type="button"
                  onClick={resetFilters}
                  disabled={!hasChanges}
                  className="h-11 rounded-2xl border border-border/70 bg-white/72 px-4 text-sm font-bold text-foreground/68 transition hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Limpar tudo
                </button>
                <SheetClose asChild>
                  <button
                    type="button"
                    className="h-11 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                  >
                    Ver resultados
                  </button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {(activeChips.length > 0 || search) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-foreground/[0.07] pt-3">
          <span className="mr-0.5 text-[11px] font-bold text-foreground/48">Ativos:</span>
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white/78 px-3 text-[11px] font-bold text-foreground/64 ring-1 ring-border/60 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Remover busca ativa"
            >
              Busca: “{search.length > 20 ? `${search.slice(0, 20)}…` : search}”
              <X className="size-3" aria-hidden="true" />
            </button>
          )}
          {activeChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary/[0.09] px-3 text-[11px] font-bold text-primary ring-1 ring-primary/15 transition hover:bg-primary/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={`Remover filtro ${chip.label}`}
            >
              {chip.label}
              <X className="size-3" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto min-h-8 px-2 text-[11px] font-extrabold text-foreground/52 underline-offset-4 transition hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Limpar filtros
          </button>
        </div>
      )}
    </section>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string; helper: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground/52">
        {label}
      </legend>
      <div className="mt-2 grid gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={value === option.id}
            className={cn(
              "flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              value === option.id
                ? "border-primary/25 bg-primary/[0.09] shadow-sm"
                : "border-white/75 bg-white/62 hover:bg-white/82",
            )}
          >
            <span>
              <span className="block text-sm font-extrabold text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-xs font-medium text-foreground/50">
                {option.helper}
              </span>
            </span>
            <span
              className={cn(
                "size-3.5 shrink-0 rounded-full border-2",
                value === option.id
                  ? "border-primary bg-primary shadow-[inset_0_0_0_3px_white]"
                  : "border-foreground/20 bg-white",
              )}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
