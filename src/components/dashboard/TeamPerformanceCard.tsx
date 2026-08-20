import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Award,
  ClipboardCheck,
  Gift,
  Handshake,
  Loader2,
  Percent,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  calculateCorretoresSummary,
  filterCorretoresByAgency,
  rankCorretores,
  type AgencyFilter,
} from "@/services/corretores";
import type { EquipePeriodo, EquipePerformanceResult } from "@/lib/equipe/equipe.functions";
import type { CorretorSortKey } from "@/types/corretor";
import { cn } from "@/lib/utils";

type Props = {
  data: EquipePerformanceResult;
  periodo: EquipePeriodo;
  onPeriodoChange: (next: EquipePeriodo) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  className?: string;
};

const PERIODOS: Array<{ value: EquipePeriodo; label: string }> = [
  { value: "mes", label: "Mês" },
  { value: "ultimos_30", label: "30d" },
  { value: "trimestre", label: "Trim." },
  { value: "ano", label: "Ano" },
];

const AGENCIES: Array<{ value: AgencyFilter; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "cordial", label: "Cordial" },
  { value: "morar", label: "Morar" },
];

const ORDENACOES: Array<{ value: CorretorSortKey; label: string }> = [
  { value: "bonificacoes", label: "Bonificações" },
  { value: "contratos", label: "Contratos" },
  { value: "atendimentos", label: "Atendimentos" },
  { value: "conversao", label: "Conversão" },
];

function Chips<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex min-w-0 flex-wrap items-center gap-0.5 rounded-full bg-foreground/[0.045] p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-colors",
              active
                ? "bg-white text-primary shadow-[0_6px_16px_-12px_rgba(23,27,33,0.5)]"
                : "text-foreground/55 hover:text-foreground/80",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  helper,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl px-3 py-2.5 ring-1",
        accent
          ? "bg-[rgba(217,120,45,0.10)] ring-[rgba(217,120,45,0.22)]"
          : "bg-white/[0.55] ring-white/60",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            accent ? "text-[var(--system-accent-dark)]" : "text-primary/65",
          )}
          aria-hidden
        />
        <span className="text-[9.5px] font-semibold uppercase leading-tight tracking-[0.1em] text-foreground/50">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "mt-1.5 truncate text-[1.45rem] font-extrabold leading-none tracking-[-0.035em] tabular-nums",
          accent ? "text-[var(--system-accent-dark)]" : "text-foreground",
        )}
      >
        {value}
      </p>
      {helper && (
        <p className="mt-1 truncate text-[10.5px] font-medium text-foreground/45">{helper}</p>
      )}
    </div>
  );
}

