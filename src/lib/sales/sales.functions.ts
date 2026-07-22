import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  SaleAttachment,
  SaleDocumentStatus,
  SalePayment,
  SalePaymentInput,
  SalePaymentKind,
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
  owner?: { id: string; nome: string | null; iniciais: string | null } | null;
  payments?: SalePayment[];
  attachments?: SaleAttachment[];
};

type AttachmentRow = {
  id: string;
  sale_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  sale_id: string;
  kind: string;
  sequence: number;
  amount: number | string;
  due_date: string;
  paid: boolean;
  paid_at: string | null;
  notified_at: string | null;
};

const orNull = (v?: string | null) =>
  v !== undefined && v !== null && String(v).trim() ? String(v).trim() : null;
const numOrNull = (v?: number | null) =>
  v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v);

function mapPayment(r: PaymentRow): SalePayment {
  return {
    id: r.id,
    saleId: r.sale_id,
    kind: r.kind as SalePaymentKind,
    sequence: Number(r.sequence ?? 0),
    amount: Number(r.amount),
    dueDate: r.due_date,
    paid: Boolean(r.paid),
    paidAt: r.paid_at,
    notifiedAt: r.notified_at,
  };
}

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
    ownerId: r.owner?.id ?? r.user_id ?? undefined,
    ownerName: r.owner?.nome ?? undefined,
    ownerInitials: r.owner?.iniciais ?? undefined,
    contractFilePath: r.contract_file_path ?? undefined,
    contractFileUrl: undefined,
    contractFileName: r.contract_file_name ?? undefined,
    supportingDocumentFileName: r.supporting_document_file_name ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    payments: r.payments ?? [],
    attachments: r.attachments ?? [],
  };
}

function mapAttachment(r: AttachmentRow): SaleAttachment {
  return {
    id: r.id,
    saleId: r.sale_id,
    fileName: r.file_name,
    filePath: r.file_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    createdAt: r.created_at,
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

async function syncPayments(
  supabase: any,
  saleId: string,
  payments: SalePaymentInput[] | undefined,
) {
  // Full sync: delete existing then reinsert. Keeps the domain simple and
  // avoids complex diff logic for a small collection of rows.
  if (!payments) return;
  await supabase.from("sale_payments").delete().eq("sale_id", saleId);
  if (payments.length === 0) return;
  const rows = payments
    .filter((p) => Number.isFinite(p.amount) && p.amount > 0 && p.dueDate)
    .map((p, idx) => ({
      sale_id: saleId,
      kind: p.kind,
      sequence: p.sequence ?? idx,
      amount: p.amount,
      due_date: p.dueDate,
      paid: p.paid ?? false,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("sale_payments").insert(rows);
  if (error) throw new Error(error.message);
}

async function attachPayments(
  supabase: any,
  saleIds: string[],
): Promise<Record<string, SalePayment[]>> {
  if (saleIds.length === 0) return {};
  const { data } = await supabase
    .from("sale_payments")
    .select("*")
    .in("sale_id", saleIds)
    .order("kind", { ascending: true })
    .order("due_date", { ascending: true });
  const grouped: Record<string, SalePayment[]> = {};
  for (const row of (data ?? []) as PaymentRow[]) {
    const key = row.sale_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(mapPayment(row));
  }
  return grouped;
}

async function attachAttachments(
  supabase: any,
  saleIds: string[],
): Promise<Record<string, SaleAttachment[]>> {
  if (saleIds.length === 0) return {};
  const { data } = await supabase
    .from("sale_documents")
    .select("*")
    .in("sale_id", saleIds)
    .order("created_at", { ascending: true });
  const grouped: Record<string, SaleAttachment[]> = {};
  for (const row of (data ?? []) as AttachmentRow[]) {
    const key = row.sale_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(mapAttachment(row));
  }
  return grouped;
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
    const rows = (data ?? []) as unknown as SaleRow[];
    const ownerIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    let owners: Record<string, { id: string; nome: string | null; iniciais: string | null }> = {};
    if (ownerIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, nome, iniciais")
        .in("id", ownerIds);
      owners = Object.fromEntries(
        ((profs ?? []) as Array<{ id: string; nome: string | null; iniciais: string | null }>).map(
          (p) => [p.id, p],
        ),
      );
    }
    const ids = rows.map((r) => r.id);
    const [payments, attachments] = await Promise.all([
      attachPayments(context.supabase, ids),
      attachAttachments(context.supabase, ids),
    ]);
    return rows.map((r) =>
      mapSale({
        ...r,
        owner: owners[r.user_id] ?? null,
        payments: payments[r.id] ?? [],
        attachments: attachments[r.id] ?? [],
      }),
    );
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
    const saleRow = row as unknown as SaleRow;
    await syncPayments(context.supabase, saleRow.id, data.payments);
    const [payments, attachments] = await Promise.all([
      attachPayments(context.supabase, [saleRow.id]),
      attachAttachments(context.supabase, [saleRow.id]),
    ]);
    return mapSale({
      ...saleRow,
      payments: payments[saleRow.id] ?? [],
      attachments: attachments[saleRow.id] ?? [],
    });
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
    const saleRow = row as unknown as SaleRow;
    await syncPayments(context.supabase, saleRow.id, data.input.payments);
    const [payments, attachments] = await Promise.all([
      attachPayments(context.supabase, [saleRow.id]),
      attachAttachments(context.supabase, [saleRow.id]),
    ]);
    return mapSale({
      ...saleRow,
      payments: payments[saleRow.id] ?? [],
      attachments: attachments[saleRow.id] ?? [],
    });
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
    const { data: existing } = await context.supabase
      .from("real_estate_sales")
      .select("contract_file_path")
      .eq("id", data.id)
      .maybeSingle();
    const filePath = (existing as { contract_file_path?: string | null } | null)
      ?.contract_file_path;
    const { data: docs } = await context.supabase
      .from("sale_documents")
      .select("file_path")
      .eq("sale_id", data.id);
    const paths = [
      ...(filePath ? [filePath] : []),
      ...(((docs ?? []) as Array<{ file_path: string }>).map((d) => d.file_path)),
    ];
    if (paths.length > 0) {
      await context.supabase.storage.from("sale-documents").remove(paths);
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

// ============================ MARK PAYMENT PAID ============================
export const setSalePaymentPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; paid: boolean }) => data)
  .handler(async ({ data, context }): Promise<SalePayment> => {
    const { data: row, error } = await context.supabase
      .from("sale_payments")
      .update({
        paid: data.paid,
        paid_at: data.paid ? new Date().toISOString() : null,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapPayment(row as unknown as PaymentRow);
  });
