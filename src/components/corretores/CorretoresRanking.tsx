import {
  Award,
  BadgeDollarSign,
  ClipboardCheck,
  Medal,
  Percent,
  type LucideIcon,
} from "lucide-react";
import type { Corretor } from "@/types/corretor";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";

type CorretoresRankingProps = {
  ranking: Corretor[];
  onSelect: (corretor: Corretor) => void;
};

export function CorretoresRanking({ ranking, onSelect }: CorretoresRankingProps) {
  const topThree = ranking.slice(0, 3);
  const bestConversion = [...ranking].sort((a, b) => b.taxaConversao - a.taxaConversao)[0];
  const bestAgency = [...ranking].sort((a, b) => b.agenciamentosFeitos - a.agenciamentosFeitos)[0];
  const bestCommission = [...ranking].sort((a, b) => b.comissaoPrevista - a.comissaoPrevista)[0];

  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
      <article className="premium-card min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/70">
              Ranking do período
            </p>
            <h2 className="mt-0.5 text-base font-semibold tracking-tight">Liderança comercial</h2>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[rgba(217,120,45,0.12)] text-[var(--system-accent-dark)]">
            <Medal className="size-5" />
          </span>
        </div>

        <div className="space-y-2">
          {topThree.map((corretor, index) => (
            <button
              key={corretor.id}
              type="button"
              onClick={() => onSelect(corretor)}
              className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-white/[0.55] px-3 py-3 text-left ring-1 ring-white/60 transition-all hover:-translate-y-0.5 hover:bg-white/[0.75] hover:shadow-[0_14px_30px_-24px_rgba(30,100,125,0.7)] active:scale-[0.99]"
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full font-mono text-xs font-bold",
                  index === 0
                    ? "bg-[rgba(217,120,45,0.16)] text-[var(--system-accent-dark)]"
                    : "bg-primary/10 text-primary",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{corretor.nome}</span>
                <span className="mt-0.5 block truncate text-[11px] text-foreground/52">
                  {corretor.contratosFechados} contratos · {corretor.taxaConversao}% conversão
                </span>
              </span>
              <span className="font-mono text-xs font-bold text-primary">
                {brl(corretor.comissaoPrevista, { compact: true })}
              </span>
            </button>
          ))}
        </div>
      </article>

      <article className="premium-card min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/70">
              Destaques
            </p>
            <h2 className="mt-0.5 text-base font-semibold tracking-tight">Sinais rápidos</h2>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Award className="size-5" />
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
          <Highlight
            icon={Percent}
            label="Melhor conversão"
            name={bestConversion?.nome ?? "-"}
            value={bestConversion ? `${bestConversion.taxaConversao}%` : "-"}
          />
          <Highlight
            icon={ClipboardCheck}
            label="Mais agenciamentos"
            name={bestAgency?.nome ?? "-"}
            value={bestAgency ? String(bestAgency.agenciamentosFeitos).padStart(2, "0") : "-"}
          />
          <Highlight
            icon={BadgeDollarSign}
            label="Maior comissão"
            name={bestCommission?.nome ?? "-"}
            value={bestCommission ? brl(bestCommission.comissaoPrevista, { compact: true }) : "-"}
          />
        </div>
      </article>
    </section>
  );
}

function Highlight({
  icon: Icon,
  label,
  name,
  value,
}: {
  icon: LucideIcon;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.55] p-3 ring-1 ring-white/60">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
        <Icon className="size-3.5 text-primary/70" />
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold">{name}</p>
        <p className="shrink-0 font-mono text-base font-bold text-primary">{value}</p>
      </div>
    </div>
  );
}
