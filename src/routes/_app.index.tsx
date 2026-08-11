import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import type { AgenciamentoCorretorRanking, AgenciamentoSummary } from "@/types/agenciamento";
import type { Corretor, CorretoresSummary } from "@/types/corretor";
import { useState } from "react";

import { AgenciamentosQuickStrip } from "@/components/agenciamentos/AgenciamentosQuickStrip";
import { AttendanceEvolutionCard } from "@/components/dashboard/AttendanceEvolutionCard";
import { DashboardMetricCards } from "@/components/dashboard/DashboardMetricCards";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";

import { LeadOriginCard } from "@/components/dashboard/LeadOriginCard";
import { TeamPerformanceChart } from "@/components/dashboard/TeamPerformanceChart";
import { useEquipePerformance } from "@/hooks/useEquipePerformance";
import { RealEstateSitePreviewSection } from "@/components/real-estate-site-preview-section";
import { useApp } from "@/store/app-store";
import { brl } from "@/lib/format";
import {
  dashboardAluguelVenda,
  dashboardComparativoCordialMorar,
  dashboardPrevisaoFinanceira,
} from "@/lib/mock/data";
import { NovoAtendimentoSheet } from "@/components/sheets/novo-atendimento";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-mock";
import { useAgenciamentos } from "@/hooks/useAgenciamentos";
import { useCorretores } from "@/hooks/useCorretores";
import {
  axisTick,
  chartCordial,
  chartDanger,
  chartMorar,
  chartSystem,
  gridStroke,
  tooltipStyle,
} from "@/lib/chart-palette";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  BadgeCheck,
  BadgeDollarSign,
  Building2,
  ClipboardCheck,
  FileText,
  Handshake,
  HardDrive,
  HousePlus,
  Instagram,
  MapPinned,
  Percent,
  Sparkles,
  TrendingUp,
  type LucideIcon,
  Users,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard — Gestão Cordial" }] }),
  component: Dashboard,
});

