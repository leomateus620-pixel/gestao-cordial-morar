import { useEffect, useRef, useState } from "react";
import {
  Wallet,
  MousePointer2,
  Goal,
  BadgeDollarSign,
  Eye,
  Percent,
  Coins,
  ArrowLeft,
} from "lucide-react";
import type {
  GoogleMarketingOverview,
  GoogleMarketingSort,
} from "@/lib/marketing/google-overview.types";
import { GoogleSelect, GoogleDataInfo } from "./GoogleAdsPrimitives";
import { GoogleCampaignTable } from "./GoogleCampaignTable";
import { GoogleTrend } from "./GoogleTrend";
import { metrics, googleMetricLabel, type Metric } from "./google-metrics";
import "./google-ads.css";
const icons = {
  cost: Wallet,
  clicks: MousePointer2,
  conversions: Goal,
  costPerConversion: BadgeDollarSign,
  impressions: Eye,
  ctr: Percent,
  cpc: Coins,
};

export function GoogleMarketingView({
  data,
  area,
  selectedId,
  onSelect,
  onPage,
  onSort,
  canViewFinancialInsights = false,
  preferenceKey,
  isRefreshing = false,
}: {
  data: GoogleMarketingOverview;
  area: "overview" | "campaigns";
  selectedId?: string;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
  onSort: (sort: GoogleMarketingSort) => void;
  canViewFinancialInsights?: boolean;
  preferenceKey?: string;
  isRefreshing?: boolean;
}) {
  const [selectedMetrics, setSelectedMetrics] = useState<Metric[]>([
    "cost",
    "clicks",
    "conversions",
    "costPerConversion",
  ]);
  const campaignButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnToCampaign = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId && returnToCampaign.current) {
      campaignButtons.current.get(returnToCampaign.current)?.focus({ preventScroll: true });
      returnToCampaign.current = null;
    }
  }, [selectedId]);
  const selected = data.items.find((item) => item.id === selectedId);
  const dateLabel = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
      : "Não informado";
  if (selectedId)
    return (
      <section className="gads-root gads-detail" aria-label="Detalhes da campanha Google">
        <nav aria-label="Navegação da campanha">
          <button type="button" className="gads-text-button" onClick={() => onSelect("")}>
            <ArrowLeft size={15} aria-hidden="true" />
            Campanhas
          </button>
        </nav>
        {selected ? (
          <>
            <header className="gads-detail-heading">
              <h2>{selected.name}</h2>
              <p>
                {selected.accountName ?? "Conta"} · {selected.accountId ?? "Não informada"}
              </p>
            </header>
            <GoogleDataInfo
              data={{
                ...data,
                coverage: selected.coverage,
                currency: selected.currency,
                timezone: selected.timezone,
                lastCollectedAt: selected.lastCollectedAt,
              }}
            />
            <dl className="gads-detail-facts">
              <div>
                <dt>Status registrado no Gestão</dt>
                <dd>{selected.status || "Não disponível"}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{selected.channelType ?? "Não disponível"}</dd>
              </div>
              <div>
                <dt>Início</dt>
                <dd>{dateLabel(selected.dataInicio)}</dd>
              </div>
              <div>
                <dt>Término</dt>
                <dd>
                  {selected.dataFim === "2037-12-30"
                    ? "Sem data de término"
                    : dateLabel(selected.dataFim)}
                </dd>
              </div>
              {metrics.slice(0, 4).map((metric) => (
                <div key={metric.key}>
                  <dt>{metric.label}</dt>
                  <dd>
                    {googleMetricLabel(
                      metric.key,
                      selected.metrics,
                      selected.currency,
                      selected.coverage,
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <GoogleTrend
              data={selected.dailySeries}
              scope={data.scope}
              coverage={selected.coverage}
              currency={selected.currency}
              timezone={selected.timezone}
            />
          </>
        ) : (
          <p className="gads-empty">
            A campanha não está nesta página ou não está disponível neste escopo.
          </p>
        )}
      </section>
    );
  return (
    <div className="gads-root">
      <GoogleDataInfo data={data} isRefreshing={isRefreshing} />
      {area === "overview" && (
        <>
          <section aria-label="Indicadores Google Ads" className="gads-kpis">
            {selectedMetrics.map((key, index) => {
              const Icon = icons[key];
              return (
                <article className="gads-surface gads-kpi" key={index}>
                  <div className="gads-kpi-top">
                    <span className="gads-kpi-icon" data-metric={key}>
                      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <GoogleSelect
                      label={`Indicador ${index + 1}`}
                      value={key}
                      className="gads-kpi-select"
                      onValueChange={(value) =>
                        setSelectedMetrics((current) =>
                          current.map((item, i) => (i === index ? (value as Metric) : item)),
                        )
                      }
                      options={metrics
                        .filter((item) => item.key === key || !selectedMetrics.includes(item.key))
                        .map((item) => ({ value: item.key, label: item.label }))}
                    />
                  </div>
                  <p className="gads-kpi-value">
                    {googleMetricLabel(key, data.summary, data.currency, data.coverage)}
                  </p>
                </article>
              );
            })}
          </section>
          <GoogleTrend
            data={data.series}
            scope={data.scope}
            coverage={data.coverage}
            currency={data.currency}
            timezone={data.timezone}
          />
        </>
      )}
      <GoogleCampaignTable
        data={data}
        onSelect={(id) => {
          returnToCampaign.current = id;
          onSelect(id);
        }}
        onPage={onPage}
        onSort={onSort}
        canViewFinancialInsights={canViewFinancialInsights}
        preferenceKey={preferenceKey}
        campaignButtons={campaignButtons}
      />
    </div>
  );
}
