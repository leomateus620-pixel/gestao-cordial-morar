import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import type {
  GoogleMarketingOverview,
  GoogleMarketingSort,
  GoogleMetricTotals,
} from "@/lib/marketing/google-overview.types";

type Metric = keyof GoogleMetricTotals | "ctr" | "cpc";
export type CampaignColumn = Metric | "status" | "type";
const metrics: { key: Metric; label: string; money?: boolean; percent?: boolean }[] = [
  { key: "cost", label: "Custo", money: true },
  { key: "clicks", label: "Cliques" },
  { key: "conversions", label: "Conversões" },
  { key: "costPerConversion", label: "Custo / conversão", money: true },
  { key: "impressions", label: "Impressões" },
  { key: "ctr", label: "CTR", percent: true },
  { key: "cpc", label: "CPC médio", money: true },
];
const defaultColumns: CampaignColumn[] = [
  "status",
  "type",
  "cost",
  "impressions",
  "clicks",
  "conversions",
  "costPerConversion",
  "ctr",
  "cpc",
];
const campaignColumns: Array<{ key: CampaignColumn; label: string }> = [
  { key: "status", label: "Status registrado" },
  { key: "type", label: "Tipo" },
  ...[metrics[0], metrics[4], metrics[1], metrics[2], metrics[3], metrics[5], metrics[6]],
];
export function googleColumnPreferenceKey(userId: string, agency: string) {
  return `marketing:google:columns:${encodeURIComponent(userId)}:${agency}`;
}
export function googleColumnsFromPreference(value: unknown): CampaignColumn[] {
  const allowed = new Set(campaignColumns.map((column) => column.key));
  return Array.isArray(value) &&
    value.every((key) => typeof key === "string" && allowed.has(key as CampaignColumn))
    ? [...new Set(value as CampaignColumn[])]
    : [...defaultColumns];
}
export function toggleGoogleColumn(
  current: CampaignColumn[],
  key: CampaignColumn,
  checked: boolean,
): CampaignColumn[] {
  return checked ? [...new Set([...current, key])] : current.filter((column) => column !== key);
}

/** Ratios are derived after aggregation using integer arithmetic, not averages of daily rates. */
export function googleRatio(
  numerator: string | null,
  denominator: string | null,
  scale = 1,
): string | null {
  if (
    !numerator ||
    !denominator ||
    !/^-?\d+(?:\.\d+)?$/.test(numerator) ||
    !/^\d+(?:\.\d+)?$/.test(denominator) ||
    numerator.length > 100 ||
    denominator.length > 100
  )
    return null;
  const parse = (value: string) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
    return {
      value: BigInt(whole + fraction) * (negative ? -1n : 1n),
      scale: 10n ** BigInt(fraction.length),
    };
  };
  const n = parse(numerator),
    d = parse(denominator);
  if (d.value === 0n) return null;
  const raw = n.value * d.scale * BigInt(scale) * 100n;
  const base = d.value * n.scale;
  const abs = raw < 0n ? -raw : raw;
  const rounded = (abs + base / 2n) / base;
  return `${raw < 0n ? "-" : ""}${rounded / 100n}.${String(rounded % 100n).padStart(2, "0")}`;
}

function metricRaw(key: Metric, totals: GoogleMetricTotals): string | null {
  return key === "ctr"
    ? googleRatio(totals.clicks, totals.impressions, 100)
    : key === "cpc"
      ? googleRatio(totals.cost, totals.clicks)
      : totals[key];
}

function metricLabel(
  metric: Metric,
  totals: GoogleMetricTotals,
  currency: string | null,
  coverage: GoogleMarketingOverview["coverage"],
) {
  if (coverage === "unavailable") return "—";
  const definition = metrics.find((item) => item.key === metric)!;
  const value = googleMetricValue(metricRaw(metric, totals), currency, Boolean(definition.money));
  return definition.percent && value !== "—" ? `${value}%` : value;
}

