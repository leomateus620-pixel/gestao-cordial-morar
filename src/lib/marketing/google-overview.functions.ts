import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { marketingAccess, requireMarketingAction } from "@/lib/ads/authorization.server";
import type { GoogleMarketingOverview, GoogleMarketingQuery } from "./google-overview.types";

const date = z.iso.date();
export const googleOverviewQuerySchema = z
  .object({
    agency: z.enum(["cordial", "morar"]).nullish(),
    accountId: z
      .string()
      .regex(/^\d{10}$/)
      .nullish(),
    since: date,
    until: date,
    search: z.string().trim().max(100).optional(),
    status: z.string().trim().min(1).max(40).nullish(),
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    sort: z
      .enum([
        "name_asc",
        "name_desc",
        "status_asc",
        "updated_desc",
        "cost_desc",
        "impressions_desc",
        "clicks_desc",
        "conversions_desc",
        "ctr_desc",
        "cpc_desc",
        "cost_per_conversion_desc",
      ])
      .default("name_asc"),
  })
  .strict()
  .refine(
    (value) =>
      value.until >= value.since &&
      Date.parse(value.until) - Date.parse(value.since) <= 366 * 86400000,
    "Selecione um período de até 367 dias.",
  );

const decimal = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/)
  .nullable();
const metrics = z
  .object({
    cost: decimal,
    impressions: decimal,
    clicks: decimal,
    conversions: decimal,
    ctr: decimal,
    cpc: decimal,
    costPerConversion: decimal,
  })
  .strict();
const coverage = z.enum(["partial", "unavailable"]);
const item = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.string(),
    nativeStatus: z.string().nullable(),
    channelType: z.string().nullable(),
    channelSubtype: z.string().nullable(),
    accountId: z
      .string()
      .regex(/^\d{10}$/)
      .nullable(),
    agency: z.enum(["cordial", "morar"]),
    accountName: z.string().nullable(),
    dataInicio: date,
    dataFim: date,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    timezone: z.string().nullable(),
    lastCollectedAt: z.string().nullable(),
    coverage,
    metrics,
    dailySeries: z.array(z.object({ date, metrics }).strict()).nullable(),
  })
  .strict();
const response = z
  .object({
    coverage,
    accounts: z
      .array(
        z
          .object({
            id: z.string().regex(/^\d{10}$/),
            name: z.string().nullable(),
            agency: z.enum(["cordial", "morar"]),
          })
          .strict(),
      )
      .max(10000),
    accountName: z.string().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    timezone: z.string().nullable(),
    lastCollectedAt: z.string().nullable(),
    summary: metrics,
    series: z.array(z.object({ date, metrics }).strict()).nullable(),
    items: z.array(item).max(100),
    total: z.number().int().nonnegative().safe(),
  })
  .strict();

/** Reject malformed or unexpectedly complete results rather than inventing totals. */
export function googleOverviewDto(
  raw: unknown,
  query: z.output<typeof googleOverviewQuerySchema>,
  financial: boolean,
): GoogleMarketingOverview {
  const data = response.parse(raw);
  const mask = (m: z.output<typeof metrics>) =>
    financial ? m : { ...m, cost: null, cpc: null, costPerConversion: null };
  if (data.items.length > query.pageSize || data.items.length > data.total)
    throw new Error("Resultado Google incompleto ou inválido.");
  if (query.agency && data.accounts.some((account) => account.agency !== query.agency))
    throw new Error("Contas Google fora do escopo autorizado.");
  if (
    data.items.some(
      (item) =>
        (query.agency && item.agency !== query.agency) ||
        (query.accountId && item.accountId !== query.accountId),
    )
  )
    throw new Error("Resultado Google fora do escopo autorizado.");
  const datesOutsideScope = (series: Array<{ date: string }> | null) =>
    series?.some((entry) => entry.date < query.since || entry.date > query.until) ?? false;
  if (
    datesOutsideScope(data.series) ||
    data.items.some((item) => datesOutsideScope(item.dailySeries))
  )
    throw new Error("Série Google fora do período solicitado.");
  if (
    data.coverage === "unavailable" &&
    (data.series !== null || Object.values(data.summary).some((v) => v !== null))
  )
    throw new Error("Cobertura Google inconsistente.");
  if (
    (!data.currency || !data.timezone) &&
    (data.series !== null || Object.values(data.summary).some((v) => v !== null))
  )
    throw new Error("Agregação Google sem moeda ou fuso comprovados.");
  if (query.agency && data.accounts.some((account) => account.agency !== query.agency))
    throw new Error("Contas Google fora do escopo autorizado.");
  if (
    data.items.some(
      (item) =>
        (item.coverage === "unavailable" || !item.currency || !item.timezone) &&
        Object.values(item.metrics).some((value) => value !== null),
    )
  )
    throw new Error("Métricas de campanha Google sem contexto comprovado.");
  return {
    scope: {
      agency: query.agency ?? null,
      accountId: query.accountId ?? null,
      since: query.since,
      until: query.until,
    },
    ...data,
    summary: mask(data.summary),
    series: data.series?.map((d) => ({ ...d, metrics: mask(d.metrics) })) ?? null,
    items: data.items.map((campaign) => ({
      ...campaign,
      metrics: mask(campaign.metrics),
      dailySeries: campaign.dailySeries?.map((d) => ({ ...d, metrics: mask(d.metrics) })) ?? null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
  };
}

export const getGoogleMarketingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GoogleMarketingQuery) => googleOverviewQuerySchema.parse(input))
  .handler(async ({ data, context }): Promise<GoogleMarketingOverview> => {
    const access = await marketingAccess(context, "read_metrics");
    if (access.isReviewer) throw new Error("Sem permissão para consultar Google Ads.");
    if (data.agency) await requireMarketingAction(context, "read_metrics", data.agency);
    const metricSorts = [
      "cost_desc",
      "impressions_desc",
      "clicks_desc",
      "conversions_desc",
      "ctr_desc",
      "cpc_desc",
      "cost_per_conversion_desc",
    ];
    if (metricSorts.includes(data.sort) && (!data.agency || !data.accountId))
      throw new Error("Selecione uma imobiliária e uma conta para ordenar por métricas.");
    if (
      ["cost_desc", "cpc_desc", "cost_per_conversion_desc"].includes(data.sort) &&
      !access.financialVisible
    )
      throw new Error("Ordenação financeira não permitida para este perfil.");
    const db = context.supabase as unknown as SupabaseClient;
    const { data: result, error } = await db.rpc("google_marketing_overview", {
      p_agency: data.agency ?? null,
      p_account_id: data.accountId ?? null,
      p_since: data.since,
      p_until: data.until,
      p_search: data.search || null,
      p_status: data.status ?? null,
      p_page: data.page,
      p_page_size: data.pageSize,
      p_sort: data.sort,
    });
    if (error) throw new Error("Não foi possível consultar os dados Google. Tente novamente.");
    return googleOverviewDto(result, data, access.financialVisible);
  });
