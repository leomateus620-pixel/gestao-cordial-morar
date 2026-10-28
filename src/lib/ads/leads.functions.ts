import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMarketingAction, type MarketingAction } from "./authorization.server";

type LeadContext = { supabase: SupabaseClient; userId: string };
export type MetaLeadInboxItem = {
  id: string;
  is_synthetic: boolean;
  status: "queued" | "processing" | "unassigned" | "imported" | "review" | "failed" | "quarantined";
  imobiliaria: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  campaign_id: string | null;
  external_campaign_id: string | null;
  form_id: string | null;
  received_at: string;
  broker_id: string | null;
  attendance_id: string | null;
  last_error: string | null;
};
async function leadAccess(
  ctx: LeadContext,
  agency?: string | null,
  adminOnly = false,
  action: MarketingAction = "manage_leads",
) {
  const access = await requireMarketingAction(
    ctx,
    adminOnly ? "manage_connection" : action,
    agency,
  );
  if (!access.isAdmin && !agency) throw new Error("Selecione a imobiliária autorizada.");
  return { admin: access.isAdmin };
}
async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as SupabaseClient;
}
const inboxSchema = z.object({
  imobiliaria: z.enum(["cordial", "morar"]).optional(),
  status: z
    .enum(["queued", "processing", "unassigned", "imported", "review", "failed", "quarantined"])
    .optional(),
  formId: z
    .string()
    .regex(/^\d{1,80}$/)
    .optional(),
  accountId: z
    .string()
    .regex(/^\d{1,80}$/)
    .optional(),
  campaignId: z.string().uuid().optional(),
  brokerId: z.string().uuid().optional(),
  since: z.iso.date().optional(),
  until: z.iso.date().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
export const listMetaLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (value: {
      imobiliaria?: "cordial" | "morar";
      status?: MetaLeadInboxItem["status"];
      formId?: string;
      accountId?: string;
      campaignId?: string;
      brokerId?: string;
      since?: string;
      until?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    }) => inboxSchema.parse(value ?? {}),
  )
  .handler(async ({ context, data }): Promise<{ items: MetaLeadInboxItem[]; total: number }> => {
    const access = await requireMarketingAction(context, "read_lead_contacts", data.imobiliaria);
    const isAdmin = access.isAdmin;
    const agencies: string[] = [];
    if (!isAdmin) {
      for (const agency of ["cordial", "morar"]) {
        const { data: allowed, error } = await context.supabase.rpc("marketing_can_act", {
          p_action: "read_lead_contacts",
          p_agency: agency,
        });
        if (error) throw new Error("Não foi possível validar o acesso.");
        if (allowed === true) agencies.push(agency);
      }
      if (!agencies.length) throw new Error("Sem permissão para os leads Meta.");
    }
    const db = await adminDb();
    let connectionIds: string[] | null = null;
    if (data.accountId) {
      let connections = db
        .from("ad_platform_connections")
        .select("id")
        .eq("platform", "meta")
        .eq("external_account_id", data.accountId);
      if (data.imobiliaria) connections = connections.eq("imobiliaria", data.imobiliaria);
      if (!isAdmin) connections = connections.in("imobiliaria", agencies);
      const { data: scoped, error: scopeError } = await connections;
      if (scopeError) throw new Error("Não foi possível validar a conta selecionada.");
      connectionIds = (scoped ?? []).map((connection) => connection.id);
      if (!connectionIds.length) return { items: [], total: 0 };
    }
    let query = db
      .from("meta_lead_submissions")
      .select(
        "id,is_synthetic,status,imobiliaria,full_name,phone,email,campaign_id,external_campaign_id,form_id,received_at,broker_id,attendance_id,last_error",
        { count: "exact" },
      )
      .is("privacy_deleted_at", null)
      .order("received_at", { ascending: false });
    if (!isAdmin) query = query.in("imobiliaria", agencies);
    if (data.imobiliaria) query = query.eq("imobiliaria", data.imobiliaria);
    if (connectionIds) query = query.in("connection_id", connectionIds);
    if (data.status) query = query.eq("status", data.status);
    if (data.formId) query = query.eq("form_id", data.formId);
    if (data.campaignId) query = query.eq("campaign_id", data.campaignId);
    if (data.brokerId) query = query.eq("broker_id", data.brokerId);
    // Explicit instants; these filters are received-at days in São Paulo, not browser timezone.
    if (data.since) query = query.gte("received_at", `${data.since}T00:00:00-03:00`);
    if (data.until)
      query = query.lt(
        "received_at",
        new Date(Date.parse(`${data.until}T00:00:00-03:00`) + 86400000).toISOString(),
      );
    if (data.search) {
      // PostgREST OR syntax is not a parameterized expression. Restrict structural
      // metacharacters and escape SQL wildcards before constructing its literals.
      const term = data.search.replace(/[\\%_*(),."']/g, " ").trim();
      if (term)
        query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
    }
    const {
      data: rows,
      count,
      error,
    } = await query.range((data.page - 1) * data.pageSize, data.page * data.pageSize - 1);
    if (error) throw new Error("Não foi possível carregar os leads.");
    return {
      items: (rows ?? []).map((row) => ({
        ...row,
        last_error: row.last_error ? "Processamento pendente. Consulte o diagnóstico." : null,
      })) as MetaLeadInboxItem[],
      total: count ?? 0,
    };
  });
export const retryMetaLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string }) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ context, data }) => {
    await leadAccess(context as LeadContext, null, true);
    const db = await adminDb();
    const { error } = await db.rpc("meta_lead_retry", { p_id: data.id });
    if (error)
      throw new Error("O lead não pode ser reprocessado. Revise a conexão e o mapeamento.");
    return { ok: true as const };
  });
