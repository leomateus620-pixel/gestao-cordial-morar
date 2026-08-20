import { Medal, Trophy } from "lucide-react";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCorretorSortLabel, getCorretorSortValue } from "@/services/corretores";
import type { Corretor, CorretorSortKey } from "@/types/corretor";

type CorretoresRankingProps = {
  ranking: Corretor[];
  criterion: CorretorSortKey;
  onSelect: (corretor: Corretor) => void;
  isLoading?: boolean;
  isError?: boolean;
};

export function CorretoresRanking({
  ranking,
  criterion,
  onSelect,
  isLoading = false,
  isError = false,
}: CorretoresRankingProps) {
  const eligible = ranking
    .filter(
      (corretor) =>
        corretor.rankingPosicao != null &&
        getCorretorSortValue(corretor, criterion) > 0,
    )
    .slice(0, 5);
  const criterionLabel = getCorretorSortLabel(criterion);

  return (
    <section className="premium-card min-w-0 p-4 sm:p-5" aria-labelledby="ranking-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/75">
            Ranking do período
          </p>
          <h2 id="ranking-title" className="mt-0.5 text-base font-semibold tracking-tight">
            Liderança operacional
          </h2>
          <p className="mt-1 text-xs text-foreground/58">
            Critério ativo:{" "}
            <span className="font-semibold text-foreground/78">{criterionLabel}</span>
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-700">
          <Medal className="size-5" aria-hidden />
        </span>
      </div>

      {isLoading && <RankingSkeleton />}

      {!isLoading && isError && (
        <RankingNotice
          title="Ranking indisponível"
          description="Não foi possível carregar os dados operacionais agora."
          tone="error"
        />
      )}

      {!isLoading && !isError && eligible.length === 0 && (
        <RankingNotice
          title="Sem ranking neste recorte"
          description={`Nenhum corretor possui ${criterionLabel.toLocaleLowerCase("pt-BR")} acima de zero. As posições não são exibidas sem atividade comprovada.`}
        />
      )}

      {!isLoading && !isError && eligible.length > 0 && (
        <ol className="space-y-2" aria-label={`Ranking por ${criterionLabel}`}>
          {eligible.map((corretor) => (
            <li key={corretor.id}>
              <button
                type="button"
                onClick={() => onSelect(corretor)}
                aria-label={`${corretor.rankingPosicao}º lugar, ${corretor.nome}, ${formatRankingValue(
                  corretor,
                  criterion,
                )}`}
                className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/45 bg-background/58 px-3 py-3 text-left transition-[border-color,background-color,box-shadow,transform] enabled:hover:-translate-y-0.5 enabled:hover:border-primary/20 enabled:hover:bg-background/85 enabled:hover:shadow-[0_14px_30px_-25px_rgba(30,100,125,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0"
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-full font-mono text-xs font-bold",
                    corretor.rankingPosicao === 1
                      ? "bg-orange-500/14 text-orange-800"
                      : "bg-primary/10 text-primary",
                  )}
                  aria-hidden
                >
                  {corretor.rankingPosicao}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{corretor.nome}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-foreground/55">
                    {buildSupportingMetric(corretor, criterion)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-bold text-primary">
                    {formatRankingValue(corretor, criterion)}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.12em] text-foreground/42">
                    {criterionUnit(criterion)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function formatRankingValue(corretor: Corretor, criterion: CorretorSortKey) {
  const value = getCorretorSortValue(corretor, criterion);
  if (criterion === "conversao") return `${value}%`;
  return String(value);
}

function criterionUnit(criterion: CorretorSortKey) {
  const units: Record<CorretorSortKey, string> = {
    conversao: "conversão",
    contratos: "contratos",
    atendimentos: "recebidos",
    agenciamentos: "agenciamentos",
    bonificacoes: "bonificações",
  };
  return units[criterion];
}

function buildSupportingMetric(corretor: Corretor, criterion: CorretorSortKey) {
  if (criterion === "conversao") {
    return `${corretor.contratosDeAtendimento} contratos em ${corretor.atendimentosRecebidos} atendimentos`;
  }
  if (criterion === "contratos") {
    return `${corretor.vendasFechadas} vendas · ${corretor.alugueisFechados} aluguéis`;
  }
  if (criterion === "atendimentos") {
    return `${corretor.atendimentosEmAndamento} em andamento · ${corretor.atendimentosConcluidos} concluídos`;
  }
  if (criterion === "bonificacoes") {
    return `${corretor.bonificacoesPagas} pagas · ${corretor.bonificacoesPendentes} pendentes`;
  }
  return `${corretor.agenciamentosChecklistPercent}% do checklist concluído`;
}

function RankingNotice({
  title,
  description,
  tone = "empty",
}: {
  title: string;
  description: string;
  tone?: "empty" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border border-dashed border-border/70 bg-background/45 px-4 py-6 text-center",
        tone === "error" && "border-destructive/25 bg-destructive/[0.035]",
      )}
    >
      <Trophy
        className={cn(
          "mx-auto size-5 text-foreground/35",
          tone === "error" && "text-destructive/60",
        )}
        aria-hidden
      />
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-foreground/55">
        {description}
      </p>
    </div>
  );
}

function RankingSkeleton() {
  return (
    <div role="status" aria-label="Carregando ranking" className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden
          className="h-16 animate-pulse rounded-xl bg-foreground/[0.06] motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
