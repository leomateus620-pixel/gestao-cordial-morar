import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  SaleDocumentStatus,
  SalePaymentMethod,
  SalePropertyType,
  SaleRecord,
  SaleRecordInput,
  SalesKpis,
  SaleStatus,
} from "@/types/sale";
import type { AgencyId } from "@/lib/mock/data";

type SaleRow = {
  id: string;
  user_id: string;
  imobiliaria: string;
  property_id: string | null;
  property_name: string;
  property_address: string;
  property_neighborhood: string | null;
  property_city_state: string | null;
  property_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  previous_asking_price: number | null;
  buyer_name: string;
  buyer_document: string | null;
  buyer_phone: string | null;
  buyer_email: string | null;
  buyer_address: string | null;
  buyer_observations: string | null;
  sale_value: number;
  sale_date: string;
  sale_status: string;
  document_status: string;
  payment_method: string | null;
  payment_details: string | null;
  commission_value: number | null;
  commission_percentage: number | null;
  responsible_agent: string | null;
  contract_file_path: string | null;
  contract_file_name: string | null;
  supporting_document_file_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const orNull = (v?: string | null) =>
  v !== undefined && v !== null && String(v).trim() ? String(v).trim() : null;
const numOrNull = (v?: number | null) =>
  v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v);

function mapSale(r: SaleRow): SaleRecord {
  return {
    id: r.id,
    imobiliaria: (r.imobiliaria as AgencyId) ?? "cordial",
    propertyId: r.property_id ?? undefined,
    propertyName: r.property_name,
    propertyAddress: r.property_address,
    propertyNeighborhood: r.property_neighborhood ?? undefined,
    propertyCityState: r.property_city_state ?? undefined,
    propertyType: r.property_type as SalePropertyType,
    bedrooms: r.bedrooms ?? undefined,
    bathrooms: r.bathrooms ?? undefined,
    areaM2: r.area_m2 ?? undefined,
    previousAskingPrice: r.previous_asking_price ?? undefined,
    buyerName: r.buyer_name,
    buyerDocument: r.buyer_document ?? undefined,
    buyerPhone: r.buyer_phone ?? undefined,
    buyerEmail: r.buyer_email ?? undefined,
    buyerAddress: r.buyer_address ?? undefined,
    buyerObservations: r.buyer_observations ?? undefined,
    saleValue: Number(r.sale_value),
    saleDate: r.sale_date,
    saleStatus: r.sale_status as SaleStatus,
    documentStatus: r.document_status as SaleDocumentStatus,
    paymentMethod: (r.payment_method as SalePaymentMethod) ?? "Financiamento",
    paymentDetails: r.payment_details ?? undefined,
    commissionValue: r.commission_value ?? undefined,
    commissionPercentage: r.commission_percentage ?? undefined,
    responsibleAgent: r.responsible_agent ?? undefined,
    contractFileUrl: undefined,
    contractFileName: r.contract_file_name ?? undefined,
    supportingDocumentFileName: r.supporting_document_file_name ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function inputToPayload(input: SaleRecordInput) {
  return {
    imobiliaria: input.imobiliaria,
    property_id: orNull(input.propertyId),
    property_name: input.propertyName.trim(),
    property_address: input.propertyAddress.trim(),
    property_neighborhood: orNull(input.propertyNeighborhood),
    property_city_state: orNull(input.propertyCityState),
    property_type: input.propertyType,
    bedrooms: numOrNull(input.bedrooms),
    bathrooms: numOrNull(input.bathrooms),
    area_m2: numOrNull(input.areaM2),
    previous_asking_price: numOrNull(input.previousAskingPrice),
    buyer_name: input.buyerName.trim(),
    buyer_document: orNull(input.buyerDocument),
    buyer_phone: orNull(input.buyerPhone),
    buyer_email: orNull(input.buyerEmail),
    buyer_address: orNull(input.buyerAddress),
    buyer_observations: orNull(input.buyerObservations),
    sale_value: Number(input.saleValue),
    sale_date: input.saleDate,
    sale_status: input.saleStatus,
    document_status: input.documentStatus,
    payment_method: orNull(input.paymentMethod),
    payment_details: orNull(input.paymentDetails),
    commission_value: numOrNull(input.commissionValue),
    commission_percentage: numOrNull(input.commissionPercentage),
    responsible_agent: orNull(input.responsibleAgent),
    contract_file_path: orNull(input.contractFilePath),
    contract_file_name: orNull(input.contractFileName),
    supporting_document_file_name: orNull(input.supportingDocumentFileName),
    notes: orNull(input.notes),
  };
}

// ============================ LIST ============================
export const listSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SaleRecord[]> => {
    const { data, error } = await context.supabase
      .from("real_estate_sales")
      .select("*")
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as SaleRow[]).map(mapSale);
  });