export const assignMetaLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string; brokerId: string }) =>
    z.object({ id: z.string().uuid(), brokerId: z.string().uuid() }).parse(value),
  )
  .handler(async ({ context, data }) => {
    await requireMarketingAction(context, "manage_leads");
    const db = await adminDb();
    const { data: lead, error: readError } = await db
      .from("meta_lead_submissions")
      .select("imobiliaria")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !lead) throw new Error("Lead indisponível.");
    await leadAccess(context as LeadContext, lead.imobiliaria);
    const { error } = await db.rpc("meta_lead_assign", {
      p_id: data.id,
      p_broker_id: data.brokerId,
      p_actor_id: context.userId,
    });
    if (error) throw new Error("Não foi possível distribuir: confira a imobiliária e o corretor.");
    return { ok: true as const };
  });
export const resolveMetaLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string; attendanceId: string }) =>
    z.object({ id: z.string().uuid(), attendanceId: z.string().uuid() }).parse(value),
  )
  .handler(async ({ context, data }) => {
    await requireMarketingAction(context, "manage_leads");
    const db = await adminDb();
    const { data: lead } = await db
      .from("meta_lead_submissions")
      .select("imobiliaria")
      .eq("id", data.id)
      .maybeSingle();
    if (!lead) throw new Error("Lead indisponível.");
    await leadAccess(context as LeadContext, lead.imobiliaria);
    const { error } = await db.rpc("meta_lead_resolve", {
      p_id: data.id,
      p_attendance_id: data.attendanceId,
      p_actor_id: context.userId,
    });
    if (error) throw new Error("Atendimento incompatível ou lead já resolvido.");
    return { ok: true as const };
  });
