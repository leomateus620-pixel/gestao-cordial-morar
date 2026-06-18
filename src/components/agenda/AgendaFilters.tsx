import { useState, type ReactNode } from "react";
import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import {
  defaultAgendaFilters,
  type AgendaFilters as AgendaFiltersState,
  type AgendaPeriod,
} from "@/hooks/useAgenda";
import { agendaPrioridadeOptions, agendaStatusOptions, agendaTipoOptions } from "@/types/agenda";
import { cn } from "@/lib/utils";

type Option = { id: string; nome: string };

const periods: { value: AgendaPeriod; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "sete_dias", label: "Próximos 7 dias" },
  { value: "mes", label: "Este mês" },
  { value: "todos", label: "Todos" },
];

export function AgendaFilters({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  people,
  clients,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filters: AgendaFiltersState;
  onFiltersChange: (filters: AgendaFiltersState) => void;
  people: Option[];
  clients: Option[];
}) {
  const [showFilters, setShowFilters] = useState(false);
  const activeSecondary = [
    filters.tipo,
    filters.status,
    filters.responsavel,
    filters.participante,
    filters.imobiliaria,
    filters.prioridade,
    filters.cliente,
  ].filter((value) => value !== "todos" && value !== "todas").length;

  return (
    <section className="space-y-3" aria-label="Filtros da agenda">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
        {periods.map((period) => (
          <FilterChip
            key={period.value}
            active={filters.periodo === period.value}
            onClick={() => onFiltersChange({ ...filters, periodo: period.value })}
          >
            {period.label}
          </FilterChip>
        ))}
        <FilterChip
          active={filters.periodo === "personalizado"}
          onClick={() => {
            onFiltersChange({ ...filters, periodo: "personalizado" });
            setShowFilters(true);
          }}
        >
          Período personalizado
        </FilterChip>
      </div>

      <div className="flex gap-2">
        <div className="glass-panel flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 py-2.5">
          <Search className="size-4 shrink-0 text-teal-700/65" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar título, cliente, responsável, imóvel, endereço..."
            aria-label="Buscar na agenda"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
          />
          {query && (
            <button type="button" onClick={() => onQueryChange("")} aria-label="Limpar busca">
              <X className="size-4 text-foreground/40" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className={cn(
            "glass-panel relative flex shrink-0 items-center gap-2 rounded-2xl px-3 text-xs font-semibold text-foreground/65",
            (showFilters || activeSecondary > 0) &&
              "bg-teal-700/10 text-teal-800 ring-1 ring-teal-700/15",
          )}
          aria-expanded={showFilters}
          aria-label="Filtros secundários"
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Filtros</span>
          {activeSecondary > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-teal-700 text-[9px] text-white">
              {activeSecondary}
            </span>
          )}
          <ChevronDown
            className={cn("size-3.5 transition-transform", showFilters && "rotate-180")}
          />
        </button>
      </div>

      <div
        className={cn(
          "animate-accordion-down gap-2",
          showFilters ? "grid grid-cols-2 md:grid-cols-4 xl:flex xl:flex-wrap" : "hidden",
        )}
      >
        <FilterSelect
          value={filters.tipo}
          onChange={(value) =>
            onFiltersChange({ ...filters, tipo: value as AgendaFiltersState["tipo"] })
          }
        >
          <option value="todos">Tipo</option>
          {agendaTipoOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={filters.status}
          onChange={(value) =>
            onFiltersChange({ ...filters, status: value as AgendaFiltersState["status"] })
          }
        >
          <option value="todos">Status</option>
          {agendaStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={filters.responsavel}
          onChange={(value) => onFiltersChange({ ...filters, responsavel: value })}
        >
          <option value="todos">Responsável</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.nome}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={filters.participante}
          onChange={(value) => onFiltersChange({ ...filters, participante: value })}
        >
          <option value="todos">Participante</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.nome}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={filters.imobiliaria}
          onChange={(value) =>
            onFiltersChange({ ...filters, imobiliaria: value as AgendaFiltersState["imobiliaria"] })
          }
        >
          <option value="todas">Imobiliária</option>
          <option value="cordial">Cordial</option>
          <option value="morar">Morar</option>
          <option value="ambas">Ambas</option>
        </FilterSelect>
        <FilterSelect
          value={filters.prioridade}
          onChange={(value) =>
            onFiltersChange({ ...filters, prioridade: value as AgendaFiltersState["prioridade"] })
          }
        >
          <option value="todas">Prioridade</option>
          {agendaPrioridadeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={filters.cliente}
          onChange={(value) => onFiltersChange({ ...filters, cliente: value })}
        >
          <option value="todos">Cliente</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.nome}
            </option>
          ))}
        </FilterSelect>

        {filters.periodo === "personalizado" && (
          <>
            <label className="glass-panel rounded-2xl px-3 py-2 xl:rounded-full">
              <span className="sr-only">Data inicial</span>
              <input
                type="date"
                value={filters.dataInicio}
                onChange={(event) =>
                  onFiltersChange({ ...filters, dataInicio: event.target.value })
                }
                className="w-full bg-transparent text-xs font-semibold outline-none"
              />
            </label>
            <label className="glass-panel rounded-2xl px-3 py-2 xl:rounded-full">
              <span className="sr-only">Data final</span>
              <input
                type="date"
                value={filters.dataFim}
                onChange={(event) => onFiltersChange({ ...filters, dataFim: event.target.value })}
                className="w-full bg-transparent text-xs font-semibold outline-none"
              />
            </label>
          </>
        )}

        <button
          type="button"
          onClick={() => onFiltersChange(defaultAgendaFilters)}
          className="glass-panel col-span-2 flex min-h-10 items-center justify-center gap-1.5 rounded-2xl px-3 text-xs font-semibold text-foreground/58 transition hover:text-foreground md:col-span-1 xl:rounded-full"
        >
          <RotateCcw className="size-3.5" />
          Limpar
        </button>
      </div>
    </section>
  );
}

function FilterChip({
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
        "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-all",
        active
          ? "bg-teal-700 text-white shadow-md shadow-teal-900/18"
          : "glass-panel text-foreground/58 hover:bg-white/75 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="glass-panel flex min-h-10 items-center rounded-2xl px-3 text-xs text-foreground/65 xl:rounded-full">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 max-w-full flex-1 bg-transparent text-xs font-semibold outline-none xl:max-w-[11rem]"
      >
        {children}
      </select>
    </label>
  );
}
