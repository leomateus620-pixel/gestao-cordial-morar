import type { AgendaFilters } from "@/hooks/useAgenda";
import { cn } from "@/lib/utils";

export type AgendaGeralStats = {
  today: number;
  nextSevenDays: number;
  visits: number;
  returns: number;
  signatures: number;
  pendingConfirmation: number;
};

export type AgendaFotosStats = {
  today: number;
  nextSevenDays: number;
  agendadas: number;
  pendentes: number;
  concluidas: number;
  reagendadas: number;
};

type FilterPatch = Partial<AgendaFilters>;

type Item = {
  key: string;
  label: string;
  /** Filter applied when the card is activated. */
  patch: FilterPatch;
  /** Filter restored when the active card is clicked again. */
  reset: FilterPatch;
};

const periodoHoje: Item["patch"] = { periodo: "hoje" };

const geralItems: Item[] = [
  { key: "today", label: "Hoje", patch: periodoHoje, reset: { periodo: "todos" } },
  {
    key: "nextSevenDays",
    label: "Próximos 7 dias",
    patch: { periodo: "sete_dias" },
    reset: { periodo: "todos" },
  },
  { key: "visits", label: "Visitas", patch: { tipo: "visita" }, reset: { tipo: "todos" } },
  { key: "returns", label: "Retornos", patch: { tipo: "retorno" }, reset: { tipo: "todos" } },
  {
    key: "signatures",
    label: "Assinaturas",
    patch: { tipo: "assinatura" },
    reset: { tipo: "todos" },
  },
  {
    key: "pendingConfirmation",
    label: "A confirmar",
    patch: { status: "agendado" },
    reset: { status: "todos" },
  },
];

const fotosItems: Item[] = [
  { key: "today", label: "Fotos hoje", patch: periodoHoje, reset: { periodo: "todos" } },
  {
    key: "nextSevenDays",
    label: "Próximos 7 dias",
    patch: { periodo: "sete_dias" },
    reset: { periodo: "todos" },
  },
  {
    key: "agendadas",
    label: "Agendadas",
    patch: { status: "agendado" },
    reset: { status: "todos" },
  },
  {
    key: "pendentes",
    label: "Pendentes",
    patch: { status: "em_andamento" },
    reset: { status: "todos" },
  },
  {
    key: "concluidas",
    label: "Concluídas",
    patch: { status: "concluido" },
    reset: { status: "todos" },
  },
  {
    key: "reagendadas",
    label: "Reagendadas",
    patch: { status: "reagendado" },
    reset: { status: "todos" },
  },
];

type Props = ({ variant: "geral"; stats: AgendaGeralStats } | {
  variant: "fotos";
  stats: AgendaFotosStats;
}) & {
  filters?: AgendaFilters;
  onFiltersChange?: (filters: AgendaFilters) => void;
};

function isActive(item: Item, filters?: AgendaFilters) {
  if (!filters) return false;
  return Object.entries(item.patch).every(
    ([key, value]) => filters[key as keyof AgendaFilters] === value,
  );
}

export function AgendaSummaryCards(props: Props) {
  const { filters, onFiltersChange } = props;
  const items = props.variant === "fotos" ? fotosItems : geralItems;
  const stats = props.stats as Record<string, number>;
  const interactive = Boolean(filters && onFiltersChange);

  return (
    <section
      aria-label={
        props.variant === "fotos"
          ? "Filtros rápidos da agenda de fotos"
          : "Filtros rápidos da agenda de visitas e compromissos"
      }
    >
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-6 lg:px-0">
        {items.map((item) => {
          const value = stats[item.key] ?? 0;
          const active = isActive(item, filters);
          const className = cn(
            "min-w-28 shrink-0 rounded-2xl px-3.5 py-3 text-left transition lg:min-w-0",
            active
              ? "bg-gradient-to-br from-teal-700 to-teal-600 text-white shadow-md shadow-teal-900/20"
              : "glass-panel text-foreground",
            interactive && !active && "hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-md",
            !active && value === 0 && "opacity-60",
          );
          const content = (
            <>
              <span
                className={cn(
                  "block font-mono text-2xl font-semibold leading-none",
                  active ? "text-white" : "text-foreground",
                )}
              >
                {value}
              </span>
              <span
                className={cn(
                  "mt-1.5 block truncate text-[10.5px] font-semibold tracking-tight",
                  active ? "text-white/80" : "text-foreground/55",
                )}
              >
                {item.label}
              </span>
            </>
          );

          if (!interactive) {
            return (
              <div key={item.key} className={className}>
                {content}
              </div>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onFiltersChange!({
                  ...filters!,
                  ...(active ? item.reset : item.patch),
                } as AgendaFilters)
              }
              className={cn(
                className,
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50",
              )}
            >
              {content}
            </button>
          );
        })}
      </div>
    </section>
  );
}