export function TeamPerformanceCard({
  data,
  periodo,
  onPeriodoChange,
  isLoading = false,
  isFetching = false,
  isError = false,
  className,
}: Props) {
  const [agency, setAgency] = useState<AgencyFilter>("todas");
  const [ordenacao, setOrdenacao] = useState<CorretorSortKey>("bonificacoes");

  const scoped = useMemo(
    () =>
      filterCorretoresByAgency(data.rows, agency).filter((corretor) => corretor.status === "ativo"),
    [data.rows, agency],
  );
  const summary = useMemo(() => calculateCorretoresSummary(scoped), [scoped]);
  const ranking = useMemo(() => rankCorretores(scoped, ordenacao), [scoped, ordenacao]);
  const top = useMemo(
    () => ranking.filter((corretor) => corretor.rankingPosicao != null).slice(0, 5),
    [ranking],
  );

  const metricValue = (corretor: (typeof top)[number]) => {
    if (ordenacao === "bonificacoes") return corretor.bonificacoesTotal;
    if (ordenacao === "contratos") return corretor.contratosFechados;
    if (ordenacao === "atendimentos") return corretor.atendimentosRecebidos;
    return corretor.taxaConversao;
  };
  const metricLabel = (corretor: (typeof top)[number]) =>
    ordenacao === "conversao" ? `${corretor.taxaConversao}%` : String(metricValue(corretor));
  const maxValue = Math.max(1, ...top.map(metricValue));
  const bonusUnavailable = data.sourceStatus.bonificacoes === "error";

  return (
    <section
      className={cn("rounded-3xl p-5", className)}
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.56) 100%)",
        backdropFilter: "blur(20px) saturate(145%)",
        border: "1px solid rgba(255,255,255,0.64)",
        boxShadow: "0 18px 48px -16px rgba(23,27,33,0.14), inset 0 1px 0 rgba(255,255,255,0.86)",
      }}
      aria-busy={isLoading || isFetching}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/70">
            Performance da equipe
          </p>
          <h2 className="mt-0.5 flex items-center gap-2 text-base font-semibold tracking-tight">
            Corretores no período
            {isFetching && !isLoading && (
              <Loader2 className="size-3.5 animate-spin text-primary/60" aria-hidden />
            )}
          </h2>
        </div>
        <Link
          to="/corretores"
          className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-[11px] font-bold text-white shadow-[0_12px_26px_-16px_rgba(30,100,125,0.8)] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Ver corretores
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Chips value={periodo} options={PERIODOS} onChange={onPeriodoChange} ariaLabel="Período" />
        <Chips value={agency} options={AGENCIES} onChange={setAgency} ariaLabel="Imobiliária" />
      </div>

      {isError ? (
        <p className="rounded-2xl bg-destructive/8 px-3 py-4 text-[12px] font-medium text-destructive">
          Não foi possível carregar a performance da equipe agora.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Metric
              icon={Gift}
              label="Bonificações"
              value={bonusUnavailable ? "—" : String(summary.bonificacoesTotal).padStart(2, "0")}
              helper={
                bonusUnavailable
                  ? "indisponível"
                  : `${summary.bonificacoesPagas} pagas · ${summary.bonificacoesPendentes} pendentes`
              }
              accent
            />
            <Metric
              icon={Handshake}
              label="Contratos"
              value={String(summary.contratosFechados).padStart(2, "0")}
              helper={`${summary.vendasFechadas} venda(s) · ${summary.alugueisFechados} aluguel(is)`}
            />
            <Metric
              icon={Percent}
              label="Conversão"
              value={`${summary.taxaMediaConversao}%`}
              helper={`${summary.atendimentosRecebidos} atendimentos`}
            />
            <Metric
              icon={ClipboardCheck}
              label="Agenc."
              value={String(summary.agenciamentosFeitos).padStart(2, "0")}
              helper={`${summary.agenciamentosChecklistPercent}% de checklist`}
            />
          </div>

          <div className="mt-4 flex flex-col items-start gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
              <Award className="size-3.5 text-[var(--system-accent-dark)]" aria-hidden />
              Ranking
            </span>
            <Chips
              value={ordenacao}
              options={ORDENACOES}
              onChange={setOrdenacao}
              ariaLabel="Ordenar ranking por"
            />
          </div>

          <div className="mt-2 space-y-1.5">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[3.1rem] animate-pulse rounded-2xl bg-foreground/[0.06] motion-reduce:animate-none"
                />
              ))
            ) : top.length === 0 ? (
              <p className="flex items-center gap-2 rounded-2xl bg-white/[0.5] px-3 py-4 text-[12px] font-medium text-foreground/55 ring-1 ring-white/60">
                <Users className="size-4 text-primary/50" aria-hidden />
                Sem resultados atribuídos no período selecionado.
              </p>
            ) : (
              top.map((corretor, index) => (
                <Link
                  key={corretor.id}
                  to="/corretores"
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-white/[0.5] px-3 py-2.5 ring-1 ring-white/55 transition-colors hover:bg-white/[0.78]"
                >
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-full font-mono text-[11px] font-black tabular-nums",
                      index === 0
                        ? "bg-[rgba(217,120,45,0.16)] text-[var(--system-accent-dark)]"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold tracking-tight">
                      {corretor.nome}
                    </span>
                    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-foreground/[0.07]">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          index === 0 ? "bg-[var(--system-accent-dark)]" : "bg-primary/60",
                        )}
                        style={{
                          width: `${Math.max(6, Math.round((metricValue(corretor) / maxValue) * 100))}%`,
                        }}
                      />
                    </span>
                    <span className="mt-1 block truncate text-[10.5px] font-medium text-foreground/48">
                      {corretor.bonificacoesTotal} bonificaç
                      {corretor.bonificacoesTotal === 1 ? "ão" : "ões"} ·{" "}
                      {corretor.contratosFechados} contratos · {corretor.taxaConversao}% conversão
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[13px] font-black tabular-nums text-primary">
                    <TrendingUp className="size-3.5 text-primary/45" aria-hidden />
                    {metricLabel(corretor)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
