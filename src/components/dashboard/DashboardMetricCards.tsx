import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BadgeDollarSign,
  CalendarCheck,
  Handshake,
  Home,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { cn } from "@/lib/utils";

type Accent = "teal" | "emerald" | "amber" | "sky" | "violet";

const accentRing: Record<Accent, string> = {
  teal: "bg-teal-500/12 text-teal-700",
  emerald: "bg-emerald-500/12 text-emerald-700",
  amber: "bg-amber-500/14 text-amber-700",
  sky: "bg-sky-500/12 text-sky-700",
  violet: "bg-violet-500/12 text-violet-700",
};

const accentBar: Record<Accent, string> = {
  teal: "bg-teal-500/70",
  emerald: "bg-emerald-500/70",
  amber: "bg-amber-500/70",
  sky: "bg-sky-500/70",
  violet: "bg-violet-500/70",
};

type CardDef = {
  id: string;
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  accent: Accent;
  to: string;
  search?: Record<string, string>;
};

export function DashboardMetricCards() {
  const metrics = useDashboardMetrics();

  const delta = metrics.atendimentosMes - metrics.atendimentosMesAnterior;
  const hasBaseline = metrics.atendimentosMesAnterior > 0 || metrics.atendimentosMes > 0;

  const cards: CardDef[] = [
    {
      id: "atendimentos",
      label: "Atendimentos do mês",
      value: metrics.atendimentosMes,
      detail: hasBaseline
        ? `${delta >= 0 ? "+" : ""}${delta} vs. mês anterior`
        : "nenhum registro ainda",
      icon: TrendingUp,
      accent: "teal",
      to: "/atendimentos",
    },
    {
      id: "clientes",
      label: "Novos clientes",
      value: metrics.novosClientes,
      detail: "etapa fechamento no mês",
      icon: Handshake,
      accent: "emerald",
      to: "/atendimentos",
    },
    {
      id: "aluguel",
      label: "Buscando aluguel",
      value: metrics.buscandoAluguel,
      detail: "atendimentos ativos",
      icon: Home,
      accent: "amber",
      to: "/atendimentos",
      search: { track: "aluguel" },
    },
    {
      id: "compra",
      label: "Buscando compra",
      value: metrics.buscandoCompra,
      detail: "atendimentos ativos",
      icon: BadgeDollarSign,
      accent: "violet",
      to: "/atendimentos",
      search: { track: "venda" },
    },
    {
      id: "visitas",
      label: "Visitas agendadas",
      value: metrics.visitasAgendadas,
      detail: "de hoje em diante",
      icon: CalendarCheck,
      accent: "sky",
      to: "/agenda",
    },
  ];

  return (
    <section className="mb-5" aria-label="Indicadores do painel" aria-busy={metrics.isLoading}>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.id}
              to={card.to}
              search={card.search as never}
              className="group relative flex min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-white/70 bg-white/[0.68] px-3.5 py-3.5 shadow-[0_16px_36px_-30px_rgba(23,27,33,0.5)] backdrop-blur-lg transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.82] hover:shadow-[0_20px_38px_-26px_rgba(23,27,33,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 top-0 h-[3px] opacity-70 transition-opacity group-hover:opacity-100",
                  accentBar[card.accent],
                )}
              />
              <div className="flex items-start justify-between gap-2">
                <span className="max-w-[9.5rem] text-[10.5px] font-extrabold uppercase leading-[1.35] tracking-[0.11em] text-foreground/55">
                  {card.label}
                </span>
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full",
                    accentRing[card.accent],
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
              </div>

              <div className="mt-4 min-h-8">
                {metrics.isLoading ? (
                  <>
                    <span
                      className="block h-7 w-16 animate-pulse rounded-lg bg-foreground/10 motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    <span className="sr-only">Carregando indicador</span>
                  </>
                ) : metrics.isError ? (
                  <span
                    className="text-2xl font-black text-foreground/40"
                    aria-label="Indicador indisponível"
                  >
                    —
                  </span>
                ) : (
                  <span className="text-[clamp(1.6rem,3vw,2rem)] font-black leading-none tracking-[-0.03em] text-foreground tabular-nums">
                    {String(card.value).padStart(2, "0")}
                  </span>
                )}
              </div>

              <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold leading-4 text-foreground/50">
                <span className="truncate">
                  {metrics.isError ? "indisponível no momento" : card.detail}
                </span>
                <ArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
