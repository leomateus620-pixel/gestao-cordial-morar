import { z } from "zod";
import { campaignStats, dailyTrend, periodKpis } from "@/services/marketing-insights";
import { marketingCampaignDto, type CampaignRow } from "./marketing.dto";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const parsed = new Date(`${d}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  }, "Data inválida.");
export const reportScopeSchema = z.object({
  imobiliaria: z.enum(["cordial", "morar"]),
  type: z.enum(["executive", "detailed", "funnel"]),
  filters: z
    .object({
      since: date,
      until: date,
      accountId: z
        .string()
        .regex(/^(act_)?\d{1,80}$/)
        .nullish(),
      platform: z.enum(["meta", "google", "manual"]).nullish(),
      status: z.string().max(40).nullish(),
      search: z.string().max(100).optional(),
    })
    .refine(
      (v) => v.until >= v.since && Date.parse(v.until) - Date.parse(v.since) <= 366 * 86400000,
      "Selecione até 367 dias, em ordem cronológica.",
    ),
});
export type MarketingReportScope = z.input<typeof reportScopeSchema>;
export type ReportSource = {
  items: CampaignRow[];
  total: number;
  financial_visible: boolean;
  captured_at: string;
  funnel: { submissions: number; attendances: number; linkedSubmissions: number };
};
/** Pure, shared dashboard/PDF math. No contacts, notes, owners or raw Graph responses. */
export function buildMarketingReport(scope: MarketingReportScope, source: ReportSource) {
  const campaigns = source.items.map((c) => marketingCampaignDto(c, source.financial_visible));
  const range = { since: scope.filters.since, until: scope.filters.until };
  const stats = campaigns.map((c) => campaignStats(c, range.since.slice(0, 7), range));
  const rows = stats.map((s) => ({
    id: s.campaign.id,
    name: s.campaign.name,
    platform: s.campaign.platform ?? "manual",
    status: s.campaign.status,
    currency: s.currency,
    timezone: s.campaign.accountTimezone,
    accountId: s.campaign.externalAccountId ?? null,
    spend: s.spend,
    leads: s.hasData ? s.leads : null,
    clicks: s.hasData ? s.clicks : null,
    impressions: s.hasData ? s.impressions : null,
    ctr: s.hasData ? s.ctr : null,
    cpl: s.cpl,
    reach: s.reach,
    frequency: s.frequency,
    updatedAt: s.campaign.lastSyncedAt,
    coverage:
      s.campaign.syncStatus === "error"
        ? "error"
        : s.campaign.syncStatus === "partial"
          ? "partial"
          : s.campaign.dailyMetrics.some((d) => d.date >= range.since && d.date <= range.until)
            ? "data"
            : s.campaign.periodAggregate?.since === range.since &&
                s.campaign.periodAggregate.until === range.until
              ? s.campaign.periodAggregate.has_data === false && !s.campaign.periodAggregate.reach
                ? "empty"
                : "partial"
              : "pending",
  }));
  const coverage = Object.fromEntries(
    ["data", "empty", "pending", "partial", "error"].map((key) => [
      key,
      rows.filter((r) => r.coverage === key).length,
    ]),
  );
  return {
    version: 1 as const,
    scope,
    capturedAt: source.captured_at,
    financialVisible: source.financial_visible,
    total: source.total,
    rows,
    kpis: periodKpis(stats),
    trend: dailyTrend(campaigns, range.since.slice(0, 7), range),
    funnel: source.funnel,
    coverage,
    timezones: [...new Set(rows.map((r) => r.timezone).filter(Boolean))] as string[],
    definitions: [
      "Cliques: todos os cliques reportados; não equivalem a cliques no link.",
      "Leads Meta: uma família de ação por linha, sem somar aliases sobrepostos. Atribuição: configuração unificada solicitada; janela efetiva não verificada.",
      "Alcance e frequência só aparecem com agregado exato do período; nunca são somados entre dias ou campanhas.",
      "Submissões recebidas e atendimentos únicos são registros internos do CRM, não conversões atribuídas pela Meta.",
      "Sem coleta comprovada não significa zero. Valores de moedas diferentes não são somados.",
      "Cobertura vazia exige consulta completa no mesmo período. O fuso é o da conta; datas não são convertidas pelo navegador.",
    ],
  };
}
export type MarketingReportSnapshot = ReturnType<typeof buildMarketingReport>;
