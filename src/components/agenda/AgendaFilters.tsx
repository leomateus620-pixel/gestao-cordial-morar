import { useState, type ReactNode } from "react";
import { CalendarRange, ChevronDown, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import {
  defaultAgendaFilters,
  type AgendaFilters as AgendaFiltersState,
  type AgendaPeriod,
} from "@/hooks/useAgenda";
import { agendaPrioridadeOptions, agendaStatusOptions, agendaTipoOptions } from "@/types/agenda";
import { cn } from "@/lib/utils";

type Option = { id: string; nome: string };

const periods: { value: AgendaPeriod; label: string; shortLabel?: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "sete_dias", label: "Próximos 7 dias", shortLabel: "7 dias" },
  { value: "mes", label: "Este mês", shortLabel: "Mês" },
  { value: "todos", label: "Todos" },
];

type SecondaryKey =
  | "tipo"
  | "status"
  | "responsavel"
  | "participante"
  | "imobiliaria"
  | "prioridade"
  | "cliente";

const secondaryLabels: Record<SecondaryKey, string> = {
  tipo: "Tipo",
  status: "Status",
  responsavel: "Responsável",
  participante: "Participante",
  imobiliaria: "Imobiliária",
  prioridade: "Prioridade",
  cliente: "Cliente",
};

const imobiliariaLabels: Record<string, string> = {
  cordial: "Cordial",
  morar: "Morar",
  ambas: "Ambas",
};

function isNeutral(value: string) {
  return value === "todos" || value === "todas";
}

export function AgendaFilters({
  filters,
  onFiltersChange,
  people,
  clients,
  resultText,
}: {
  filters: AgendaFiltersState;
  onFiltersChange: (filters: AgendaFiltersState) => void;
  people: Option[];
  clients: Option[];
  /** Pre-formatted result summary (e.g. "7 compromissos") shown next to the toolbar. */
  resultText?: string;
}) {
  const [showFilters, setShowFilters] = useState(filters.periodo === "personalizado");

  const activeSecondary = (Object.keys(secondaryLabels) as SecondaryKey[]).filter(
    (key) => !isNeutral(filters[key]),
  );
  const hasCustomRange =
    filters.periodo === "personalizado" && Boolean(filters.dataInicio || filters.dataFim);
  const hasAnyActive = activeSecondary.length > 0 || filters.periodo !== "todos";

  function labelFor(key: SecondaryKey, value: string) {
    switch (key) {
      case "tipo":
        return agendaTipoOptions.find((option) => option.value === value)?.label ?? value;
      case "status":
        return agendaStatusOptions.find((option) => option.value === value)?.label ?? value;
      case "prioridade":
        return agendaPrioridadeOptions.find((option) => option.value === value)?.label ?? value;
      case "imobiliaria":
        return imobiliariaLabels[value] ?? value;
      case "cliente":
        return clients.find((client) => client.id === value)?.nome ?? value;
      default:
        return people.find((person) => person.id === value)?.nome ?? value;
    }
  }

  function clearKey(key: SecondaryKey) {
    onFiltersChange({ ...filters, [key]: defaultAgendaFilters[key] });
  }

  function selectPeriod(value: AgendaPeriod) {
    onFiltersChange({ ...filters, periodo: value });
    if (value === "personalizado") setShowFilters(true);
  }

  return (
    <section className="space-y-2.5" aria-label="Filtros da agenda">
      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label="Período"
          className="glass-panel no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-full p-1 sm:flex-none"
        >
          {periods.map((period) => (
            <PeriodChip
              key={period.value}
              active={filters.periodo === period.value}
              onClick={() => selectPeriod(period.value)}
            >
              <span className="hidden sm:inline">{period.label}</span>
              <span className="sm:hidden">{period.shortLabel ?? period.label}</span>
            </PeriodChip>
          ))}
          <PeriodChip
            active={filters.periodo === "personalizado"}
            onClick={() => selectPeriod("personalizado")}
            aria-label="Período personalizado"
          >
            <CalendarRange className="size-3.5" />
            <span className="hidden md:inline">Personalizado</span>
          </PeriodChip>
        </div>

        {resultText && (
          <span className="ml-auto hidden truncate text-[11px] font-medium text-foreground/50 sm:inline">
            {resultText}
          </span>
        )}

        <button
          type="button"
          onClick={() => setShowFilters((current) => !current)}
          className={cn(
            "glass-panel relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground/65 transition sm:gap-2 sm:px-3.5",
            "hover:bg-white/75 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50",
            (showFilters || activeSecondary.length > 0) &&
              "bg-teal-700/10 text-teal-900 ring-1 ring-teal-700/15",
          )}
          aria-expanded={showFilters}
          aria-controls="agenda-advanced-filters"
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Filtros</span>
          {activeSecondary.length > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-teal-700 font-mono text-[10px] font-semibold text-white">
              {activeSecondary.length}
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              showFilters && "rotate-180",
            )}
          />
        </button>
      </div>

      {showFilters && (
        <div
          id="agenda-advanced-filters"
          className="glass-panel animate-in fade-in slide-in-from-top-1 rounded-[1.35rem] p-3.5 duration-200 sm:p-4"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Field label="Tipo">
              <Select
                value={filters.tipo}
                onChange={(value) =>
                  onFiltersChange({ ...filters, tipo: value as AgendaFiltersState["tipo"] })
                }
              >
                <option value="todos">Todos os tipos</option>
                {agendaTipoOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={filters.status}
                onChange={(value) =>
                  onFiltersChange({ ...filters, status: value as AgendaFiltersState["status"] })
                }
              >
                <option value="todos">Todos os status</option>
                {agendaStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Responsável">
              <Select
                value={filters.responsavel}
                onChange={(value) => onFiltersChange({ ...filters, responsavel: value })}
              >
                <option value="todos">Qualquer responsável</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Participante">
              <Select
                value={filters.participante}
                onChange={(value) => onFiltersChange({ ...filters, participante: value })}
              >
                <option value="todos">Qualquer participante</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Imobiliária">
              <Select
                value={filters.imobiliaria}
                onChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    imobiliaria: value as AgendaFiltersState["imobiliaria"],
                  })
                }
              >
                <option value="todas">Todas</option>
                <option value="cordial">Cordial</option>
                <option value="morar">Morar</option>
                <option value="ambas">Ambas</option>
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select
                value={filters.prioridade}
                onChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    prioridade: value as AgendaFiltersState["prioridade"],
                  })
                }
              >
                <option value="todas">Todas</option>
                {agendaPrioridadeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cliente" className="col-span-2 md:col-span-1">
              <Select
                value={filters.cliente}
                onChange={(value) => onFiltersChange({ ...filters, cliente: value })}
              >
                <option value="todos">Todos os clientes</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.nome}
                  </option>
                ))}
              </Select>
            </Field>

            {filters.periodo === "personalizado" && (
              <>
                <Field label="De">
                  <DateInput
                    value={filters.dataInicio}
                    max={filters.dataFim || undefined}
                    onChange={(value) => onFiltersChange({ ...filters, dataInicio: value })}
                  />
                </Field>
                <Field label="Até">
                  <DateInput
                    value={filters.dataFim}
                    min={filters.dataInicio || undefined}
                    onChange={(value) => onFiltersChange({ ...filters, dataFim: value })}
                  />
                </Field>
              </>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-foreground/8 pt-3">
            <p className="text-[11px] text-foreground/45">
              {activeSecondary.length === 0
                ? "Refine a lista combinando os filtros acima."
                : `${activeSecondary.length} filtro${activeSecondary.length === 1 ? "" : "s"} aplicado${activeSecondary.length === 1 ? "" : "s"}.`}
            </p>
            <button
              type="button"
              onClick={() => onFiltersChange(defaultAgendaFilters)}
              disabled={!hasAnyActive}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-foreground/60 transition hover:bg-white/70 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <RotateCcw className="size-3.5" />
              Limpar tudo
            </button>
          </div>
        </div>
      )}

      {(activeSecondary.length > 0 || hasCustomRange) && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5" aria-label="Filtros ativos">
          {hasCustomRange && (
            <ActiveChip
              label="Período"
              value={formatRange(filters.dataInicio, filters.dataFim)}
              onRemove={() =>
                onFiltersChange({ ...filters, periodo: "todos", dataInicio: "", dataFim: "" })
              }
            />
          )}
          {activeSecondary.map((key) => (
            <ActiveChip
              key={key}
              label={secondaryLabels[key]}
              value={labelFor(key, filters[key])}
              onRemove={() => clearKey(key)}
            />
          ))}
          <button
            type="button"
            onClick={() => onFiltersChange(defaultAgendaFilters)}
            className="ml-1 text-[11px] font-semibold text-teal-800/80 underline-offset-2 transition hover:text-teal-900 hover:underline"
          >
            Limpar tudo
          </button>
        </div>
      )}
    </section>
  );
}

