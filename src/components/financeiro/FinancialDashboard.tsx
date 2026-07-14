import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  Calculator,
  CalendarRange,
  HandCoins,
  Landmark,
  PieChart as PieChartIcon,
  ReceiptText,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AgencySwitcher } from "@/components/agency-switcher";
import { EmptyState } from "@/components/shared/empty-state";
import { GlassCard } from "@/components/shared/glass-card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import {
  axisTick,
  chartAccent,
  chartDanger,
  chartGraphite,
  chartMorar,
  chartMuted,
  chartSuccess,
  chartSystem,
  gridStroke,
} from "@/lib/chart-palette";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FinanceSectionSelector } from "@/components/financeiro/FinanceSectionSelector";
import type { FinanceSection } from "@/components/financeiro/finance-sections";

type AgencyId = "cordial" | "morar";
type AgencyFilter = AgencyId | "todas";
type PeriodMode = "month" | "quarter" | "year" | "custom" | "all";

type Lancamento = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  tipo: "entrada" | "saida";
  imobiliaria: AgencyId | "ambas";
  status: string;
};

type DateRange = {
  start: Date;
  end: Date;
} | null;

type CategoryDatum = {
  name: string;
  value: number;
  count: number;
  percent: number;
  color: string;
};

type CashFlowDatum = {
  key: string;
  label: string;
  entradas: number;
  saidas: number;
  saldo: number;
};

type Metrics = {
  entradas: Lancamento[];
  saidas: Lancamento[];
  despesas: Lancamento[];
  comissoes: Lancamento[];
  repassesLancamentos: Lancamento[];
  inadimplentes: Lancamento[];
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  inadimplencia: number;
  repasses: number;
  despesasOperacionais: number;
  comissoesRegistradas: number;
  comissoesEntrada: number;
  comissoesSaida: number;
  receitaPaga: number;
  receitaPendente: number;
  despesaPaga: number;
  despesaPendente: number;
  repassePago: number;
  repassePendente: number;
  comissaoPaga: number;
  comissaoPendente: number;
  ticketReceita: number;
  ticketDespesa: number;
  receitaCategorias: CategoryDatum[];
  despesaCategorias: CategoryDatum[];
  fluxo: CashFlowDatum[];
  fluxoDespesas: CashFlowDatum[];
};

const periodOptions: Array<{ value: PeriodMode; label: string }> = [
  { value: "month", label: "Mês" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Ano" },
  { value: "custom", label: "Personalizado" },
  { value: "all", label: "Tudo" },
];

const chartColors = [chartSuccess, chartSystem, chartMorar, chartAccent, chartGraphite, chartMuted];

export function FinancialDashboard({
  lancamentos,
  agency,
  activeSection,
  onSectionChange,
  isLoading = false,
  isFetching = false,
  isError = false,
  onRetry,
  overviewFooter,
}: {
  lancamentos: Lancamento[];
  agency: AgencyFilter;
  activeSection: FinanceSection;
  onSectionChange: (section: FinanceSection) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  overviewFooter?: ReactNode;
}) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const bounds = useMemo(() => getDateBounds(lancamentos), [lancamentos]);
  const boundsMin = bounds.min;
  const boundsMax = bounds.max;
  const referenceDate = useMemo(() => boundsMax ?? new Date(), [boundsMax]);

  useEffect(() => {
    if (!boundsMin || !boundsMax) return;
    setCustomStart((current) => current || toInputDate(boundsMin));
    setCustomEnd((current) => current || toInputDate(boundsMax));
  }, [boundsMin, boundsMax]);

  const periodRange = useMemo(
    () => getPeriodRange(periodMode, referenceDate, customStart, customEnd),
    [periodMode, referenceDate, customStart, customEnd],
  );

  const { validLancamentos, invalidCount } = useMemo(
    () => splitValidLaunches(lancamentos),
    [lancamentos],
  );

  const periodLancamentos = useMemo(
    () => filterByRange(validLancamentos, periodRange),
    [validLancamentos, periodRange],
  );

  const metrics = useMemo(
    () => buildMetrics(periodLancamentos, periodMode),
    [periodLancamentos, periodMode],
  );

  const periodLabel = formatRangeLabel(periodMode, periodRange, referenceDate);
  const agencyLabel = getAgencyLabel(agency);

  return (
    <div className="mx-auto w-full max-w-[88rem] min-w-0 space-y-5 pb-3 sm:space-y-6">
      <FinancialHeader
        agencyLabel={agencyLabel}
        periodLabel={periodLabel}
        periodMode={periodMode}
        customStart={customStart}
        customEnd={customEnd}
        onPeriodChange={setPeriodMode}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        isRefreshing={isFetching}
      />

      <FinanceSectionSelector value={activeSection} onChange={onSectionChange} />

      {invalidCount > 0 && <PartialDataBanner count={invalidCount} />}

      {isLoading ? (
        <FinanceSectionSkeleton />
      ) : isError && validLancamentos.length === 0 ? (
        <FinanceErrorState onRetry={onRetry} />
      ) : (
        <div
          id="finance-section-panel"
          role="tabpanel"
          aria-labelledby={`finance-tab-${activeSection}`}
          tabIndex={0}
          className={cn(
            "min-w-0 space-y-5 outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-primary/30 sm:space-y-6 motion-reduce:transition-none",
            isFetching && "opacity-75",
          )}
          aria-busy={isFetching}
        >
          {isError && (
            <div className="glass-panel rounded-2xl border border-amber-300/30 bg-amber-50/50 p-3 text-xs font-semibold text-amber-950/70">
              Não foi possível atualizar agora. Os últimos dados carregados continuam visíveis.
            </div>
          )}
          <FinanceSectionContent
            section={activeSection}
            metrics={metrics}
            periodLabel={periodLabel}
            overviewFooter={overviewFooter}
          />
        </div>
      )}
    </div>
  );
}

