import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { useState } from "react";
import { Fab } from "@/components/fab";
import { RealEstateSitePreviewSection } from "@/components/real-estate-site-preview-section";
import { useApp } from "@/store/app-store";
import { brl } from "@/lib/format";
import {
  dashboardAluguelVenda,
  dashboardComparativoCordialMorar,
  dashboardDesempenhoCorretores,
  dashboardEvolucaoMensal,
  dashboardOrigemLeads,
  dashboardPrevisaoFinanceira,
} from "@/lib/mock/data";
import { NovoAtendimentoSheet } from "@/components/sheets/novo-atendimento";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-mock";
import {
  axisTick,
  chartCordial,
  chartDanger,
  chartMorar,
  chartSystem,
  gridStroke,
  pieSeries,
  tooltipStyle,
} from "@/lib/chart-palette";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Building2,
  FileText,
  TrendingUp,
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
  const {
    agency,
    rawAtendimentos,
    rawImoveis,
    rawContratos,
    rawAgenda,
    rawLancamentos,
    rawClientes,
    rawCorretores,
  } = useApp(
    useShallow((s) => ({
      agency: s.agency,
      rawAtendimentos: s.atendimentos,
      rawImoveis: s.imoveis,
      rawContratos: s.contratos,
      rawAgenda: s.agenda,
      rawLancamentos: s.lancamentos,
      rawClientes: s.clientes,
      rawCorretores: s.corretores,
    })),
  );
  const filterByAgency = <T extends { imobiliaria: "cordial" | "morar" }>(items: T[]) =>
    agency === "todas" ? items : items.filter((item) => item.imobiliaria === agency);
  const atendimentos = filterByAgency(rawAtendimentos);
  const imoveis = filterByAgency(rawImoveis);
  const contratos = filterByAgency(rawContratos);
  const agenda = filterByAgency(rawAgenda);
  const lancamentos = filterByAgency(rawLancamentos);
  const clientes = filterByAgency(rawClientes);
  const corretores = filterByAgency(rawCorretores);

  const mesAtual = "2026-06";
  const atendimentosMes = atendimentos.filter((a) => a.criadoEm.startsWith(mesAtual)).length;
  const novosClientes = clientes.filter((c) => c.criadoEm.startsWith(mesAtual)).length;
  const clientesAluguel = clientes.filter((c) => c.tipo === "Locatário").length;
  const clientesCompra = clientes.filter((c) => c.tipo === "Comprador").length;
  const contratosAtivos = contratos.filter((c) => c.status === "Ativo").length;
  const imoveisNegociacao =
    imoveis.filter((i) => i.status === "Reservado").length +
    atendimentos.filter((a) => a.status === "Proposta").length;
  const visitasAgendadas = agenda.filter(
    (a) => a.tipo === "Visita" && new Date(a.data) >= new Date("2026-06-12T00:00:00"),
  ).length;
  const valoresPrevistos = contratos
    .filter((c) => c.status !== "Encerrado")
    .reduce((sum, c) => sum + (c.tipo === "Aluguel" ? c.valor : c.valor * 0.05), 0);
  const cobrancasAbertas = lancamentos
    .filter((l) => l.status === "Pendente")
    .reduce((sum, l) => sum + l.valor, 0);
  const inadimplencia = lancamentos
    .filter((l) => l.status === "Atrasado")
    .reduce((sum, l) => sum + l.valor, 0);
  const vendasEmAndamento =
    contratos.filter((c) => c.tipo === "Venda" && c.status === "Pendente assinatura").length +
    atendimentos.filter((a) => a.status === "Proposta").length;
  const alugueisFechados = contratos.filter(
    (c) => c.tipo === "Aluguel" && c.status === "Ativo",
  ).length;
  const desempenhoCorretores = corretores.reduce((sum, c) => sum + c.contratosFechados, 0);
  const atendPendentes = atendimentos.filter(
    (a) => a.status !== "Fechado" && a.status !== "Perdido",
  ).length;

  /* Grupos de métricas para o carrossel mobile */
  const metricGroups: MetricCardData[][] = [
    [
      {
        label: "Atendimentos do mês",
        value: String(atendimentosMes).padStart(2, "0"),
        detail: "+18% vs. maio",
        tone: "primary",
        accent: "up",
        icon: <TrendingUp className="size-4" />,
      },
      {
        label: "Novos clientes",
        value: String(novosClientes).padStart(2, "0"),
        detail: "cadastros em junho",
        accent: "up",
        icon: <ArrowUpRight className="size-4" />,
      },
      {
        label: "Buscando aluguel",
        value: String(clientesAluguel).padStart(2, "0"),
        detail: "locatários ativos",
        icon: <Building2 className="size-4" />,
      },
      {
        label: "Buscando compra",
        value: String(clientesCompra).padStart(2, "0"),
        detail: "compradores ativos",
        icon: <BadgeDollarSign className="size-4" />,
      },
    ],
    [
      {
        label: "Contratos ativos",
        value: String(contratosAtivos).padStart(2, "0"),
        detail: "assinados",
        tone: "primary",
        icon: <FileText className="size-4" />,
      },
      {
        label: "Imóveis em negociação",
        value: String(imoveisNegociacao).padStart(2, "0"),
        detail: "reservas + propostas",
        accent: "up",
        icon: <Building2 className="size-4" />,
      },
      {
        label: "Visitas agendadas",
        value: String(visitasAgendadas).padStart(2, "0"),
        detail: "próximos dias",
        icon: <TrendingUp className="size-4" />,
      },
      {
        label: "Valores previstos",
        value: brl(valoresPrevistos, { compact: true }),
        detail: "aluguéis + comissões",
        tone: "primary",
        accent: "up",
        icon: <Wallet className="size-4" />,
      },
    ],
    [
      {
        label: "Cobranças em aberto",
        value: brl(cobrancasAbertas, { compact: true }),
        detail: "pendentes",
        icon: <Wallet className="size-4" />,
      },
      {
        label: "Inadimplência",
        value: brl(inadimplencia, { compact: true }),
        detail: "atrasados",
        accent: "down",
        tone: "danger" as MetricTone,
        icon: <ArrowDownRight className="size-4" />,
      },
      {
        label: "Vendas em andamento",
        value: String(vendasEmAndamento).padStart(2, "0"),
        detail: "propostas e assinaturas",
        icon: <BadgeDollarSign className="size-4" />,
      },
      {
        label: "Aluguéis fechados",
        value: String(alugueisFechados).padStart(2, "0"),
        detail: "contratos ativos",
        accent: "up",
        icon: <FileText className="size-4" />,
      },
    ],
  ];

  const filteredBrokerChart =
    agency === "todas"
      ? dashboardDesempenhoCorretores
      : dashboardDesempenhoCorretores.filter((c) => c.imobiliaria === agency);
  const origemChart = dashboardOrigemLeads.map((item) => ({
    ...item,
    total: agency === "todas" ? item.total : item[agency],
  }));

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
              Acompanhe atendimentos, imóveis, contratos e performance das duas imobiliárias em um
              só lugar.
            </p>
          </div>
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto lg:gap-3">
            <HeroStat label="Visitas hoje" value={String(visitasAgendadas).padStart(2, "0")} />
            <HeroStat label="Atend. pendentes" value={String(atendPendentes).padStart(2, "0")} />
            <HeroStat label="Contratos ativos" value={String(contratosAtivos).padStart(2, "0")} />
            <HeroStat
              label="Previsão entrada"
              value={brl(valoresPrevistos, { compact: true })}
              accent
            />
          </div>
        </div>
      </section>

      {/* ── Métricas — carrossel horizontal com scroll-snap ─────────────── */}
      <MetricsCarousel groups={metricGroups} />

      {/* ── Resumo financeiro + Comparativo ─────────────────────────────── */}
      <section className="mb-5 grid min-w-0 gap-4 lg:grid-cols-3">
        <FinancialSummaryCard
          receita={valoresPrevistos}
          cobrancas={cobrancasAbertas}
          inadimplencia={inadimplencia}
          contratos={contratosAtivos}
        />
        <ComparativoCard />
      </section>

      {/* ── Gráficos ────────────────────────────────────────────────────── */}
      <section className="mb-5 grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Evolução mensal de atendimentos"
          subtitle="Cordial, Morar e total"
          className="xl:col-span-2"
          heightClassName="h-60 lg:h-72"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dashboardEvolucaoMensal} margin={{ left: -20, right: 12, top: 8 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis tickLine={false} axisLine={false} tick={axisTick} width={30} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ stroke: "rgba(30,100,125,0.12)", strokeWidth: 1 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
              <Line
                type="monotone"
                dataKey="cordial"
                stroke={chartCordial}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                name="Cordial"
                animationDuration={900}
              />
              <Line
                type="monotone"
                dataKey="morar"
                stroke={chartMorar}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                name="Morar"
                animationDuration={1100}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke={chartSystem}
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 3"
                activeDot={{ r: 4, strokeWidth: 0 }}
                name="Total"
                animationDuration={1300}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Origem dos leads"
          subtitle="Distribuição dos contatos"
          heightClassName="h-56 lg:h-64"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={origemChart}
                dataKey="total"
                nameKey="origem"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={3}
                animationBegin={200}
                animationDuration={900}
              >
                {origemChart.map((entry, index) => (
                  <Cell
                    key={entry.origem}
                    fill={pieSeries[index % pieSeries.length]}
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

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

        <ChartCard title="Desempenho dos corretores" subtitle="Atendimentos e contratos">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredBrokerChart}
              layout="vertical"
              margin={{ left: 8, right: 10, top: 8 }}
            >
              <defs>
                <linearGradient id="gradAtend" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={chartCordial} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={chartCordial} stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="gradContr" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={chartMorar} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={chartMorar} stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridStroke} horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                dataKey="nome"
                type="category"
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                width={54}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, name) =>
                  name === "Comissão" ? brl(Number(v), { compact: true }) : v
                }
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="atendimentos"
                fill="url(#gradAtend)"
                radius={[0, 6, 6, 0]}
                name="Atendimentos"
                animationDuration={900}
              />
              <Bar
                dataKey="contratos"
                fill="url(#gradContr)"
                radius={[0, 6, 6, 0]}
                name="Contratos"
                animationDuration={1100}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <RealEstateSitePreviewSection />

      <Fab onClick={() => setOpen(true)} label="Novo atendimento" />
      <NovoAtendimentoSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Carrossel de métricas                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function MetricsCarousel({ groups }: { groups: MetricCardData[][] }) {
  const [activeGroup, setActiveGroup] = useState(0);
  const allCards = groups.flat();

  return (
    <section className="mb-5">
      {/* Desktop: grid fixo */}
      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        {allCards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      {/* Mobile: carrossel com scroll-snap por grupo */}
      <div className="sm:hidden">
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto scroll-px-4 px-4 pb-2">
          {groups.map((group, gi) => (
            <div
              key={gi}
              className="mr-3 grid w-[calc(100vw-2rem)] max-w-full flex-none snap-start grid-cols-2 gap-2.5 last:mr-0"
            >
              {group.map((card) => (
                <MetricCard key={card.label} {...card} />
              ))}
            </div>
          ))}
        </div>
        {/* Indicadores de página */}
        <div className="mt-2 flex justify-center gap-1.5">
          {groups.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === activeGroup ? "w-5 bg-primary" : "w-1.5 bg-foreground/20",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  MetricCard — liquid glass sutil com profundidade 3D                        */
/* ─────────────────────────────────────────────────────────────────────────── */

const toneValueClass: Record<MetricTone, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-[color:var(--success)]",
  danger: "text-[color:var(--danger)]",
};

function MetricCard({
  label,
  value,
  detail,
  tone = "default",
  accent = "neutral",
  icon,
}: MetricCardData) {
  const TrendIcon = accent === "up" ? ArrowUpRight : accent === "down" ? ArrowDownRight : null;

  return (
    <article
      className="group relative min-w-0 overflow-hidden rounded-2xl p-3 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg sm:p-4"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.52) 100%)",
        backdropFilter: "blur(18px) saturate(145%)",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow:
          "0 8px 24px -8px rgba(23,27,33,0.1), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(23,27,33,0.04)",
      }}
    >
      {/* Brilho sutil no topo */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)",
        }}
      />

      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 leading-tight">
          {label}
        </p>
        {icon && (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-xl transition-colors",
              tone === "primary"
                ? "bg-primary/12 text-primary"
                : tone === "danger"
                  ? "bg-destructive/12 text-destructive"
                  : "bg-foreground/6 text-foreground/50",
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <span
          className={cn(
            "truncate text-xl font-bold leading-none tracking-tight sm:text-2xl",
            toneValueClass[tone],
          )}
        >
          {value}
        </span>
        {TrendIcon && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              accent === "up"
                ? "bg-emerald-500/12 text-emerald-700"
                : "bg-destructive/12 text-destructive",
            )}
          >
            <TrendIcon className="size-3" />
          </span>
        )}
      </div>

      {detail && (
        <p className="mt-2 truncate text-[10px] text-foreground/45 leading-tight">{detail}</p>
      )}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  FinancialSummaryCard — compacto e premium                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

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
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/70">
            Cordial x Morar
          </p>
          <h2 className="text-base font-semibold tracking-tight">Comparativo das operações</h2>
        </div>
        <span className="text-[10px] text-foreground/40">Atendimentos · conversão · receita</span>
      </div>

      {/* Mobile: scroll horizontal com snap; Desktop: grid */}
      <div className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 px-3 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
        {dashboardComparativoCordialMorar.map((item) => {
          const color = contextColors[item.imobiliaria] ?? chartSystem;
          const isCordial = item.imobiliaria === "Cordial";

          return (
            <div
              key={item.imobiliaria}
              className="w-[85%] min-w-[260px] max-w-[320px] flex-none snap-start rounded-2xl p-4 transition-all hover:scale-[1.01] md:w-auto md:min-w-0 md:max-w-none"
              style={{
                background: isCordial
                  ? "linear-gradient(135deg, rgba(43,127,163,0.08), rgba(43,127,163,0.04))"
                  : "linear-gradient(135deg, rgba(224,122,46,0.08), rgba(224,122,46,0.04))",
                border: `1px solid ${color}28`,
                borderLeft: `3px solid ${color}`,
                boxShadow: `0 4px 16px -8px ${color}22`,
              }}
            >
              {/* Header do card */}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold" style={{ color }}>
                  {item.imobiliaria}
                </h3>
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                  style={{ background: `${color}18`, color }}
                >
                  {item.conversao}% conv.
                </span>
              </div>

              {/* Stats */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Atend." value={item.atendimentos} color={color} />
                <MiniStat label="Aluguéis" value={item.alugueis} color={color} />
                <MiniStat label="Vendas" value={item.vendas} color={color} />
              </div>

              {/* Receita */}
              <div className="mt-3 rounded-xl p-3" style={{ background: `${color}0d` }}>
                <p className="text-[10px] uppercase tracking-wider text-foreground/45">
                  Receita prevista
                </p>
                <p className="mt-1 font-mono text-lg font-bold" style={{ color }}>
                  {brl(item.receitaPrevista, { compact: true })}
                </p>
                <p className="mt-0.5 text-[10px] text-foreground/50">
                  Origem: {item.origemContatos}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-white/40 p-2.5">
      <p className="font-mono text-base font-bold" style={{ color }}>
        {value}
      </p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-foreground/45">{label}</p>
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
