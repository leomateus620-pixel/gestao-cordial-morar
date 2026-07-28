import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCorretorPeriodLabel, getCorretorStatusLabel } from "@/services/corretores";
import type {
  Corretor,
  CorretorFiltersState,
  CorretorPeriodFilter,
  CorretorSortKey,
  CorretorStatusFilter,
} from "@/types/corretor";
import { cn } from "@/lib/utils";

type CorretoresFiltersProps = {
  filters: CorretorFiltersState;
  corretores: Corretor[];
  onFiltersChange: (filters: Partial<CorretorFiltersState>) => void;
  onReset: () => void;
  isLoading?: boolean;
  activeAgencyLabel?: string;
};

const periodOptions: CorretorPeriodFilter[] = ["mes", "ultimos_30", "trimestre", "ano"];
const statusOptions: CorretorStatusFilter[] = ["ativos", "todos", "inativos"];

const sortOptions: Array<{ value: CorretorSortKey; label: string }> = [
  { value: "conversao", label: "Conversão de atendimentos" },
  { value: "contratos", label: "Contratos fechados" },
  { value: "atendimentos", label: "Atendimentos recebidos" },
  { value: "comissao", label: "Comissão prevista" },
  { value: "agenciamentos", label: "Agenciamentos" },
];

export function CorretoresFilters({
  filters,
  corretores,
  onFiltersChange,
  onReset,
  isLoading = false,
  activeAgencyLabel,
}: CorretoresFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const selectedBrokerExists = useMemo(
    () => filters.corretorId === "todos" || corretores.some(({ id }) => id === filters.corretorId),
    [corretores, filters.corretorId],
  );
  const brokerSelectValue = selectedBrokerExists ? filters.corretorId : "todos";
  const activeFilterCount = [
    filters.periodo !== "mes",
    filters.status !== "ativos",
    filters.ordenacao !== "contratos",
    filters.corretorId !== "todos",
    filters.busca.trim().length > 0,
  ].filter(Boolean).length;

  return (
    <section className="premium-card p-3 sm:p-4" aria-labelledby="corretores-filters-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <SlidersHorizontal className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="corretores-filters-title" className="text-sm font-semibold tracking-tight">
                Filtros operacionais
              </h2>
              {activeAgencyLabel && (
                <span className="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Escopo: {activeAgencyLabel}
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-foreground/55">
              Período, situação, ranking e corretor.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="min-h-11 shrink-0 rounded-xl px-3 md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="corretores-filter-controls"
        >
          {activeFilterCount > 0 ? `${activeFilterCount} ativos` : "Filtros"}
          <ChevronDown
            className={cn("ml-2 size-4 transition-transform", mobileOpen && "rotate-180")}
            aria-hidden
          />
        </Button>
      </div>

      <div
        id="corretores-filter-controls"
        className={cn(
          "mt-4 gap-3",
          mobileOpen ? "grid" : "hidden",
          "md:grid md:grid-cols-2 xl:grid-cols-[0.9fr_0.9fr_1.1fr_1.1fr_minmax(13rem,1.2fr)_auto]",
        )}
      >
        <FilterField label="Período" htmlFor="corretores-periodo">
          <Select
            value={filters.periodo}
            disabled={isLoading}
            onValueChange={(periodo) =>
              onFiltersChange({ periodo: periodo as CorretorPeriodFilter })
            }
          >
            <SelectTrigger
              id="corretores-periodo"
              className="h-11 rounded-xl border-border/55 bg-background/72"
            >
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((periodo) => (
                <SelectItem key={periodo} value={periodo}>
                  {getCorretorPeriodLabel(periodo)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Situação" htmlFor="corretores-status">
          <Select
            value={filters.status}
            disabled={isLoading}
            onValueChange={(status) => onFiltersChange({ status: status as CorretorStatusFilter })}
          >
            <SelectTrigger
              id="corretores-status"
              className="h-11 rounded-xl border-border/55 bg-background/72"
            >
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {getCorretorStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Critério do ranking" htmlFor="corretores-ranking">
          <Select
            value={filters.ordenacao}
            disabled={isLoading}
            onValueChange={(ordenacao) =>
              onFiltersChange({ ordenacao: ordenacao as CorretorSortKey })
            }
          >
            <SelectTrigger
              id="corretores-ranking"
              className="h-11 rounded-xl border-border/55 bg-background/72"
            >
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Corretor" htmlFor="corretores-corretor">
          <Select
            value={brokerSelectValue}
            disabled={isLoading}
            onValueChange={(corretorId) => onFiltersChange({ corretorId })}
          >
            <SelectTrigger
              id="corretores-corretor"
              className="h-11 rounded-xl border-border/55 bg-background/72"
            >
              <SelectValue placeholder="Corretor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os corretores</SelectItem>
              {corretores.map((corretor) => (
                <SelectItem key={corretor.id} value={corretor.id}>
                  {corretor.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Busca" htmlFor="corretores-busca">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40"
              aria-hidden
            />
            <input
              id="corretores-busca"
              value={filters.busca}
              disabled={isLoading}
              onChange={(event) => onFiltersChange({ busca: event.target.value })}
              placeholder="Nome ou CRECI"
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-border/55 bg-background/72 pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow,background-color] placeholder:text-foreground/40 focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/12 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </FilterField>

        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl border-border/55 bg-background/72 px-3 text-foreground/65 hover:text-primary md:w-auto"
            onClick={onReset}
            disabled={isLoading || activeFilterCount === 0}
            aria-label="Limpar todos os filtros"
          >
            <RotateCcw className="mr-2 size-4" aria-hidden />
            <span className="xl:sr-only">Limpar filtros</span>
          </Button>
        </div>
      </div>
    </section>
  );
}

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/55"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
