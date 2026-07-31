import { Award, Trophy } from "lucide-react";
import {
  RENTAL_BONUS_LISTINGS,
  SALES_BONUS_LISTINGS,
  SALES_BONUS_SIGNS,
  getBonusPeriodLabel,
  getBonusStatusLabel,
  type AgenciamentoTrack,
  type BonusProgress,
} from "@/lib/agenciamentos/track";
import type { AgenciamentoBonus } from "@/types/agenciamento";
import { cn } from "@/lib/utils";

type Props = {
  track: AgenciamentoTrack;
  progress: BonusProgress;
  bonuses: AgenciamentoBonus[];
  showBrokerName: boolean;
};

const statusTone: Record<AgenciamentoBonus["status"], string> = {
  pendente: "bg-amber-500/15 text-amber-800",
  aprovada: "bg-sky-500/15 text-sky-800",
  paga: "bg-emerald-500/15 text-emerald-800",
  cancelada: "bg-slate-200 text-slate-600",
};

export function AgenciamentoBonusPanel({ track, progress, bonuses, showBrokerName }: Props) {
  const isSales = track === "venda";
  const goalText = isSales
    ? `${SALES_BONUS_LISTINGS} captações + ${SALES_BONUS_SIGNS} placas no mês`
    : `${RENTAL_BONUS_LISTINGS} captações acumuladas`;

  return (
    <section
      aria-labelledby="agenciamentos-bonus-title"
      className="rounded-[1.75rem] border border-white/70 bg-white/70 p-5 shadow-[0_18px_44px_-36px_rgba(23,27,33,0.35)] backdrop-blur-md sm:p-6"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="agenciamentos-bonus-title" className="text-sm font-extrabold tracking-tight">
            Bonificações · {isSales ? "Venda" : "Aluguel"}
          </h2>
          <p className="mt-0.5 text-xs text-foreground/55">
            {goalText} · ciclo: {progress.cycleLabel}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#174d61]/10 px-3 py-1 text-xs font-bold text-[#174d61]">
          <Trophy aria-hidden="true" className="size-3.5" />
          {progress.earned} conquistada{progress.earned === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-semibold text-foreground/60">
          <span>Progresso para a próxima bonificação</span>
          <span className="tabular-nums">{progress.percent}%</span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-foreground/8"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              isSales ? "bg-sky-600" : "bg-emerald-600",
            )}
            style={{ width: `${Math.min(progress.percent, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-foreground/58">
          {isSales
            ? `Faltam ${progress.listingsRemaining} captação(ões) e ${progress.signsRemaining} placa(s). Atual: ${progress.listings} captações / ${progress.signs} placas.`
            : `Faltam ${progress.listingsRemaining} captação(ões). Atual: ${progress.listings} captações acumuladas.`}
        </p>
      </div>

      <div className="mt-4 border-t border-foreground/8 pt-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/45">
          Histórico de bonificações
        </h3>
        {bonuses.length === 0 ? (
          <p className="mt-2 text-xs text-foreground/55">
            Nenhuma bonificação registrada nesta trilha até o momento.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {bonuses.slice(0, 6).map((bonus) => (
              <li
                key={bonus.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-white/70 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Award aria-hidden="true" className="size-4 shrink-0 text-[#174d61]" />
                  <span className="min-w-0 truncate text-xs font-semibold">
                    {showBrokerName ? `${bonus.corretorNome ?? "Corretor"} · ` : ""}
                    Bonificação nº {bonus.nivel} · {getBonusPeriodLabel(bonus)}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    statusTone[bonus.status],
                  )}
                >
                  {getBonusStatusLabel(bonus.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
