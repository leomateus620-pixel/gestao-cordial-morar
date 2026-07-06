export type ReportsPeriodPreset =
  | "today"
  | "this_week"
  | "last_7_days"
  | "this_month"
  | "last_30_days"
  | "custom";

export type ReportsComparisonMode = "previous_period" | "previous_month" | "previous_week" | "none";

export type ReportsAreaId =
  | "agenciamentos"
  | "atendimentos"
  | "clientes"
  | "alugueis"
  | "vendas"
  | "financeiro"
  | "marketing";

export type ReportsTone = "neutral" | "positive" | "attention" | "warning" | "danger" | "info";

export type ReportsDirection = "up" | "down" | "flat";

export type ReportsValueKind = "number" | "currency" | "percent";

export type ReportsDateRange = {
  start: Date;
  end: Date;
};

export type ReportsDelta = {
  current: number;
  previous: number;
  absolute: number;
  percent: number | null;
  direction: ReportsDirection;
  label: string;
  tone: ReportsTone;
};

export type ReportsKpi = {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  helper: string;
  area: ReportsAreaId | "geral";
  valueKind: ReportsValueKind;
  delta?: ReportsDelta;
  tone?: ReportsTone;
};

export type ReportsChartPoint = {
  key: string;
  label: string;
  tooltipLabel: string;
} & Record<string, string | number>;

export type ReportsChartSeries = {
  key: string;
  label: string;
  color: string;
  valueKind: ReportsValueKind;
  chartType?: "bar" | "line" | "area";
};

export type ReportsChartConfig = {
  id: string;
  title: string;
  subtitle: string;
  kind: "bar" | "line" | "area" | "composed";
  data: ReportsChartPoint[];
  series: ReportsChartSeries[];
  emptyTitle: string;
  emptyDescription: string;
};

export type ReportsHighlight = {
  id: string;
  label: string;
  value: string;
  description?: string;
  tone?: ReportsTone;
};

export type ReportsRankingItem = {
  id: string;
  name: string;
  subtitle?: string;
  value: string;
  secondaryValue?: string;
  progress?: number;
  tone?: ReportsTone;
};

export type ReportsInsightItem = {
  id: string;
  title: string;
  description: string;
  tone: ReportsTone;
  area: ReportsAreaId | "geral";
  direction?: ReportsDirection;
};

export type ReportsSourceState = {
  status: "ready" | "empty" | "loading" | "error" | "unavailable";
  title?: string;
  description?: string;
};

export type ReportsAreaSummary = {
  id: ReportsAreaId;
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
  metricDetail: string;
  delta?: ReportsDelta;
  highlights: ReportsHighlight[];
  chart: ReportsChartConfig;
  rankings: {
    title: string;
    items: ReportsRankingItem[];
    emptyTitle: string;
  };
  insights: ReportsInsightItem[];
  state: ReportsSourceState;
};

export type ReportsRankingGroup = {
  id: string;
  title: string;
  subtitle: string;
  items: ReportsRankingItem[];
  emptyTitle: string;
};

export type ReportsOverview = {
  period: {
    preset: ReportsPeriodPreset;
    label: string;
    range: ReportsDateRange;
  };
  comparison: {
    mode: ReportsComparisonMode;
    label: string;
    range: ReportsDateRange | null;
  };
  kpis: ReportsKpi[];
  areas: ReportsAreaSummary[];
  crossAreaComparisons: ReportsChartConfig[];
  insights: ReportsInsightItem[];
  rankings: ReportsRankingGroup[];
  hasAnyData: boolean;
};
