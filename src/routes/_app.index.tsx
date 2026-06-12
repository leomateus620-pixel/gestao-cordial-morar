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
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { Fab } from "@/components/fab";
import { useApp, useFiltered } from "@/store/app-store";
import { brl, timeAgo } from "@/lib/format";
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
  chartAccent,
  chartCordial,
  chartDanger,
  chartGraphite,
  chartMorar,
  chartMuted,
  chartSuccess,
  chartSystem,
  chartWarning,
  gridStroke,
  pieSeries,
  tooltipStyle,
} from "@/lib/chart-palette";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard — Gestão Cordial" }] }),
  component: Dashboard,
});

const contextColors: Record<string, string> = {
  Cordial: chartCordial,
  Morar: chartMorar,
};

function Dashboard() {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const agency = useApp((s) => s.agency);
  const atendimentos = useFiltered(useApp((s) => s.atendimentos));
  const imoveis = useFiltered(useApp((s) => s.imoveis));
  const contratos = useFiltered(useApp((s) => s.contratos));
  const agenda = useFiltered(useApp((s) => s.agenda));
  const lancamentos = useFiltered(useApp((s) => s.lancamentos));
  const clientes = useFiltered(useApp((s) => s.clientes));
  const corretores = useFiltered(useApp((s) => s.corretores));
  const todosClientes = useApp((s) => s.clientes);
  const todosCorretores = useApp((s) => s.corretores);

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

  const metricCards = [
    {
      label: "Atendimentos do mês",
      value: String(atendimentosMes).padStart(2, "0"),
      detail: "+18% vs. maio",
      tone: "primary" as const,
      accent: "up" as const,
    },
    {
      label: "Novos clientes",
      value: String(novosClientes).padStart(2, "0"),
      detail: "cadastros em junho",
      accent: "up" as const,
    },
    {
      label: "Buscando aluguel",
      value: String(clientesAluguel).padStart(2, "0"),
      detail: "locatários ativos",
    },
    {
      label: "Buscando compra",
      value: String(clientesCompra).padStart(2, "0"),
      detail: "compradores ativos",
    },
    {
      label: "Contratos ativos",
      value: String(contratosAtivos).padStart(2, "0"),
      detail: "assinados",
    },
    {
      label: "Imóveis em negociação",
      value: String(imoveisNegociacao).padStart(2, "0"),
      detail: "reservas + propostas",
      accent: "up" as const,
    },
    {
      label: "Visitas agendadas",
      value: String(visitasAgendadas).padStart(2, "0"),
      detail: "próximos dias",
    },
    {
      label: "Valores previstos",
      value: brl(valoresPrevistos, { compact: true }),
      detail: "aluguéis + comissões",
      tone: "primary" as const,
    },
    {
      label: "Cobranças em aberto",
      value: brl(cobrancasAbertas, { compact: true }),
      detail: "pendentes",
    },
    {
      label: "Inadimplência",
      value: brl(inadimplencia, { compact: true }),
      detail: "atrasados",
      accent: "down" as const,
    },
    {
      label: "Vendas em andamento",
      value: String(vendasEmAndamento).padStart(2, "0"),
      detail: "propostas e assinaturas",
    },
    {
      label: "Aluguéis fechados",
      value: String(alugueisFechados).padStart(2, "0"),
      detail: "contratos ativos",
      accent: "up" as const,
    },
    {
      label: "Desempenho dos corretores",
      value: String(desempenhoCorretores).padStart(2, "0"),
      detail: "contratos fechados",
      accent: "up" as const,
    },
  ];

  const filteredBrokerChart =
    agency === "todas"
      ? dashboardDesempenhoCorretores
      : dashboardDesempenhoCorretores.filter((c) => c.imobiliaria === agency);
  const origemChart = dashboardOrigemLeads.map((item) => ({
    ...item,
    total: agency === "todas" ? item.total : item[agency],
  }));
  const destaques = imoveis.filter((i) => i.status === "Disponível").slice(0, 5);
  const recentes = atendimentos.slice(0, 4);

  return (
    <>
      <section
        className="mb-6 overflow-hidden rounded-3xl p-6 text-white lg:p-7"
        style={{
          background:
            "linear-gradient(135deg, #174d61 0%, #1e647d 45%, #2a3038 100%)",
          boxShadow: "0 24px 60px -20px rgba(23,27,33,0.45)",
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
            <h1 className="mt-1 text-2xl font-semibold tracking-tight lg:text-3xl">
              Olá, {session?.nome ?? "bem-vindo"}
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/70">
              Acompanhe atendimentos, imóveis, contratos e performance das duas
              imobiliárias em um só lugar.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
            <HeroStat label="Visitas hoje" value={String(visitasAgendadas).padStart(2, "0")} />
            <HeroStat
              label="Atend. pendentes"
              value={String(atendimentos.filter((a) => a.status !== "Fechado" && a.status !== "Perdido").length).padStart(2, "0")}
            />
            <HeroStat
              label="Contratos ativos"
              value={String(contratosAtivos).padStart(2, "0")}
            />
            <HeroStat
              label="Previsão entrada"
              value={brl(valoresPrevistos, { compact: true })}
              accent
            />
          </div>
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {metricCards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <FinancialSummaryCard
          title="Resumo financeiro previsto"
          receita={valoresPrevistos}
          cobrancas={cobrancasAbertas}
          inadimplencia={inadimplencia}
          contratos={contratosAtivos}
        />
        <div className="glass-panel rounded-3xl p-5 lg:col-span-2">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/70">
                Cordial x Morar
              </p>
              <h2 className="text-lg font-semibold tracking-tight">Comparativo das operações</h2>
            </div>
            <span className="text-[10px] text-foreground/45">
              Atendimentos, conversão, receita e origem dos contatos
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {dashboardComparativoCordialMorar.map((item) => {
              const color = contextColors[item.imobiliaria] ?? chartSystem;
              const ctx =
                item.imobiliaria === "Cordial" ? "context-cordial" : "context-morar";
              return (
                <div
                  key={item.imobiliaria}
                  className={cn(
                    "rounded-2xl border border-white/60 bg-white/55 p-4 shadow-sm",
                    ctx,
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold" style={{ color }}>
                      {item.imobiliaria}
                    </h3>
                    <span
                      className="rounded-full px-2 py-1 font-mono text-[10px] font-bold"
                      style={{ background: `${color}1f`, color }}
                    >
                      {item.conversao}% conversão
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Atend." value={item.atendimentos} />
                    <MiniStat label="Aluguéis" value={item.alugueis} />
                    <MiniStat label="Vendas" value={item.vendas} />
                  </div>
                  <div className="mt-4 rounded-2xl bg-foreground/[0.04] p-3">
                    <p className="text-[10px] uppercase tracking-wider text-foreground/45">
                      Receita prevista
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold" style={{ color }}>
                      {brl(item.receitaPrevista, { compact: true })}
                    </p>
                    <p className="mt-1 text-[10px] text-foreground/55">
                      Origem: {item.origemContatos}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Evolução mensal de atendimentos"
          subtitle="Cordial, Morar e total"
          className="xl:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dashboardEvolucaoMensal} margin={{ left: -20, right: 12, top: 8 }}>
              <CartesianGrid stroke="rgba(80,40,20,0.06)" vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis tickLine={false} axisLine={false} tick={axisTick} width={30} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="cordial"
                stroke={chartCordial}
                strokeWidth={2.5}
                dot={false}
                name="Cordial"
              />
              <Line
                type="monotone"
                dataKey="morar"
                stroke={chartMorar}
                strokeWidth={2.5}
                dot={false}
                name="Morar"
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke={chartSystem}
                strokeWidth={2.5}
                dot={false}
                name="Total"
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
                innerRadius={48}
                outerRadius={78}
                paddingAngle={3}
              >
                {origemChart.map((entry, index) => (
                  <Cell key={entry.origem} fill={pieSeries[index % pieSeries.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Aluguel x venda" subtitle="Negócios por mês">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dashboardAluguelVenda}
              barCategoryGap={8}
              margin={{ left: -20, right: 8, top: 8 }}
            >
              <CartesianGrid stroke="rgba(80,40,20,0.06)" vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis hide />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="venda" fill={chartCordial} radius={[7, 7, 0, 0]} name="Venda" />
              <Bar
                dataKey="aluguel"
                fill={chartMorar}
                radius={[7, 7, 0, 0]}
                name="Aluguel"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Previsão financeira mensal"
          subtitle="Receita, comissão e aberto"
          className="xl:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dashboardPrevisaoFinanceira} margin={{ left: -14, right: 12, top: 8 }}>
              <defs>
                <linearGradient id="receitaPrevista" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartCordial} stopOpacity={0.42} />
                  <stop offset="100%" stopColor={chartCordial} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(80,40,20,0.06)" vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                width={44}
                tickFormatter={(value) => brl(Number(value), { compact: true })}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => brl(Number(value), { compact: true })}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
              <Area
                type="monotone"
                dataKey="receita"
                stroke={chartCordial}
                strokeWidth={2.4}
                fill="url(#receitaPrevista)"
                name="Receita"
              />
              <Line
                type="monotone"
                dataKey="comissao"
                stroke={chartSystem}
                strokeWidth={2.2}
                dot={false}
                name="Comissão"
              />
              <Line
                type="monotone"
                dataKey="aberto"
                stroke={chartDanger}
                strokeWidth={2.2}
                dot={false}
                name="Em aberto"
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
              <CartesianGrid stroke="rgba(80,40,20,0.06)" horizontal={false} />
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
                formatter={(value, name) =>
                  name === "Comissão" ? brl(Number(value), { compact: true }) : value
                }
              />
              <Bar
                dataKey="atendimentos"
                fill={chartCordial}
                radius={[0, 8, 8, 0]}
                name="Atendimentos"
              />
              <Bar
                dataKey="contratos"
                fill={chartMorar}
                radius={[0, 8, 8, 0]}
                name="Contratos"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="mb-6 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader title="Imóveis em destaque" href="/imoveis" />
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0 xl:grid-cols-3">
            {destaques.map((im) => (
              <Link
                key={im.id}
                to="/imoveis"
                className="glass-panel w-64 flex-none overflow-hidden rounded-2xl p-3 lg:w-auto"
              >
                <img
                  src={im.foto}
                  alt={im.titulo}
                  loading="lazy"
                  className="mb-3 aspect-[16/10] w-full rounded-xl object-cover"
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{im.titulo}</p>
                    <p className="text-[10px] text-foreground/55">
                      {im.bairro}, {im.cidade}
                    </p>
                  </div>
                  <StatusBadge status={im.status} />
                </div>
                <p className="mt-2 font-mono text-xs font-bold">{brl(im.valor)}</p>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader title="Atendimentos recentes" href="/atendimentos" />
          <div className="space-y-2">
            {recentes.map((a) => {
              const cli = todosClientes.find((c) => c.id === a.clienteId);
              const cor = todosCorretores.find((c) => c.id === a.corretorId);
              return (
                <div
                  key={a.id}
                  className="glass-panel flex items-center justify-between gap-3 rounded-2xl p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                      {cli?.iniciais ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{cli?.nome}</p>
                      <p className="truncate text-[10px] text-foreground/55">
                        Corretor: {cor?.nome}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={a.status} />
                    <p className="mt-1 font-mono text-[9px] text-foreground/45">
                      {timeAgo(a.criadoEm)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Fab onClick={() => setOpen(true)} label="Novo atendimento" />
      <NovoAtendimentoSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "primary";
  accent?: "up" | "down" | "neutral";
};

function MetricCard({
  label,
  value,
  detail,
  tone = "default",
  accent = "neutral",
}: MetricCardProps) {
  return (
    <article className="glass-panel rounded-3xl p-4 lg:p-5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-foreground/50">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span
          className={cn(
            "text-2xl font-bold leading-none lg:text-3xl",
            tone === "primary" && "text-primary",
          )}
        >
          {value}
        </span>
        <span
          className={cn(
            "h-2 w-10 rounded-full bg-foreground/10",
            accent === "up" && "bg-emerald-500/60",
            accent === "down" && "bg-destructive/70",
          )}
        />
      </div>
      {detail && <p className="mt-3 truncate text-[10px] text-foreground/50">{detail}</p>}
    </article>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
  heightClassName = "h-64 lg:h-72",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  heightClassName?: string;
}) {
  return (
    <section className={cn("glass-panel rounded-3xl p-5", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[10px] text-foreground/50">{subtitle}</p>}
        </div>
        <span className="font-mono text-[10px] text-foreground/40">6 MESES</span>
      </div>
      <div className={heightClassName}>{children}</div>
    </section>
  );
}

function FinancialSummaryCard({
  title,
  receita,
  cobrancas,
  inadimplencia,
  contratos,
}: {
  title: string;
  receita: number;
  cobrancas: number;
  inadimplencia: number;
  contratos: number;
}) {
  const liquido = Math.max(receita - cobrancas - inadimplencia, 0);

  return (
    <section className="glass-panel rounded-3xl p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/70">
        Financeiro
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-5 space-y-3">
        <SummaryRow
          label="Receita prevista"
          value={brl(receita, { compact: true })}
          tone="primary"
        />
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
      <div className="mt-5 rounded-2xl bg-primary/10 p-4">
        <p className="text-[10px] uppercase tracking-wider text-primary/70">Contratos ativos</p>
        <p className="mt-1 text-3xl font-bold text-primary">{String(contratos).padStart(2, "0")}</p>
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
  tone?: "default" | "primary" | "danger" | "success";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/40 px-3 py-2">
      <span className="text-[11px] text-foreground/55">{label}</span>
      <span
        className={cn(
          "font-mono text-sm font-bold",
          tone === "primary" && "text-primary",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-emerald-700",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.04] p-3">
      <p className="font-mono text-lg font-bold">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-foreground/45">{label}</p>
    </div>
  );
}

function HeroStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl px-3 py-2.5"
      style={{
        background: accent ? "rgba(240,168,109,0.18)" : "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <p
        className="text-[9px] font-semibold uppercase tracking-wider"
        style={{ color: accent ? "#f0a86d" : "rgba(255,255,255,0.6)" }}
      >
        {label}
      </p>
      <p className="mt-1 font-mono text-base font-bold text-white">{value}</p>
    </div>
  );
}
