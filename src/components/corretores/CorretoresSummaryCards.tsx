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
      className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"
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
  const detail = card.unavailable ? "Fonte indisponível" : card.detail;

  return (
    <button
      type="button"
      onClick={() => onNavigate(card.target)}
      disabled={disabled}
      aria-label={`${card.label}: ${isLoading ? "carregando" : `${value}. ${detail}`}`}
      className={cn(
        "group min-w-0 rounded-xl border border-border/50 bg-card/85 px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-200",
        "enabled:hover:-translate-y-0.5 enabled:hover:border-primary/25 enabled:hover:bg-card",
        "enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-primary enabled:focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-70",
        card.tone === "primary" && "border-primary/15 bg-primary/[0.05]",
        card.tone === "success" && "border-emerald-700/10 bg-emerald-600/[0.04]",
        card.tone === "money" && "border-orange-700/10 bg-orange-500/[0.05]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          className={cn(
            "size-3.5 shrink-0 text-primary",
            card.tone === "money" && "text-orange-700",
            card.tone === "success" && "text-emerald-700",
          )}
          aria-hidden
        />
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/55">
          {card.label}
        </p>
      </div>

      {isLoading ? (
        <span
          aria-hidden
          className="mt-2 block h-5 w-16 animate-pulse rounded bg-foreground/10 motion-reduce:animate-none"
        />
      ) : (
        <p className="mt-1.5 truncate font-mono text-xl font-bold leading-none tracking-tight text-foreground">
          {value}
        </p>
      )}

      <p className="mt-1.5 min-w-0 truncate text-[11px] font-medium text-foreground/55">
        {isLoading ? "\u00a0" : detail}
      </p>
    </button>
  );
}

