import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type Metrics = {
  investimento: number;
  leads: number;
  clicks: number;
  views: number;
  impressions: number;
};

function emptyMetrics(): Metrics {
  return { investimento: 0, leads: 0, clicks: 0, views: 0, impressions: 0 };
}

function withRates(m: Metrics) {
  return {
    ...m,
    cpl: m.leads > 0 ? Math.round((m.investimento / m.leads) * 100) / 100 : null,
    ctr: m.impressions > 0 ? Math.round((m.clicks / m.impressions) * 10000) / 100 : null,
  };
}

export default defineTool({
  name: "marketing_performance",
  title: "Desempenho de marketing",
  description:
    "Campanhas de marketing com investimento, leads, CPL e CTR, comparando o mês atual com o anterior, por imobiliária e plataforma (somente leitura).",
  inputSchema: {
    imobiliaria: z.string().trim().max(40).optional().describe("Filtrar por imobiliária."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ imobiliaria }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Não autenticado");
    const supabase = supabaseForUser(ctx);

    let campQ = supabase
      .from("marketing_campaigns")
      .select("id,nome,imobiliaria,platform,canal,status,sync_status,investimento,data_inicio,data_fim")
      .limit(500);
    if (imobiliaria) campQ = campQ.eq("imobiliaria", imobiliaria);
    const { data: campaigns, error: campErr } = await campQ;
    if (campErr) throw new ToolError(campErr.message);

    const ids = (campaigns ?? []).map((c) => c.id);
    const now = new Date();
    const mesAtual = now.toISOString().slice(0, 7);
    const mesAnterior = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 7);

    let metrics: Array<Record<string, number | string>> = [];
    if (ids.length > 0) {
      const { data: m, error: mErr } = await supabase
        .from("marketing_daily_metrics")
        .select("campaign_id,data,investimento,leads,clicks,views,impressions")
        .in("campaign_id", ids)
        .gte("data", `${mesAnterior}-01`)
        .limit(10000);
      if (mErr) throw new ToolError(mErr.message);
      metrics = m ?? [];
    }

    const porCampanha: Record<string, { atual: Metrics; anterior: Metrics }> = {};
    for (const row of metrics) {
      const id = String(row.campaign_id);
      const bucket = String(row.data).startsWith(mesAtual) ? "atual" : "anterior";
      const entry = (porCampanha[id] ??= { atual: emptyMetrics(), anterior: emptyMetrics() });
      entry[bucket].investimento += Number(row.investimento) || 0;
      entry[bucket].leads += Number(row.leads) || 0;
      entry[bucket].clicks += Number(row.clicks) || 0;
      entry[bucket].views += Number(row.views) || 0;
      entry[bucket].impressions += Number(row.impressions) || 0;
    }

    const totais = { atual: emptyMetrics(), anterior: emptyMetrics() };
    const lista = (campaigns ?? []).map((c) => {
      const m = porCampanha[c.id] ?? { atual: emptyMetrics(), anterior: emptyMetrics() };
      for (const k of Object.keys(totais.atual) as Array<keyof Metrics>) {
        totais.atual[k] += m.atual[k];
        totais.anterior[k] += m.anterior[k];
      }
      return {
        id: c.id,
        nome: c.nome,
        imobiliaria: c.imobiliaria,
        plataforma: c.platform ?? c.canal,
        status: c.status,
        sincronizacao: c.sync_status ?? "manual",
        mesAtual: withRates(m.atual),
        mesAnterior: withRates(m.anterior),
      };
    });

    const summary = {
      mesAtual,
      mesAnterior,
      totalCampanhas: lista.length,
      totais: { mesAtual: withRates(totais.atual), mesAnterior: withRates(totais.anterior) },
      campanhas: lista,
    };
    return {
      content: [
        {
          type: "text",
          text: `${lista.length} campanha(s); ${mesAtual}: R$ ${totais.atual.investimento.toFixed(2)} investidos, ${totais.atual.leads} leads.`,
        },
      ],
      structuredContent: summary,
    };
  },
});
