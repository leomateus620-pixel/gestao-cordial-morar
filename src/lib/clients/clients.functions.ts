import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  BedroomOption,
  Client,
  ClientCreateInput,
  ClientPurpose,
  ClientStatus,
  ClientType,
  ContactPreference,
  LeadOrigin,
  PropertyType,
  RealEstateBrand,
} from "@/types/client";

type DbRow = {
  id: string;
  created_by: string;
  brand: string;
  full_name: string;
  phone: string;
  email: string | null;
  document: string | null;
  client_type: string;
  contact_preference: string;
  lead_origin: string;
  assigned_broker_id: string | null;
  assigned_broker_name: string | null;
  status: string;
  purpose: string;
  property_type: string;
  bedrooms: string | null;
  neighborhood: string | null;
  min_budget: number | string | null;
  max_budget: number | string | null;
  approximate_income: number | string | null;
  profession: string | null;
  notes: string | null;
  restrictions: string | null;
  next_step: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

const orNull = (v?: string | null) => {
  const trimmed = (v ?? "").toString().trim();
  return trimmed ? trimmed : null;
};
const num = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : Number(v);
const orUndef = <T,>(v: T | null | undefined): T | undefined =>
  v === null || v === undefined ? undefined : v;

function rowToClient(row: DbRow): Client {
  return {
    id: row.id,
    createdBy: row.created_by,
    fullName: row.full_name,
    phone: row.phone,
    email: orUndef(row.email),
    clientType: row.client_type as ClientType,
    contactPreference: row.contact_preference as ContactPreference,
    leadOrigin: row.lead_origin as LeadOrigin,
    brand: row.brand as RealEstateBrand,
    assignedBrokerId: orUndef(row.assigned_broker_id),
    assignedBrokerName: orUndef(row.assigned_broker_name),
    purpose: row.purpose as ClientPurpose,
    propertyType: row.property_type as PropertyType,
    bedrooms: (orUndef(row.bedrooms) as BedroomOption | undefined) ?? undefined,
    neighborhood: orUndef(row.neighborhood),
    minBudget: row.min_budget !== null ? Number(row.min_budget) : undefined,
    maxBudget: row.max_budget !== null ? Number(row.max_budget) : undefined,
    approximateIncome:
      row.approximate_income !== null ? Number(row.approximate_income) : undefined,
    document: orUndef(row.document),
    profession: orUndef(row.profession),
    notes: orUndef(row.notes),
    restrictions: orUndef(row.restrictions),
    nextStep: orUndef(row.next_step),
    nextFollowUpAt: orUndef(row.next_follow_up_at),
    status: row.status as ClientStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inputToPayload(input: ClientCreateInput, userId: string) {
  return {
    created_by: userId,
    brand: input.brand,
    full_name: input.fullName.trim(),
    phone: input.phone.trim(),
    email: orNull(input.email),
    document: orNull(input.document),
    client_type: input.clientType,
    contact_preference: input.contactPreference,
    lead_origin: input.leadOrigin,
    assigned_broker_id:
      input.assignedBrokerId && input.assignedBrokerId !== "outro"
        ? input.assignedBrokerId
        : null,
    assigned_broker_name: orNull(input.assignedBrokerName),
    status: input.status,
    purpose: input.purpose,
    property_type: input.propertyType,
    bedrooms: orNull(input.bedrooms),
    neighborhood: orNull(input.neighborhood),
    min_budget: num(input.minBudget),
    max_budget: num(input.maxBudget),
    approximate_income: num(input.approximateIncome),
    profession: orNull(input.profession),
    notes: orNull(input.notes),
    restrictions: orNull(input.restrictions),
    next_step: orNull(input.nextStep),
    next_follow_up_at: input.nextFollowUpAt
      ? new Date(input.nextFollowUpAt).toISOString()
      : null,
  };
}

function validate(input: ClientCreateInput) {
  if (!input.fullName?.trim()) throw new Error("Informe o nome completo.");
  if (!input.phone?.trim() && !input.email?.trim())
    throw new Error("Informe ao menos telefone ou e-mail.");
  if (!input.clientType) throw new Error("Selecione o tipo de cliente.");
  if (!input.leadOrigin) throw new Error("Selecione a origem do lead.");
  if (!input.brand) throw new Error("Selecione a imobiliária.");
  if (!input.purpose) throw new Error("Selecione a finalidade.");
  if (!input.propertyType) throw new Error("Selecione o tipo de imóvel.");
  if (!input.status) throw new Error("Selecione o status.");
  if (
    typeof input.minBudget === "number" &&
    typeof input.maxBudget === "number" &&
    input.minBudget > input.maxBudget
  )
    throw new Error("O orçamento mínimo não pode ser maior que o máximo.");
}

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    let query = context.supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (!isAdmin) {
      query = query.or(
        `created_by.eq.${context.userId},assigned_broker_id.eq.${context.userId}`,
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => rowToClient(row as unknown as DbRow));
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ClientCreateInput) => d)
  .handler(async ({ data, context }) => {
    validate(data);
    const { data: inserted, error } = await context.supabase
      .from("clients")
      .insert(inputToPayload(data, context.userId))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToClient(inserted as unknown as DbRow);
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Partial<ClientCreateInput> }) => d)
  .handler(async ({ data, context }) => {
    const p = data.patch;
    const patch: Record<string, unknown> = {};
    if (p.fullName !== undefined) patch.full_name = p.fullName.trim();
    if (p.phone !== undefined) patch.phone = p.phone.trim();
    if (p.email !== undefined) patch.email = orNull(p.email);
    if (p.document !== undefined) patch.document = orNull(p.document);
    if (p.clientType !== undefined) patch.client_type = p.clientType;
    if (p.contactPreference !== undefined) patch.contact_preference = p.contactPreference;
    if (p.leadOrigin !== undefined) patch.lead_origin = p.leadOrigin;
    if (p.brand !== undefined) patch.brand = p.brand;
    if (p.assignedBrokerId !== undefined)
      patch.assigned_broker_id =
        p.assignedBrokerId && p.assignedBrokerId !== "outro" ? p.assignedBrokerId : null;
    if (p.assignedBrokerName !== undefined)
      patch.assigned_broker_name = orNull(p.assignedBrokerName);
    if (p.status !== undefined) patch.status = p.status;
    if (p.purpose !== undefined) patch.purpose = p.purpose;
    if (p.propertyType !== undefined) patch.property_type = p.propertyType;
    if (p.bedrooms !== undefined) patch.bedrooms = orNull(p.bedrooms);
    if (p.neighborhood !== undefined) patch.neighborhood = orNull(p.neighborhood);
    if (p.minBudget !== undefined) patch.min_budget = num(p.minBudget);
    if (p.maxBudget !== undefined) patch.max_budget = num(p.maxBudget);
    if (p.approximateIncome !== undefined)
      patch.approximate_income = num(p.approximateIncome);
    if (p.profession !== undefined) patch.profession = orNull(p.profession);
    if (p.notes !== undefined) patch.notes = orNull(p.notes);
    if (p.restrictions !== undefined) patch.restrictions = orNull(p.restrictions);
    if (p.nextStep !== undefined) patch.next_step = orNull(p.nextStep);
    if (p.nextFollowUpAt !== undefined)
      patch.next_follow_up_at = p.nextFollowUpAt
        ? new Date(p.nextFollowUpAt).toISOString()
        : null;

    const { data: updated, error } = await context.supabase
      .from("clients")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToClient(updated as unknown as DbRow);
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("clients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
