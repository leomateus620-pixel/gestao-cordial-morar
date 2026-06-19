import {
  BadgeDollarSign,
  ClipboardCheck,
  Handshake,
  Percent,
  UserCheck,
  Users,
} from "lucide-react";
import type { CorretoresSummary } from "@/types/corretor";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";

type CorretoresSummaryCardsProps = {
  summary: CorretoresSummary;
};

export function CorretoresSummaryCards({ summary }: CorretoresSummaryCardsProps) {
  const cards = [
    {
      label: "Corretores ativos",
      value: String(summary.ativos).padStart(2, "0"),
      detail: `${summary.total} no período`,
      icon: UserCheck,
      tone: "primary",
    },
    {
      label: "Atendimentos",
      value: String(summary.atendimentosRecebidos).padStart(2, "0"),
      detail: `${summary.atendimentosEmAndamento} em andamento`,
      icon: Users,
      tone: "base",
    },
    {
      label: "Contratos fechados",
      value: String(summary.contratosFechados).padStart(2, "0"),
      detail: `${summary.vendasFechadas} vendas · ${summary.alugueisFechados} aluguéis`,
      icon: Handshake,
      tone: "success",
    },
    {
      label: "Conversão média",
      value: `${summary.taxaMediaConversao}%`,
      detail: `${summary.visitasRealizadas} visitas realizadas`,
      icon: Percent,
      tone: "base",
    },
    {
      label: "Comissão prevista",
      value: brl(summary.comissaoPrevista, { compact: true }),
      detail: `${brl(summary.comissaoPaga, { compact: true })} pagos`,
      icon: BadgeDollarSign,
      tone: "money",
    },
    {
      label: "Agenciamentos",
      value: String(summary.agenciamentosFeitos).padStart(2, "0"),
      detail: `${summary.agenciamentosChecklistPercent}% checklist`,
      icon: ClipboardCheck,
      tone: "base",
    },
  ] as const;

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            key={card.label}
            className={cn(
              "group min-w-0 overflow-hidden rounded-2xl border border-white/60 bg-white/[0.62] p-3 shadow-[0_14px_36px_-22px_rgba(23,27,33,0.24)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 sm:p-4",
              card.tone === "primary" && "bg-primary/[0.075]",
              card.tone === "success" && "bg-emerald-500/[0.075]",
              card.tone === "money" && "bg-[rgba(217,120,45,0.09)]",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/45">
                {card.label}
              </p>
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-xl bg-white/65 text-primary ring-1 ring-foreground/5",
                  card.tone === "money" && "text-[var(--system-accent-dark)]",
                  card.tone === "success" && "text-emerald-700",
                )}
              >
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-2 truncate font-mono text-2xl font-bold leading-none tracking-tight text-foreground sm:text-3xl">
              {card.value}
            </p>
            <p className="mt-2 truncate text-[11px] font-medium text-foreground/52">
              {card.detail}
            </p>
          </article>
        );
      })}
    </section>
  );
}
