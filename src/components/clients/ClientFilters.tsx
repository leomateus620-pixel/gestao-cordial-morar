import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  brokerOptions,
  clientPurposeOptions,
  clientStatusOptions,
  clientTypeOptions,
  leadOriginOptions,
  propertyTypeOptions,
} from "@/types/client";
import { defaultClientFilters, type ClientFilters as ClientFiltersState } from "@/hooks/useClients";
import { cn } from "@/lib/utils";

type AgencyFilter = "todas" | "cordial" | "morar";

const agencyOptions = [
  { value: "todas", label: "Todas" },
  { value: "cordial", label: "Cordial" },
  { value: "morar", label: "Morar" },
] as const;

const budgetOptions = [
  { value: "todos", label: "Faixa de valor" },
  { value: "ate_300", label: "Até R$ 300k / 3k" },
  { value: "300_700", label: "R$ 300k-700k / 3k-7k" },
  { value: "700_1500", label: "R$ 700k-1,5M / 7k-15k" },
  { value: "acima_1500", label: "Acima de R$ 1,5M / 15k" },
] as const;

export function ClientFilters({
  query,
  onQueryChange,
  agency,
  onAgencyChange,
  filters,
  onFiltersChange,
  resultCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  agency: AgencyFilter;
  onAgencyChange: (value: AgencyFilter) => void;
  filters: ClientFiltersState;
  onFiltersChange: (filters: ClientFiltersState) => void;
  resultCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeFilterCount = Object.values(filters).filter((value) => value !== "todos").length;
  const hasActiveFilters = activeFilterCount > 0 || query.trim().length > 0;

  function clearFilters() {
    onQueryChange("");
    onFiltersChange(defaultClientFilters);
  }

  return (
    <section
      className="glass-panel-strong space-y-3 rounded-3xl p-3 sm:p-4"
      aria-label="Busca e filtros de clientes"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex shrink-0 gap-1 rounded-2xl border border-white/65 bg-white/42 p-1">
          {agencyOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={agency === option.value}
              onClick={() => onAgencyChange(option.value)}
              className={cn(
                "premium-pressable min-h-10 flex-1 rounded-xl px-3 text-xs font-semibold lg:flex-none",
                agency === option.value
                  ? "bg-teal-700 text-white shadow-md shadow-teal-900/15"
                  : "text-foreground/62 hover:bg-white/58 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 gap-2">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/65 bg-white/58 px-3 transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-teal-700/30 focus-within:bg-white/78 focus-within:ring-2 focus-within:ring-teal-700/10">
            <Search className="size-4 shrink-0 text-teal-700/65" aria-hidden="true" />
            <span className="sr-only">Buscar clientes</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Nome, telefone, e-mail ou região"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="premium-pressable grid size-8 shrink-0 place-items-center rounded-xl text-foreground/45 hover:bg-white/70 hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>

          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="client-advanced-filters"
            onClick={() => setExpanded((current) => !current)}
            className={cn(
              "premium-pressable relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-xs font-semibold lg:hidden",
              expanded || activeFilterCount > 0
                ? "border-teal-700/25 bg-teal-700 text-white"
                : "border-white/65 bg-white/58 text-foreground/65",
            )}
          >
            <SlidersHorizontal className="size-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-orange-200 text-[10px] font-bold text-teal-950">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div
        id="client-advanced-filters"
        className={cn(
          "grid-cols-2 gap-2 border-t border-white/55 pt-3 sm:grid-cols-3 lg:grid lg:grid-cols-4 xl:grid-cols-7",
          expanded ? "grid" : "hidden",
        )}
      >
        <FilterShell>
          <Select
            label="Tipo de cliente"
            value={filters.clientType}
            onChange={(value) => onFiltersChange({ ...filters, clientType: value as never })}
          >
            <option value="todos">Tipo de cliente</option>
            {clientTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>

        <FilterShell>
          <Select
            label="Finalidade"
            value={filters.purpose}
            onChange={(value) => onFiltersChange({ ...filters, purpose: value as never })}
          >
            <option value="todos">Finalidade</option>
            {clientPurposeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>

        <FilterShell>
          <Select
            label="Tipo de imóvel"
            value={filters.propertyType}
            onChange={(value) => onFiltersChange({ ...filters, propertyType: value as never })}
          >
            <option value="todos">Tipo de imóvel</option>
            {propertyTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>

        <FilterShell>
          <Select
            label="Status comercial"
            value={filters.status}
            onChange={(value) => onFiltersChange({ ...filters, status: value as never })}
          >
            <option value="todos">Status</option>
            {clientStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>

        <FilterShell>
          <Select
            label="Corretor responsável"
            value={filters.broker}
            onChange={(value) => onFiltersChange({ ...filters, broker: value })}
          >
            <option value="todos">Corretor</option>
            {brokerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>

        <FilterShell>
          <Select
            label="Origem do cliente"
            value={filters.origin}
            onChange={(value) => onFiltersChange({ ...filters, origin: value as never })}
          >
            <option value="todos">Origem</option>
            {leadOriginOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>

        <FilterShell>
          <Select
            label="Faixa de valor"
            value={filters.budget}
            onChange={(value) => onFiltersChange({ ...filters, budget: value as never })}
          >
            {budgetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterShell>
      </div>

      <div className="flex items-center justify-between gap-3 px-1 text-[11px] text-foreground/52">
        <span aria-live="polite">
          <strong className="font-semibold tabular-nums text-foreground/78">{resultCount}</strong>{" "}
          resultado{resultCount === 1 ? "" : "s"}
          {activeFilterCount > 0 &&
            ` · ${activeFilterCount} filtro${activeFilterCount === 1 ? "" : "s"}`}
        </span>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="premium-pressable inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-teal-800 hover:bg-white/58 disabled:pointer-events-none disabled:opacity-35"
        >
          <RotateCcw className="size-3.5" />
          Limpar
        </button>
      </div>
    </section>
  );
}

function FilterShell({ children }: { children: ReactNode }) {
  return (
    <label className="flex min-h-11 min-w-0 items-center rounded-2xl border border-white/65 bg-white/58 px-3 text-xs text-foreground/65 transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-teal-700/30 focus-within:bg-white/78 focus-within:ring-2 focus-within:ring-teal-700/10">
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
