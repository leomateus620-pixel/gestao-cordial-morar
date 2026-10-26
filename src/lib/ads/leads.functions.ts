import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LeadContext = { supabase: SupabaseClient; userId: string };
export type MetaLeadInboxItem = {
  id: string;
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
async function leadAccess(ctx: LeadContext, agency?: string | null, adminOnly = false) {
  const { data: admin, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("Não foi possível validar o acesso.");
  if (admin) return { admin: true };
  if (adminOnly || !agency) throw new Error("Somente o administrador pode executar esta ação.");
  const { data: permitted, error: scopeError } = await ctx.supabase.rpc("marketing_can_operate", {
    p_agency: agency,
  });
  if (scopeError || !permitted) throw new Error("Sem permissão nesta imobiliária.");
  return { admin: false };
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
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
export const listMetaLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (value: {
      imobiliaria?: "cordial" | "morar";
      status?: MetaLeadInboxItem["status"];
      page?: number;
      pageSize?: number;
    }) => inboxSchema.parse(value ?? {}),
  )
  .handler(async ({ context, data }): Promise<{ items: MetaLeadInboxItem[]; total: number }> => {
    const db = await adminDb();
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const agencies: string[] = [];
    if (!isAdmin) {
      for (const agency of ["cordial", "morar"]) {
        const { data: allowed, error } = await context.supabase.rpc("marketing_can_operate", {
          p_agency: agency,
        });
        if (error) throw new Error("Não foi possível validar o acesso.");
        if (allowed) agencies.push(agency);
      }
      if (!agencies.length) throw new Error("Sem permissão para os leads Meta.");
    }
    let query = db
      .from("meta_lead_submissions")
      .select(
        "id,status,imobiliaria,full_name,phone,email,campaign_id,external_campaign_id,form_id,received_at,broker_id,attendance_id,last_error",
        { count: "exact" },
      )
      .is("privacy_deleted_at", null)
      .order("received_at", { ascending: false });
    if (!isAdmin) query = query.in("imobiliaria", agencies);
    if (data.imobiliaria) query = query.eq("imobiliaria", data.imobiliaria);
    if (data.status) query = query.eq("status", data.status);
    const {
      data: rows,
      count,
      error,
    } = await query.range((data.page - 1) * data.pageSize, data.page * data.pageSize - 1);
    if (error) throw new Error("Não foi possível carregar os leads.");
    return { items: (rows ?? []) as MetaLeadInboxItem[], total: count ?? 0 };
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
    return metaPages<{ id: string; name?: string; status?: string }>(
      `/${externalId(connection.page_id)}/leadgen_forms`,
      token,
      { fields: "id,name,status" },
    );
  });
export const getMetaLeadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { id: string }) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ context, data }) => {
    const db = await adminDb();
    const { data: row, error } = await db
      .from("meta_lead_submissions")
      .select(
        "id,imobiliaria,status,full_name,phone,email,form_id,ad_id,adset_id,external_campaign_id,campaign_id,field_data,received_at,meta_created_at,broker_id,client_id,attendance_id,last_error",
      )
      .eq("id", data.id)
      .is("privacy_deleted_at", null)
      .maybeSingle();
    if (error || !row) throw new Error("Lead indisponível.");
    await leadAccess(context as LeadContext, row.imobiliaria);
    return row;
  });