function FinanceSectionContent({
  section,
  metrics,
  periodLabel,
  overviewFooter,
}: {
  section: FinanceSection;
  metrics: Metrics;
  periodLabel: string;
  overviewFooter?: ReactNode;
}) {
  if (section === "receitas") return <RevenueSection metrics={metrics} />;
  if (section === "despesas") return <ExpenseSection metrics={metrics} />;
  if (section === "fluxo-caixa") {
    return metrics.entradas.length || metrics.saidas.length ? (
      <CashFlowChart data={metrics.fluxo} />
    ) : (
      <FinanceEmptyState
        title="Sem movimentação de caixa neste período"
        description="Entradas e saídas registradas para os filtros selecionados formarão a evolução do caixa."
        icon={<BarChart3 className="size-5" />}
      />
    );
  }
  if (section === "dre") return <SimplifiedDRE metrics={metrics} />;
  if (section === "comissoes") return <CommissionSection metrics={metrics} />;
  if (section === "repasses") return <TransferSection metrics={metrics} />;
  if (section === "inadimplencia") return <DelinquencySection metrics={metrics} />;
  if (section === "integracoes") return <GoogleSheetsIntegration />;

  if (!metrics.entradas.length && !metrics.saidas.length) {
    return (
      <FinanceEmptyState
        title="Sem dados financeiros neste período"
        description="Quando lançamentos forem registrados para os filtros selecionados, a visão executiva aparecerá aqui."
        icon={<Wallet className="size-5" />}
      />
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <FinancialMetricCards metrics={metrics} periodLabel={periodLabel} />
      <CashFlowChart data={metrics.fluxo} compact />
      <FinancialSummary metrics={metrics} periodLabel={periodLabel} />
      {overviewFooter}
    </div>
  );
}

function FinanceSectionSkeleton() {
  return (
    <div aria-label="Carregando dados financeiros" aria-busy="true" className="space-y-4">
      <LoadingSkeleton rows={4} className="rounded-3xl border border-white/45 bg-white/35 p-3" />
      <div className="glass-panel h-72 animate-pulse rounded-3xl motion-reduce:animate-none" />
    </div>
  );
}

function FinanceErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <FinanceEmptyState
      title="Não foi possível carregar o Financeiro"
      description="Confira sua conexão e tente novamente. Nenhum indicador foi estimado enquanto os dados reais estão indisponíveis."
      icon={<AlertTriangle className="size-5" />}
      action={
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            Tentar novamente
          </button>
        ) : undefined
      }
    />
  );
}

function FinanceEmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return <EmptyState title={title} description={description} icon={icon} action={action} />;
}

function FinancialHeader({
  agencyLabel,
  periodLabel,
  periodMode,
  customStart,
  customEnd,
  onPeriodChange,
  onCustomStartChange,
  onCustomEndChange,
  isRefreshing,
}: {
  agencyLabel: string;
  periodLabel: string;
  periodMode: PeriodMode;
  customStart: string;
  customEnd: string;
  onPeriodChange: (mode: PeriodMode) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  isRefreshing: boolean;
}) {
  return (
    <section className="premium-card overflow-hidden p-4 sm:p-5 lg:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/12 bg-white/45 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary shadow-sm">
            <Activity className="size-3.5" />
            Central executiva
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Financeiro
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-foreground/62 sm:text-base">
            Acompanhe receitas, despesas, repasses, comissões e resultado consolidado.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-foreground/52">
            <span className="rounded-full bg-white/45 px-2.5 py-1">Imobiliária: {agencyLabel}</span>
            <span className="rounded-full bg-white/45 px-2.5 py-1">Período: {periodLabel}</span>
            {isRefreshing && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                Atualizando dados
              </span>
            )}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 xl:min-w-[36rem]">
          <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <AgencySwitcher />
            <PeriodFilter
              value={periodMode}
              onChange={onPeriodChange}
              isRefreshing={isRefreshing}
            />
          </div>
          {periodMode === "custom" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <DateField label="Início" value={customStart} onChange={onCustomStartChange} />
              <DateField label="Fim" value={customEnd} onChange={onCustomEndChange} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PeriodFilter({
  value,
  onChange,
  isRefreshing,
}: {
  value: PeriodMode;
  onChange: (mode: PeriodMode) => void;
  isRefreshing: boolean;
}) {
  return (
    <div className="glass-panel no-scrollbar flex min-w-0 gap-1 overflow-x-auto rounded-[1.35rem] p-1">
      {periodOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-11 shrink-0 rounded-full px-3 text-xs font-bold transition motion-reduce:transition-none md:min-w-0 md:flex-1",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
            value === option.value
              ? "bg-primary text-white shadow-[0_8px_20px_-10px_rgba(30,100,125,0.65)]"
              : "text-foreground/58 hover:bg-white/60 hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
      <span className="sr-only">
        {isRefreshing ? "Atualizando filtros" : "Filtros atualizados"}
      </span>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="glass-panel flex min-h-11 items-center gap-2 rounded-2xl px-3 text-xs font-semibold text-foreground/58">
      <span className="shrink-0">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-right text-xs font-bold text-foreground outline-none"
      />
    </label>
  );
}

function PartialDataBanner({ count }: { count: number }) {
  return (
    <div className="glass-panel flex items-start gap-3 rounded-2xl border border-amber-300/30 bg-amber-50/45 p-3 text-sm text-amber-950/75">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div>
        <p className="font-semibold">Dados parciais detectados</p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-950/62">
          {count} lançamento{count > 1 ? "s" : ""} sem data ou valor válido ficou
          {count > 1 ? "aram" : ""} fora dos gráficos.
        </p>
      </div>
    </div>
  );
}

function FinancialMetricCards({ metrics, periodLabel }: { metrics: Metrics; periodLabel: string }) {
  const cards = [
    {
      label: "Receita do período",
      value: metrics.totalEntradas,
      helper: `${metrics.entradas.length} entrada${metrics.entradas.length === 1 ? "" : "s"} em ${periodLabel}`,
      icon: TrendingUp,
      tone: "income" as const,
    },
    {
      label: "Comissões",
      value: metrics.comissoesRegistradas,
      helper:
        metrics.comissoesSaida > 0
          ? "comissões pagas registradas"
          : metrics.comissoesEntrada > 0
            ? "comissões registradas como entrada"
            : "sem lançamento de comissão",
      icon: BadgeDollarSign,
      tone: "neutral" as const,
    },
    {
      label: "Repasses",
      value: metrics.repasses,
      helper: metrics.repasses > 0 ? "saídas para repasse no período" : "sem repasse registrado",
      icon: HandCoins,
      tone: "outflow" as const,
    },
    {
      label: "Inadimplência",
      value: metrics.inadimplencia,
      helper: metrics.inadimplencia > 0 ? "lançamentos em atraso" : "sem atraso no período",
      icon: AlertTriangle,
      tone: "alert" as const,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <ExecutiveMetricCard key={card.label} {...card} />
      ))}
    </section>
  );
}

function ExecutiveMetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  icon: typeof TrendingUp;
  tone: "income" | "neutral" | "outflow" | "alert";
}) {
  const styles = {
    income: {
      icon: "bg-emerald-500/12 text-[color:var(--success)]",
      value: "text-[color:var(--success)]",
      bar: "bg-[color:var(--success)]",
    },
    neutral: {
      icon: "bg-primary/12 text-primary",
      value: "text-primary",
      bar: "bg-primary",
    },
    outflow: {
      icon: "bg-orange-500/12 text-orange-700",
      value: "text-orange-700",
      bar: "bg-orange-500",
    },
    alert: {
      icon: "bg-red-500/12 text-[color:var(--danger)]",
      value: "text-[color:var(--danger)]",
      bar: "bg-[color:var(--danger)]",
    },
  }[tone];

  return (
    <GlassCard
      variant="interactive"
      className="group relative overflow-hidden rounded-3xl border border-white/55 bg-white/45 p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-950/8"
      padding="none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/48">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 break-words text-2xl font-black leading-none tracking-tight sm:text-3xl",
              styles.value,
            )}
          >
            {brl(value, { compact: true })}
          </p>
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", styles.icon)}>
          <Icon className="size-5" />
        </span>
      </div>
      <p className="mt-3 min-h-8 text-xs leading-relaxed text-foreground/58">{helper}</p>
      <span
        className={cn(
          "absolute inset-x-4 bottom-0 h-0.5 origin-left scale-x-75 rounded-full opacity-55 transition group-hover:scale-x-100",
          styles.bar,
        )}
      />
    </GlassCard>
  );
}

