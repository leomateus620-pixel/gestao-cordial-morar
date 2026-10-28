import {
  entityInsightTotals,
  type EntityInsightRow,
  type InsightLevel,
  type InsightGrain,
  type InsightBreakdown,
} from "./entity-insights.model";
import type { MarketingReportDocument } from "@/lib/marketing/report-document";

export type EntityReportSource = {
  jobId: string;
  campaignId: string;
  imobiliaria: "cordial" | "morar";
  accountId: string;
  level: InsightLevel;
  grain: InsightGrain;
  breakdown: InsightBreakdown;
  since: string;
  until: string;
  completedAt: string;
  capturedAt: string;
  currency: string;
  timezone: string;
  apiVersion: string;
  attributionRequested: Record<string, string | boolean>;
  financialVisible: boolean;
  rows: EntityInsightRow[];
  total: number;
};
const entityNames = { campaign: "Campanha", adset: "Conjunto", ad: "Anúncio" };
const canonical = (value: string) =>
  value
    .replace(/^0+(?=\d)/, "")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
/** Refuse a lossy PDF representation; original decimal strings remain in the Insights snapshot. */
export function reportNumber(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > Number.MAX_SAFE_INTEGER ||
    canonical(String(number)) !== canonical(value)
  )
    throw new Error("Precisão do valor excede o formato deste relatório.");
  return number;
}
export function buildEntityReport(source: EntityReportSource): MarketingReportDocument {
  if (source.total !== source.rows.length || source.total > 5000)
    throw new Error("Snapshot incompleto ou acima do limite de 5.000 registros.");
  // Mask again at the document boundary, even if a caller accidentally supplies a financial value.
  const metrics = source.rows.map((r) => ({
    ...r,
    spend: source.financialVisible ? r.spend : null,
  }));
  const total = entityInsightTotals(metrics, source.currency);
  const rows = metrics.map((r, index) => {
    const stats = entityInsightTotals([r], source.currency);
    const slice = [source.grain === "daily" ? r.dateStart : null, r.breakdown.publisher_platform]
      .filter(Boolean)
      .join(" · ");
    return {
      id: `${source.jobId}:${index}`,
      name: `${entityNames[source.level]} ${r.entityId}${slice ? ` · ${slice}` : ""}`,
      platform: "meta",
      status: "Snapshot concluído",
      currency: source.currency,
      timezone: source.timezone,
      accountId: r.accountId,
      spend: reportNumber(stats.spend),
      leads: reportNumber(stats.leads),
      clicks: reportNumber(stats.clicks),
      impressions: reportNumber(stats.impressions),
      ctr: stats.ctr,
      cpl: stats.cpl,
      reach: reportNumber(stats.reach),
      frequency: reportNumber(stats.frequency),
      updatedAt: source.completedAt,
      coverage: "data",
    };
  });
  const days = [...new Set(metrics.map((r) => r.dateStart))].sort();
  const attribution = [...new Set(metrics.map((r) => r.attribution).filter(Boolean))];
  return {
    version: 1,
    scope: {
      imobiliaria: source.imobiliaria,
      type: "detailed",
      filters: {
        since: source.since,
        until: source.until,
        accountId: source.accountId,
        platform: "meta",
      },
    },
    capturedAt: source.capturedAt,
    financialVisible: source.financialVisible,
    total: rows.length,
    rows,
    kpis: {
      spend: reportNumber(total.spend),
      leads: reportNumber(total.leads),
      clicks: reportNumber(total.clicks),
      impressions: reportNumber(total.impressions),
      ctr: total.ctr,
      cpl: total.cpl,
      cpc: total.cpc,
      cpm: total.cpm,
      reach: reportNumber(total.reach),
      frequency: reportNumber(total.frequency),
      activeCampaigns: 0,
      currency: source.currency,
      mixedCurrencies: false,
      hasData: rows.length > 0,
    },
    trend:
      source.grain === "daily"
        ? days.map((date) => {
            const stats = entityInsightTotals(
              metrics.filter((r) => r.dateStart === date),
              source.currency,
            );
            return {
              date,
              label: `${date.slice(8)}/${date.slice(5, 7)}`,
              spend: reportNumber(stats.spend),
              leads: reportNumber(stats.leads),
              clicks: reportNumber(stats.clicks),
              cpl: stats.cpl,
              ctr: stats.ctr,
            };
          })
        : [],
    funnel: { submissions: 0, attendances: 0, linkedSubmissions: 0 },
    coverage: { data: rows.length, empty: rows.length ? 0 : 1, pending: 0, partial: 0, error: 0 },
    timezones: [source.timezone],
    entity: {
      snapshotJobId: source.jobId,
      campaignId: source.campaignId,
      level: source.level,
      grain: source.grain,
      breakdown: source.breakdown,
      apiVersion: source.apiVersion,
      completedAt: source.completedAt,
    },
    definitions: [
      "Cliques: todos os cliques reportados. CTR, CPC, CPM e CPL usam totais compatíveis; nunca a média de taxas das linhas.",
      "Leads Meta: uma família por linha. Famílias incompatíveis ou ausentes impedem total/CPL; submissões e atendimentos do CRM não integram este relatório.",
      "Alcance e frequência não são somados. Só aparecem no agregado exato da entidade/período, quando retornados pela Meta.",
      `Grão: ${source.grain === "daily" ? "diário" : "período completo"}; quebra: ${source.breakdown === "none" ? "nenhuma" : "plataforma de publicação"}. Fonte: Graph ${source.apiVersion}.`,
      `Atribuição efetiva: ${attribution.length === 1 && metrics.every((r) => r.attribution) ? attribution[0] : "não verificada ou variável entre entidades"}. Configuração unificada e data da impressão solicitadas.`,
      "Ausência permanece n/d. Coleta vazia não comprova ausência de entrega. Arquivo contém todo o snapshot autorizado, limitado a 5.000 registros.",
    ],
  };
}
