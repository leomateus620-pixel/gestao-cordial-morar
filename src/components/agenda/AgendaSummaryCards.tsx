import {
  CalendarClock,
  CalendarDays,
  Camera,
  CircleAlert,
  FileSignature,
  RotateCcw,
  Route,
} from "lucide-react";

type AgendaStats = {
  today: number;
  nextSevenDays: number;
  visits: number;
  returns: number;
  media: number;
  signatures: number;
  pendingConfirmation: number;
};

const items = [
  { key: "today", label: "Hoje", icon: CalendarClock },
  { key: "nextSevenDays", label: "Próximos 7 dias", icon: CalendarDays },
  { key: "visits", label: "Visitas", icon: Route },
  { key: "returns", label: "Retornos", icon: RotateCcw },
  { key: "media", label: "Fotos/Vídeos", icon: Camera },
  { key: "signatures", label: "Assinaturas", icon: FileSignature },
  { key: "pendingConfirmation", label: "A confirmar", icon: CircleAlert },
] as const;

export function AgendaSummaryCards({ stats }: { stats: AgendaStats }) {
  return (
    <section aria-label="Resumo gerencial da agenda">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-7 lg:px-0">
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
                  {stats[item.key]}
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
