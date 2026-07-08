import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  MarketingAgencyId,
  MarketingCampaign,
  MarketingCampaignStatus,
  MarketingChannel,
  MarketingDailyMetric,
  MarketingObjective,
} from "@/types/marketing";

type CampaignRow = {
  id: string;
  user_id: string;
  imobiliaria: string;
  nome: string;
  canal: string;
  objetivo: string;
  status: string;
  data_inicio: string;
  data_fim: string;
  investimento: number | string;
  responsavel: string | null;
  observacoes: string | null;
  diagnostico: string | null;
  referencia_url: string | null;
  leads_esperados: number | null;
  created_at: string;
  updated_at: string;
};

type DailyRow = {
  id: string;
  campaign_id: string;
  user_id: string;
  data: string;
  leads: number;
  clicks: number;
  accesses: number;
  views: number;
  investimento: number | string;
};

export type CampaignInput = {
  imobiliaria: MarketingAgencyId;
  nome: string;
  canal: MarketingChannel;
  objetivo: MarketingObjective;
  status: MarketingCampaignStatus;
  dataInicio: string;
  dataFim: string;
  investimento: number;
  responsavel?: string | null;
  observacoes?: string | null;
  diagnostico?: string | null;
  referenciaUrl?: string | null;
  leadsEsperados?: number | null;
};

export type DailyMetricInput = {
  campaignId: string;
  data: string;
  leads?: number;
  clicks?: number;
  accesses?: number;
  views?: number;
  investimento?: number;
};

function orNull(v?: string | null) {
  return v !== undefined && v !== null && String(v).trim() ? String(v).trim() : null;
}

function inputToPayload(input: CampaignInput) {
  return {
    imobiliaria: input.imobiliaria,
    nome: input.nome.trim(),
    canal: input.canal,
    objetivo: input.objetivo,
    status: input.status,
    data_inicio: input.dataInicio,
    data_fim: input.dataFim,
    investimento: Number(input.investimento) || 0,
    responsavel: orNull(input.responsavel ?? null),
    observacoes: orNull(input.observacoes ?? null),
    diagnostico: orNull(input.diagnostico ?? null),
    referencia_url: orNull(input.referenciaUrl ?? null),
    leads_esperados:
      input.leadsEsperados === undefined || input.leadsEsperados === null
        ? null
        : Number(input.leadsEsperados),
  };
}

function toDaily(row: DailyRow): MarketingDailyMetric {
  return {
    date: row.data,
    leads: row.leads ?? 0,
    clicks: row.clicks ?? 0,
    accesses: row.accesses ?? 0,
    views: row.views ?? 0,
  };
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function buildCampaign(row: CampaignRow, daily: DailyRow[]): MarketingCampaign {
  const dailyMetrics = daily
    .map(toDaily)
    .sort((a, b) => a.date.localeCompare(b.date));
  const leads = dailyMetrics.reduce((s, d) => s + d.leads, 0);
  const clicks = dailyMetrics.reduce((s, d) => s + d.clicks, 0);
  const accesses = dailyMetrics.reduce((s, d) => s + d.accesses, 0);
  const views = dailyMetrics.reduce((s, d) => s + d.views, 0);
  const investimento = Number(row.investimento) || 0;
  return {
    id: row.id,
    name: row.nome,
    channel: row.canal as MarketingChannel,
    objective: row.objetivo as MarketingObjective,
    status: row.status as MarketingCampaignStatus,
    startDate: row.data_inicio,
    endDate: row.data_fim,
    investment: investimento,
    leads,
    clicks,
    accesses,
    views,
    impressions: 0,
    conversionRate: accesses > 0 ? round2((leads / accesses) * 100) : 0,
    costPerLead: leads > 0 ? round2(investimento / leads) : 0,
    bestLocation: "—",
    responsiblePerson: row.responsavel ?? "",
    notes: row.observacoes ?? "",
    diagnosis: row.diagnostico ?? "",
    expectedLeads: row.leads_esperados ?? undefined,
    referenceUrl: row.referencia_url ?? undefined,
    dailyMetrics,
    locationBreakdown: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imobiliaria: row.imobiliaria as MarketingAgencyId,
  };
}

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarketingCampaign[]> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    let campaignsQuery = context.supabase
      .from("marketing_campaigns")
      .select("*")
      .order("data_inicio", { ascending: false });
    if (!isAdmin) {
      campaignsQuery = campaignsQuery.eq("user_id", context.userId);
    }
    const { data: campaigns, error } = await campaignsQuery;
    if (error) throw new Error(error.message);
    const rows = (campaigns ?? []) as unknown as CampaignRow[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const { data: daily, error: dErr } = await context.supabase
      .from("marketing_daily_metrics")
      .select("*")
      .in("campaign_id", ids);
    if (dErr) throw new Error(dErr.message);
    const dailyRows = (daily ?? []) as unknown as DailyRow[];
    const byCampaign = new Map<string, DailyRow[]>();
    for (const d of dailyRows) {
      const arr = byCampaign.get(d.campaign_id) ?? [];
      arr.push(d);
      byCampaign.set(d.campaign_id, arr);
    }
    return rows.map((r) => buildCampaign(r, byCampaign.get(r.id) ?? []));
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CampaignInput) => data)
  .handler(async ({ data, context }): Promise<MarketingCampaign> => {
    const { data: row, error } = await context.supabase
      .from("marketing_campaigns")
      .insert({ ...inputToPayload(data), user_id: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return buildCampaign(row as unknown as CampaignRow, []);
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; input: CampaignInput }) => data)
  .handler(async ({ data, context }): Promise<MarketingCampaign> => {
    const { data: row, error } = await context.supabase
      .from("marketing_campaigns")
      .update(inputToPayload(data.input))
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const { data: daily } = await context.supabase
      .from("marketing_daily_metrics")
      .select("*")
      .eq("campaign_id", data.id);
    return buildCampaign(
      row as unknown as CampaignRow,
      (daily ?? []) as unknown as DailyRow[],
    );
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("marketing_campaigns")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertDailyMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: DailyMetricInput) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const payload = {
      campaign_id: data.campaignId,
      user_id: context.userId,
      data: data.data,
      leads: data.leads ?? 0,
      clicks: data.clicks ?? 0,
      accesses: data.accesses ?? 0,
      views: data.views ?? 0,
      investimento: data.investimento ?? 0,
    };
    const { error } = await context.supabase
      .from("marketing_daily_metrics")
      .upsert(payload, { onConflict: "campaign_id,data" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
