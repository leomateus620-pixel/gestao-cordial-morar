import { ClipboardCheck, Medal, Trophy } from "lucide-react";
import type { AgenciamentoCorretorRanking } from "@/types/agenciamento";
import { cn } from "@/lib/utils";

type AgenciamentosRankingProps = {
  ranking: AgenciamentoCorretorRanking[];
};

export function AgenciamentosRanking({ ranking }: AgenciamentosRankingProps) {
  if (ranking.length === 0) return null;

  return (
    <section className="premium-card min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/70">
            Ranking compacto
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight">
            Agenciamentos por corretor
          </h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[rgba(217,120,45,0.12)] text-[var(--system-accent-dark)]">
          <Medal className="size-5" />
        </span>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        {ranking.slice(0, 3).map((item, index) => (
          <div
            key={item.corretorId}
            className="rounded-2xl bg-white/[0.58] p-3 ring-1 ring-white/65"
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full font-mono text-xs font-bold",
                  index === 0
                    ? "bg-[rgba(217,120,45,0.16)] text-[var(--system-accent-dark)]"
                    : "bg-primary/10 text-primary",
                )}
              >
                {index === 0 ? <Trophy className="size-4" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.corretorNome}</p>
                <p className="mt-0.5 truncate text-[11px] text-foreground/52">
                  {item.total} agenciamentos - {item.percentualChecklist}% checklist
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              <Mini label="Placa" value={item.comPlaca} />
              <Mini label="Drive" value={item.fotosDrive} />
              <Mini label="Site" value={item.noSite} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/65 px-2 py-2 ring-1 ring-foreground/5">
      <ClipboardCheck className="mx-auto size-3.5 text-primary/70" />
      <p className="mt-1 font-mono text-sm font-black text-foreground">{value}</p>
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-foreground/42">
        {label}
      </p>
    </div>
  );
}
