import { Award, AlertTriangle } from "lucide-react";
import {
  RENTAL_BONUS_LISTINGS,
  SALES_BONUS_LISTINGS,
  SALES_BONUS_SIGNS,
  describeBlockingChecklist,
  getBonusPeriodLabel,
  getBonusStatusLabel,
  summarizeBonuses,
  type AgenciamentoTrack,
  type BonusProgress,
} from "@/lib/agenciamentos/track";
import { Button } from "@/components/ui/button";
import type { AgenciamentoBonus } from "@/types/agenciamento";
import { cn } from "@/lib/utils";

type Props = {
  track: AgenciamentoTrack;
  progress: BonusProgress;
  bonuses: AgenciamentoBonus[];
  showBrokerName: boolean;
  onOpenRegistry?: () => void;
  onReviewPending?: () => void;
};

const statusTone: Record<AgenciamentoBonus["status"], string> = {
  pendente: "bg-amber-500/15 text-amber-800",
  aprovada: "bg-sky-500/15 text-sky-800",
  paga: "bg-emerald-500/15 text-emerald-800",
  cancelada: "bg-slate-200 text-slate-600",
};

export function AgenciamentoBonusPanel({
  track,
  progress,
  bonuses,
  showBrokerName,
  onOpenRegistry,
  onReviewPending,
}: Props) {
  const isSales = track === "venda";
  const registry = summarizeBonuses(bonuses);
  const goalText = isSales
    ? `${SALES_BONUS_LISTINGS} captações + ${SALES_BONUS_SIGNS} placas`
    : `${RENTAL_BONUS_LISTINGS} captações acumuladas`;
  const blockingText = describeBlockingChecklist(progress.blocking);
  const cycleScopeLabel = isSales ? "no mês" : "acumulados";
  const progressLine = isSales
    ? `Bonificação nº ${progress.nextLevel} de ${progress.cycleLabel}: faltam ${progress.listingsRemaining} captação(ões) válida(s) (${progress.listings}/${progress.listingsTarget}) e ${progress.signsRemaining} placa(s) (${progress.signs}/${progress.signsTarget})`
    : `Bonificação nº ${progress.nextLevel} (acumulada): faltam ${progress.listingsRemaining} captação(ões) válida(s) (${progress.listings}/${progress.listingsTarget})`;

  return (
    <section
      aria-labelledby="agenciamentos-bonus-title"
      className="rounded-2xl border border-foreground/8 bg-white/85 p-5 shadow-[0_18px_44px_-38px_rgba(23,27,33,0.4)] backdrop-blur-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="agenciamentos-bonus-title" className="text-sm font-extrabold tracking-tight">
          Bonificações · {isSales ? "Venda" : "Aluguel"}
          <span className="ml-2 text-[11px] font-medium text-foreground/45">
            {goalText} · {progress.cycleLabel}
          </span>
        </h2>
        <div className="flex items-center gap-3">
          <BonusStat value={registry.validadas} label="validadas" tone="success" />
          {registry.pendentes > 0 && (
            <BonusStat value={registry.pendentes} label="pendentes" tone="warning" />
          )}
        </div>
      </div>

      <div className="mt-4 flex items-end gap-4">
        <span
          className={cn(
            "text-[2rem] font-extrabold leading-none tracking-[-0.05em] tabular-nums",
            isSales ? "text-sky-700" : "text-emerald-700",
          )}
        >
          {progress.percent}%
        </span>
        <div className="min-w-0 flex-1 pb-0.5">
          <div
            className="h-2 overflow-hidden rounded-full bg-foreground/8"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso para a próxima bonificação"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                isSales ? "bg-sky-600" : "bg-emerald-600",
              )}
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-foreground/52">{progressLine}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CycleStat label={`Agenciamentos ${cycleScopeLabel}`} value={progress.cycleTotal} />
        <CycleStat label="Válidos p/ bonificação" value={progress.listings} />
        {isSales && <CycleStat label="Com placa" value={progress.signs} />}
        <CycleStat
          label="Fora da conta"
          value={progress.blocking.blocked}
          tone={progress.blocking.blocked > 0 ? "warning" : "muted"}
        />
      </div>

      {progress.blocking.blocked > 0 && (
        <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-amber-700" />
          <p className="min-w-0 text-[11px] font-medium leading-snug text-amber-900">
            {progress.blocking.blocked} agenciamento(s) não contam por checklist incompleto
            {blockingText ? ` · ${blockingText}` : ""}
          </p>
          {onReviewPending && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-lg border-amber-500/30 bg-white/70 px-2.5 text-xs font-semibold text-amber-900 shadow-none hover:bg-amber-500/10"
              onClick={onReviewPending}
            >
              Revisar
            </Button>
          )}
        </div>
      )}


      <div className="mt-4 border-t border-foreground/8 pt-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/45">
            Histórico de bonificações
          </h3>
          {onOpenRegistry && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/8"
              onClick={onOpenRegistry}
            >
              Ver todas
            </Button>
          )}
        </div>

        {bonuses.length === 0 ? (
          <p className="mt-2 text-xs text-foreground/52">
            Nenhuma bonificação registrada nesta trilha até o momento.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {bonuses.slice(0, 6).map((bonus) => (
              <li
                key={bonus.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.03]"
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

function BonusStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "success" | "warning";
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "text-lg font-extrabold leading-none tabular-nums",
          tone === "success" ? "text-[#174d61]" : "text-amber-700",
        )}
      >
        {value}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
        {label}
      </span>
    </span>
  );
}
