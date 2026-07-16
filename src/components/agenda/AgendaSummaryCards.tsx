import {
  CalendarClock,
  CalendarDays,
  Camera,
  CircleAlert,
  FileSignature,
  RotateCcw,
  Route,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  { key: "today", label: "Hoje", icon: CalendarClock, tone: "text-teal-800 bg-teal-700/10" },
  {
    key: "nextSevenDays",
    label: "Próximos 7 dias",
    icon: CalendarDays,
    tone: "text-sky-800 bg-sky-700/9",
  },
  { key: "visits", label: "Visitas", icon: Route, tone: "text-teal-800 bg-teal-700/8" },
  { key: "returns", label: "Retornos", icon: RotateCcw, tone: "text-amber-800 bg-amber-600/10" },
  { key: "media", label: "Fotos e vídeos", icon: Camera, tone: "text-violet-800 bg-violet-600/9" },
  {
    key: "signatures",
    label: "Assinaturas",
    icon: FileSignature,
    tone: "text-emerald-800 bg-emerald-600/9",
  },
  {
    key: "pendingConfirmation",
    label: "A confirmar",
    icon: CircleAlert,
    tone: "text-orange-800 bg-orange-600/10",
  },
] as const;

export function AgendaSummaryCards({ stats }: { stats: AgendaStats }) {
  return (
    <section aria-label="Resumo gerencial da agenda">
      <p className="sr-only">Os indicadores abaixo consideram toda a agenda visível.</p>
      <ul className="premium-stagger no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0 xl:grid-cols-7">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.key}
              className="glass-panel min-w-32 snap-start shrink-0 rounded-2xl px-3.5 py-3 lg:min-w-0"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={cn("grid size-8 place-items-center rounded-xl", item.tone)}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-2xl font-semibold leading-none text-foreground">
                  {stats[item.key]}
                </span>
              </div>
              <p className="mt-2 text-[10px] font-bold uppercase leading-4 tracking-[0.08em] text-foreground/62">
                {item.label}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
