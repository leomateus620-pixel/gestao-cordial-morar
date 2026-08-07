import { Handshake, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgenciamentoTrack } from "@/lib/agenciamentos/track";

type TrackCounts = { total: number; pendentes: number };

type Props = {
  value: AgenciamentoTrack;
  onChange: (track: AgenciamentoTrack) => void;
  counts: { venda: TrackCounts; aluguel: TrackCounts };
};

const OPTIONS: Array<{
  id: AgenciamentoTrack;
  label: string;
  goal: string;
  Icon: typeof Handshake;
  activeBorder: string;
  activeIcon: string;
  activeText: string;
}> = [
  {
    id: "venda",
    label: "Venda",
    goal: "Meta: 8 captações + 4 placas por mês",
    Icon: Handshake,
    activeBorder: "border-sky-600/60 bg-sky-50/80",
    activeIcon: "bg-sky-600 text-white",
    activeText: "text-sky-900",
  },
  {
    id: "aluguel",
    label: "Aluguel",
    goal: "Meta: 10 captações acumuladas",
    Icon: KeyRound,
    activeBorder: "border-emerald-600/60 bg-emerald-50/80",
    activeIcon: "bg-emerald-600 text-white",
    activeText: "text-emerald-900",
  },
];

export function AgenciamentoTrackSelector({ value, onChange, counts }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Trilha de agenciamento">
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        const stats = counts[opt.id];
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              "group flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? cn(opt.activeBorder, "shadow-[0_14px_32px_-24px_rgba(15,23,42,0.5)]")
                : "border-foreground/8 bg-white/75 hover:border-foreground/16 hover:bg-white",
            )}
          >
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl transition",
                active ? opt.activeIcon : "bg-foreground/6 text-foreground/45",
              )}
            >
              <opt.Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-[1.45rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums",
                    active ? opt.activeText : "text-foreground/75",
                  )}
                >
                  {stats.total}
                </span>
                <span
                  className={cn(
                    "truncate text-sm font-bold tracking-tight",
                    active ? opt.activeText : "text-foreground/65",
                  )}
                >
                  Captações de {opt.label}
                </span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-foreground/48">{opt.goal}</span>
                {stats.pendentes > 0 && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    {stats.pendentes} pendente{stats.pendentes === 1 ? "" : "s"}
                  </span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