function PeriodChip({
  active,
  onClick,
  children,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-all duration-200 sm:px-3 sm:text-xs",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50",
        active
          ? "bg-teal-700 text-white shadow-[0_8px_18px_-10px_rgba(15,118,110,0.9)]"
          : "text-foreground/58 hover:bg-white/70 hover:text-foreground",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function ActiveChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-teal-700/10 py-1 pl-2.5 pr-1 text-[11px] text-teal-900 ring-1 ring-teal-700/12">
      <span className="font-medium text-teal-900/60">{label}</span>
      <span className="truncate font-semibold">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}: ${value}`}
        className="grid size-5 place-items-center rounded-full text-teal-900/60 transition hover:bg-teal-700/15 hover:text-teal-950"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/45">
        {label}
      </span>
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
  const neutral = isNeutral(value);
  return (
    <span className="relative block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 w-full appearance-none truncate rounded-xl border bg-white/55 pl-3 pr-8 text-xs font-semibold outline-none transition",
          "hover:bg-white/75 focus-visible:border-teal-600/40 focus-visible:bg-white/85 focus-visible:ring-2 focus-visible:ring-teal-500/25",
          neutral
            ? "border-white/70 text-foreground/60"
            : "border-teal-600/25 bg-teal-700/8 text-teal-950",
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground/40" />
    </span>
  );
}

function DateInput({
  value,
  onChange,
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-10 w-full rounded-xl border bg-white/55 px-3 text-xs font-semibold outline-none transition",
        "hover:bg-white/75 focus-visible:border-teal-600/40 focus-visible:bg-white/85 focus-visible:ring-2 focus-visible:ring-teal-500/25",
        value
          ? "border-teal-600/25 bg-teal-700/8 text-teal-950"
          : "border-white/70 text-foreground/60",
      )}
    />
  );
}

function formatRange(start: string, end: string) {
  const format = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
  if (start && end) return `${format(start)} – ${format(end)}`;
  if (start) return `a partir de ${format(start)}`;
  return `até ${format(end)}`;
}
