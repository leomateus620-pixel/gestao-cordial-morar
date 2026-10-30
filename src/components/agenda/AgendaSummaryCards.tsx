import {
  CalendarCheck2,
  CalendarRange,
  CheckCircle2,
  Home,
  Hourglass,
  PenLine,
  PhoneCall,
  RotateCcw,
  Sun,
} from "lucide-react";
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

const itemMeta: Record<string, { icon: typeof Sun; tone: string }> = {
  today: { icon: Sun, tone: "bg-amber-500/12 text-amber-700" },
  nextSevenDays: { icon: CalendarRange, tone: "bg-teal-600/12 text-teal-700" },
  visits: { icon: Home, tone: "bg-sky-600/12 text-sky-700" },
  returns: { icon: PhoneCall, tone: "bg-violet-600/12 text-violet-700" },
  signatures: { icon: PenLine, tone: "bg-emerald-600/12 text-emerald-700" },
  pendingConfirmation: { icon: Hourglass, tone: "bg-orange-500/14 text-orange-700" },
  agendadas: { icon: CalendarCheck2, tone: "bg-sky-600/12 text-sky-700" },
  pendentes: { icon: Hourglass, tone: "bg-orange-500/14 text-orange-700" },
  concluidas: { icon: CheckCircle2, tone: "bg-emerald-600/12 text-emerald-700" },
  reagendadas: { icon: RotateCcw, tone: "bg-violet-600/12 text-violet-700" },
};

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
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {items.map((item) => {
          const value = stats[item.key] ?? 0;
          const active = isActive(item, filters);
          const meta = itemMeta[item.key] ?? itemMeta.today;
          const ItemIcon = meta.icon;
          const className = cn(
            "group relative flex min-w-0 items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left transition-all duration-200 sm:px-3",
            active
              ? "border-teal-700 bg-teal-700 text-white shadow-[0_10px_24px_-14px_rgba(15,118,110,0.9)]"
              : "border-white/80 bg-white/70 text-foreground shadow-[0_4px_14px_-10px_rgba(23,27,33,0.35)] backdrop-blur-sm",
            interactive && !active && "hover:-translate-y-0.5 hover:bg-white",
            !active && value === 0 && "opacity-60",
          );
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "hidden size-8 shrink-0 place-items-center rounded-xl sm:grid",
                  active ? "bg-white/18 text-white" : meta.tone,
                )}
              >
                <ItemIcon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-xl font-semibold leading-none tabular-nums">
                  {value}
                </span>
                <span
                  className={cn(
                    "mt-1 block truncate text-[10px] font-semibold uppercase tracking-[0.08em]",
                    active ? "text-white/80" : "text-foreground/50",
                  )}
                >
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.shortLabel ?? item.label}</span>
                </span>
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
