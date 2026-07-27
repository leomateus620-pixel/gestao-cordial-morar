import {
  CalendarClock,
  CalendarCheck,
  CalendarDays,
  CalendarX2,
  Camera,
  CircleAlert,
  FileSignature,
  Hourglass,
  RotateCcw,
  Route,
} from "lucide-react";

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

const geralItems = [
  { key: "today", label: "Hoje", icon: CalendarClock },
  { key: "nextSevenDays", label: "Próximos 7 dias", icon: CalendarDays },
  { key: "visits", label: "Visitas", icon: Route },
  { key: "returns", label: "Retornos", icon: RotateCcw },
  { key: "signatures", label: "Assinaturas", icon: FileSignature },
  { key: "pendingConfirmation", label: "A confirmar", icon: CircleAlert },
] as const;

const fotosItems = [
  { key: "today", label: "Fotos hoje", icon: Camera },
  { key: "nextSevenDays", label: "Próximos 7 dias", icon: CalendarDays },
  { key: "agendadas", label: "Agendadas", icon: CalendarClock },
  { key: "pendentes", label: "Pendentes", icon: Hourglass },
  { key: "concluidas", label: "Concluídas", icon: CalendarCheck },
  { key: "reagendadas", label: "Reagendadas", icon: CalendarX2 },
] as const;

type Props =
  | { variant: "geral"; stats: AgendaGeralStats }
  | { variant: "fotos"; stats: AgendaFotosStats };

export function AgendaSummaryCards(props: Props) {
  const items = props.variant === "fotos" ? fotosItems : geralItems;
  const stats = props.stats as Record<string, number>;
  return (
    <section
      aria-label={
        props.variant === "fotos"
          ? "Resumo da agenda de fotos"
          : "Resumo gerencial da agenda de visitas e compromissos"
      }
    >
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-6 lg:px-0">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className="glass-panel min-w-28 shrink-0 rounded-2xl px-3 py-3 lg:min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className="size-3.5 text-teal-700/70" />
                <span className="font-mono text-lg font-semibold text-foreground">
                  {stats[item.key] ?? 0}
                </span>
              </div>
              <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.1em] text-foreground/48">
                {item.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
