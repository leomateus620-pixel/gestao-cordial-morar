import {
  ArrowUpRight,
  BadgeDollarSign,
  ClipboardCheck,
  Handshake,
  Percent,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CorretoresSummary, CorretorSourceStatus } from "@/types/corretor";

export type CorretoresKpiTarget =
  | "corretores"
  | "atendimentos"
  | "contratos"
  | "conversao"
  | "comissoes"
  | "agenciamentos";

type CorretoresSummaryCardsProps = {
  summary: CorretoresSummary;
  sourceStatus: CorretorSourceStatus;
  isLoading: boolean;
  isError: boolean;
  onNavigate: (target: CorretoresKpiTarget) => void;
};

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "primary" | "base" | "success" | "money";
  target: CorretoresKpiTarget;
  unavailable: boolean;
};

export function CorretoresSummaryCards({
  summary,
  sourceStatus,
  isLoading,
  isError,
  onNavigate,
}: CorretoresSummaryCardsProps) {
  const attendanceUnavailable = isError || sourceStatus.atendimentos === "error";
  const contractsUnavailable =
    isError || sourceStatus.vendas === "error" || sourceStatus.alugueis === "error";
  const commissionUnavailable =
    isError || sourceStatus.vendas === "error" || !summary.comissaoPrevistaDisponivel;
  const listingsUnavailable = isError || sourceStatus.agenciamentos === "error";

  const cards: SummaryCard[] = [
    {
      label: "Corretores ativos",
      value: String(summary.ativos),
      detail: `${summary.total} no recorte atual`,
      icon: UserCheck,
      tone: "primary",
      target: "corretores",
      unavailable: isError,
    },
    {
      label: "Atendimentos",
      value: String(summary.atendimentosRecebidos),
      detail: `${summary.atendimentosEmAndamento} em andamento`,
      icon: Users,
      tone: "base",
      target: "atendimentos",
      unavailable: attendanceUnavailable,
    },
    {
      label: "Contratos fechados",
      value: String(summary.contratosFechados),
      detail: `${summary.vendasFechadas} vendas · ${summary.alugueisFechados} aluguéis`,
      icon: Handshake,
      tone: "success",
      target: "contratos",
      unavailable: contractsUnavailable,
    },
    {
      label: "Conversão média",
      value: `${summary.taxaMediaConversao}%`,
      detail: `${summary.visitasRealizadas} visitas realizadas`,
      icon: Percent,
      tone: "base",
      target: "conversao",
      unavailable: attendanceUnavailable,
    },
    {
      label: "Comissão prevista",
      value: brl(summary.comissaoPrevista, { compact: true }),
      detail:
        summary.comissaoPaga == null
          ? "Comissão paga indisponível"
          : `${brl(summary.comissaoPaga, { compact: true })} pagos`,
      icon: BadgeDollarSign,
      tone: "money",
      target: "comissoes",
      unavailable: commissionUnavailable,
    },
    {
      label: "Agenciamentos",
      value: String(summary.agenciamentosFeitos),
      detail: `${summary.agenciamentosChecklistPercent}% do checklist concluído`,
      icon: ClipboardCheck,
      tone: "base",
      target: "agenciamentos",
      unavailable: listingsUnavailable,
    },
  ];

  return (
    <section
      aria-label="Indicadores operacionais dos corretores"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {cards.map((card) => (
        <SummaryCardButton
          key={card.label}
          card={card}
          isLoading={isLoading}
          onNavigate={onNavigate}
        />
      ))}
    </section>
  );
}

function SummaryCardButton({
  card,
  isLoading,
  onNavigate,
}: {
  card: SummaryCard;
  isLoading: boolean;
  onNavigate: (target: CorretoresKpiTarget) => void;
}) {
  const Icon = card.icon;
  const disabled = isLoading || card.unavailable;
  const value = card.unavailable ? "—" : card.value;
  const detail = card.unavailable ? "Fonte temporariamente indisponível" : card.detail;

  return (
    <button
      type="button"
      onClick={() => onNavigate(card.target)}
      disabled={disabled}
      aria-label={`${card.label}: ${isLoading ? "carregando" : `${value}. ${detail}`}`}
      className={cn(
        "group min-w-0 rounded-2xl border border-border/55 bg-card/88 p-4 text-left shadow-[0_14px_34px_-26px_rgba(23,27,33,0.38)] transition-[border-color,background-color,box-shadow,transform] duration-200",
        "enabled:hover:-translate-y-0.5 enabled:hover:border-primary/25 enabled:hover:bg-card enabled:hover:shadow-[0_18px_38px_-26px_rgba(30,100,125,0.4)]",
        "enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-primary enabled:focus-visible:ring-offset-2",
        "enabled:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70",
        card.tone === "primary" && "border-primary/15 bg-primary/[0.055]",
        card.tone === "success" && "border-emerald-700/10 bg-emerald-600/[0.045]",
        card.tone === "money" && "border-orange-700/10 bg-orange-500/[0.055]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/55">
            {card.label}
          </p>
          {isLoading ? (
            <span
              aria-hidden
              className="mt-3 block h-7 w-24 animate-pulse rounded-lg bg-foreground/10 motion-reduce:animate-none"
            />
          ) : (
            <p className="mt-2 truncate font-mono text-2xl font-bold leading-none tracking-tight text-foreground sm:text-[1.7rem]">
              {value}
            </p>
          )}
        </div>

        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl bg-background/75 text-primary ring-1 ring-foreground/5",
            card.tone === "money" && "text-orange-700",
            card.tone === "success" && "text-emerald-700",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        {isLoading ? (
          <span
            aria-hidden
            className="block h-3 w-36 max-w-full animate-pulse rounded bg-foreground/10 motion-reduce:animate-none"
          />
        ) : (
          <p className="min-w-0 truncate text-xs font-medium text-foreground/58">{detail}</p>
        )}
        {!disabled && (
          <ArrowUpRight
            className="size-4 shrink-0 text-foreground/35 transition-colors group-hover:text-primary"
            aria-hidden
          />
        )}
      </div>
    </button>
  );
}
