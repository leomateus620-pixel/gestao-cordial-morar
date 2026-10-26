import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  MarketingAgencyId,
  MarketingCampaign,
  MarketingCampaignStatus,
  MarketingChannel,
  MarketingObjective,
} from "@/types/marketing";

import { marketingCampaignDto, type CampaignRow } from "./marketing.dto";

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
export type MarketingQuery = {
  imobiliaria?: MarketingAgencyId | null;
  since?: string;
  until?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  platform?: "meta" | "google" | "manual" | null;
  status?: string | null;
  campaignId?: string;
  accountId?: string | null;
  currentSince?: string;
  previousUntil?: string;
};
export type MarketingPeriodSummary = {
  spend: number | null;
  leads: number;
  clicks: number;
  impressions: number;
  active_campaigns: number;
  currencies: Array<string | null>;
  has_data: boolean;
};
export type CampaignPage = {
  summary?: { current: MarketingPeriodSummary; previous: MarketingPeriodSummary };
  items: MarketingCampaign[];
  total: number;
  financialVisible: boolean;
  page: number;
  pageSize: number;
};
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z
  .object({
    imobiliaria: z.enum(["cordial", "morar"]).nullish(),
    since: date.optional(),
    until: date.optional(),
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    search: z.string().max(100).optional(),
    platform: z.enum(["meta", "google", "manual"]).nullish(),
    status: z.string().max(40).nullish(),
    campaignId: z.string().uuid().optional(),
    accountId: z
      .string()
      .regex(/^(act_)?[0-9]{1,80}$/)
      .nullish(),
    currentSince: date.optional(),
    previousUntil: date.optional(),
  })
  .strict();
const inputSchema = z
  .object({
    imobiliaria: z.enum(["cordial", "morar"]),
    nome: z.string().trim().min(1).max(200),
    canal: z.enum([
      "Instagram",
      "Facebook",
      "Google",
      "WhatsApp",
      "E-mail",
      "Portal imobiliário",
      "Open house",
      "Externa",
    ]),
    objetivo: z.enum([
      "Leads qualificados",
      "Visitas",
      "Captação",
      "Venda",
      "Locação",
      "Relacionamento",
      "Reconhecimento",
    ]),
    status: z.enum([
      "Ativa",
      "Planejada",
      "Pausada",
      "Encerrada",
      "Em análise",
      "Com baixo desempenho",
    ]),
    dataInicio: date,
    dataFim: date,
    investimento: z.number().finite().min(0).max(1e12),
    responsavel: z.string().max(200).nullish(),
    observacoes: z.string().max(5000).nullish(),
    diagnostico: z.string().max(2000).nullish(),
    referenciaUrl: z.string().max(2000).nullish(),
    leadsEsperados: z.number().int().min(0).max(100000000).nullish(),
  })
  .strict()
  .refine((d) => d.dataFim >= d.dataInicio, "O fim do período deve ser posterior ao início.");
type Ctx = { supabase: SupabaseClient<Database>; userId: string };
async function marketingAccess(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error("Não foi possível validar o acesso ao marketing.");
  const roles = new Set((data ?? []).map((r: { role: string }) => r.role));
  if (!roles.has("admin") && (roles.has("financeiro") || !roles.has("secretaria")))
    throw new Error("Acesso ao marketing não permitido.");
  return { isAdmin: roles.has("admin"), financialVisible: roles.has("admin") };
}
async function agencyAccess(ctx: Ctx, agency: string) {
  const { data, error } = await ctx.supabase.rpc("marketing_can_operate", { p_agency: agency });
  if (error || data !== true) throw new Error("Sem permissão para operar esta imobiliária.");
}

async function readPage(ctx: Ctx, raw: MarketingQuery = {}): Promise<CampaignPage> {
  await marketingAccess(ctx);
  const q = querySchema.parse(raw);
  const { data, error } = await ctx.supabase.rpc("marketing_campaigns_safe", {
    p_imobiliaria: q.imobiliaria ?? undefined,
    p_since: q.since ?? undefined,
    p_until: q.until ?? undefined,
    p_page: q.page,
    p_page_size: q.pageSize,
    p_search: q.search || undefined,
    p_platform: q.platform ?? undefined,
    p_status: q.status ?? undefined,
    p_campaign_id: q.campaignId ?? undefined,
    p_account_id: q.accountId?.replace(/^act_/, "") ?? undefined,
    p_current_since: q.currentSince ?? undefined,
    p_previous_until: q.previousUntil ?? undefined,
  });
  if (error)
    throw new Error(
      "Não foi possível carregar as campanhas. Verifique a aplicação da migração de marketing.",
    );
  const result = data as unknown as {
    items: CampaignRow[];
    total: number;
    financial_visible: boolean;
    summary?: CampaignPage["summary"];
  };
  return {
    summary: result?.summary,
    items: (result?.items ?? []).map((r) =>
      marketingCampaignDto(r, result.financial_visible === true),
    ),
    total: Number(result?.total ?? 0),
    financialVisible: result?.financial_visible === true,
    page: q.page,
    pageSize: q.pageSize,
  };
}
export const listCampaignPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: MarketingQuery) => querySchema.parse(d))
  .handler(({ data, context }) => readPage(context, data));
