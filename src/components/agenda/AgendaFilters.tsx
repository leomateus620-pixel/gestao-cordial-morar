import { useId, useState, type ReactNode } from "react";
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
  filters,
  onFiltersChange,
  people,
  clients,
  query,
  onQueryChange,
}: {
  filters: AgendaFiltersState;
  onFiltersChange: (filters: AgendaFiltersState) => void;
  people: Option[];
  clients: Option[];
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const searchId = useId();
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
      <div className="flex items-center gap-2" role="search">
        <label htmlFor={searchId} className="sr-only">
          Buscar compromissos
        </label>
        <div className="glass-panel flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl px-3 text-foreground/58 focus-within:bg-white/76 focus-within:ring-2 focus-within:ring-teal-700/18">
          <Search className="size-4 shrink-0 text-teal-700/65" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar cliente, imóvel ou compromisso"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-foreground/42"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="premium-pressable grid size-8 shrink-0 place-items-center rounded-full text-foreground/48 hover:bg-white/80 hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className={cn(
            "premium-pressable glass-panel relative flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-3 text-xs font-semibold text-foreground/65",
            (showFilters || activeSecondary > 0) &&
              "bg-teal-700/10 text-teal-800 ring-1 ring-teal-700/15",
          )}
          aria-expanded={showFilters}
          aria-controls="agenda-secondary-filters"
          aria-label="Filtros avançados"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Filtros</span>
          {activeSecondary > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-teal-700 text-[10px] text-white">
              {activeSecondary}
            </span>
          )}
          <ChevronDown
            className={cn("size-3.5 transition-transform", showFilters && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
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

      <div
        id="agenda-secondary-filters"
        className={cn(
          "animate-accordion-down gap-2",
          showFilters
            ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:flex xl:flex-wrap"
            : "hidden",
        )}
      >
        <FilterSelect
          label="Tipo de compromisso"
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
          label="Status"
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
          label="Responsável"
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
          label="Participante"
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
          label="Imobiliária"
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
          label="Prioridade"
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
          label="Cliente"
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
            <label className="glass-panel col-span-1 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-teal-700/18 xl:rounded-full">
              <span className="sr-only">Data inicial</span>
              <input
                type="date"
                value={filters.dataInicio}
                onChange={(event) =>
                  onFiltersChange({ ...filters, dataInicio: event.target.value })
                }
                className="min-h-6 w-full bg-transparent text-xs font-semibold outline-none"
              />
            </label>
            <label className="glass-panel col-span-1 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-teal-700/18 xl:rounded-full">
              <span className="sr-only">Data final</span>
              <input
                type="date"
                value={filters.dataFim}
                onChange={(event) => onFiltersChange({ ...filters, dataFim: event.target.value })}
                className="min-h-6 w-full bg-transparent text-xs font-semibold outline-none"
              />
            </label>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            onFiltersChange(defaultAgendaFilters);
            onQueryChange("");
          }}
          className="premium-pressable glass-panel flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-3 text-xs font-semibold text-foreground/62 hover:bg-white/76 hover:text-foreground xl:rounded-full"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
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
      aria-pressed={active}
      className={cn(
        "premium-pressable snap-start shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold",
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
    <label className="glass-panel flex min-h-11 items-center rounded-2xl px-3 text-xs text-foreground/68 focus-within:bg-white/76 focus-within:ring-2 focus-within:ring-teal-700/18 xl:rounded-full">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 max-w-full flex-1 bg-transparent text-xs font-semibold outline-none xl:max-w-[11rem]"
      >
        {children}
      </select>
    </label>
  );
}