// ============================ CREATE ============================
export const createSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SaleRecordInput) => data)
  .handler(async ({ data, context }): Promise<SaleRecord> => {
    const payload = { ...inputToPayload(data), user_id: context.userId };
    const { data: row, error } = await context.supabase
      .from("real_estate_sales")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapSale(row as unknown as SaleRow);
  });

// ============================ UPDATE ============================
export const updateSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; input: SaleRecordInput }) => data)
  .handler(async ({ data, context }): Promise<SaleRecord> => {
    const { data: row, error } = await context.supabase
      .from("real_estate_sales")
      .update(inputToPayload(data.input))
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapSale(row as unknown as SaleRow);
  });

// ============================ CANCEL ============================
export const cancelSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<SaleRecord> => {
    const { data: row, error } = await context.supabase
      .from("real_estate_sales")
      .update({ sale_status: "cancelada", document_status: "cancelado" })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapSale(row as unknown as SaleRow);
  });

// ============================ DELETE ============================
export const deleteSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Fetch to know file path
    const { data: existing } = await context.supabase
      .from("real_estate_sales")
      .select("contract_file_path")
      .eq("id", data.id)
      .maybeSingle();
    const filePath = (existing as { contract_file_path?: string | null } | null)
      ?.contract_file_path;
    if (filePath) {
      await context.supabase.storage.from("sale-documents").remove([filePath]);
    }
    const { error } = await context.supabase
      .from("real_estate_sales")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================ KPIs ============================
export const getSalesKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SalesKpis> => {
    const { data, error } = await context.supabase
      .from("real_estate_sales")
      .select("sale_value,sale_date,sale_status,document_status,contract_file_path");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      sale_value: number;
      sale_date: string;
      sale_status: string;
      document_status: string;
      contract_file_path: string | null;
    }>;
    const active = rows.filter((r) => r.sale_status !== "cancelada");
    const totalSold = active.reduce((t, r) => t + Number(r.sale_value ?? 0), 0);
    const attached = rows.filter((r) => Boolean(r.contract_file_path)).length;
    const pendencies = rows.filter((r) =>
      ["contrato_pendente", "aguardando_assinatura", "em_analise"].includes(r.document_status),
    ).length;
    const now = new Date();
    const month = active.filter((r) => {
      const d = new Date(`${r.sale_date}T12:00:00`);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    return {
      totalSold,
      registeredSales: rows.length,
      attachedContracts: attached,
      averageTicket: active.length ? totalSold / active.length : 0,
      monthSales: month,
      documentPendencies: pendencies,
    };
  });

// ============================ SIGNED URL ============================
export const getSaleDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { path: string }) => data)
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: signed, error } = await context.supabase.storage
      .from("sale-documents")
      .createSignedUrl(data.path, 3600);
    if (error || !signed?.signedUrl) {
      throw new Error(error?.message ?? "Não foi possível gerar o link do documento.");
    }
    return { url: signed.signedUrl };
  });
