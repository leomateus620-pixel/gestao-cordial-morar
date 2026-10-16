import { z } from "zod";
import { canSeeFinancialValues, effectiveRole, scopeAgency } from "../security";
import { previousMonth, rows, saoPauloDay } from "./common";
import { result, type AgentTool } from "./types";
export default {
  name: "marketing_performance",
  title: "Desempenho de marketing",
  description:
    "Resultados das campanhas permitidas. Investimento e CPL somente para o administrador.",
  roles: ["admin", "secretaria"],
  inputSchema: z.object({ imobiliaria: z.enum(["cordial", "morar"]).optional() }).strict(),
  async handler({ imobiliaria }, ctx) {
    const financial = canSeeFinancialValues(ctx);
    let query = scopeAgency(
      ctx.supabase
        .from("marketing_campaigns")
        .select("id,nome,imobiliaria,platform,canal,status,sync_status"),
      ctx,
      "imobiliaria",
    );
    if (effectiveRole(ctx) !== "admin") query = query.eq("user_id", ctx.userId);
    if (imobiliaria) query = query.eq("imobiliaria", imobiliaria);
    const data = await rows(query.limit(101), ctx),
      campaigns = data.slice(0, 100);
    const mesAtual = saoPauloDay().slice(0, 7),
      mesAnterior = previousMonth();
    let metricsQuery = ctx.supabase
      .from("marketing_daily_metrics")
      .select(`campaign_id,data,leads,clicks,views,impressions${financial ? ",investimento" : ""}`)
      .in(
        "campaign_id",
        campaigns.map((c) => c.id),
      )
      .gte("data", `${mesAnterior}-01`)
      .lte("data", saoPauloDay());
    if (effectiveRole(ctx) !== "admin") metricsQuery = metricsQuery.eq("user_id", ctx.userId);
    const metrics = campaigns.length ? await rows(metricsQuery.limit(1000), ctx) : [];
    const empty = () =>
      ({
        leads: 0,
        clicks: 0,
        views: 0,
        impressions: 0,
        ...(financial ? { investimento: 0 } : {}),
      }) as Record<string, number>;
    const totals = { atual: empty(), anterior: empty() };
    const rates = (m: Record<string, number>) => ({
      ...m,
      ctr: m.impressions ? Math.round((m.clicks / m.impressions) * 10000) / 100 : null,
      ...(financial
        ? { cpl: m.leads ? Math.round((m.investimento / m.leads) * 100) / 100 : null }
        : {}),
    });
    const list = campaigns.map((c) => {
      const values = { atual: empty(), anterior: empty() };
      for (const m of metrics.slice(0, 1000).filter((m) => m.campaign_id === c.id)) {
        const b = String(m.data).startsWith(mesAtual) ? "atual" : "anterior";
        for (const k of Object.keys(values[b])) {
          values[b][k] += Number(m[k] || 0);
          totals[b][k] += Number(m[k] || 0);
        }
      }
      return {
        id: c.id,
        nome: c.nome,
        imobiliaria: c.imobiliaria,
        plataforma: c.platform ?? c.canal,
        status: c.status,
        sincronizacao: c.sync_status ?? "manual",
        mesAtual: rates(values.atual),
        mesAnterior: rates(values.anterior),
        href: "/marketing",
      };
    });
    return result(`${list.length} campanha(s); ${totals.atual.leads} leads no mês atual.`, {
      total: list.length,
      totalCampanhas: list.length,
      limited: data.length > 100 || metrics.length >= 1000,
      mesAtual,
      mesAnterior,
      totais: { mesAtual: rates(totals.atual), mesAnterior: rates(totals.anterior) },
      campanhas: list,
      href: "/marketing",
    });
  },
} satisfies AgentTool;
