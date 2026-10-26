import { z } from "zod";
import { canSeeFinancialValues, effectiveRole, AgentAccessError } from "../security";
import { previousMonth, saoPauloDay } from "./common";
import { result, type AgentTool } from "./types";
type SafeMetric = {
  data: string;
  leads: number;
  clicks: number;
  views: number;
  impressions: number;
  spend?: number | null;
  investimento?: number | null;
};
type SafeCampaign = {
  id: string;
  nome: string;
  imobiliaria: string;
  platform: string | null;
  canal: string;
  status: string;
  sync_status: string | null;
  currency: string | null;
  daily_metrics: SafeMetric[];
};
type SafeSummary = {
  spend: number | null;
  leads: number;
  clicks: number;
  impressions: number;
  currencies: Array<string | null>;
  has_data: boolean;
};
type SafePage = {
  items?: SafeCampaign[];
  total?: number;
  financial_visible?: boolean;
  summary?: { current: SafeSummary; previous: SafeSummary };
};
type Totals = {
  leads: number;
  clicks: number;
  views: number | null;
  impressions: number;
  investment: number | null;
};
export default {
  name: "marketing_performance",
  title: "Desempenho de marketing",
  description:
    "Resultados persistidos das campanhas permitidas. Investimento e CPL somente para o administrador.",
  roles: ["admin", "secretaria"],
  inputSchema: z.object({ imobiliaria: z.enum(["cordial", "morar"]).optional() }).strict(),
  async handler({ imobiliaria }, ctx) {
    const role = effectiveRole(ctx);
    if (role !== "admin" && role !== "secretaria") throw new AgentAccessError();
    const isAdmin = role === "admin";
    const financial = isAdmin && canSeeFinancialValues(ctx);
    const agencies = [
      ...new Set(ctx.agencies.filter((agency) => agency === "cordial" || agency === "morar")),
    ];
    if (!isAdmin && (!agencies.length || (imobiliaria && !agencies.includes(imobiliaria))))
      throw new AgentAccessError();
    const today = saoPauloDay(),
      mesAtual = today.slice(0, 7),
      mesAnterior = previousMonth();
    const [year, month] = mesAnterior.split("-").map(Number);
    const previousUntil = `${mesAnterior}-${String(Math.min(Number(today.slice(-2)), new Date(Date.UTC(year, month, 0)).getUTCDate())).padStart(2, "0")}`;
    ctx.signal?.throwIfAborted();
    // Each requested agency comes from the caller's server-loaded scope. The
    // narrowing flag preserves the Bot's existing campaign AND metric ownership.
    const scopes: Array<string | null> = isAdmin
      ? [imobiliaria ?? null]
      : imobiliaria
        ? [imobiliaria]
        : agencies;
    const pages = await Promise.all(
      scopes.map(async (agency): Promise<SafePage> => {
        const { data: raw, error } = await ctx.supabase.rpc("marketing_campaigns_safe", {
          p_imobiliaria: agency,
          p_since: `${mesAnterior}-01`,
          p_until: today,
          p_current_since: `${mesAtual}-01`,
          p_previous_until: previousUntil,
          p_page: 1,
          p_page_size: 100,
          p_owned_only: !isAdmin,
        });
        if (error)
          throw new Error("Não foi possível consultar os resultados de marketing permitidos.");
        return raw as unknown as SafePage;
      }),
    );
    ctx.signal?.throwIfAborted();
    function mergeSummaries(period: "current" | "previous"): SafeSummary | undefined {
      const summaries = pages.map((page) => page.summary?.[period]);
      if (summaries.some((summary) => !summary)) return undefined;
      const values = summaries as SafeSummary[];
      const currencies = [...new Set(values.flatMap((summary) => summary.currencies))];
      return {
        leads: values.reduce((sum, summary) => sum + summary.leads, 0),
        clicks: values.reduce((sum, summary) => sum + summary.clicks, 0),
        impressions: values.reduce((sum, summary) => sum + summary.impressions, 0),
        spend:
          currencies.length === 1 && values.every((summary) => summary.spend !== null)
            ? values.reduce((sum, summary) => sum + summary.spend!, 0)
            : null,
        currencies,
        has_data: values.some((summary) => summary.has_data),
      };
    }
    const currentSummary = mergeSummaries("current"),
      previousSummary = mergeSummaries("previous");
    const page: SafePage = {
      items: pages.flatMap((entry) => entry.items ?? []).slice(0, 100),
      total: pages.reduce((sum, entry) => sum + (entry.total ?? entry.items?.length ?? 0), 0),
      financial_visible: pages.every((entry) => entry.financial_visible === true),
      ...(currentSummary && previousSummary
        ? { summary: { current: currentSummary, previous: previousSummary } }
        : {}),
    };
    const allowedFinancial = financial && page.financial_visible === true;
    const empty = (): Totals => ({ leads: 0, clicks: 0, views: 0, impressions: 0, investment: 0 });
    const rates = (m: Totals) => ({
      leads: m.leads,
      clicks: m.clicks,
      views: m.views,
      impressions: m.impressions,
      ctr: m.impressions > 0 ? Math.round((m.clicks / m.impressions) * 10000) / 100 : null,
      ...(allowedFinancial
        ? {
            investimento: m.investment,
            cpl:
              m.investment !== null && m.leads > 0
                ? Math.round((m.investment / m.leads) * 100) / 100
                : null,
          }
        : {}),
    });
    const totals = { atual: empty(), anterior: empty() };
    const list = (page.items ?? []).map((c) => {
      const values = { atual: empty(), anterior: empty() };
      for (const metric of c.daily_metrics ?? []) {
        const b = String(metric.data).startsWith(mesAtual) ? "atual" : "anterior";
        if (b === "anterior" && String(metric.data) > previousUntil) continue;
        for (const key of ["leads", "clicks", "views", "impressions"] as const) {
          const value = Number(metric[key] ?? 0);
          values[b][key] = (values[b][key] ?? 0) + value;
          totals[b][key] = (totals[b][key] ?? 0) + value;
        }
        if (allowedFinancial) {
          const spend = Number(metric.spend ?? metric.investimento ?? 0);
          values[b].investment = (values[b].investment ?? 0) + spend;
          totals[b].investment = (totals[b].investment ?? 0) + spend;
        }
      }
      return {
        id: c.id,
        nome: c.nome,
        imobiliaria: c.imobiliaria,
        plataforma: c.platform ?? c.canal,
        status: c.status,
        sincronizacao: c.sync_status ?? "manual",
        moeda: c.currency ?? (c.platform ? null : "BRL"),
        mesAtual: rates(values.atual),
        mesAnterior: rates(values.anterior),
        href: "/marketing",
      };
    });
    function summaryTotals(summary: SafeSummary | undefined, fallback: Totals) {
      if (!summary) return rates(fallback);
      return {
        ...rates({
          leads: summary.leads,
          clicks: summary.clicks,
          impressions: summary.impressions,
          investment: summary.spend ?? null,
          views: null,
        }),
        ...(allowedFinancial ? { moedas: summary.currencies ?? [] } : {}),
        dadosDisponiveis: summary.has_data === true,
      };
    }
    const current = summaryTotals(page.summary?.current, totals.atual),
      previous = summaryTotals(page.summary?.previous, totals.anterior);
    return result(
      `${page.total ?? list.length} campanha(s); ${current.leads} leads reportados no mês atual até ${today}.`,
      {
        total: list.length,
        totalCampanhas: page.total ?? list.length,
        limited: (page.total ?? 0) > list.length,
        mesAtual,
        mesAnterior,
        periodoAtual: { inicio: `${mesAtual}-01`, fim: today },
        periodoAnterior: { inicio: `${mesAnterior}-01`, fim: previousUntil },
        totais: { mesAtual: current, mesAnterior: previous },
        campanhas: list,
        href: "/marketing",
      },
    );
  },
} satisfies AgentTool;
