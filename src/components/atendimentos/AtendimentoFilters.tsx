import { useState, type ReactNode } from "react";
import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import {
  atendimentoBrokerOptions,
  atendimentoFinalidadeOptions,
  atendimentoOrigemOptions,
  atendimentoPrioridadeOptions,
  atendimentoTipoImovelOptions,
} from "@/types/atendimento";
import {
  defaultAtendimentoFilters,
  type AtendimentoFilters as AtendimentoFiltersState,
} from "@/hooks/useAttendances";
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
  resultCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filters: AtendimentoFiltersState;
  onFiltersChange: (filters: AtendimentoFiltersState) => void;
  resultCount: number;
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

  function clearFilters() {
    onQueryChange("");
    onFiltersChange({ ...defaultAtendimentoFilters, status: filters.status });
  }

  return (
    <section
      className="glass-panel rounded-3xl p-3 sm:p-4"
      aria-label="Busca e filtros de atendimentos"
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-xs font-semibold tracking-tight text-foreground/80">
            Encontre o próximo atendimento
          </h2>
          <p className="text-[10px] text-foreground/48" aria-live="polite">
            {resultCount} resultado{resultCount === 1 ? "" : "s"} no recorte atual
          </p>
        </div>
        {(query || activeSecondary > 0) && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-semibold text-foreground/58 transition-colors duration-150 hover:bg-white/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/35"
          >
            <RotateCcw className="size-3.5" />
            Limpar
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/65 bg-white/58 px-3 transition-[border-color,background-color,box-shadow] duration-200 focus-within:border-teal-700/35 focus-within:bg-white/75 focus-within:ring-4 focus-within:ring-teal-700/8">
          <Search className="size-4 shrink-0 text-teal-700/65" />
          <span className="sr-only">Buscar atendimentos</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Nome, telefone, bairro ou corretor"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Limpar busca"
              className="grid size-8 shrink-0 place-items-center rounded-xl text-foreground/40 transition-colors duration-150 hover:bg-white/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/35"
            >
              <X className="size-4" />
            </button>
          )}
        </label>

        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className={cn(
            "premium-pressable relative flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-white/65 bg-white/58 px-3 text-xs font-semibold text-foreground/65 transition-[border-color,background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/35",
            (showFilters || activeSecondary > 0) &&
              "border-teal-700/20 bg-teal-700/10 text-teal-800 shadow-sm",
          )}
          aria-expanded={showFilters}
          aria-controls="atendimento-secondary-filters"
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Filtros</span>
          {activeSecondary > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-teal-700 text-[9px] text-white">
              {activeSecondary}
            </span>
          )}
          <ChevronDown
            className={cn(
              "hidden size-3.5 transition-transform duration-200 motion-reduce:transition-none sm:block",
              showFilters && "rotate-180",
            )}
          />
        </button>
      </div>

      {showFilters && (
        <div
          id="atendimento-secondary-filters"
          className="premium-reveal mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"
        >
          <FilterShell>
            <Select
              label="Finalidade"
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
              label="Tipo de imóvel"
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
              label="Origem"
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
              label="Corretor"
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
              label="Prioridade"
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
              label="Período"
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
            onClick={() =>
              onFiltersChange({ ...defaultAtendimentoFilters, status: filters.status })
            }
            disabled={isDefault || activeSecondary === 0}
            className="col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/65 bg-white/55 px-3 text-xs font-semibold text-foreground/58 transition-colors duration-150 hover:bg-white/75 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/35 disabled:cursor-default disabled:opacity-35 md:col-span-3 xl:col-span-6"
          >
            <RotateCcw className="size-3.5" />
            Limpar filtros avançados
          </button>
        </div>
      )}
    </section>
  );
}

function FilterShell({ children }: { children: ReactNode }) {
  return (
    <label className="flex min-h-11 min-w-0 items-center rounded-2xl border border-white/65 bg-white/58 px-3 text-xs text-foreground/65 transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-teal-700/30 focus-within:bg-white/75 focus-within:ring-2 focus-within:ring-teal-700/10">
      {children}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-w-0 w-full bg-transparent text-xs font-semibold outline-none"
    >
      {children}
    </select>
  );
}