/** Formats serialized decimal values without converting int64 or micros to floats. */
export function googleMetricValue(
  value: string | null,
  currency?: string | null,
  money = false,
): string {
  if (value == null || !/^-?\d+(?:\.\d+)?$/.test(value) || (money && !currency)) return "—";
  const negative = value.startsWith("-");
  let [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  if (money) {
    const cents =
      BigInt(whole) * 100n +
      BigInt((fraction + "00").slice(0, 2)) +
      (Number(fraction[2] ?? "0") >= 5 ? 1n : 0n);
    whole = String(cents / 100n);
    fraction = String(cents % 100n).padStart(2, "0");
  } else fraction = fraction.replace(/0+$/, "");
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (fraction ? `,${fraction}` : "");
  return `${negative ? "−" : ""}${money ? `${currency === "BRL" ? "R$" : currency} ` : ""}${formatted}`;
}

function coverageText(coverage: GoogleMarketingOverview["coverage"]) {
  return coverage === "complete"
    ? "Coleta completa para o período"
    : coverage === "partial"
      ? "Valores observados · cobertura do período não comprovada"
      : "Sem coleta comprovada para o período";
}

const sortOptions: Array<[GoogleMarketingSort, string]> = [
  ["name_asc", "Nome A–Z"],
  ["name_desc", "Nome Z–A"],
  ["status_asc", "Status registrado"],
  ["updated_desc", "Atualização mais recente"],
];

export function GoogleMarketingView({
  data,
  area,
  selectedId,
  onSelect,
  onPage,
  onSort,
  canViewFinancialInsights = false,
  preferenceKey,
}: {
  data: GoogleMarketingOverview;
  area: "overview" | "campaigns";
  selectedId?: string;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
  onSort: (sort: GoogleMarketingSort) => void;
  canViewFinancialInsights?: boolean;
  preferenceKey?: string;
}) {
  const [selectedMetrics, setSelectedMetrics] = useState<Metric[]>([
    "cost",
    "clicks",
    "conversions",
    "costPerConversion",
  ]);
  const campaignButtons = useRef(new Map<string, HTMLButtonElement>());
  const [columnState, setColumnState] = useState<{ key?: string; columns: CampaignColumn[] }>({
    key: preferenceKey,
    columns: defaultColumns,
  });
  const visibleColumns = columnState.key === preferenceKey ? columnState.columns : defaultColumns;
  useEffect(() => {
    if (!preferenceKey) return;
    try {
      const raw = localStorage.getItem(preferenceKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      setColumnState({ key: preferenceKey, columns: googleColumnsFromPreference(parsed) });
    } catch {
      setColumnState({ key: preferenceKey, columns: defaultColumns });
    }
  }, [preferenceKey]);
  function updateColumns(next: CampaignColumn[]) {
    setColumnState({ key: preferenceKey, columns: next });
    if (preferenceKey) {
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(next));
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
    }
  }
  const returnToCampaign = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId && returnToCampaign.current) {
      campaignButtons.current.get(returnToCampaign.current)?.focus({ preventScroll: true });
      returnToCampaign.current = null;
    }
  }, [selectedId]);
  const selected = data.items.find((item) => item.id === selectedId);
  const onlyAccount = data.accounts.length === 1 ? data.accounts[0] : null;
  const dateLabel = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
      : "Não informado";
  let collectedAt = "";
  let collectionZone = data.timezone ?? "UTC";
  if (data.lastCollectedAt && !Number.isNaN(Date.parse(data.lastCollectedAt))) {
    try {
      collectedAt = new Date(data.lastCollectedAt).toLocaleString("pt-BR", {
        timeZone: data.timezone ?? "UTC",
      });
    } catch {
      collectionZone = "UTC";
      collectedAt = new Date(data.lastCollectedAt).toLocaleString("pt-BR", { timeZone: "UTC" });
    }
  }
  const label = metricLabel;
  const metricSorts: Array<[GoogleMarketingSort, string]> = [
    ["clicks_desc", "Mais cliques"],
    ["impressions_desc", "Mais impressões"],
    ["conversions_desc", "Mais conversões"],
    ["ctr_desc", "Maior CTR"],
    ...(canViewFinancialInsights
      ? ([
          ["cost_desc", "Maior custo"],
          ["cpc_desc", "Maior CPC"],
          ["cost_per_conversion_desc", "Maior custo/conversão"],
        ] as Array<[GoogleMarketingSort, string]>)
      : []),
  ];
  if (selectedId) {
    return (
      <section
        className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
        aria-label="Detalhes da campanha Google"
      >
        <nav aria-label="Navegação da campanha" className="text-sm">
          <button
            type="button"
            className="min-h-11 rounded text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onSelect("")}
          >
            Campanhas
          </button>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{selected?.name ?? "Campanha"}</span>
        </nav>
        {selected ? (
          <>
            <div>
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <p className="mt-1 text-sm text-foreground/70">
                {selected.agency === "cordial" ? "Cordial" : "Morar"} · Conta{" "}
                {selected.accountName ? `${selected.accountName} · ` : ""}
                {selected.accountId ?? "não informada"} ·{" "}
                {selected.currency ?? "moeda não informada"} ·{" "}
                {selected.timezone ?? "fuso não informado"}
              </p>
            </div>
            <p className="text-sm text-foreground/70">{coverageText(selected.coverage)}</p>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-sm text-foreground/70">Status registrado</dt>
                <dd className="font-medium">{selected.status || "Não disponível"}</dd>
              </div>
              <div>
                <dt className="text-sm text-foreground/70">Tipo de campanha</dt>
                <dd className="font-medium">{selected.channelType ?? "Não disponível"}</dd>
              </div>
              <div>
                <dt className="text-sm text-foreground/70">Início</dt>
                <dd className="font-medium">{dateLabel(selected.dataInicio)}</dd>
              </div>
              <div>
                <dt className="text-sm text-foreground/70">Término</dt>
                <dd className="font-medium">
                  {selected.dataFim === "2037-12-30"
                    ? "Sem data de término"
                    : dateLabel(selected.dataFim)}
                </dd>
              </div>
              {metrics.slice(0, 4).map((metric) => (
                <div key={metric.key}>
                  <dt className="text-sm text-foreground/70">{metric.label}</dt>
                  <dd className="font-medium tabular-nums">
                    {label(metric.key, selected.metrics, selected.currency, selected.coverage)}
                  </dd>
                </div>
              ))}
            </dl>
            <GoogleTrend
              data={selected.dailySeries}
              scope={data.scope}
              coverage={selected.coverage}
              currency={selected.currency}
            />
            <p className="text-sm text-foreground/70">
              O status nativo Google não foi comprovado. Grupos, anúncios, palavras-chave e assets
              ainda não estão disponíveis para este recorte.
            </p>
          </>
        ) : (
          <p className="text-sm text-foreground/70">
            A campanha não está nesta página ou não está disponível neste escopo.
          </p>
        )}
      </section>
    );
  }
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-foreground/70">
        <span>{coverageText(data.coverage)}</span>
        <span>
          {data.currency ?? "Moeda não informada"} · {data.timezone ?? "Fuso não informado"}
          {collectedAt ? ` · Última coleta ${collectedAt} (${collectionZone})` : ""}
        </span>
      </div>
      <p className="text-sm text-foreground/70">
        {data.scope.agency
          ? data.scope.agency === "cordial"
            ? "Cordial"
            : "Morar"
          : "Todas as imobiliárias"}{" "}
        ·{" "}
        {data.scope.accountId
          ? `Conta ${data.accountName ? `${data.accountName} · ` : ""}${data.scope.accountId}`
          : onlyAccount
            ? `Conta ${onlyAccount.name ? `${onlyAccount.name} · ` : ""}${onlyAccount.id} (${onlyAccount.agency})`
            : "Todas as contas"}{" "}
        · {data.scope.since} a {data.scope.until}
      </p>
      {area === "overview" && (
        <>
          <section
            aria-label="Indicadores Google Ads"
            className="grid grid-cols-2 gap-2 lg:grid-cols-4"
          >
            {selectedMetrics.map((key, index) => {
              const metric = metrics.find((item) => item.key === key)!;
              return (
                <div key={index} className="min-w-0 rounded-xl border bg-card p-4">
                  <label className="block text-sm text-foreground/70">
                    <span className="sr-only">Indicador {index + 1}</span>
                    <select
                      aria-label={`Indicador ${index + 1}`}
                      value={key}
                      onChange={(event) =>
                        setSelectedMetrics((current) =>
                          current.map((item, i) =>
                            i === index ? (event.target.value as Metric) : item,
                          ),
                        )
                      }
                      className="min-h-11 max-w-full bg-transparent font-medium"
                    >
                      <option value={key}>{metric.label}</option>
                      {metrics
                        .filter((item) => item.key !== key && !selectedMetrics.includes(item.key))
                        .map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">
                    {label(metric.key, data.summary, data.currency, data.coverage)}
                  </p>
                </div>
              );
            })}
          </section>
          <GoogleTrend
            data={data.series}
            scope={data.scope}
            coverage={data.coverage}
            currency={data.currency}
          />
        </>
      )}
      <section
        className="min-w-0 rounded-xl border bg-card p-4"
        aria-labelledby="google-campaigns-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="google-campaigns-title" className="text-base font-semibold">
              Campanhas
            </h2>
            <p className="text-sm text-foreground/70">{data.total} no escopo selecionado</p>
            <p className="text-sm text-foreground/70">
              Status registrado no Gestão; status nativo Google ainda não comprovado.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            Ordenar
            <select
              className="min-h-11 rounded-lg border bg-card px-3"
              value={data.sort}
              onChange={(event) => onSort(event.target.value as GoogleMarketingSort)}
            >
              {[
                ...sortOptions,
                ...(data.scope.agency && data.scope.accountId ? metricSorts : []),
              ].map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <details className="relative text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border bg-card px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Colunas
            </summary>
            <div className="absolute left-0 z-20 mt-1 max-h-[70vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg sm:left-auto sm:right-0">
              <fieldset className="space-y-1">
                <legend className="mb-2 font-semibold">Colunas da tabela</legend>
                {campaignColumns.map((column) => (
                  <label
                    key={column.key}
                    className="flex min-h-10 cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column.key)}
                      onChange={(event) =>
                        updateColumns(
                          toggleGoogleColumn(visibleColumns, column.key, event.target.checked),
                        )
                      }
                    />
                    <span>{column.label}</span>
                  </label>
                ))}
              </fieldset>
              <Button
                variant="outline"
                className="mt-2 min-h-11 w-full"
                onClick={() => updateColumns(defaultColumns)}
              >
                Restaurar padrão
              </Button>
            </div>
          </details>
        </div>
        {data.items.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Campanhas Google Ads no escopo selecionado</caption>
              <thead className="border-b text-left text-foreground/70">
                <tr>
                  <th className="p-3">Campanha</th>
                  {campaignColumns
                    .filter((column) => visibleColumns.includes(column.key))
                    .map((column) => (
                      <th
                        key={column.key}
                        className={
                          column.key === "status" || column.key === "type"
                            ? "p-3"
                            : "p-3 text-right"
                        }
                      >
                        {column.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((campaign) => (
                  <tr key={campaign.id} className="border-b last:border-0">
                    <td className="p-3">
                      <button
                        type="button"
                        ref={(element) => {
                          if (element) campaignButtons.current.set(campaign.id, element);
                          else campaignButtons.current.delete(campaign.id);
                        }}
                        onClick={() => {
                          returnToCampaign.current = campaign.id;
                          onSelect(campaign.id);
                        }}
                        className="min-h-11 rounded text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {campaign.name}
                      </button>
                      <span className="block text-xs text-foreground/70">
                        {campaign.agency} ·{" "}
                        {campaign.accountName ? `${campaign.accountName} · ` : ""}
                        {campaign.accountId ?? "Conta não informada"}
                      </span>
                      <span className="block text-xs text-foreground/70">
                        {coverageText(campaign.coverage)}
                      </span>
                    </td>
                    {campaignColumns
                      .filter((column) => visibleColumns.includes(column.key))
                      .map((column) => (
                        <td
                          key={column.key}
                          className={
                            column.key === "status" || column.key === "type"
                              ? "p-3"
                              : "p-3 text-right tabular-nums"
                          }
                        >
                          {column.key === "status"
                            ? campaign.status || "Não disponível"
                            : column.key === "type"
                              ? (campaign.channelType ?? "Não disponível")
                              : label(
                                  column.key,
                                  campaign.metrics,
                                  campaign.currency,
                                  campaign.coverage,
                                )}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-foreground/70">
            Nenhuma campanha encontrada neste escopo.
          </p>
        )}
        {data.total > data.pageSize && (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span>Página {data.page}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={data.page <= 1}
                onClick={() => onPage(data.page - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => onPage(data.page + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const blankTotals: GoogleMetricTotals = {
  cost: null,
  impressions: null,
  clicks: null,
  conversions: null,
  ctr: null,
  cpc: null,
  costPerConversion: null,
};
type Bucket = "day" | "week" | "month";
function sumDecimals(values: Array<string | null>): string | null {
  if (
    values.some((value) => value === null || !/^-?\d+(?:\.\d+)?$/.test(value) || value.length > 100)
  )
    return null;
  const decimals = values as string[];
  const precision = Math.max(0, ...decimals.map((value) => (value.split(".")[1] ?? "").length));
  const total = decimals.reduce((sum, value) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
    return sum + BigInt(whole + fraction.padEnd(precision, "0")) * (negative ? -1n : 1n);
  }, 0n);
  const base = 10n ** BigInt(precision),
    magnitude = total < 0n ? -total : total;
  return `${total < 0n ? "-" : ""}${magnitude / base}${precision ? `.${String(magnitude % base).padStart(precision, "0")}` : ""}`;
}

export function googleTrendBuckets(
  data: GoogleMarketingOverview["series"],
  since: string,
  until: string,
  grain: Bucket,
) {
  if (!data) return null;
  const start = Date.parse(`${since}T00:00:00Z`),
    end = Date.parse(`${until}T00:00:00Z`);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > 366 * 86400000
  )
    return null;
  const source = new Map(data.map((point) => [point.date, point.metrics]));
  const buckets = new Map<string, GoogleMetricTotals[]>();
  for (let time = start; time <= end; time += 86400000) {
    const day = new Date(time),
      date = day.toISOString().slice(0, 10);
    const key =
      grain === "day"
        ? date
        : grain === "month"
          ? date.slice(0, 7)
          : new Date(time - ((day.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const list = buckets.get(key) ?? [];
    list.push(source.get(date) ?? blankTotals);
    buckets.set(key, list);
  }
  return [...buckets].map(([date, rows]) => {
    const cost = sumDecimals(rows.map((row) => row.cost)),
      clicks = sumDecimals(rows.map((row) => row.clicks)),
      impressions = sumDecimals(rows.map((row) => row.impressions)),
      conversions = sumDecimals(rows.map((row) => row.conversions));
    return {
      date,
      metrics: {
        cost,
        clicks,
        impressions,
        conversions,
        ctr: googleRatio(clicks, impressions, 100),
        cpc: googleRatio(cost, clicks),
        costPerConversion: googleRatio(cost, conversions),
      },
    };
  });
}

function GoogleTrend({
  data,
  scope,
  coverage,
  currency,
}: {
  data: GoogleMarketingOverview["series"];
  scope: GoogleMarketingOverview["scope"];
  coverage: GoogleMarketingOverview["coverage"];
  currency: string | null;
}) {
  const [first, setFirst] = useState<Metric>("clicks"),
    [second, setSecond] = useState<Metric | "none">("none"),
    [grain, setGrain] = useState<Bucket>("day");
  const firstDef = metrics.find((metric) => metric.key === first)!;
  const secondDef = metrics.find((metric) => metric.key === second);
  const buckets = googleTrendBuckets(data, scope.since, scope.until, grain);
  const series = buckets?.map((point) => {
    const one = firstDef.money && !currency ? null : metricRaw(first, point.metrics),
      two =
        second === "none" || (secondDef?.money && !currency)
          ? null
          : metricRaw(second, point.metrics);
    return {
      ...point,
      one: one === null ? null : Number(one),
      two: two === null ? null : Number(two),
    };
  });
  const safe =
    coverage !== "unavailable" &&
    series?.some((point) => point.one !== null || point.two !== null) &&
    series.every((point) =>
      [point.one, point.two].every(
        (value) =>
          value === null || (Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER),
      ),
    );
  return (
    <section className="min-w-0 rounded-xl border bg-card p-4" aria-label="Evolução Google Ads">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Evolução</h2>
        <div className="flex flex-wrap gap-2">
          <label className="text-sm">
            Primeira métrica
            <select
              className="ml-2 min-h-11 max-w-full rounded-lg border bg-card px-2"
              value={first}
              onChange={(event) => {
                const value = event.target.value as Metric;
                setFirst(value);
                if (second === value) setSecond("none");
              }}
            >
              {metrics.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Segunda métrica
            <select
              className="ml-2 min-h-11 max-w-full rounded-lg border bg-card px-2"
              value={second}
              onChange={(event) => setSecond(event.target.value as Metric | "none")}
            >
              <option value="none">Nenhuma</option>
              {metrics
                .filter((metric) => metric.key !== first)
                .map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            Agrupar
            <select
              className="ml-2 min-h-11 rounded-lg border bg-card px-2"
              value={grain}
              onChange={(event) => setGrain(event.target.value as Bucket)}
            >
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              <option value="month">Mês</option>
            </select>
          </label>
        </div>
      </div>
      <p className="mt-2 text-sm text-foreground/70">
        Eixo esquerdo: {firstDef.label}
        {secondDef ? ` · Eixo direito: ${secondDef.label}` : ""}. Datas sem coleta mantêm lacunas;
        períodos com lacunas não são somados.
      </p>
      <p className="mt-1 text-sm text-foreground/70">
        Comparação com período anterior indisponível enquanto a cobertura não for comprovada.
      </p>
      {safe && series ? (
        <>
          <div className="mt-4 h-56 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                {secondDef && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />}
                <Tooltip
                  content={({ active, payload, label }) => {
                    const point = payload?.[0]?.payload as
                      | { metrics?: GoogleMetricTotals }
                      | undefined;
                    return active && point?.metrics ? (
                      <div className="rounded-lg border bg-card p-2 text-sm shadow-sm">
                        <p>{label}</p>
                        <p>
                          {firstDef.label}: {metricLabel(first, point.metrics, currency, coverage)}
                        </p>
                        {secondDef && second !== "none" && (
                          <p>
                            {secondDef.label}:{" "}
                            {metricLabel(second, point.metrics, currency, coverage)}
                          </p>
                        )}
                      </div>
                    ) : null;
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="one"
                  name={firstDef.label}
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {secondDef && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="two"
                    name={secondDef.label}
                    stroke="#a85527"
                    strokeDasharray="6 3"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-sm">
            <summary className="min-h-11 cursor-pointer font-medium">
              Ver dados da evolução em tabela
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <caption className="sr-only">Valores da evolução</caption>
                <thead>
                  <tr>
                    <th className="p-2">Período</th>
                    <th className="p-2 text-right">{firstDef.label}</th>
                    {secondDef && <th className="p-2 text-right">{secondDef.label}</th>}
                  </tr>
                </thead>
                <tbody>
                  {series.map((point) => (
                    <tr key={point.date}>
                      <td className="p-2">{point.date}</td>
                      <td className="p-2 text-right tabular-nums">
                        {metricLabel(first, point.metrics, currency, coverage)}
                      </td>
                      {secondDef && second !== "none" && (
                        <td className="p-2 text-right tabular-nums">
                          {metricLabel(second, point.metrics, currency, coverage)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="mt-5 text-sm text-foreground/70">
          Evolução indisponível para o escopo selecionado.
        </p>
      )}
    </section>
  );
}
