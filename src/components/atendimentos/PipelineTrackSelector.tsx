import { Handshake, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommercialTrack } from "@/lib/atendimentos/track";

type TrackCounts = { total: number; overdue: number };

type Props = {
  value: CommercialTrack;
  onChange: (track: CommercialTrack) => void;
  counts: { venda: TrackCounts; aluguel: TrackCounts };
};

const OPTIONS: Array<{
  id: CommercialTrack;
  label: string;
  description: string;
  Icon: typeof Handshake;
  accent: string;
  ring: string;
  chip: string;
}> = [
  {
    id: "venda",
    label: "Vendas",
    description: "Funil de compra e venda",
    Icon: Handshake,
    accent: "bg-sky-500/8 border-sky-500/40 text-sky-900",
    ring: "ring-2 ring-sky-500/70",
    chip: "bg-sky-600 text-white",
  },
  {
    id: "aluguel",
    label: "Aluguéis",
    description: "Funil de locação",
    Icon: KeyRound,
    accent: "bg-emerald-500/8 border-emerald-500/40 text-emerald-900",
    ring: "ring-2 ring-emerald-500/70",
    chip: "bg-emerald-600 text-white",
  },
];

export function PipelineTrackSelector({ value, onChange, counts }: Props) {
  return (
    <section
      className="rounded-3xl border border-white/60 bg-white/70 p-2 shadow-sm backdrop-blur-sm"
      role="tablist"
      aria-label="Trilha comercial"
    >
      <div className="grid gap-2 sm:grid-cols-2">
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
                "group relative flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                active
                  ? cn(opt.accent, opt.ring, "shadow-[0_10px_28px_-16px_rgba(15,23,42,0.35)]")
                  : "border-transparent bg-white/60 text-foreground/70 hover:bg-white",
              )}
            >
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-2xl transition",
                  active ? opt.chip : "bg-slate-100 text-slate-500 group-hover:bg-slate-200",
                )}
              >
                <opt.Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight sm:text-base">
                    {opt.label}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      active ? opt.chip : "bg-slate-200 text-slate-600",
                    )}
                  >
                    {stats.total} ativo{stats.total === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-foreground/55">
                  <span>{opt.description}</span>
                  {stats.overdue > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-800">
                      {stats.overdue} em atraso
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