function RevenueSection({ metrics }: { metrics: Metrics }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const topCategory = metrics.receitaCategorias[0];
  const revenueFlow = useMemo(
    () => metrics.fluxo.filter((item) => item.entradas > 0),
    [metrics.fluxo],
  );

  useEffect(() => {
    if (!revenueFlow.length) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !revenueFlow.some((item) => item.key === selectedKey)) {
      setSelectedKey(revenueFlow[revenueFlow.length - 1].key);
    }
  }, [revenueFlow, selectedKey]);

  if (!metrics.entradas.length) {
    return (
      <FinanceEmptyState
        title="Sem receitas neste período"
        description="Quando receitas forem registradas ou recebidas para os filtros selecionados, os indicadores e gráficos aparecerão aqui."
        icon={<TrendingUp className="size-5" />}
      />
    );
  }

  const selectedPoint = revenueFlow.find((item) => item.key === selectedKey) ?? revenueFlow.at(-1);

  return (
    <section className="min-w-0 space-y-4">
      <SectionTitle
        icon={<TrendingUp className="size-5" />}
        title="Receitas"
        subtitle="Entradas recebidas e previstas, com evolução, composição e registros do período."
      />
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <MiniInsightCard
          label="Receita total"
          value={formatMoneyExact(metrics.totalEntradas)}
          detail={`${metrics.entradas.length} entrada${metrics.entradas.length === 1 ? "" : "s"}`}
          icon={<Landmark className="size-4" />}
          tone="success"
        />
        <MiniInsightCard
          label="Receita recebida"
          value={formatMoneyExact(metrics.receitaPaga)}
          detail="lançamentos com status pago"
          icon={<BadgeDollarSign className="size-4" />}
          tone="success"
        />
        <MiniInsightCard
          label="Receita em aberto"
          value={formatMoneyExact(metrics.receitaPendente)}
          detail="pendente, atrasada ou cancelada"
          icon={<CalendarRange className="size-4" />}
          tone="warning"
        />
        <MiniInsightCard
          label="Ticket médio"
          value={formatMoneyExact(metrics.ticketReceita)}
          detail={topCategory ? `maior fonte: ${topCategory.name}` : "por entrada registrada"}
          icon={<Calculator className="size-4" />}
          tone="primary"
        />
      </div>

      <RevenueInsightCard metrics={metrics} selectedPoint={selectedPoint} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.8fr)]">
        <GlassCard className="min-w-0 rounded-3xl p-3 sm:p-5" padding="none">
          <ChartHeader
            title="Evolução da receita"
            subtitle="Selecione um ponto para destacar o período"
            value={selectedPoint ? formatMoneyExact(selectedPoint.entradas) : undefined}
          />
          <div
            className="h-64 min-w-0 sm:h-72"
            role="img"
            aria-label="Gráfico de colunas com a evolução das receitas registradas no período selecionado"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                accessibilityLayer
                data={revenueFlow}
                margin={{ top: 10, right: 2, left: -8, bottom: 0 }}
              >
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis
                  width={52}
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  tickFormatter={(value) => brl(Number(value), { compact: true })}
                />
                <Tooltip content={<SimpleMoneyTooltip label="Receita" dataKey="entradas" />} />
                <Bar dataKey="entradas" radius={[8, 8, 3, 3]} maxBarSize={64}>
                  {revenueFlow.map((item) => (
                    <Cell
                      key={item.key}
                      fill={item.key === selectedKey ? chartSystem : chartSuccess}
                      fillOpacity={item.key === selectedKey ? 1 : 0.45}
                      className="cursor-pointer outline-none transition-opacity duration-200 motion-reduce:transition-none"
                      onClick={() => setSelectedKey(item.key)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div
            className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1"
            aria-label="Períodos do gráfico de receitas"
          >
            {revenueFlow.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={item.key === selectedKey}
                onClick={() => setSelectedKey(item.key)}
                className={cn(
                  "min-h-9 shrink-0 rounded-full px-3 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none",
                  item.key === selectedKey
                    ? "bg-primary text-white"
                    : "bg-white/50 text-foreground/58 hover:bg-white/75",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </GlassCard>

        <CategoryBreakdown
          title="Distribuição de receita"
          subtitle="Categorias reais dos lançamentos"
          data={metrics.receitaCategorias}
          empty="Sem categoria de receita no período."
        />
      </div>
      <FinanceRecords title="Registros de receita" items={metrics.entradas} />
    </section>
  );
}

function ExpenseSection({ metrics }: { metrics: Metrics }) {
  const topCategory = metrics.despesaCategorias[0];
  const totalDespesas = sum(metrics.despesas);

  if (!metrics.despesas.length) {
    return (
      <FinanceEmptyState
        title="Sem despesas neste período"
        description="Despesas operacionais registradas para os filtros selecionados aparecerão aqui. Repasses e comissões permanecem em suas seções próprias."
        icon={<TrendingDown className="size-5" />}
      />
    );
  }

  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<TrendingDown className="size-5" />}
        title="Despesas e saídas"
        subtitle="Despesas operacionais registradas, sem misturar repasses e comissões."
      />
      <div className="grid gap-3 md:grid-cols-4">
        <MiniInsightCard
          label="Total de saídas"
          value={formatMoneyExact(totalDespesas)}
          detail={`${formatMoneyExact(metrics.despesaPaga)} pagos`}
          icon={<ArrowDownLeft className="size-4" />}
          tone="danger"
        />
        <MiniInsightCard
          label="Lançamentos"
          value={String(metrics.despesas.length)}
          detail="despesas no período"
          icon={<ReceiptText className="size-4" />}
          tone="neutral"
        />
        <MiniInsightCard
          label="Ticket médio"
          value={
            metrics.despesas.length ? formatMoneyExact(metrics.ticketDespesa) : "Não informado"
          }
          detail="por saída registrada"
          icon={<Calculator className="size-4" />}
          tone="primary"
        />
        <MiniInsightCard
          label="Maior categoria"
          value={topCategory?.name ?? "Não informado"}
          detail={topCategory ? `${topCategory.percent}% das saídas` : "sem categoria real"}
          icon={<PieChartIcon className="size-4" />}
          tone="warning"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
        <GlassCard className="rounded-3xl p-4 sm:p-5" padding="none">
          <ChartHeader
            title="Saídas por período"
            subtitle="Volume de repasses e despesas"
            value={formatMoneyExact(totalDespesas)}
          />
          <div className="h-60 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                accessibilityLayer
                data={metrics.fluxoDespesas}
                margin={{ top: 10, right: 2, left: -8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="expenseBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartMorar} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={chartMorar} stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis
                  width={44}
                  tickLine={false}
                  axisLine={false}
                  tick={axisTick}
                  tickFormatter={(value) => brl(Number(value), { compact: true })}
                />
                <Tooltip content={<SimpleMoneyTooltip label="Saídas" dataKey="saidas" />} />
                <Bar dataKey="saidas" fill="url(#expenseBar)" radius={[8, 8, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <CategoryBreakdown
          title="Distribuição de saídas"
          subtitle="Principais categorias do período"
          data={metrics.despesaCategorias}
          empty="Sem despesas ou repasses no período."
        />
      </div>
      <FinanceRecords title="Registros de despesa" items={metrics.despesas} />
    </section>
  );
}

function CommissionSection({ metrics }: { metrics: Metrics }) {
  if (!metrics.comissoes.length) {
    return (
      <FinanceEmptyState
        title="Sem comissões neste período"
        description="Lançamentos categorizados como comissão aparecerão aqui, respeitando os filtros e permissões atuais."
        icon={<BadgeDollarSign className="size-5" />}
      />
    );
  }

  return (
    <section className="space-y-4">
      <SectionTitle
        icon={<BadgeDollarSign className="size-5" />}
        title="Comissões"
        subtitle="Valores recebidos e pagos identificados pela categoria real dos lançamentos."
      />
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <MiniInsightCard
          label="Total registrado"
          value={formatMoneyExact(metrics.comissoesRegistradas)}
          detail={`${metrics.comissoes.length} lançamento${metrics.comissoes.length === 1 ? "" : "s"}`}
          icon={<BadgeDollarSign className="size-4" />}
          tone="primary"
        />
        <MiniInsightCard
          label="Entradas"
          value={formatMoneyExact(metrics.comissoesEntrada)}
          detail="comissões recebidas"
          icon={<ArrowUpRight className="size-4" />}
          tone="success"
        />
        <MiniInsightCard
          label="Saídas"
          value={formatMoneyExact(metrics.comissoesSaida)}
          detail="comissões pagas"
          icon={<ArrowDownLeft className="size-4" />}
          tone="danger"
        />
        <MiniInsightCard
          label="Em aberto"
          value={formatMoneyExact(metrics.comissaoPendente)}
          detail="status diferente de pago"
          icon={<CalendarRange className="size-4" />}
          tone="warning"
        />
      </div>
      <FinanceRecords title="Registros de comissão" items={metrics.comissoes} />
    </section>
  );
}

function TransferSection({ metrics }: { metrics: Metrics }) {
  if (!metrics.repassesLancamentos.length) {
    return (
      <FinanceEmptyState
        title="Sem repasses neste período"
        description="Repasses registrados para proprietários ou partes vinculadas aparecerão aqui."
        icon={<HandCoins className="size-5" />}
      />
    );
  }

  return (
    <section className="space-y-4">
      <SectionTitle
        icon={<HandCoins className="size-5" />}
        title="Repasses"
        subtitle="Acompanhamento dos valores concluídos e ainda pendentes no período."
      />
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <MiniInsightCard
          label="Total previsto"
          value={formatMoneyExact(metrics.repasses)}
          detail={`${metrics.repassesLancamentos.length} repasse${metrics.repassesLancamentos.length === 1 ? "" : "s"}`}
          icon={<HandCoins className="size-4" />}
          tone="primary"
        />
        <MiniInsightCard
          label="Concluído"
          value={formatMoneyExact(metrics.repassePago)}
          detail="repasses com status pago"
          icon={<ArrowUpRight className="size-4" />}
          tone="success"
        />
        <MiniInsightCard
          label="Pendente"
          value={formatMoneyExact(metrics.repassePendente)}
          detail="a concluir no período"
          icon={<CalendarRange className="size-4" />}
          tone="warning"
        />
        <MiniInsightCard
          label="Ticket médio"
          value={formatMoneyExact(metrics.repasses / metrics.repassesLancamentos.length)}
          detail="por repasse registrado"
          icon={<Calculator className="size-4" />}
          tone="neutral"
        />
      </div>
      <FinanceRecords title="Registros de repasse" items={metrics.repassesLancamentos} />
    </section>
  );
}

function DelinquencySection({ metrics }: { metrics: Metrics }) {
  if (!metrics.inadimplentes.length) {
    return (
      <FinanceEmptyState
        title="Sem inadimplência neste período"
        description="Nenhum lançamento com status atrasado foi encontrado para os filtros selecionados."
        icon={<AlertTriangle className="size-5" />}
      />
    );
  }

  const overdueRevenue = sum(metrics.inadimplentes.filter((item) => item.tipo === "entrada"));
  const overdueExpenses = sum(metrics.inadimplentes.filter((item) => item.tipo === "saida"));
  const oldest = [...metrics.inadimplentes].sort((a, b) => a.data.localeCompare(b.data))[0];

  return (
    <section className="space-y-4">
      <SectionTitle
        icon={<AlertTriangle className="size-5" />}
        title="Inadimplência"
        subtitle="Lançamentos atrasados, apresentados sem estimativas ou alertas artificiais."
      />
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <MiniInsightCard
          label="Total em atraso"
          value={formatMoneyExact(metrics.inadimplencia)}
          detail={`${metrics.inadimplentes.length} registro${metrics.inadimplentes.length === 1 ? "" : "s"}`}
          icon={<AlertTriangle className="size-4" />}
          tone="danger"
        />
        <MiniInsightCard
          label="Receitas atrasadas"
          value={formatMoneyExact(overdueRevenue)}
          detail="entradas ainda em atraso"
          icon={<TrendingDown className="size-4" />}
          tone="warning"
        />
        <MiniInsightCard
          label="Saídas atrasadas"
          value={formatMoneyExact(overdueExpenses)}
          detail="saídas com status atrasado"
          icon={<ReceiptText className="size-4" />}
          tone="neutral"
        />
        <MiniInsightCard
          label="Registro mais antigo"
          value={oldest ? formatFinanceDate(oldest.data) : "Não informado"}
          detail={oldest?.categoria ?? "sem categoria"}
          icon={<CalendarRange className="size-4" />}
          tone="primary"
        />
      </div>
      <FinanceRecords title="Registros em atraso" items={metrics.inadimplentes} />
    </section>
  );
}

function RevenueInsightCard({
  metrics,
  selectedPoint,
}: {
  metrics: Metrics;
  selectedPoint?: CashFlowDatum;
}) {
  const topCategory = metrics.receitaCategorias[0];
  let message = "A amostra ainda é pequena para apontar uma tendência de receita com segurança.";

  if (metrics.entradas.length > 1 && metrics.receitaPendente > 0) {
    message = `${formatMoneyExact(metrics.receitaPendente)} permanecem em aberto no período selecionado.`;
  } else if (topCategory && topCategory.percent >= 50) {
    message = `${topCategory.name} concentra ${topCategory.percent}% da receita registrada no período.`;
  } else if (selectedPoint) {
    message = `${selectedPoint.label} registra ${formatMoneyExact(selectedPoint.entradas)} em entradas.`;
  }

  return (
    <aside className="glass-panel flex items-start gap-3 rounded-3xl border border-primary/12 bg-primary/5 p-4 sm:items-center sm:p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-white">
        <ArrowUpRight className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
          Leitura do período
        </p>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground/75">{message}</p>
      </div>
    </aside>
  );
}

function FinanceRecords({ title, items }: { title: string; items: Lancamento[] }) {
  const records = [...items].sort((a, b) => b.data.localeCompare(a.data));

  return (
    <GlassCard className="min-w-0 rounded-3xl p-3 sm:p-5" padding="none">
      <ChartHeader
        title={title}
        subtitle={`${records.length} lançamento${records.length === 1 ? "" : "s"} no filtro atual`}
      />
      <div className="space-y-2 md:hidden">
        {records.map((item) => (
          <article key={item.id} className="rounded-2xl border border-white/55 bg-white/42 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold leading-snug text-foreground">
                  {item.descricao || item.categoria}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-foreground/50">
                  {item.categoria} · {formatFinanceDate(item.data)}
                </p>
              </div>
              <p className="shrink-0 text-right font-mono text-sm font-black text-foreground">
                {item.tipo === "saida" ? "− " : "+ "}
                {formatMoneyExact(item.valor)}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <FinanceStatusBadge status={item.status} />
              <span className="text-[10px] font-bold text-foreground/45">
                {getLaunchAgencyLabel(item.imobiliaria)}
              </span>
            </div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-2xl border border-white/55 bg-white/34 md:block">
        <table className="w-full table-fixed text-left text-xs">
          <caption className="sr-only">{title}</caption>
          <thead className="border-b border-white/60 bg-white/45 text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">
            <tr>
              <th className="w-[38%] px-4 py-3">Descrição</th>
              <th className="w-[18%] px-3 py-3">Data</th>
              <th className="w-[18%] px-3 py-3">Status</th>
              <th className="px-4 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/55">
            {records.map((item) => (
              <tr
                key={item.id}
                className="transition-colors hover:bg-white/45 motion-reduce:transition-none"
              >
                <td className="px-4 py-3">
                  <p className="truncate font-bold text-foreground">
                    {item.descricao || item.categoria}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold text-foreground/45">
                    {item.categoria} · {getLaunchAgencyLabel(item.imobiliaria)}
                  </p>
                </td>
                <td className="px-3 py-3 font-semibold text-foreground/62">
                  {formatFinanceDate(item.data)}
                </td>
                <td className="px-3 py-3">
                  <FinanceStatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3 text-right font-mono font-black text-foreground">
                  {item.tipo === "saida" ? "− " : "+ "}
                  {formatMoneyExact(item.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function FinanceStatusBadge({ status }: { status: string }) {
  const normalized = normalizeText(status);
  const className = normalized.includes("pago")
    ? "bg-emerald-500/10 text-[color:var(--success)]"
    : normalized.includes("atras")
      ? "bg-red-500/10 text-[color:var(--danger)]"
      : normalized.includes("cancel")
        ? "bg-slate-500/10 text-slate-700"
        : "bg-amber-500/12 text-amber-800";
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-black", className)}>
      {status || "Não informado"}
    </span>
  );
}

function CashFlowChart({ data, compact = false }: { data: CashFlowDatum[]; compact?: boolean }) {
  const totalSaldo = data.reduce((total, item) => total + item.saldo, 0);

  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<BarChart3 className="size-5" />}
        title="Fluxo de caixa"
        subtitle="Entradas, saídas e saldo no período selecionado."
        rightSlot={
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-bold",
              totalSaldo >= 0
                ? "bg-emerald-500/10 text-[color:var(--success)]"
                : "bg-red-500/10 text-[color:var(--danger)]",
            )}
          >
            {totalSaldo >= 0 ? "Saldo positivo" : "Saídas acima das entradas"}
          </span>
        }
      />
      <GlassCard className="rounded-3xl p-4 sm:p-5" padding="none">
        <div className={compact ? "h-64 sm:h-72" : "h-72 sm:h-80"}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{ top: 16, right: 2, left: -8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="cashIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartSuccess} stopOpacity={0.42} />
                  <stop offset="100%" stopColor={chartSuccess} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="cashOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartMorar} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={chartMorar} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="cashBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartSystem} stopOpacity={0.36} />
                  <stop offset="100%" stopColor={chartSystem} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis
                width={48}
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                tickFormatter={(value) => brl(Number(value), { compact: true })}
              />
              <Tooltip content={<CashFlowTooltip />} cursor={{ stroke: "rgba(30,100,125,0.24)" }} />
              <Area
                type="monotone"
                dataKey="entradas"
                name="Entradas"
                stroke={chartSuccess}
                strokeWidth={2.4}
                fill="url(#cashIn)"
                activeDot={{ r: 5 }}
              />
              <Area
                type="monotone"
                dataKey="saidas"
                name="Saídas"
                stroke={chartMorar}
                strokeWidth={2.2}
                fill="url(#cashOut)"
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="saldo"
                name="Saldo"
                stroke={chartSystem}
                strokeWidth={2.8}
                fill="url(#cashBalance)"
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-foreground/58">
          <LegendPill color={chartSuccess} label="Entradas" />
          <LegendPill color={chartMorar} label="Saídas" />
          <LegendPill color={chartSystem} label="Saldo" />
        </div>
      </GlassCard>
    </section>
  );
}

function FinancialSummary({ metrics, periodLabel }: { metrics: Metrics; periodLabel: string }) {
  const steps = [
    {
      label: "Entrou",
      value: metrics.totalEntradas,
      detail: "receitas registradas",
      icon: ArrowUpRight,
      color: "text-[color:var(--success)]",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Saiu",
      value: metrics.totalSaidas,
      detail: "repasses e despesas",
      icon: ArrowDownLeft,
      color: "text-orange-700",
      bg: "bg-orange-500/10",
    },
    {
      label: metrics.saldo >= 0 ? "Sobrou" : "Faltou",
      value: Math.abs(metrics.saldo),
      detail: metrics.saldo >= 0 ? "saldo do período" : "resultado negativo",
      icon: metrics.saldo >= 0 ? TrendingUp : TrendingDown,
      color: metrics.saldo >= 0 ? "text-primary" : "text-[color:var(--danger)]",
      bg: metrics.saldo >= 0 ? "bg-primary/10" : "bg-red-500/10",
    },
  ];

  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<Scale className="size-5" />}
        title="Resumo financeiro"
        subtitle={`Leitura executiva de ${periodLabel}.`}
      />
      <GlassCard variant="strong" className="rounded-3xl p-4 sm:p-5" padding="none">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="contents">
                <div className={cn("rounded-2xl border border-white/50 p-4", step.bg)}>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-xl bg-white/55",
                        step.color,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <p className={cn("text-sm font-black", step.color)}>{step.label}</p>
                      <p className="text-[11px] text-foreground/52">{step.detail}</p>
                    </div>
                  </div>
                  <p
                    className={cn(
                      "mt-4 text-2xl font-black tracking-tight sm:text-3xl",
                      step.color,
                    )}
                  >
                    {brl(step.value, { compact: true })}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden items-center justify-center text-foreground/28 lg:flex">
                    <ArrowRight className="size-5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-2 border-t border-white/45 pt-4 sm:grid-cols-3">
          <SummaryLine label="Entradas pendentes" value={metrics.receitaPendente} tone="warning" />
          <SummaryLine label="Inadimplência" value={metrics.inadimplencia} tone="danger" />
          <SummaryLine
            label="Resultado estimado"
            value={metrics.saldo - metrics.inadimplencia}
            tone="primary"
          />
        </div>
      </GlassCard>
    </section>
  );
}

function SimplifiedDRE({ metrics }: { metrics: Metrics }) {
  if (!metrics.entradas.length && !metrics.saidas.length) {
    return (
      <FinanceEmptyState
        title="DRE sem linhas disponíveis"
        description="Não há receitas, despesas, repasses ou comissões para compor o demonstrativo neste filtro."
        icon={<ReceiptText className="size-5" />}
      />
    );
  }

  const estimatedResult = metrics.totalEntradas - metrics.totalSaidas - metrics.inadimplencia;
  const rows = [
    {
      group: "Entradas",
      label: "Receita bruta",
      value: metrics.totalEntradas,
      sign: "positive" as const,
      visible: metrics.totalEntradas > 0,
    },
    {
      group: "Entradas",
      label: "Receitas de comissão",
      value: metrics.comissoesEntrada,
      sign: "positive" as const,
      visible: metrics.comissoesEntrada > 0,
    },
    {
      group: "Saídas",
      label: "Comissões pagas",
      value: metrics.comissoesSaida,
      sign: "negative" as const,
      visible: metrics.comissoesSaida > 0,
    },
    {
      group: "Saídas",
      label: "Repasses",
      value: metrics.repasses,
      sign: "negative" as const,
      visible: metrics.repasses > 0,
    },
    {
      group: "Saídas",
      label: "Despesas operacionais",
      value: metrics.despesasOperacionais,
      sign: "negative" as const,
      visible: metrics.despesasOperacionais > 0,
    },
    {
      group: "Ajustes",
      label: "Inadimplência e pendências em atraso",
      value: metrics.inadimplencia,
      sign: "negative" as const,
      visible: metrics.inadimplencia > 0,
    },
  ].filter((row) => row.visible);

  const maxValue = Math.max(
    ...rows.map((row) => Math.abs(row.value)),
    Math.abs(estimatedResult),
    1,
  );

  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<ReceiptText className="size-5" />}
        title="DRE visual simplificada"
        subtitle="Substitui lançamentos recentes por uma leitura executiva de entradas, saídas e resultado."
      />
      <GlassCard className="rounded-3xl p-4 sm:p-5" padding="none">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
          <div className="space-y-3">
            {rows.length ? (
              rows.map((row) => (
                <DreRow key={`${row.group}-${row.label}`} row={row} maxValue={maxValue} />
              ))
            ) : (
              <EmptyState
                title="DRE sem linhas disponíveis"
                description="Não há entradas, saídas, repasses ou pendências para compor o resultado neste filtro."
                icon={<ReceiptText className="size-5" />}
              />
            )}
          </div>

          <div
            className={cn(
              "rounded-3xl border p-4",
              estimatedResult >= 0
                ? "border-emerald-500/18 bg-emerald-500/10"
                : "border-red-500/18 bg-red-500/10",
            )}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-foreground/50">
              Resultado líquido estimado
            </p>
            <p
              className={cn(
                "mt-3 break-words text-3xl font-black tracking-tight",
                estimatedResult >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--danger)]",
              )}
            >
              {formatMoneyExact(estimatedResult)}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-foreground/58">
              Calculado com os lançamentos reais do filtro: receita bruta menos saídas registradas e
              atrasos do período.
            </p>
            {metrics.comissoesEntrada > 0 && metrics.comissoesSaida === 0 && (
              <p className="mt-3 rounded-2xl bg-white/45 px-3 py-2 text-[11px] leading-relaxed text-foreground/56">
                Comissões aparecem como entrada nos dados atuais; nenhuma saída de comissão foi
                inventada para a DRE.
              </p>
            )}
          </div>
        </div>
      </GlassCard>
    </section>
  );
}

function DreRow({
  row,
  maxValue,
}: {
  row: {
    group: string;
    label: string;
    value: number;
    sign: "positive" | "negative";
  };
  maxValue: number;
}) {
  const percent = Math.max(6, Math.round((Math.abs(row.value) / maxValue) * 100));
  const isPositive = row.sign === "positive";

  return (
    <div className="rounded-2xl border border-white/45 bg-white/38 p-3 transition hover:bg-white/55">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/42">
            {row.group}
          </p>
          <p className="mt-0.5 text-sm font-bold text-foreground">{row.label}</p>
        </div>
        <p
          className={cn(
            "font-mono text-sm font-black",
            isPositive ? "text-[color:var(--success)]" : "text-orange-700",
          )}
        >
          {isPositive ? "+" : "-"} {formatMoneyExact(Math.abs(row.value))}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/60">
        <div
          className={cn(
            "h-full rounded-full",
            isPositive ? "bg-[color:var(--success)]" : "bg-orange-500",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function CategoryBreakdown({
  title,
  subtitle,
  data,
  empty,
}: {
  title: string;
  subtitle: string;
  data: CategoryDatum[];
  empty: string;
}) {
  return (
    <GlassCard className="rounded-3xl p-4 sm:p-5" padding="none">
      <ChartHeader title={title} subtitle={subtitle} />
      {data.length ? (
        <>
          {data.length <= 5 && (
            <div className="h-44" role="img" aria-label={`${title} por categoria`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={3}
                    stroke="rgba(255,255,255,0.72)"
                    strokeWidth={2}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CategoryTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 space-y-2">
            {data.slice(0, data.length <= 5 ? 5 : 8).map((item) => (
              <CategoryRow key={item.name} item={item} />
            ))}
          </div>
        </>
      ) : (
        <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-foreground/10 bg-white/28 p-5 text-center text-xs text-foreground/52">
          {empty}
        </div>
      )}
    </GlassCard>
  );
}

function CategoryRow({ item }: { item: CategoryDatum }) {
  return (
    <div className="rounded-2xl bg-white/38 px-3 py-2 transition hover:bg-white/58">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="truncate text-xs font-bold text-foreground/78">{item.name}</span>
        </div>
        <span className="font-mono text-xs font-black text-foreground">
          {brl(item.value, { compact: true })}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/60">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(item.percent, 4)}%`, backgroundColor: item.color }}
        />
      </div>
      <p className="mt-1 text-[10px] font-semibold text-foreground/45">
        {item.percent}% · {item.count} lançamento{item.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function MiniInsightCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: "success" | "primary" | "neutral" | "danger" | "warning";
}) {
  const toneClass = {
    success: "bg-emerald-500/10 text-[color:var(--success)]",
    primary: "bg-primary/10 text-primary",
    neutral: "bg-slate-500/10 text-slate-700",
    danger: "bg-red-500/10 text-[color:var(--danger)]",
    warning: "bg-orange-500/10 text-orange-700",
  }[tone];

  return (
    <GlassCard className="rounded-2xl p-3 sm:p-4" padding="none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
            {label}
          </p>
          <p className="mt-1 [overflow-wrap:anywhere] text-[clamp(1rem,4.7vw,1.35rem)] font-black leading-tight text-foreground">
            {value}
          </p>
          <p className="mt-1 text-[11px] font-medium text-foreground/52">{detail}</p>
        </div>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", toneClass)}>
          {icon}
        </span>
      </div>
    </GlassCard>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
  rightSlot,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl bg-white/55 text-primary shadow-sm">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight text-foreground sm:text-xl">{title}</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-foreground/58">{subtitle}</p>
        </div>
      </div>
      {rightSlot}
    </div>
  );
}

function ChartHeader({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle: string;
  value?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-black text-foreground sm:text-base">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-foreground/52">{subtitle}</p>
      </div>
      {value && (
        <span className="shrink-0 rounded-full bg-white/55 px-2.5 py-1 font-mono text-[11px] font-black text-foreground/72">
          {value}
        </span>
      )}
    </div>
  );
}

function SummaryLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "warning" | "danger";
}) {
  const toneClass = {
    primary: "text-primary",
    warning: "text-orange-700",
    danger: "text-[color:var(--danger)]",
  }[tone];

  return (
    <div className="rounded-2xl bg-white/38 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/42">
        {label}
      </p>
      <p className={cn("mt-1 font-mono text-sm font-black", toneClass)}>
        {brl(value, { compact: true })}
      </p>
    </div>
  );
}

function LegendPill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/45 px-2.5 py-1">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function SimpleMoneyTooltip({
  active,
  payload,
  label,
  dataKey,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, unknown> }>;
  label?: string;
  dataKey: "entradas" | "saidas";
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashFlowDatum | undefined;
  if (!row) return null;

  return (
    <TooltipShell title={label ?? row.label}>
      <TooltipValue
        label={dataKey === "entradas" ? "Receita/entradas" : "Despesas/saídas"}
        value={row[dataKey]}
        color={dataKey === "entradas" ? chartSuccess : chartMorar}
      />
    </TooltipShell>
  );
}

function CashFlowTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CashFlowDatum | undefined;
  if (!row) return null;

  return (
    <TooltipShell title={label ?? row.label}>
      <TooltipValue label="Receita/entradas" value={row.entradas} color={chartSuccess} />
      <TooltipValue label="Despesas/saídas" value={row.saidas} color={chartMorar} />
      <TooltipValue
        label="Saldo"
        value={row.saldo}
        color={row.saldo >= 0 ? chartSystem : chartDanger}
      />
      <p className="mt-2 rounded-xl bg-slate-50 px-2 py-1 text-[11px] font-semibold text-foreground/62">
        {row.saldo >= 0 ? "Saldo positivo no período" : "Saídas acima das entradas"}
      </p>
    </TooltipShell>
  );
}

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CategoryDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  return (
    <TooltipShell title={item.name}>
      <TooltipValue label="Total" value={item.value} color={item.color} />
      <p className="mt-1 text-[11px] font-semibold text-foreground/58">
        {item.percent}% · {item.count} lançamento{item.count === 1 ? "" : "s"}
      </p>
    </TooltipShell>
  );
}

function TooltipShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 p-3 text-xs shadow-[0_18px_40px_-16px_rgba(23,27,33,0.22)] backdrop-blur-xl">
      <p className="mb-2 text-sm font-black text-foreground">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function TooltipValue({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex min-w-40 items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 text-foreground/56">
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="font-mono font-black text-foreground">{brl(value, { compact: true })}</span>
    </div>
  );
}

function buildMetrics(lancamentos: Lancamento[], periodMode: PeriodMode): Metrics {
  const entradas = lancamentos.filter((item) => item.tipo === "entrada");
  const saidas = lancamentos.filter((item) => item.tipo === "saida");
  const comissoes = lancamentos.filter((item) => hasCategory(item, "comiss"));
  const repassesLancamentos = saidas.filter((item) => hasCategory(item, "repasse"));
  const despesas = saidas.filter(
    (item) => !hasCategory(item, "repasse") && !hasCategory(item, "comiss"),
  );
  const inadimplentes = lancamentos.filter((item) => normalizeText(item.status).includes("atras"));
  const totalEntradas = sum(entradas);
  const totalSaidas = sum(saidas);
  const comissoesEntrada = sum(entradas.filter((item) => hasCategory(item, "comiss")));
  const comissoesSaida = sum(saidas.filter((item) => hasCategory(item, "comiss")));
  const repasses = sum(repassesLancamentos);
  const despesasOperacionais = sum(despesas);
  const inadimplencia = sum(inadimplentes);

  return {
    entradas,
    saidas,
    despesas,
    comissoes,
    repassesLancamentos,
    inadimplentes,
    totalEntradas,
    totalSaidas,
    saldo: totalEntradas - totalSaidas,
    inadimplencia,
    repasses,
    despesasOperacionais,
    comissoesRegistradas: comissoesEntrada + comissoesSaida,
    comissoesEntrada,
    comissoesSaida,
    receitaPaga: sum(entradas.filter((item) => normalizeText(item.status).includes("pago"))),
    receitaPendente: sum(entradas.filter((item) => !normalizeText(item.status).includes("pago"))),
    despesaPaga: sum(despesas.filter((item) => normalizeText(item.status).includes("pago"))),
    despesaPendente: sum(despesas.filter((item) => !normalizeText(item.status).includes("pago"))),
    repassePago: sum(
      repassesLancamentos.filter((item) => normalizeText(item.status).includes("pago")),
    ),
    repassePendente: sum(
      repassesLancamentos.filter((item) => !normalizeText(item.status).includes("pago")),
    ),
    comissaoPaga: sum(comissoes.filter((item) => normalizeText(item.status).includes("pago"))),
    comissaoPendente: sum(comissoes.filter((item) => !normalizeText(item.status).includes("pago"))),
    ticketReceita: entradas.length ? totalEntradas / entradas.length : 0,
    ticketDespesa: despesas.length ? despesasOperacionais / despesas.length : 0,
    receitaCategorias: aggregateCategories(entradas),
    despesaCategorias: aggregateCategories(despesas),
    fluxo: aggregateCashFlow(lancamentos, periodMode),
    fluxoDespesas: aggregateCashFlow(despesas, periodMode),
  };
}

function aggregateCategories(items: Lancamento[]): CategoryDatum[] {
  const total = sum(items);
  const grouped = new Map<string, { value: number; count: number }>();

  items.forEach((item) => {
    const name = item.categoria?.trim() || "Não informado";
    const current = grouped.get(name) ?? { value: 0, count: 0 };
    grouped.set(name, { value: current.value + item.valor, count: current.count + 1 });
  });

  return Array.from(grouped.entries())
    .map(([name, item], index) => ({
      name,
      value: item.value,
      count: item.count,
      percent: total > 0 ? Math.round((item.value / total) * 100) : 0,
      color: chartColors[index % chartColors.length],
    }))
    .sort((a, b) => b.value - a.value);
}

function aggregateCashFlow(items: Lancamento[], periodMode: PeriodMode): CashFlowDatum[] {
  const grouped = new Map<string, CashFlowDatum>();
  const useDayBucket = periodMode === "month" || periodMode === "custom";

  items.forEach((item) => {
    const date = parseLaunchDate(item.data);
    if (!date) return;
    const key = useDayBucket ? dayKey(date) : monthKey(date);
    const label = useDayBucket ? dayLabel(date) : monthLabel(date);
    const current = grouped.get(key) ?? { key, label, entradas: 0, saidas: 0, saldo: 0 };
    if (item.tipo === "entrada") current.entradas += item.valor;
    if (item.tipo === "saida") current.saidas += item.valor;
    current.saldo = current.entradas - current.saidas;
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function splitValidLaunches(items: Lancamento[]) {
  const validLancamentos: Lancamento[] = [];
  let invalidCount = 0;

  items.forEach((item) => {
    if (parseLaunchDate(item.data) && Number.isFinite(item.valor)) {
      validLancamentos.push(item);
    } else {
      invalidCount += 1;
    }
  });

  return { validLancamentos, invalidCount };
}

function filterByRange(items: Lancamento[], range: DateRange) {
  if (!range) return items;
  return items.filter((item) => {
    const date = parseLaunchDate(item.data);
    if (!date) return false;
    return date >= range.start && date <= range.end;
  });
}

function getPeriodRange(
  mode: PeriodMode,
  referenceDate: Date,
  customStart: string,
  customEnd: string,
): DateRange {
  if (mode === "all") return null;

  if (mode === "custom") {
    const start = inputDateToLocal(customStart);
    const end = inputDateToLocal(customEnd);
    if (!start || !end) return null;
    const normalizedStart = start <= end ? start : end;
    const normalizedEnd = start <= end ? end : start;
    return { start: startOfDay(normalizedStart), end: endOfDay(normalizedEnd) };
  }

  if (mode === "month") {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    return { start: startOfDay(start), end: endOfDay(end) };
  }

  if (mode === "quarter") {
    const quarterStart = Math.floor(referenceDate.getMonth() / 3) * 3;
    const start = new Date(referenceDate.getFullYear(), quarterStart, 1);
    const end = new Date(referenceDate.getFullYear(), quarterStart + 3, 0);
    return { start: startOfDay(start), end: endOfDay(end) };
  }

  const start = new Date(referenceDate.getFullYear(), 0, 1);
  const end = new Date(referenceDate.getFullYear(), 11, 31);
  return { start: startOfDay(start), end: endOfDay(end) };
}

function getDateBounds(items: Lancamento[]) {
  const dates = items.map((item) => parseLaunchDate(item.data)).filter(Boolean) as Date[];
  if (!dates.length) return { min: null, max: null };
  const timestamps = dates.map((date) => date.getTime());
  return {
    min: new Date(Math.min(...timestamps)),
    max: new Date(Math.max(...timestamps)),
  };
}

function formatRangeLabel(mode: PeriodMode, range: DateRange, referenceDate: Date) {
  if (mode === "all") return "Período completo";
  if (mode === "custom" && !range) return "Selecione as datas";
  if (!range) return "Período não definido";
  if (mode === "month") {
    return referenceDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }
  if (mode === "quarter") {
    const quarter = Math.floor(referenceDate.getMonth() / 3) + 1;
    return `${quarter}º trimestre de ${referenceDate.getFullYear()}`;
  }
  if (mode === "year") return String(referenceDate.getFullYear());
  return `${shortDateLabel(range.start)} a ${shortDateLabel(range.end)}`;
}

function getAgencyLabel(agency: AgencyFilter) {
  if (agency === "cordial") return "Cordial";
  if (agency === "morar") return "Morar";
  return "Todas";
}

function getLaunchAgencyLabel(agency: Lancamento["imobiliaria"]) {
  if (agency === "ambas") return "Cordial + Morar";
  return getAgencyLabel(agency);
}

function hasCategory(item: Lancamento, keyword: string) {
  return normalizeText(item.categoria).includes(keyword);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sum(items: Lancamento[]) {
  return items.reduce((total, item) => total + item.valor, 0);
}

function parseLaunchDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inputDateToLocal(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dayLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function shortDateLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoneyExact(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatFinanceDate(value: string) {
  const date = parseLaunchDate(value);
  return date
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : "Data não informada";
}