/** Compatibility contract for existing consumers. Bounded and sanitized by the same RPC. */
export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<MarketingCampaign[]> =>
      (await readPage(context, { pageSize: 100 })).items,
  );
function payload(input: CampaignInput, financial: boolean) {
  return {
    imobiliaria: input.imobiliaria,
    nome: input.nome.trim(),
    canal: input.canal,
    objetivo: input.objetivo,
    status: input.status,
    data_inicio: input.dataInicio,
    data_fim: input.dataFim,
    ...(financial ? { investimento: input.investimento } : {}),
    responsavel: input.responsavel?.trim() || null,
    observacoes: input.observacoes?.trim() || null,
    ...(financial ? { diagnostico: input.diagnostico?.trim() || null } : {}),
    referencia_url: input.referenciaUrl?.trim() || null,
    leads_esperados: input.leadsEsperados ?? null,
  };
}
async function mutableCampaign(ctx: Ctx, id: string) {
  const access = await marketingAccess(ctx);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin;
  const { data: row, error } = await admin
    .from("marketing_campaigns")
    .select("id,user_id,platform,imobiliaria")
    .eq("id", id)
    .maybeSingle();
  if (error || !row || (!access.isAdmin && row.user_id !== ctx.userId))
    throw new Error("Campanha não encontrada ou sem permissão para alterar.");
  await agencyAccess(ctx, row.imobiliaria);
  return { admin, row, ...access };
}
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CampaignInput) => inputSchema.parse(d))
  .handler(async ({ data, context }): Promise<MarketingCampaign> => {
    const access = await marketingAccess(context);
    await agencyAccess(context, data.imobiliaria);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("marketing_campaigns")
      .insert({ ...payload(data, access.financialVisible), user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error("Não foi possível cadastrar a campanha.");
    const result = (await readPage(context, { campaignId: row.id })).items[0];
    if (!result) throw new Error("Campanha salva; atualize a lista para consultá-la.");
    return result;
  });
export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; input: CampaignInput }) =>
    z.object({ id: z.string().uuid(), input: inputSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<MarketingCampaign> => {
    const { admin, row, financialVisible } = await mutableCampaign(context, data.id);
    await agencyAccess(context, data.input.imobiliaria);
    if (row.platform)
      throw new Error(
        "Campanhas sincronizadas são atualizadas pela integração. Preserve suas métricas de origem.",
      );
    const { error } = await admin
      .from("marketing_campaigns")
      .update(payload(data.input, financialVisible))
      .eq("id", row.id)
      .is("platform", null);
    if (error) throw new Error("Não foi possível atualizar a campanha.");
    return (await readPage(context, { campaignId: row.id })).items[0];
  });
export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { admin, row } = await mutableCampaign(context, data.id);
    const { error } = await admin.from("marketing_campaigns").delete().eq("id", row.id);
    if (error) throw new Error("Não foi possível excluir a campanha.");
    return { ok: true };
  });
export const upsertDailyMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: DailyMetricInput) =>
    z
      .object({
        campaignId: z.string().uuid(),
        data: date,
        leads: z.number().int().min(0).optional(),
        clicks: z.number().int().min(0).optional(),
        accesses: z.number().int().min(0).optional(),
        views: z.number().int().min(0).optional(),
        investimento: z.number().finite().min(0).optional(),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { admin, row, financialVisible } = await mutableCampaign(context, data.campaignId);
    if (row.platform)
      throw new Error("Métricas sincronizadas não podem ser sobrescritas manualmente.");
    const { error } = await admin.from("marketing_daily_metrics").upsert(
      {
        campaign_id: row.id,
        user_id: context.userId,
        data: data.data,
        leads: data.leads ?? 0,
        clicks: data.clicks ?? 0,
        accesses: data.accesses ?? 0,
        views: data.views ?? 0,
        ...(financialVisible ? { investimento: data.investimento ?? 0 } : {}),
      },
      { onConflict: "campaign_id,data" },
    );
    if (error) throw new Error("Não foi possível salvar as métricas manuais.");
    return { ok: true };
  });