const mappingSchema = z.object({
  connectionId: z.string().uuid(),
  pageId: z.string().regex(/^\d{1,80}$/),
  formId: z.string().regex(/^\d{1,80}$/),
  imobiliaria: z.enum(["cordial", "morar"]),
  fieldMapping: z
    .object({
      full_name: z.string().max(200).optional(),
      phone: z.string().max(200).optional(),
      email: z.string().max(200).optional(),
      interest: z.string().max(200).optional(),
    })
    .default({}),
  finalidade: z.enum(["compra", "aluguel", "ambos"]).nullable().default(null),
  tipoImovel: z
    .enum([
      "casa",
      "apartamento",
      "kitnet",
      "terreno",
      "sala_comercial",
      "area_rural",
      "sitio_chacara",
      "outro",
    ])
    .nullable()
    .default(null),
  propertyId: z.string().uuid().nullable().default(null),
  brokerId: z.string().uuid().nullable().default(null),
  enabled: z.boolean().default(true),
});
export const saveMetaLeadFormMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.input<typeof mappingSchema>) => mappingSchema.parse(value))
  .handler(async ({ context, data }) => {
    await leadAccess(context as LeadContext, null, true);
    const db = await adminDb();
    const { data: connection } = await db
      .from("ad_platform_connections")
      .select("id")
      .eq("id", data.connectionId)
      .eq("platform", "meta")
      .eq("imobiliaria", data.imobiliaria)
      .eq("page_id", data.pageId)
      .maybeSingle();
    if (!connection) throw new Error("A Página não pertence à conexão desta imobiliária.");
    const { resolvePageCredential } = await import("./credentials.server");
    const { metaPages, externalId } = await import("./meta.graph.server");
    const { token } = await resolvePageCredential(data.connectionId);
    const forms = await metaPages<{ id: string }>(
      `/${externalId(data.pageId)}/leadgen_forms`,
      token,
      { fields: "id" },
    );
    if (!forms.some((form) => form.id === data.formId))
      throw new Error("O formulário não pertence à Página selecionada ou não está acessível.");

    const { error } = await db.from("meta_lead_form_mappings").upsert(
      {
        connection_id: data.connectionId,
        page_id: data.pageId,
        form_id: data.formId,
        imobiliaria: data.imobiliaria,
        field_mapping: data.fieldMapping,
        finalidade: data.finalidade,
        tipo_imovel: data.tipoImovel,
        property_id: data.propertyId,
        broker_id: data.brokerId,
        enabled: data.enabled,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id,page_id,form_id" },
    );
    if (error) throw new Error("Mapeamento inválido. Confira o corretor, o imóvel e a conexão.");
    return { ok: true as const };
  });
export const listMetaLeadFormMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await leadAccess(context as LeadContext, null, true);
    const db = await adminDb();
    const { data, error } = await db
      .from("meta_lead_form_mappings")
      .select(
        "id,connection_id,page_id,form_id,imobiliaria,field_mapping,finalidade,tipo_imovel,property_id,broker_id,enabled",
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Não foi possível carregar os mapeamentos.");
    return data ?? [];
  });

export const listMetaLeadForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { connectionId: string }) =>
    z.object({ connectionId: z.string().uuid() }).parse(value),
  )
  .handler(async ({ context, data }) => {
    await leadAccess(context as LeadContext, null, true);
    const { resolvePageCredential } = await import("./credentials.server");
    const { metaPages, externalId } = await import("./meta.graph.server");
    const { token, connection } = await resolvePageCredential(data.connectionId);
    if (!connection.page_id) throw new Error("Página não configurada nesta conexão.");
    const forms = await metaPages<{
      id: string;
      name?: string;
      status?: string;
      questions?: Array<{ key?: string; label?: string; type?: string }>;
    }>(`/${externalId(connection.page_id)}/leadgen_forms`, token, {
      fields: "id,name,status,questions",
    });
    return forms.map((form) => ({
      id: form.id,
      name: form.name?.slice(0, 200),
      status: form.status,
      questions: (form.questions ?? []).slice(0, 100).map((question) => ({
        key: question.key?.slice(0, 200),
        label: question.label?.slice(0, 500),
        type: question.type?.slice(0, 100),
      })),
    }));
  });
export const getMetaLeadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string }) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ context, data }) => {
    await requireMarketingAction(context, "read_lead_contacts");
    const db = await adminDb();
    const { data: scope, error: scopeError } = await db
      .from("meta_lead_submissions")
      .select("imobiliaria")
      .eq("id", data.id)
      .maybeSingle();
    if (scopeError || !scope) throw new Error("Lead indisponível.");
    await leadAccess(context as LeadContext, scope.imobiliaria, false, "read_lead_contacts");
    const { data: row, error } = await db
      .from("meta_lead_submissions")
      .select(
        "id,is_synthetic,imobiliaria,status,full_name,phone,email,form_id,ad_id,adset_id,external_campaign_id,campaign_id,field_data,received_at,meta_created_at,completed_at,broker_id,client_id,attendance_id,last_error",
      )
      .eq("id", data.id)
      .eq("imobiliaria", scope.imobiliaria)
      .is("privacy_deleted_at", null)
      .maybeSingle();
    if (error || !row) throw new Error("Lead indisponível.");
    await leadAccess(context as LeadContext, row.imobiliaria, false, "read_lead_contacts");
    const { data: history, error: historyError } = await db
      .from("meta_lead_events")
      .select("id,status,previous_status,occurred_at")
      .eq("submission_id", data.id)
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (historyError) throw new Error("Não foi possível carregar o histórico do lead.");
    return {
      ...row,
      history: history ?? [],
      last_error: row.last_error ? "Processamento pendente. Consulte o diagnóstico." : null,
    };
  });
