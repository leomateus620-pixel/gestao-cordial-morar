import { useState, type ReactNode } from "react";
import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import {
  atendimentoBrokerOptions,
  atendimentoFinalidadeOptions,
  atendimentoOrigemOptions,
  atendimentoPrioridadeOptions,
  atendimentoStatusOptions,
  atendimentoTipoImovelOptions,
} from "@/types/atendimento";
import {
  defaultAtendimentoFilters,
  type AtendimentoFilters as AtendimentoFiltersState,
} from "@/hooks/useAtendimentos";
import { cn } from "@/lib/utils";

const periodOptions = [
  { value: "todos", label: "Todo período" },
  { value: "hoje", label: "Hoje" },
  { value: "sete_dias", label: "Últimos 7 dias" },
  { value: "mes", label: "Este mês" },
] as const;

export function AtendimentoFilters({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filters: AtendimentoFiltersState;
  onFiltersChange: (filters: AtendimentoFiltersState) => void;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const isDefault = JSON.stringify(filters) === JSON.stringify(defaultAtendimentoFilters);
  const activeSecondary = [
    filters.finalidade,
    filters.tipoImovel,
    filters.origem,
    filters.corretor,
    filters.prioridade,
    filters.periodo,
  ].filter((value) => value !== "todos").length;

  return (
    <section className="space-y-3">
      <div className="flex gap-2">
        <label className="glass-panel flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 py-2.5">
          <Search className="size-4 shrink-0 text-teal-700/65" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar nome, telefone, bairro, origem, corretor..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
          />
          {query && (
            <button type="button" onClick={() => onQueryChange("")} aria-label="Limpar busca">
              <X className="size-4 text-foreground/40" />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className={cn(
            "glass-panel relative flex shrink-0 items-center gap-2 rounded-2xl px-3 text-xs font-semibold text-foreground/65",
            (showFilters || activeSecondary > 0) &&
              "bg-teal-700/10 text-teal-800 ring-1 ring-teal-700/15",
          )}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="size-4" />
          Filtros
          {activeSecondary > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-teal-700 text-[9px] text-white">
              {activeSecondary}
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              showFilters && "rotate-180",
            )}
          />
        </button>
        {activeSecondary > 0 && (
          <button
            type="button"
            onClick={() => onFiltersChange(defaultAtendimentoFilters)}
            className="glass-panel flex shrink-0 items-center gap-1.5 rounded-2xl px-3 text-xs font-semibold text-foreground/65"
            aria-label="Limpar filtros"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
        <StatusChip
          active={filters.status === "todos"}
          onClick={() => onFiltersChange({ ...filters, status: "todos" })}
        >
          Todos
        </StatusChip>
        {atendimentoStatusOptions.map((option) => (
          <StatusChip
            key={option.value}
            active={filters.status === option.value}
            onClick={() => onFiltersChange({ ...filters, status: option.value })}
          >
            {option.label}
          </StatusChip>
        ))}
      </div>

      <div
        className={cn(
          "gap-2 animate-accordion-down",
          showFilters ? "grid grid-cols-2 lg:flex lg:flex-wrap" : "hidden",
        )}
      >
        <FilterShell>
          <Select
            value={filters.finalidade}
            onChange={(value) => onFiltersChange({ ...filters, finalidade: value as never })}
          >
            <option value="todos">Finalidade</option>
            {atendimentoFinalidadeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>
        <FilterShell>
          <Select
            value={filters.tipoImovel}
            onChange={(value) => onFiltersChange({ ...filters, tipoImovel: value as never })}
          >
            <option value="todos">Tipo de imóvel</option>
            {atendimentoTipoImovelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>
        <FilterShell>
          <Select
            value={filters.origem}
            onChange={(value) => onFiltersChange({ ...filters, origem: value as never })}
          >
            <option value="todos">Origem</option>
            {atendimentoOrigemOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>
        <FilterShell>
          <Select
            value={filters.corretor}
            onChange={(value) => onFiltersChange({ ...filters, corretor: value })}
          >
            <option value="todos">Corretor</option>
            {atendimentoBrokerOptions
              .filter((option) => option.id !== "a_definir")
              .map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>
        <FilterShell>
          <Select
            value={filters.prioridade}
            onChange={(value) => onFiltersChange({ ...filters, prioridade: value as never })}
          >
            <option value="todos">Prioridade</option>
            {atendimentoPrioridadeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>
        <FilterShell>
          <Select
            value={filters.periodo}
            onChange={(value) => onFiltersChange({ ...filters, periodo: value as never })}
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>
        <button
          type="button"
          onClick={() => onFiltersChange(defaultAtendimentoFilters)}
          disabled={isDefault}
          className="glass-panel col-span-2 flex min-h-10 items-center justify-center gap-1.5 rounded-2xl px-3 text-xs font-semibold text-foreground/58 transition hover:text-foreground disabled:opacity-35 lg:rounded-full"
        >
          <RotateCcw className="size-3.5" />
          Limpar filtros
        </button>
      </div>
    </section>
  );
}

function StatusChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
        active
          ? "bg-teal-700 text-white shadow-md shadow-teal-900/18"
          : "glass-panel text-foreground/58 hover:bg-white/75 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterShell({ children }: { children: ReactNode }) {
  return (
    <label className="glass-panel flex min-h-10 items-center rounded-2xl px-3 text-xs text-foreground/65 lg:rounded-full">
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-w-0 max-w-full flex-1 bg-transparent text-xs font-semibold outline-none lg:max-w-[11rem]"
    >
      {children}
    </select>
  );
}