const contextColors: Record<string, string> = {
  Cordial: chartCordial,
  Morar: chartMorar,
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Tipos                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

type MetricTone = "default" | "primary" | "success" | "danger";
type MetricAccent = "up" | "down" | "neutral";

type MetricCardData = {
  label: string;
  value: string;
  detail?: string;
  tone?: MetricTone;
  accent?: MetricAccent;
  icon?: ReactNode;
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Componente principal                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

function Dashboard() {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const isAdminOwner = session?.perfil === "admin_owner";
  const { agency, rawAtendimentos, rawImoveis, rawLancamentos } = useApp(
    useShallow((s) => ({
      agency: s.agency,
      rawAtendimentos: s.atendimentos,
      rawImoveis: s.imoveis,
      rawLancamentos: s.lancamentos,
    })),
  );
  const { dashboardSummary: equipeSummary, dashboardRanking: equipeRanking } = useCorretores({
    skipDashboard: !isAdminOwner,
  });
  const { dashboardSummary: agenciamentosSummary, dashboardRanking: agenciamentosRanking } =
    useAgenciamentos({ skipDashboard: !isAdminOwner });
  const equipePerformance = useEquipePerformance({ enabled: isAdminOwner });
  const metrics = useDashboardMetrics();
  const filterByAgency = <T extends { imobiliaria: "cordial" | "morar" | "ambas" }>(items: T[]) =>
    agency === "todas"
      ? items
      : items.filter((item) => item.imobiliaria === agency || item.imobiliaria === "ambas");
  const atendimentos = filterByAgency(rawAtendimentos);
  const imoveis = filterByAgency(rawImoveis);
  const lancamentos = filterByAgency(rawLancamentos);

  const imoveisNegociacao =
    imoveis.filter((i) => i.status === "Reservado").length +
    atendimentos.filter((a) => a.status === "proposta_enviada").length;
  const visitasAgendadas = metrics.visitasAgendadas;
  const cobrancasAbertas = lancamentos
    .filter((l) => l.status === "Pendente")
    .reduce((sum, l) => sum + l.valor, 0);
  const inadimplencia = lancamentos
    .filter((l) => l.status === "Atrasado")
    .reduce((sum, l) => sum + l.valor, 0);
  const atendPendentes = metrics.buscandoCompra + metrics.buscandoAluguel;



  return (
    <>
      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <section
        className="mb-5 w-full min-w-0 overflow-hidden rounded-3xl p-4 text-white sm:p-5 lg:p-7"
        style={{
          background: "linear-gradient(135deg, #174d61 0%, #1e647d 45%, #2a3038 100%)",
          boxShadow: "0 24px 60px -20px rgba(23,27,33,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ color: "#f0a86d" }}
            >
              Painel Gestão Cordial
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
              Olá, {session?.nome ?? "bem-vindo"} 👋
            </h1>
            <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-white/65 sm:text-[13px]">
              Acompanhe atendimentos, imóveis, vendas, aluguéis e performance das duas imobiliárias
              em um só lugar.
            </p>
          </div>
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto lg:gap-3">
            <HeroStat label="Visitas hoje" value={String(visitasAgendadas).padStart(2, "0")} />
            <HeroStat label="Atend. ativos" value={String(atendPendentes).padStart(2, "0")} />
            <HeroStat
              label="Atend. do mês"
              value={String(metrics.atendimentosMes).padStart(2, "0")}
            />
            {isAdminOwner && (
              <HeroStat
                label="Previsão entrada"
                value={brl(dashboardPrevisaoFinanceira[0]?.receita ?? 0, { compact: true })}
                accent
              />
            )}
          </div>
        </div>
      </section>

      {/* ── Métricas do painel — dados reais de Atendimentos e Agenda ───── */}
      <DashboardMetricCards />


      {/* ── Agenciamentos — resumo compacto ─────────────────────────────── */}
      {isAdminOwner && <AgenciamentosQuickStrip summary={agenciamentosSummary} />}

      {/* ── Resumo financeiro + Comparativo ─────────────────────────────── */}
      {isAdminOwner && (
        <section className="mb-5 grid min-w-0 gap-4 lg:grid-cols-3">
          <FinancialSummaryCard
            receita={dashboardPrevisaoFinanceira[0]?.receita ?? 0}
            cobrancas={cobrancasAbertas}
            inadimplencia={inadimplencia}
            contratos={imoveisNegociacao}
          />
          <ComparativoCard />
        </section>
      )}

      {isAdminOwner && (
        <section className="mb-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,0.86fr)_minmax(0,1.05fr)]">
          <TeamPerformanceCard summary={equipeSummary} ranking={equipeRanking.slice(0, 3)} />
          <AgenciamentosTeamCard summary={agenciamentosSummary} ranking={agenciamentosRanking} />

          <TeamPerformanceChart
            data={equipePerformance.data}
            periodo={equipePerformance.periodo}
            onPeriodoChange={equipePerformance.setPeriodo}
            isLoading={equipePerformance.isLoading}
            isFetching={equipePerformance.isFetching}
            isError={equipePerformance.isError}
          />
        </section>
      )}

      {!isAdminOwner && <OperationalShortcuts profile={session?.perfil} />}

      {/* ── Gráficos (admin) ────────────────────────────────────────────── */}
      {isAdminOwner && (
        <section className="mb-5 grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <AttendanceEvolutionCard />

          <LeadOriginCard />

          <ChartCard title="Aluguel x venda" subtitle="Negócios por mês">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dashboardAluguelVenda}
                barCategoryGap={10}
                margin={{ left: -20, right: 8, top: 8 }}
              >
                <defs>
                  <linearGradient id="gradVenda" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartCordial} stopOpacity={1} />
                    <stop offset="100%" stopColor={chartCordial} stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="gradAluguel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartMorar} stopOpacity={1} />
                    <stop offset="100%" stopColor={chartMorar} stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis hide />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="venda"
                  fill="url(#gradVenda)"
                  radius={[6, 6, 0, 0]}
                  name="Venda"
                  animationDuration={900}
                />
                <Bar
                  dataKey="aluguel"
                  fill="url(#gradAluguel)"
                  radius={[6, 6, 0, 0]}
                  name="Aluguel"
                  animationDuration={1100}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Previsão financeira mensal"
            subtitle="Receita, comissão e em aberto"
            className="xl:col-span-2"
            heightClassName="h-60 lg:h-72"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboardPrevisaoFinanceira} margin={{ left: -14, right: 12, top: 8 }}>
                <defs>
                  <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartCordial} stopOpacity={0.38} />
                    <stop offset="100%" stopColor={chartCordial} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradAberto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartDanger} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={chartDanger} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  width={44}
                  tickFormatter={(v) => brl(Number(v), { compact: true })}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => brl(Number(v), { compact: true })}
                  cursor={{ stroke: "rgba(30,100,125,0.12)", strokeWidth: 1 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="receita"
                  stroke={chartCordial}
                  strokeWidth={2.4}
                  fill="url(#gradReceita)"
                  name="Receita"
                  animationDuration={900}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="aberto"
                  stroke={chartDanger}
                  strokeWidth={2}
                  fill="url(#gradAberto)"
                  name="Em aberto"
                  animationDuration={1200}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="comissao"
                  stroke={chartSystem}
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="5 3"
                  name="Comissão"
                  animationDuration={1100}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>
      )}

      {isAdminOwner && <RealEstateSitePreviewSection />}

      
      <NovoAtendimentoSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  OperationalShortcuts — dashboard limitado (corretor / secretaria)         */
/* ─────────────────────────────────────────────────────────────────────────── */

function OperationalShortcuts({ profile }: { profile: string | undefined }) {
  const shortcuts =
    profile === "secretaria"
      ? [
          { to: "/atendimentos", label: "Atendimentos", desc: "Fila e novos leads", icon: Handshake },
          { to: "/clientes", label: "Clientes", desc: "Cadastro e histórico", icon: Users },
          { to: "/marketing", label: "Marketing", desc: "Campanhas em andamento", icon: TrendingUp },
        ]
      : [
          { to: "/atendimentos", label: "Atendimentos", desc: "Sua carteira comercial", icon: Handshake },
          { to: "/clientes", label: "Clientes", desc: "Cadastros e contatos", icon: Users },
          { to: "/agenciamentos", label: "Agenciamentos", desc: "Captações e checklist", icon: ClipboardCheck },
        ];

  return (
    <section className="mb-5 grid gap-3 sm:grid-cols-3">
      {shortcuts.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to as never}
            className="glass-panel group flex items-center gap-3 rounded-3xl p-4 transition hover:-translate-y-0.5 hover:bg-white/70"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {item.label}
              </span>
              <span className="block truncate text-[11px] text-foreground/55">{item.desc}</span>
            </span>
            <ArrowRight className="size-4 text-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        );
      })}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────────────────────── */
/*  FinancialSummaryCard — compacto e premium                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function TeamPerformanceCard({
  summary,
  ranking,
}: {
  summary: CorretoresSummary;
  ranking: Corretor[];
}) {
  return (
    <section
      className="rounded-3xl p-5"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.56) 100%)",
        backdropFilter: "blur(20px) saturate(145%)",
        border: "1px solid rgba(255,255,255,0.64)",
        boxShadow: "0 18px 48px -16px rgba(23,27,33,0.14), inset 0 1px 0 rgba(255,255,255,0.86)",
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/70">
            Performance da equipe
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight">Corretores no período</h2>
        </div>
        <Link
          to="/corretores"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-bold text-white shadow-[0_12px_26px_-16px_rgba(30,100,125,0.8)] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Ver corretores
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <TeamMetric
          icon={Handshake}
          label="Contratos"
          value={String(summary.contratosFechados).padStart(2, "0")}
        />
        <TeamMetric
          icon={BadgeDollarSign}
          label="Prevista"
          value={brl(summary.comissaoPrevista, { compact: true })}
          accent
        />
        <TeamMetric icon={Percent} label="Conversão" value={`${summary.taxaMediaConversao}%`} />
        <TeamMetric
          icon={ClipboardCheck}
          label="Agenc."
          value={String(summary.agenciamentosFeitos).padStart(2, "0")}
        />
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/45">
          <Award className="size-3.5 text-[var(--system-accent-dark)]" />
          Top 3 corretores
        </div>
        {ranking.map((corretor, index) => (
          <Link
            key={corretor.id}
            to="/corretores"
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-white/[0.56] px-3 py-2.5 ring-1 ring-white/60 transition-all hover:bg-white/[0.76]"
          >
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full font-mono text-[11px] font-black",
                index === 0
                  ? "bg-[rgba(217,120,45,0.14)] text-[var(--system-accent-dark)]"
                  : "bg-primary/10 text-primary",
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{corretor.nome}</span>
              <span className="block truncate text-[10px] text-foreground/48">
                {corretor.contratosFechados} contratos · {corretor.taxaConversao}% conversão
              </span>
            </span>
            <span className="font-mono text-xs font-black text-primary">
              {brl(corretor.comissaoPrevista, { compact: true })}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function AgenciamentosTeamCard({
  summary,
  ranking,
}: {
  summary: AgenciamentoSummary;
  ranking: AgenciamentoCorretorRanking[];
}) {
  return (
    <section
      className="rounded-3xl p-5"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.56) 100%)",
        backdropFilter: "blur(20px) saturate(145%)",
        border: "1px solid rgba(255,255,255,0.64)",
        boxShadow: "0 18px 48px -16px rgba(23,27,33,0.14), inset 0 1px 0 rgba(255,255,255,0.86)",
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/70">
            Agenciamentos da equipe
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight">Captacoes do mes</h2>
        </div>
        <Link
          to="/agenciamentos"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-bold text-white shadow-[0_12px_26px_-16px_rgba(30,100,125,0.8)] transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
        >
          Ver agenciamentos
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <TeamMetric icon={HousePlus} label="No mes" value={String(summary.mes).padStart(2, "0")} />
        <TeamMetric
          icon={ClipboardCheck}
          label="Pendentes"
          value={String(summary.pendentesValidacao).padStart(2, "0")}
          accent
        />
        <TeamMetric
          icon={MapPinned}
          label="Placas"
          value={String(summary.placasInstaladas).padStart(2, "0")}
        />
        <TeamMetric
          icon={HardDrive}
          label="Drive"
          value={String(summary.fotosDrive).padStart(2, "0")}
        />
        <TeamMetric
          icon={BadgeCheck}
          label="Validados"
          value={String(summary.validados).padStart(2, "0")}
        />
        <TeamMetric
          icon={Percent}
          label="Checklist"
          value={`${summary.percentualChecklistMedio}%`}
        />
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/45">
          <Award className="size-3.5 text-[var(--system-accent-dark)]" />
          Top 3 agenciamentos
        </div>
        {ranking.map((item, index) => (
          <Link
            key={item.corretorId}
            to="/agenciamentos"
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-white/[0.56] px-3 py-2.5 ring-1 ring-white/60 transition-all hover:bg-white/[0.76]"
          >
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full font-mono text-[11px] font-black",
                index === 0
                  ? "bg-[rgba(217,120,45,0.14)] text-[var(--system-accent-dark)]"
                  : "bg-primary/10 text-primary",
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{item.corretorNome}</span>
              <span className="block truncate text-[10px] text-foreground/48">
                {item.total} captacoes - {item.comPlaca} placa - {item.noSite} site
              </span>
            </span>
            <span className="font-mono text-xs font-black text-primary">
              {item.percentualChecklist}%
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TeamMetric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white/[0.56] p-3 ring-1 ring-white/60",
        accent && "bg-[rgba(217,120,45,0.09)]",
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-foreground/45">
        <Icon
          className={cn("size-3.5 text-primary/65", accent && "text-[var(--system-accent-dark)]")}
        />
        {label}
      </div>
      <p
        className={cn(
          "mt-1 truncate font-mono text-lg font-black",
          accent ? "text-[var(--system-accent-dark)]" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FinancialSummaryCard({
  receita,
  cobrancas,
  inadimplencia,
  contratos,
}: {
  receita: number;
  cobrancas: number;
  inadimplencia: number;
  contratos: number;
}) {
  const liquido = Math.max(receita - cobrancas - inadimplencia, 0);

  return (
    <section
      className="rounded-3xl p-5"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.58) 100%)",
        backdropFilter: "blur(22px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.65)",
        boxShadow: "0 20px 50px -16px rgba(23,27,33,0.14), inset 0 1px 0 rgba(255,255,255,0.9)",
      }}
    >
      {/* Cabeçalho */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/70">
            Financeiro
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight">Resumo previsto</h2>
        </div>
        <div
          className="grid size-10 place-items-center rounded-2xl"
          style={{ background: "rgba(30,100,125,0.12)", color: "var(--system-primary)" }}
        >
          <Wallet className="size-5" />
        </div>
      </div>

      {/* Receita em destaque */}
      <div className="mb-3 rounded-2xl p-3" style={{ background: "rgba(30,100,125,0.07)" }}>
        <p className="text-[10px] uppercase tracking-wider text-primary/60">Receita prevista</p>
        <p className="mt-1 font-mono text-2xl font-bold text-primary">
          {brl(receita, { compact: true })}
        </p>
      </div>

      {/* Linhas de resumo */}
      <div className="space-y-2">
        <SummaryRow label="Cobranças em aberto" value={brl(cobrancas, { compact: true })} />
        <SummaryRow
          label="Inadimplência"
          value={brl(inadimplencia, { compact: true })}
          tone="danger"
        />
        <SummaryRow
          label="Potencial líquido"
          value={brl(liquido, { compact: true })}
          tone="success"
        />
      </div>

      {/* Contratos ativos */}
      <div
        className="mt-4 flex items-center justify-between rounded-2xl px-3 py-2.5"
        style={{ background: "rgba(30,100,125,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary/60" />
          <p className="text-[11px] text-primary/70">Contratos ativos</p>
        </div>
        <p className="font-mono text-xl font-bold text-primary">
          {String(contratos).padStart(2, "0")}
        </p>
      </div>
    </section>
  );
}

function SummaryRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/45 px-3 py-2">
      <span className="text-[11px] text-foreground/55">{label}</span>
      <span
        className={cn(
          "font-mono text-sm font-bold",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-emerald-700",
          tone === "default" && "text-foreground/70",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  ComparativoCard — Cordial x Morar                                          */
/* ─────────────────────────────────────────────────────────────────────────── */

function ComparativoCard() {
  const data = dashboardComparativoCordialMorar;
  const cordial = data.find((d) => d.imobiliaria === "Cordial");
  const morar = data.find((d) => d.imobiliaria === "Morar");

  const lead = (key: "atendimentos" | "alugueis" | "vendas") => {
    if (!cordial || !morar) return null;
    const diff = cordial[key] - morar[key];
    if (diff === 0) return null;
    return {
      winner: diff > 0 ? "Cordial" : "Morar",
      delta: Math.abs(diff),
    };
  };

  const atendLead = lead("atendimentos");
  const aluLead = lead("alugueis");
  const vendaLead = lead("vendas");

  return (
    <div
      className="rounded-3xl p-5 lg:col-span-2"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.52) 100%)",
        backdropFilter: "blur(20px) saturate(145%)",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "0 18px 50px -14px rgba(23,27,33,0.12), inset 0 1px 0 rgba(255,255,255,0.85)",
      }}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-foreground/10 bg-white/60 px-2.5 py-1">
            <span className="flex -space-x-1">
              <span
                className="size-2 rounded-full ring-1 ring-white"
                style={{ background: chartCordial }}
              />
              <span
                className="size-2 rounded-full ring-1 ring-white"
                style={{ background: chartMorar }}
              />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/60">
              Cordial × Morar
            </span>
          </div>
          <h2 className="text-base font-semibold tracking-tight">Comparativo das operações</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[10px] font-medium text-foreground/55 sm:self-auto">
          <TrendingUp className="size-3" />
          Atendimentos · conversão · receita
        </span>
      </div>

      {/* Mobile: scroll horizontal com snap; Desktop: grid */}
      <div className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 px-3 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
        {data.map((item) => {
          const color = contextColors[item.imobiliaria] ?? chartSystem;
          const isCordial = item.imobiliaria === "Cordial";
          const other = isCordial ? morar : cordial;
          const receitaDelta = other ? item.receitaPrevista - other.receitaPrevista : 0;
          const origemIcon = item.origemContatos?.toLowerCase().includes("instagram") ? (
            <Instagram className="size-3" />
          ) : (
            <Users className="size-3" />
          );

          return (
            <div
              key={item.imobiliaria}
              className="group relative w-[85%] min-w-[260px] max-w-[320px] flex-none snap-start overflow-hidden rounded-2xl p-4 pl-5 transition-all duration-300 hover:-translate-y-0.5 md:w-auto md:min-w-0 md:max-w-none"
              style={{
                background: isCordial
                  ? "linear-gradient(135deg, rgba(43,127,163,0.08), rgba(43,127,163,0.04))"
                  : "linear-gradient(135deg, rgba(224,122,46,0.08), rgba(224,122,46,0.04))",
                border: `1px solid ${color}28`,
                boxShadow: `0 6px 20px -10px ${color}33`,
              }}
            >
              {/* Rail vertical com gradient */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-3 left-0 w-[3px] rounded-full"
                style={{
                  background: `linear-gradient(180deg, ${color} 0%, ${color}55 60%, ${color}00 100%)`,
                }}
              />

              {/* Header do card */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }}
                  />
                  <h3 className="text-base font-bold tracking-tight" style={{ color }}>
                    {item.imobiliaria}
                  </h3>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums"
                    style={{ background: `${color}18`, color }}
                  >
                    {item.conversao}% conv.
                  </span>
                  <span className="block h-1 w-16 overflow-hidden rounded-full bg-foreground/5">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, item.conversao)}%`,
                        background: color,
                      }}
                    />
                  </span>
                </div>
              </div>

              {/* Stats — split row, sem caixinhas */}
              <div className="mt-4 grid grid-cols-3 divide-x divide-foreground/10 text-center">
                <StatCell
                  label="Atend."
                  value={item.atendimentos}
                  color={color}
                  lead={atendLead?.winner === item.imobiliaria}
                />
                <StatCell
                  label="Aluguéis"
                  value={item.alugueis}
                  color={color}
                  lead={aluLead?.winner === item.imobiliaria}
                />
                <StatCell
                  label="Vendas"
                  value={item.vendas}
                  color={color}
                  lead={vendaLead?.winner === item.imobiliaria}
                />
              </div>

              {/* Receita */}
              <div
                className="mt-4 rounded-xl p-3"
                style={{
                  background: `linear-gradient(135deg, ${color}14, ${color}06)`,
                  border: `1px solid ${color}1f`,
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-foreground/50">
                    Receita prevista
                  </p>
                  {receitaDelta !== 0 && (
                    <span
                      className="font-mono text-[10px] font-semibold tabular-nums"
                      style={{
                        color: receitaDelta > 0 ? color : "rgb(120,113,108)",
                      }}
                    >
                      {receitaDelta > 0 ? "+" : "−"}
                      {brl(Math.abs(receitaDelta), { compact: true })} vs{" "}
                      {isCordial ? "Morar" : "Cordial"}
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 font-mono text-2xl font-bold tabular-nums leading-none"
                  style={{ color }}
                >
                  {brl(item.receitaPrevista, { compact: true })}
                </p>
                <span
                  className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium text-foreground/60"
                  style={{ border: `1px solid ${color}20` }}
                >
                  {origemIcon}
                  {item.origemContatos}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Resumo comparativo */}
      {(atendLead || aluLead || vendaLead) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-foreground/5 pt-3 text-[11px] text-foreground/55">
          <Sparkles className="size-3 text-foreground/40" />
          {atendLead && (
            <span>
              <span className="font-semibold" style={{ color: contextColors[atendLead.winner] }}>
                {atendLead.winner}
              </span>{" "}
              lidera em atendimentos
              <span className="ml-1 font-mono tabular-nums text-foreground/45">
                (+{atendLead.delta})
              </span>
            </span>
          )}
          {aluLead && (
            <span>
              <span className="font-semibold" style={{ color: contextColors[aluLead.winner] }}>
                {aluLead.winner}
              </span>{" "}
              lidera em aluguéis
              <span className="ml-1 font-mono tabular-nums text-foreground/45">
                (+{aluLead.delta})
              </span>
            </span>
          )}
          {vendaLead && (
            <span>
              <span className="font-semibold" style={{ color: contextColors[vendaLead.winner] }}>
                {vendaLead.winner}
              </span>{" "}
              lidera em vendas
              <span className="ml-1 font-mono tabular-nums text-foreground/45">
                (+{vendaLead.delta})
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  color,
  lead,
}: {
  label: string;
  value: number;
  color: string;
  lead?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 border-foreground/10 px-1 first:border-l-0 first:pl-0 last:pr-0">
      <p className="font-mono text-xl font-bold leading-none tabular-nums" style={{ color }}>
        {value}
      </p>
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-foreground/45">
        {label}
        {lead && (
          <span className="size-1 rounded-full" style={{ background: color }} aria-label="líder" />
        )}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  ChartCard                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

function ChartCard({
  title,
  subtitle,
  children,
  className,
  heightClassName = "h-56 sm:h-60 lg:h-72",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  heightClassName?: string;
}) {
  return (
    <section
      className={cn("w-full min-w-0 overflow-hidden rounded-3xl p-3 sm:p-5", className)}
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.52) 100%)",
        backdropFilter: "blur(18px) saturate(145%)",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "0 12px 36px -12px rgba(23,27,33,0.1), inset 0 1px 0 rgba(255,255,255,0.8)",
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[10px] text-foreground/45">{subtitle}</p>}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-foreground/35">6 MESES</span>
      </div>
      <div className={cn("w-full min-w-0", heightClassName)}>{children}</div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  HeroStat                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl px-3 py-2.5 transition-all hover:scale-[1.02]"
      style={{
        background: accent ? "rgba(240,168,109,0.2)" : "rgba(255,255,255,0.09)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: accent ? "0 4px 16px -8px rgba(240,168,109,0.3)" : "none",
      }}
    >
      <p
        className="text-[9px] font-semibold uppercase tracking-wider"
        style={{ color: accent ? "#f0a86d" : "rgba(255,255,255,0.55)" }}
      >
        {label}
      </p>
      <p className="mt-1 font-mono text-base font-bold text-white">{value}</p>
    </div>
  );
}
