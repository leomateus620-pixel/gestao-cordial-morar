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
  /** Compact label for narrow viewports. */
  shortLabel?: string;
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
    shortLabel: "7 dias",
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
  {
    key: "today",
    label: "Fotos hoje",
    shortLabel: "Hoje",
    patch: periodoHoje,
    reset: { periodo: "todos" },
  },
  {
    key: "nextSevenDays",
    label: "Próximos 7 dias",
    shortLabel: "7 dias",
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

type Props = (
  | { variant: "geral"; stats: AgendaGeralStats }
  | {
      variant: "fotos";
      stats: AgendaFotosStats;
    }
) & {
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
      <div className="glass-panel grid grid-cols-3 gap-1 rounded-[1.35rem] p-1.5 lg:grid-cols-6">
        {items.map((item) => {
          const value = stats[item.key] ?? 0;
          const active = isActive(item, filters);
          const className = cn(
            "group relative flex min-w-0 flex-col justify-between gap-2 rounded-2xl px-3 py-2.5 text-left transition-all duration-200",
            active
              ? "bg-teal-700 text-white shadow-[0_10px_24px_-12px_rgba(15,118,110,0.9)]"
              : "text-foreground",
            interactive && !active && "hover:bg-white/70",
          );
          const content = (
            <>
              <span
                className={cn(
                  "block truncate text-[10px] font-bold uppercase tracking-[0.1em]",
                  active ? "text-white/78" : "text-foreground/48",
                )}
              >
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.shortLabel ?? item.label}</span>
              </span>
              <span
                className={cn(
                  "block font-mono text-[1.35rem] font-semibold leading-none tabular-nums sm:text-2xl",
                  active ? "text-white" : value === 0 ? "text-foreground/35" : "text-foreground",
                )}
              >
                {value}
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
              title={active ? "Remover filtro rápido" : `Filtrar por ${item.label.toLowerCase()}`}
              onClick={() =>
                onFiltersChange!({
                  ...filters!,
                  ...(active ? item.reset : item.patch),
                } as AgendaFilters)
              }
              className={cn(
                className,
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-inset",
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
